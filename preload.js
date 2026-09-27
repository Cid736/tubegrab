const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updater', {
  getState: () => ipcRenderer.invoke('updater:getState'),
  check: () => ipcRenderer.send('updater:check'),
  downloadUpdate: () => ipcRenderer.send('updater:download'),
  quitAndInstall: () => ipcRenderer.send('updater:install'),
  onState: (cb) => ipcRenderer.on('updater:state', (_e, state) => cb(state)),
  onProgress: (cb) => ipcRenderer.on('updater:progress', (_e, progress) => cb(progress)),
  onDownloaded: (cb) => ipcRenderer.on('updater:downloaded', () => cb()),
  onError: (cb) => ipcRenderer.on('updater:error', (_e, message) => cb(message)),
});
