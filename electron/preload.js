const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanLastCourse: () => ipcRenderer.invoke('scan-last-course'),
  getVideoState: (path) => ipcRenderer.invoke('get-video-state', path),
  updateProgress: (path, pos, dur, done) => ipcRenderer.invoke('update-progress', path, pos, dur, done),
  getCourseStats: (id) => ipcRenderer.invoke('get-course-stats', id),
  getCourseProgress: (id) => ipcRenderer.invoke('get-course-progress', id),
  runCode: (code, filename, dirPath) => ipcRenderer.invoke('run-code', code, filename, dirPath),
  saveCode: (code, filename, dirPath) => ipcRenderer.invoke('save-code', code, filename, dirPath),
  showSaveDialog: (defaultName) => ipcRenderer.invoke('show-save-dialog', defaultName),
  getAllNotesTree: () => ipcRenderer.invoke('get-all-notes-tree'),
  
  // Notes & Bookmarks functionality
  getNote: (videoPath) => ipcRenderer.invoke('get-note', videoPath),
  saveNote: (videoPath, content) => ipcRenderer.invoke('save-note', videoPath, content),
  getBookmarks: (videoPath) => ipcRenderer.invoke('get-bookmarks', videoPath),
  addBookmark: (videoPath, posMs, note) => ipcRenderer.invoke('add-bookmark', videoPath, posMs, note),
  deleteBookmark: (id) => ipcRenderer.invoke('delete-bookmark', id),
  getRecentWorkspaces: () => ipcRenderer.invoke('get-recent-workspaces'),
  loadCourseByPath: (dirPath) => ipcRenderer.invoke('load-course-by-path', dirPath),
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, val) => ipcRenderer.invoke('set-setting', key, val),
  
  // Persistent Playback Checkpoint IPC API
  savePlayback: (data) => ipcRenderer.invoke('save-playback', data),
  getPlayback: (path) => ipcRenderer.invoke('get-playback', path),
  onForceSavePlayback: (callback) => {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on('force-save-playback', listener);
    return () => ipcRenderer.removeListener('force-save-playback', listener);
  },
  confirmPlaybackSaved: () => ipcRenderer.send('playback-saved-confirm'),
  
  // Helper for loading local video files via custom streaming protocol that supports buffering & seeking!
  getVideoSrc: (filePath) => `stream://local-file/${encodeURIComponent(filePath)}`,

  // Native Window Control Handlers for custom frameless React titlebars
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close')
});
