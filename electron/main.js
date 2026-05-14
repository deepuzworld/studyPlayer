const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
// Prevent Linux kernel sandbox crashes on startup
app.commandLine.appendSwitch('no-sandbox');
// Conserve memory & CPU footprint for slow processors / low memory environments
app.commandLine.appendSwitch('disable-dev-shm-usage'); // Mitigate low /dev/shm memory crashes
app.commandLine.appendSwitch('enable-low-end-device-mode'); // Chromium's built-in optimizations for low-end hardware
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Configure error logging
const logFile = path.join(app.getPath('userData'), 'error.log');
function logError(err) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] ${err && err.stack ? err.stack : err}\n`;
  fs.appendFileSync(logFile, message);
  console.error(message);
}

process.on('uncaughtException', (err) => {
  logError(err);
  app.exit(1);
});

process.on('unhandledRejection', (err) => {
  logError(err);
});

const BackendService = require('./backend');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow; // Accessible outside createWindow for system-level window controllers

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#0f111a',
    frame: false, // Fully frameless design to enable custom React headers
    titleBarStyle: 'hidden', // Backup safety for macOS support
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Purge standard OS title menus (File, Edit, View...) to give modern appearance
  mainWindow.removeMenu();

  // Graceful shutdown delay to ensure persistent playback checkpoint flushes complete
  let isQuitting = false;
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.webContents.send('force-save-playback');
      setTimeout(() => {
        isQuitting = true;
        mainWindow.close();
      }, 400); // Take a small lag to securely store current video content time
    }
  });

  // In production load index.html, in dev load from localhost
  if (isDev || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// Need to register standard schemes before app is ready!
protocol.registerSchemesAsPrivileged([
  { scheme: 'stream', privileges: { bypassCSP: true, stream: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);

app.whenReady().then(() => {
  // Custom protocol handler for range-request enabled video streaming!
  protocol.handle('stream', (request) => {
    try {
      const url = new URL(request.url);
      // Skip leading '/' from pathname to retrieve absolute path encoded in preload
      const filePath = decodeURIComponent(url.pathname.slice(1));
      const fileUrl = pathToFileURL(filePath).toString();
      
      return net.fetch(fileUrl, {
        headers: request.headers,
        bypassCustomProtocolHandlers: true
      });
    } catch (err) {
      console.error('Stream protocol error:', err);
      return new Response('Error streaming file: ' + err.message, { status: 500 });
    }
  });

  const backend = new BackendService();

  // Expose IPC API
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (!result.canceled) {
      const dirPath = result.filePaths[0];
      // Uniformly load through backend to preserve 'lastWatchedVideoPath' context!
      return await backend.loadCourseByPath(dirPath);
    }
    return null;
  });

  ipcMain.handle('scan-last-course', async () => {
    const lastPath = backend.getLastCoursePath();
    if (lastPath && fs.existsSync(lastPath)) {
      // Uniformly load through backend to preserve 'lastWatchedVideoPath' context!
      return await backend.loadCourseByPath(lastPath);
    }
    return null;
  });

  ipcMain.handle('get-video-state', (event, videoPath) => {
    return backend.getVideoState(videoPath);
  });

  ipcMain.handle('update-progress', (event, videoPath, posMs, durMs, isCompleted) => {
    backend.updateProgress(videoPath, posMs, durMs, isCompleted);
    return true;
  });

  ipcMain.handle('get-course-stats', (event, courseId) => {
    return backend.getCourseStats(courseId);
  });

  ipcMain.handle('get-course-progress', (event, courseId) => {
    return backend.getCourseVideosProgress(courseId);
  });

  ipcMain.handle('show-save-dialog', async (event, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      title: 'Save Script As',
      filters: [
        { name: 'JavaScript', extensions: ['js'] },
        { name: 'Python', extensions: ['py'] },
        { name: 'HTML File', extensions: ['html'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return { canceled, filePath };
  });

  ipcMain.handle('get-all-notes-tree', async () => {
    return backend.getAllNotesTree();
  });

  ipcMain.handle('run-code', async (event, code, filename, dirPath) => {
    return await backend.runCode(code, filename, dirPath);
  });

  ipcMain.handle('save-code', async (event, code, filename, dirPath) => {
    return await backend.saveCode(code, filename, dirPath);
  });

  // Notes & Bookmarks
  ipcMain.handle('get-note', (event, videoPath) => {
    return backend.getNote(videoPath);
  });

  ipcMain.handle('save-note', (event, videoPath, content) => {
    return backend.saveNote(videoPath, content);
  });

  ipcMain.handle('get-bookmarks', (event, videoPath) => {
    return backend.getBookmarks(videoPath);
  });

  ipcMain.handle('add-bookmark', (event, videoPath, posMs, note) => {
    return backend.addBookmark(videoPath, posMs, note);
  });

  ipcMain.handle('delete-bookmark', (event, id) => {
    return backend.deleteBookmark(id);
  });

  ipcMain.handle('get-recent-workspaces', (event) => {
    return backend.getRecentWorkspaces();
  });

  ipcMain.handle('load-course-by-path', async (event, dirPath) => {
    return await backend.loadCourseByPath(dirPath);
  });

  ipcMain.handle('get-setting', (event, key) => {
    return backend.getSetting(key);
  });

  ipcMain.handle('set-setting', (event, key, val) => {
    return backend.setSetting(key, val);
  });

  // Persistent Playback Session Handlers
  ipcMain.handle('save-playback', (event, data) => {
    return backend.savePlayback(data);
  });

  ipcMain.on('save-playback', (event, data) => {
    backend.savePlayback(data);
  });

  ipcMain.handle('get-playback', (event, videoPath) => {
    return backend.getPlayback(videoPath);
  });

  // Native Frameless Window Interaction Handlers
  ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
  });

  app.on('before-quit', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('force-save-playback');
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
