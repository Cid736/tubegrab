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

contextBridge.exposeInMainWorld('desktop', {
  getSettings: () => ipcRenderer.invoke('desktop:getSettings'),
  chooseFolder: () => ipcRenderer.invoke('desktop:chooseFolder'),
  openFolder: () => ipcRenderer.send('desktop:openFolder'),
  saveJob: (jobId, clientId) => ipcRenderer.send('desktop:saveJob', { jobId, clientId }),
  showInFolder: (jobId) => ipcRenderer.send('desktop:showInFolder', jobId),
  setProgress: (value) => ipcRenderer.send('desktop:setProgress', value),
  windowControl: (action) => ipcRenderer.send('window:control', action),
  onSaved: (cb) => ipcRenderer.on('desktop:saved', (_e, info) => cb(info)),
  getEngine: () => ipcRenderer.invoke('engine:getState'),
  updateEngine: () => ipcRenderer.send('engine:update'),
  onEngine: (cb) => ipcRenderer.on('engine:state', (_e, state) => cb(state)),
});
