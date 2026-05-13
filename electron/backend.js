const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { tmpdir } = require('os');
const { app } = require('electron');

class BackendService {
  constructor() {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'study_player.db');
    this.db = new Database(dbPath);
    this._initializeDB();
  }

  _initializeDB() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS courses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          root_path TEXT UNIQUE,
          last_doc_path TEXT
      );
      CREATE TABLE IF NOT EXISTS videos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER,
          path TEXT UNIQUE,
          last_position_ms INTEGER DEFAULT 0,
          duration_ms INTEGER DEFAULT 0,
          is_completed INTEGER DEFAULT 0,
          FOREIGN KEY(course_id) REFERENCES courses(id)
      );
      CREATE TABLE IF NOT EXISTS notes (
          video_path TEXT PRIMARY KEY,
          content TEXT
      );
      CREATE TABLE IF NOT EXISTS bookmarks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_path TEXT,
          timestamp_ms INTEGER,
          note TEXT
      );
      CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          val TEXT
      );
    `);
  }

  // --- Notes Operations ---
  getNote(videoPath) {
    const row = this.db.prepare('SELECT content FROM notes WHERE video_path = ?').get(videoPath);
    return row ? row.content : '';
  }

  saveNote(videoPath, content) {
    this.db.prepare('INSERT OR REPLACE INTO notes (video_path, content) VALUES (?, ?)').run(videoPath, content);
    return true;
  }

  // --- Bookmark Operations ---
  getBookmarks(videoPath) {
    return this.db.prepare('SELECT id, timestamp_ms, note FROM bookmarks WHERE video_path = ? ORDER BY timestamp_ms ASC').all(videoPath);
  }

  addBookmark(videoPath, timestampMs, note) {
    const result = this.db.prepare('INSERT INTO bookmarks (video_path, timestamp_ms, note) VALUES (?, ?, ?)').run(videoPath, timestampMs, note);
    return { id: result.lastInsertRowid };
  }

  deleteBookmark(bookmarkId) {
    this.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bookmarkId);
    return true;
  }

  // --- Scanning ---
  async scanDirectory(dirPath) {
    const validExts = ['.mp4', '.mkv', '.avi', '.webm', '.mov'];
    const ignoredDirs = ['node_modules', '.git', '.vscode', '.idea', 'dist', 'build', 'venv', 'env', '__pycache__', 'tmp', 'release', 'target'];
    const result = {};
    const topLevelVideos = [];

    try {
      // Async read without blocking the main thread, getting entry types automatically
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const sortedEntries = entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      
      for (const entry of sortedEntries) {
        const name = entry.name;
        if (name.startsWith('.')) continue;
        
        const fullPath = path.join(dirPath, name);

        if (entry.isDirectory()) {
          // Prevent traversing into massive directories to conserve memory & CPU
          if (ignoredDirs.includes(name.toLowerCase())) continue;
          
          try {
            const subEntries = await fs.promises.readdir(fullPath, { withFileTypes: true });
            const sortedSub = subEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            const videos = [];
            
            for (const subEntry of sortedSub) {
              if (subEntry.name.startsWith('.')) continue;
              if (subEntry.isFile() && validExts.includes(path.extname(subEntry.name).toLowerCase())) {
                videos.push({ name: subEntry.name, path: path.join(fullPath, subEntry.name) });
              }
            }
            
            if (videos.length > 0) {
              result[name] = videos;
            }
          } catch (subErr) {
            console.warn(`Skipping problematic directory ${fullPath}:`, subErr.message);
          }
        } else if (entry.isFile() && validExts.includes(path.extname(name).toLowerCase())) {
          topLevelVideos.push({ name: name, path: fullPath });
        }
      }

      if (topLevelVideos.length > 0) {
        result["Module 1: General"] = topLevelVideos;
      }

      return result;
    } catch (e) {
      console.error("Scanning failed", e);
      throw e;
    }
  }

  // --- DB Operations ---
  registerCourse(rootPath, structure) {
    const insertCourse = this.db.prepare('INSERT OR IGNORE INTO courses (root_path) VALUES (?)');
    const getCourseId = this.db.prepare('SELECT id FROM courses WHERE root_path = ?');
    const insertVideo = this.db.prepare('INSERT OR IGNORE INTO videos (course_id, path) VALUES (?, ?)');

    const transaction = this.db.transaction(() => {
      insertCourse.run(rootPath);
      const row = getCourseId.get(rootPath);
      const courseId = row.id;

      for (const moduleName in structure) {
        for (const video of structure[moduleName]) {
          insertVideo.run(courseId, video.path);
        }
      }
      return courseId;
    });

    return transaction();
  }

  getVideoState(videoPath) {
    const row = this.db.prepare('SELECT last_position_ms, duration_ms, is_completed FROM videos WHERE path = ?').get(videoPath);
    return row || { last_position_ms: 0, duration_ms: 0, is_completed: 0 };
  }

  updateProgress(videoPath, posMs, durMs, isCompleted) {
    this.db.prepare(`
      UPDATE videos 
      SET last_position_ms = ?, duration_ms = ?, is_completed = MAX(is_completed, ?) 
      WHERE path = ?
    `).run(posMs, durMs, isCompleted ? 1 : 0, videoPath);
  }

  getCourseStats(courseId) {
    const stats = this.db.prepare(`
      SELECT 
          COUNT(*) as total_videos,
          SUM(is_completed) as completed_videos
      FROM videos WHERE course_id = ?
    `).get(courseId);
    return stats || { total_videos: 0, completed_videos: 0 };
  }

  getLastCoursePath() {
    const row = this.db.prepare('SELECT root_path FROM courses ORDER BY id DESC LIMIT 1').get();
    return row ? row.root_path : null;
  }

  // --- Dashboard & Recent Workspaces ---
  getRecentWorkspaces() {
    const list = this.db.prepare('SELECT id, root_path FROM courses ORDER BY id DESC LIMIT 4').all();
    const workspaces = [];
    for (const course of list) {
      const stats = this.getCourseStats(course.id);
      workspaces.push({
        id: course.id,
        path: course.root_path,
        name: path.basename(course.root_path),
        total_videos: stats.total_videos,
        completed_videos: stats.completed_videos || 0,
        progress: stats.total_videos > 0 ? Math.round(( (stats.completed_videos || 0) / stats.total_videos) * 100) : 0
      });
    }
    return workspaces;
  }

  async loadCourseByPath(dirPath) {
    const structure = await this.scanDirectory(dirPath);
    const courseId = this.registerCourse(dirPath, structure);
    return {
      courseId,
      path: dirPath,
      structure
    };
  }

  // --- Code Runner ---
  runCode(code, filename, dirPath) {
    return new Promise((resolve, reject) => {
      const destDir = dirPath && fs.existsSync(dirPath) ? dirPath : tmpdir();
      const tmpFile = path.join(destDir, filename);
      fs.writeFileSync(tmpFile, code);

      let cmd = '';
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.py') cmd = `python3 "${tmpFile}"`;
      else if (ext === '.js') cmd = `node "${tmpFile}"`;
      else cmd = `bash "${tmpFile}"`;

      exec(cmd, { cwd: destDir }, (error, stdout, stderr) => {
        // Resolve both success and output/errors in a format the UI can display
        resolve({
          success: !error,
          output: stdout,
          error: stderr || (error ? error.message : '')
        });
      });
    });
  }

  saveCode(code, filename, dirPath) {
    try {
      const destDir = dirPath && fs.existsSync(dirPath) ? dirPath : tmpdir();
      const filePath = path.join(destDir, filename);
      fs.writeFileSync(filePath, code);
      return { success: true, path: filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  // --- App Settings ---
  getSetting(key) {
    const row = this.db.prepare('SELECT val FROM app_settings WHERE key = ?').get(key);
    return row ? row.val : null;
  }

  setSetting(key, val) {
    this.db.prepare('INSERT OR REPLACE INTO app_settings (key, val) VALUES (?, ?)').run(key, val);
    return true;
  }
}

module.exports = BackendService;
