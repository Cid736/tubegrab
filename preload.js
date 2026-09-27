const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  downloadUpdate: () => ipcRenderer.send('updater:download'),
  quitAndInstall: () => ipcRenderer.send('updater:install'),
  onAvailable: (cb) => ipcRenderer.on('updater:available', (_e, info) => cb(info)),
  onProgress: (cb) => ipcRenderer.on('updater:progress', (_e, progress) => cb(progress)),
  onDownloaded: (cb) => ipcRenderer.on('updater:downloaded', () => cb()),
  onError: (cb) => ipcRenderer.on('updater:error', (_e, message) => cb(message)),
});
