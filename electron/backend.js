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
      CREATE TABLE IF NOT EXISTS playback_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_path TEXT UNIQUE NOT NULL,
          current_time REAL DEFAULT 0,
          duration REAL DEFAULT 0,
          last_watched INTEGER,
          completed INTEGER DEFAULT 0
      );
    `);
  }


  // --- Notes Operations ---
  getNote(videoPath) {
    const normPath = videoPath.normalize('NFC');
    const row = this.db.prepare('SELECT content FROM notes WHERE video_path = ?').get(normPath);
    return row ? row.content : '';
  }

  saveNote(videoPath, content) {
    const normPath = videoPath.normalize('NFC');
    this.db.prepare('INSERT OR REPLACE INTO notes (video_path, content) VALUES (?, ?)').run(normPath, content);
    return true;
  }

  // --- Bookmark Operations ---
  getBookmarks(videoPath) {
    const normPath = videoPath.normalize('NFC');
    return this.db.prepare('SELECT id, timestamp_ms, note FROM bookmarks WHERE video_path = ? ORDER BY timestamp_ms ASC').all(normPath);
  }

  addBookmark(videoPath, timestampMs, note) {
    const normPath = videoPath.normalize('NFC');
    const result = this.db.prepare('INSERT INTO bookmarks (video_path, timestamp_ms, note) VALUES (?, ?, ?)').run(normPath, timestampMs, note);
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

    const scan = async (currentPath, moduleName = null) => {
      try {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
        const sortedEntries = entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        
        const videos = [];

        for (const entry of sortedEntries) {
          const name = entry.name;
          if (name.startsWith('.')) continue;
          
          const fullPath = path.join(currentPath, name);

          if (entry.isDirectory()) {
            if (ignoredDirs.includes(name.toLowerCase())) continue;
            // Recursively scan subdirectories. Use the directory name as the module name if we're at the top level
            await scan(fullPath, moduleName || name);
          } else if (entry.isFile() && validExts.includes(path.extname(name).toLowerCase())) {
            videos.push({ name: name, path: fullPath.normalize('NFC') });
          }
        }

        if (videos.length > 0) {
          const key = moduleName || "Module 1: General";
          if (!result[key]) result[key] = [];
          result[key].push(...videos);
        }
      } catch (e) {
        console.warn(`Skipping problematic directory ${currentPath}:`, e.message);
      }
    };

    try {
      await scan(dirPath);
      return result;
    } catch (e) {
      console.error("Scanning failed", e);
      throw e;
    }
  }

  // --- DB Operations ---
  registerCourse(rootPath, structure) {
    const normRoot = rootPath.normalize('NFC');
    const insertCourse = this.db.prepare('INSERT OR IGNORE INTO courses (root_path) VALUES (?)');
    const getCourseId = this.db.prepare('SELECT id FROM courses WHERE root_path = ?');
    const insertVideo = this.db.prepare('INSERT OR IGNORE INTO videos (course_id, path) VALUES (?, ?)');

    const transaction = this.db.transaction(() => {
      insertCourse.run(normRoot);
      const row = getCourseId.get(normRoot);
      const courseId = row.id;

      for (const moduleName in structure) {
        for (const video of structure[moduleName]) {
          const normVidPath = video.path.normalize('NFC');
          insertVideo.run(courseId, normVidPath);
        }
      }
      return courseId;
    });

    return transaction();
  }

  getVideoState(videoPath) {
    const normPath = videoPath.normalize('NFC');
    const row = this.db.prepare('SELECT last_position_ms, duration_ms, is_completed FROM videos WHERE path = ?').get(normPath);
    return row || { last_position_ms: 0, duration_ms: 0, is_completed: 0 };
  }

  updateProgress(videoPath, posMs, durMs, isCompleted) {
    try {
      const normPath = videoPath.normalize('NFC');
      this.db.prepare(`
        UPDATE videos 
        SET last_position_ms = ?, duration_ms = ?, is_completed = MAX(is_completed, ?) 
        WHERE path = ?
      `).run(posMs, durMs, isCompleted ? 1 : 0, normPath);

      // Track user's exact last-watched media context inside internal configuration tables
      const row = this.db.prepare('SELECT course_id FROM videos WHERE path = ?').get(normPath);
      if (row && row.course_id) {
        this.setSetting(`last_watched_${row.course_id}`, normPath);
      }
    } catch(err) {
      console.error("Database transaction failed in progress persistence:", err);
    }
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

  getCourseVideosProgress(courseId) {
    const rows = this.db.prepare('SELECT path, is_completed, duration_ms FROM videos WHERE course_id = ?').all(courseId);
    // Map into simple lookup object holding both completion status and duration
    const map = {};
    for (const row of rows) {
      map[row.path] = {
        is_completed: row.is_completed,
        duration_ms: row.duration_ms || 0
      };
    }
    return map;
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
    
    // Query active persistence index for this specific course context
    const lastWatched = this.getSetting(`last_watched_${courseId}`);
    
    return {
      courseId,
      path: dirPath,
      structure,
      lastWatchedVideoPath: lastWatched || null
    };
  }

  // --- Code Runner ---
  runCode(code, filename, dirPath) {
    return new Promise((resolve, reject) => {
      // Sanitize filename to prevent directory traversal or command injection via filename
      const safeFilename = path.basename(filename);
      const ext = path.extname(safeFilename).toLowerCase();
      const allowedExts = ['.py', '.js', '.sh'];

      if (!allowedExts.includes(ext)) {
        return resolve({
          success: false,
          output: '',
          error: 'Unsupported file extension. Only .py, .js, and .sh are allowed.'
        });
      }

      const destDir = dirPath && fs.existsSync(dirPath) ? dirPath : tmpdir();
      const tmpFile = path.join(destDir, safeFilename);
      fs.writeFileSync(tmpFile, code);

      let cmd = '';
      if (ext === '.py') cmd = `python3 "${tmpFile}"`;
      else if (ext === '.js') cmd = `node "${tmpFile}"`;
      else if (ext === '.sh') cmd = `bash "${tmpFile}"`;
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
      const safeFilename = path.basename(filename);
      const destDir = dirPath && fs.existsSync(dirPath) ? dirPath : tmpdir();
      const filePath = path.join(destDir, safeFilename);
      fs.writeFileSync(filePath, code);
      return { success: true, path: filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  getAllNotesTree() {
    try {
      const rows = this.db.prepare(`
        SELECT 
            n.content,
            v.path as video_path,
            c.root_path as course_path
        FROM notes n
        JOIN videos v ON n.video_path = v.path
        JOIN courses c ON v.course_id = c.id
        WHERE n.content IS NOT NULL AND TRIM(n.content) != ''
      `).all();
      
      const tree = {};
      for (const row of rows) {
        const courseName = path.basename(row.course_path);
        if (!tree[courseName]) tree[courseName] = [];
        tree[courseName].push({
          videoName: path.basename(row.video_path),
          videoPath: row.video_path,
          coursePath: row.course_path,
          snippet: row.content.substring(0, 80) + (row.content.length > 80 ? '...' : '')
        });
      }
      return tree;
    } catch (e) {
      console.error("Failed fetching notes tree", e);
      return {};
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

  // --- Persistent Playback Sessions Checkpoint System ---
  savePlayback(data) {
    try {
      const normPath = data.path.normalize('NFC');
      const completed = data.completed ? 1 : (data.duration > 0 && (data.currentTime / data.duration > 0.90) ? 1 : 0);
      this.db.prepare(`
        INSERT INTO playback_history (
           video_path,
           current_time,
           duration,
           last_watched,
           completed
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(video_path)
        DO UPDATE SET
           current_time = excluded.current_time,
           duration = excluded.duration,
           last_watched = excluded.last_watched,
           completed = MAX(playback_history.completed, excluded.completed);
      `).run(normPath, data.currentTime, data.duration, Date.now(), completed);

      // Also keep internal videos schema in sync to prevent progress mismatch
      this.updateProgress(normPath, Math.floor(data.currentTime * 1000), Math.floor(data.duration * 1000), completed === 1);
      return true;
    } catch (err) {
      console.error("Failed saving playback checkpoint:", err);
      return false;
    }
  }

  getPlayback(videoPath) {
    try {
      const normPath = videoPath.normalize('NFC');
      const row = this.db.prepare('SELECT current_time as currentTime, duration, last_watched as lastWatched, completed FROM playback_history WHERE video_path = ?').get(normPath);
      return row || null;
    } catch (err) {
      console.error("Failed fetching playback checkpoint:", err);
      return null;
    }
  }
}

module.exports = BackendService;

