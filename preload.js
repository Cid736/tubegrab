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
  saveJob: (jobId, clientId, count, folder, artist, album, into) => ipcRenderer.send('desktop:saveJob', { jobId, clientId, count, folder, artist, album, into }),
  showInFolder: (jobId) => ipcRenderer.send('desktop:showInFolder', jobId),
  openSaved: (jobId) => ipcRenderer.send('desktop:openSaved', jobId),
  savedExists: (ids) => ipcRenderer.invoke('desktop:savedExists', ids),
  setOptions: (patch) => ipcRenderer.send('desktop:setOptions', patch),
  retryComponents: () => ipcRenderer.send('components:retry'),
  onPasteUrl: (cb) => ipcRenderer.on('desktop:pasteUrl', (_e, info) => cb(info)),
  setProgress: (value) => ipcRenderer.send('desktop:setProgress', value),
  windowControl: (action) => ipcRenderer.send('window:control', action),
  setTheme: (theme) => ipcRenderer.send('appearance:theme', theme),
  setUi: (ui) => ipcRenderer.send('appearance:ui', ui),
  openDataFolder: () => ipcRenderer.send('desktop:openDataFolder'),
  onWindowState: (cb) => ipcRenderer.on('window:state', (_e, state) => cb(state)),
  onSaved: (cb) => ipcRenderer.on('desktop:saved', (_e, info) => cb(info)),
  getEngine: () => ipcRenderer.invoke('engine:getState'),
  updateEngine: () => ipcRenderer.send('engine:update'),
  onEngine: (cb) => ipcRenderer.on('engine:state', (_e, state) => cb(state)),
  showLibraryFile: (rel) => ipcRenderer.send('desktop:showLibraryFile', rel),
  installExtension: () => ipcRenderer.invoke('desktop:installExtension'),
  exportBackup: (text) => ipcRenderer.invoke('desktop:exportBackup', text),
  importBackup: () => ipcRenderer.invoke('desktop:importBackup'),
  setDownloadDir: (dir) => ipcRenderer.invoke('desktop:setDownloadDir', dir),
  getNtfy: () => ipcRenderer.invoke('desktop:getNtfy'),
  setNtfy: (patch) => ipcRenderer.invoke('desktop:setNtfy', patch),
  testNtfy: () => ipcRenderer.invoke('desktop:testNtfy'),
  jobFinished: (info) => ipcRenderer.send('desktop:jobFinished', info),
  onQuickDownload: (cb) => ipcRenderer.on('desktop:quickDownload', (_e, info) => cb(info)),
  onTrayAction: (cb) => ipcRenderer.on('desktop:trayAction', (_e, info) => cb(info)),
  getStartup: () => ipcRenderer.invoke('desktop:getStartup'),
  setStartup: (enabled) => ipcRenderer.invoke('desktop:setStartup', enabled),
  // Automatic subtitles: the Whisper engine and models.
  getWhisper: () => ipcRenderer.invoke('whisper:getState'),
  installWhisper: (model) => ipcRenderer.send('whisper:install', model),
  removeWhisper: (model) => ipcRenderer.invoke('whisper:remove', model),
  onWhisper: (cb) => ipcRenderer.on('whisper:state', (_e, state) => cb(state)),
  // Library: duplicates to the Recycle Bin; mirrored playlists.
  trashLibraryFile: (rel) => ipcRenderer.invoke('desktop:trashLibraryFile', rel),
  syncMirror: (info) => ipcRenderer.invoke('desktop:syncMirror', info),
  // Mini player (both windows use these).
  openMini: () => ipcRenderer.send('desktop:openMini'),
  playerState: (state) => ipcRenderer.send('player:state', state),
  onPlayerCommand: (cb) => ipcRenderer.on('player:command', (_e, cmd) => cb(cmd)),
  miniCommand: (cmd) => ipcRenderer.send('player:command', cmd),
  onPlayerState: (cb) => ipcRenderer.on('player:state', (_e, state) => cb(state)),
  // Disk space.
  getSpace: () => ipcRenderer.invoke('desktop:getSpace'),
  setSpace: (patch) => ipcRenderer.invoke('desktop:setSpace', patch),
  onSpace: (cb) => ipcRenderer.on('desktop:space', (_e, state) => cb(state)),
  // Command line.
  onCliDownload: (cb) => ipcRenderer.on('desktop:cliDownload', (_e, req) => cb(req)),
  getCli: () => ipcRenderer.invoke('desktop:getCli'),
  installCli: (on) => ipcRenderer.invoke('desktop:installCli', on),
  // Watch folder.
  chooseWatchFolder: () => ipcRenderer.invoke('desktop:chooseWatchFolder'),
  // Mini player: dragged around by the page itself.
  miniMove: (dx, dy) => ipcRenderer.send('mini:move', { dx, dy }),
  onMiniPrefs: (cb) => ipcRenderer.on('mini:prefs', (_e, p) => cb(p)),
  // Keyboard shortcuts (also in the background).
  getShortcuts: () => ipcRenderer.invoke('desktop:getShortcuts'),
  setShortcuts: (patch) => ipcRenderer.invoke('desktop:setShortcuts', patch),
  // Last.fm and Discord.
  getLastfm: () => ipcRenderer.invoke('desktop:getLastfm'),
  setLastfm: (patch) => ipcRenderer.invoke('desktop:setLastfm', patch),
  getDiscord: () => ipcRenderer.invoke('desktop:getDiscord'),
  setDiscord: (patch) => ipcRenderer.invoke('desktop:setDiscord', patch),
  // A finished job's notification with "Abrir" / "Mostrar en la carpeta".
  notifyDone: (info) => ipcRenderer.send('desktop:notifyDone', info),
  // Automatic backup.
  getAutoBackup: () => ipcRenderer.invoke('desktop:getAutoBackup'),
  setAutoBackup: (patch) => ipcRenderer.invoke('desktop:setAutoBackup', patch),
  writeAutoBackup: (text) => ipcRenderer.invoke('desktop:writeAutoBackup', text),
  // Screen recording for the Editor.
  screenSources: () => ipcRenderer.invoke('desktop:screenSources'),
  pickScreenSource: (pick) => ipcRenderer.invoke('desktop:pickScreenSource', pick),
  // AcoustID's fpcalc.
  getFpcalc: () => ipcRenderer.invoke('desktop:getFpcalc'),
  installFpcalc: () => ipcRenderer.invoke('desktop:installFpcalc'),
});
