const { app, BrowserWindow, ipcMain, shell, screen, dialog, nativeTheme } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { fork, execFile, spawn } = require('child_process');
const http = require('http');

const PORT = process.env.PORT || 3000;
const APP_ORIGIN = `http://localhost:${PORT}`;

let mainWindow;
let serverProcess;
let shuttingDown = false;

// === Updater ===
// TubeGrab ships as a single portable .exe (no installer), so electron-builder's
// own update feed (latest.yml) and electron-updater's install logic don't apply
// here — both are wired to the NSIS installer target, not a bare portable exe.
// This checks the GitHub Releases API directly, downloads the new .exe to a temp
// file, then — since Windows won't let a running .exe overwrite itself — hands
// off to a detached PowerShell one-liner that waits for this process to exit,
// swaps the file, and relaunches it.
const GITHUB_REPO = 'Cid736/tubegrab';
const UPDATE_ASSET_NAME = 'TubeGrab.exe';
// Only ever talk to GitHub (API + its release-asset CDN), over HTTPS, even when
// following redirects.
const ALLOWED_UPDATE_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);
const MAX_REDIRECTS = 5;
let pendingUpdate = null; // { downloadUrl, version, sha256, size }
let downloadedExePath = null;
let downloadInProgress = false;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function isTrustedSender(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return typeof url === 'string' && url.startsWith(`${APP_ORIGIN}/`);
}

function assertAllowedUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !ALLOWED_UPDATE_HOSTS.has(url.hostname)) {
    throw new Error(`Origen de actualización no permitido: ${url.hostname}`);
  }
  return url;
}

function httpsGet(rawUrl, redirectsLeft, onResponse, onError) {
  let url;
  try { url = assertAllowedUrl(rawUrl); } catch (err) { onError(err); return; }
  const req = https.get(url, { headers: { 'User-Agent': 'TubeGrab-Updater', Accept: 'application/json, application/octet-stream' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      if (redirectsLeft <= 0) { onError(new Error('Demasiadas redirecciones')); return; }
      httpsGet(new URL(res.headers.location, url).toString(), redirectsLeft - 1, onResponse, onError);
      return;
    }
    if (res.statusCode !== 200) {
      res.resume();
      onError(new Error(`GitHub respondió ${res.statusCode}`));
      return;
    }
    onResponse(res);
  });
  req.on('error', onError);
  req.setTimeout(30_000, () => req.destroy(new Error('Tiempo de espera agotado')));
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url, MAX_REDIRECTS, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    }, reject);
  });
}

/** Streams to destPath and resolves with the file's sha256 (hex) and byte count. */
function downloadToFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    httpsGet(url, MAX_REDIRECTS, (res) => {
      const total = parseInt(res.headers['content-length'] || '0', 10);
      const hash = crypto.createHash('sha256');
      let downloaded = 0;
      const file = fs.createWriteStream(destPath, { flags: 'wx' });
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        hash.update(chunk);
        if (total > 0 && onProgress) onProgress(Math.round((downloaded / total) * 100));
      });
      res.on('aborted', () => reject(new Error('Descarga interrumpida')));
      res.on('error', reject);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ sha256: hash.digest('hex'), size: downloaded })));
      file.on('error', reject);
    }, reject);
  });
}

/** "1.4.0" > "1.3.2"? Plain numeric semver compare, no pre-release suffixes to worry about here. */
function isNewerVersion(remote, local) {
  const r = remote.split('.').map((n) => parseInt(n, 10) || 0);
  const l = local.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((r[i] || 0) !== (l[i] || 0)) return (r[i] || 0) > (l[i] || 0);
  }
  return false;
}

// Kept in the main process and pulled by the page on load: a one-shot push
// sent before the page finished loading would otherwise be lost.
let updateState = { status: 'idle', current: app.getVersion(), latest: null, error: null };

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  sendToRenderer('updater:state', updateState);
}

async function checkForUpdates() {
  // Nothing to compare against when running from source.
  if (!app.isPackaged) { setUpdateState({ status: 'dev' }); return; }
  if (updateState.status === 'checking' || downloadInProgress || downloadedExePath) return;

  setUpdateState({ status: 'checking', error: null });
  try {
    const release = await httpJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    // tag_name ends up in UI text and in comparisons; accept strict X.Y.Z only.
    const remoteVersion = String(release.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(remoteVersion)) throw new Error('versión publicada no válida');
    if (!isNewerVersion(remoteVersion, app.getVersion())) {
      setUpdateState({ status: 'up-to-date', latest: remoteVersion });
      return;
    }

    const asset = (release.assets || []).find((a) => a.name === UPDATE_ASSET_NAME);
    // GitHub publishes a sha256 digest per asset; without one we can't verify
    // the download, so don't offer the update at all.
    const digestMatch = asset && /^sha256:([0-9a-f]{64})$/i.exec(String(asset.digest || ''));
    if (!asset || !digestMatch) throw new Error(`la versión ${remoteVersion} no tiene un .exe verificable`);

    pendingUpdate = {
      downloadUrl: asset.browser_download_url,
      version: remoteVersion,
      sha256: digestMatch[1].toLowerCase(),
      size: asset.size,
    };
    setUpdateState({ status: 'available', latest: remoteVersion });
  } catch (err) {
    console.error('[Updater] check failed:', err.message);
    setUpdateState({ status: 'error', error: err.message });
  }
}

ipcMain.handle('updater:getState', (event) => (isTrustedSender(event) ? updateState : null));

ipcMain.on('updater:check', (event) => {
  if (isTrustedSender(event)) checkForUpdates();
});

ipcMain.on('updater:download', async (event) => {
  if (!isTrustedSender(event) || !pendingUpdate || downloadInProgress || downloadedExePath) return;
  downloadInProgress = true;
  let destPath = null;
  try {
    // Fresh random directory instead of a predictable %TEMP% file name.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tubegrab-update-'));
    destPath = path.join(dir, UPDATE_ASSET_NAME);
    const result = await downloadToFile(pendingUpdate.downloadUrl, destPath, (percent) => sendToRenderer('updater:progress', { percent }));
    if (result.sha256 !== pendingUpdate.sha256 || result.size !== pendingUpdate.size) {
      throw new Error('el archivo descargado no coincide con la firma publicada (sha256)');
    }
    downloadedExePath = destPath;
    sendToRenderer('updater:downloaded');
  } catch (err) {
    if (destPath) fs.rm(path.dirname(destPath), { recursive: true, force: true }, () => {});
    sendToRenderer('updater:error', err.message);
  } finally {
    downloadInProgress = false;
  }
});

ipcMain.on('updater:install', (event) => {
  if (!isTrustedSender(event) || !downloadedExePath) return;

  // electron-builder's portable launcher exposes the real on-disk exe path here;
  // process.execPath would instead point at the self-extracted temp copy.
  const targetExePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

  // Paths go in through environment variables, never interpolated into the
  // script text, so no file name can break out of the PowerShell command.
  // The move is retried because the portable launcher stub keeps TubeGrab.exe
  // locked for a moment after this process exits; if it never succeeds, the
  // old version is relaunched rather than leaving the user with nothing.
  const psScript = [
    'Wait-Process -Id ([int]$env:TG_PID) -ErrorAction SilentlyContinue',
    'for ($i = 0; $i -lt 30; $i++) { try { Move-Item -LiteralPath $env:TG_SRC -Destination $env:TG_DST -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 } }',
    'Start-Process -FilePath $env:TG_DST',
  ].join('; ');

  // A detached powershell.exe has no console and exits immediately without
  // running anything, so it's started through `cmd /c start`, which gives it a
  // (minimized, then hidden) console of its own and lets it outlive this app.
  // The script contains no double quotes and no cmd metacharacters outside
  // them; the command line is passed verbatim so cmd sees exactly this.
  const helper = spawn('cmd.exe', [`/d /c start "" /min powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "${psScript}"`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true,
    env: { ...process.env, TG_PID: String(process.pid), TG_SRC: downloadedExePath, TG_DST: targetExePath },
  });
  helper.unref();

  app.quit();
});

// === Settings (userData/settings.json) ===
const SETTINGS_PATH = () => path.join(app.getPath('userData'), 'settings.json');
let settingsCache = null;

function getSettings() {
  if (!settingsCache) {
    try { settingsCache = JSON.parse(fs.readFileSync(SETTINGS_PATH(), 'utf8')); } catch { settingsCache = {}; }
    if (typeof settingsCache.downloadDir !== 'string' || !path.isAbsolute(settingsCache.downloadDir)) {
      settingsCache.downloadDir = path.join(app.getPath('downloads'), 'TubeGrab');
    }
  }
  return settingsCache;
}

function saveSettings(patch) {
  settingsCache = { ...getSettings(), ...patch };
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH()), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH(), JSON.stringify(settingsCache, null, 2));
  } catch (err) {
    console.error('[Settings] save failed:', err.message);
  }
  return settingsCache;
}

// === Download engine (yt-dlp) ===
// The copy bundled in the portable .exe is re-extracted on every launch, so
// it can never update itself. Keep a copy in the user's app-data folder,
// seed it from the bundled one, and let `yt-dlp -U` keep it current: sites
// like YouTube break old versions within weeks.
const ENGINE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
let engineState = { version: null, updating: false, error: null };

function engineUserPath() {
  return path.join(app.getPath('userData'), 'bin', 'yt-dlp.exe');
}

function ensureEngine() {
  if (process.platform !== 'win32') return null;
  const bundled = path.join(__dirname, 'yt-dlp.exe');
  const target = engineUserPath();
  try {
    if (!fs.existsSync(target) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(bundled, target);
    }
    return fs.existsSync(target) ? target : null;
  } catch (err) {
    console.error('[Engine] seed failed:', err.message);
    return null;
  }
}

function engineVersion(exePath) {
  return new Promise((resolve) => {
    execFile(exePath, ['--version'], { windowsHide: true, timeout: 60_000 }, (err, stdout) => resolve(err ? null : stdout.trim()));
  });
}

const versionParts = (v) => String(v || '').split('.').map((n) => parseInt(n, 10) || 0);
function isNewerEngine(a, b) {
  const x = versionParts(a); const y = versionParts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

function setEngineState(patch) {
  engineState = { ...engineState, ...patch };
  sendToRenderer('engine:state', engineState);
}

async function maintainEngine(force) {
  const target = engineUserPath();
  if (process.platform !== 'win32' || engineState.updating || !fs.existsSync(target)) return;
  setEngineState({ updating: true, error: null });
  try {
    // A newer app release may ship a newer yt-dlp than the user's copy.
    const bundled = path.join(__dirname, 'yt-dlp.exe');
    const [current, shipped] = await Promise.all([engineVersion(target), engineVersion(bundled)]);
    if (shipped && isNewerEngine(shipped, current)) {
      try { fs.copyFileSync(bundled, target); } catch { /* in use by a running download; next launch */ }
    }
    const last = Number(getSettings().engineCheckedAt || 0);
    if (force || Date.now() - last > ENGINE_CHECK_INTERVAL_MS) {
      // yt-dlp -U only installs releases it verifies against the published SHA-256 sums.
      await new Promise((resolve) => execFile(target, ['-U'], { windowsHide: true, timeout: 180_000 }, (err, stdout, stderr) => {
        if (err) setEngineState({ error: 'No se pudo actualizar el motor de descargas.' });
        if (stderr && /ERROR/.test(stderr)) console.error('[Engine] update:', stderr.trim().split('\n').pop());
        resolve();
      }));
      saveSettings({ engineCheckedAt: Date.now() });
    }
    setEngineState({ version: await engineVersion(target) });
  } finally {
    setEngineState({ updating: false });
  }
}

ipcMain.handle('engine:getState', (event) => (isTrustedSender(event) ? engineState : null));
ipcMain.on('engine:update', (event) => { if (isTrustedSender(event)) maintainEngine(true); });

// === Saving finished jobs straight into the chosen folder ===
const JOB_FILE_RE = new RegExp(`^${APP_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/jobs/([a-f0-9]{32})/file\\?client=[a-f0-9]{32}$`);
const savedFiles = new Map(); // jobId -> absolute path we wrote

function safeFileName(name) {
  const cleaned = path.basename(String(name || '')).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
  return cleaned.slice(0, 200) || 'descarga';
}

function uniquePath(dir, fileName) {
  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  let candidate = path.join(dir, fileName);
  for (let i = 1; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`);
  return candidate;
}

// Electron grants every permission a page asks for unless told otherwise.
// This UI only needs notifications and reading the clipboard (paste a link).
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write']);
function isAppOrigin(url) {
  try { return new URL(url).origin === new URL(APP_ORIGIN).origin; } catch { return false; }
}

function lockDownSession(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isAppOrigin(details.requestingUrl || webContents.getURL()));
  });
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => (
    ALLOWED_PERMISSIONS.has(permission)
    && isAppOrigin(requestingOrigin || (details && details.requestingUrl) || (webContents && webContents.getURL()))
  ));
}

function setupDownloads() {
  lockDownSession(mainWindow.webContents.session);
  // No <webview> tags: they could load remote content inside the app.
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  mainWindow.webContents.session.on('will-download', (event, item) => {
    const match = JOB_FILE_RE.exec(item.getURL());
    if (!match) return; // anything else keeps Electron's normal save dialog
    const jobId = match[1];
    const dir = getSettings().downloadDir;
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* reported on failure below */ }
    const target = uniquePath(dir, safeFileName(item.getFilename()));
    item.setSavePath(target);
    item.once('done', (_e, state) => {
      if (state === 'completed') {
        savedFiles.set(jobId, target);
        sendToRenderer('desktop:saved', { jobId, ok: true, path: target });
      } else {
        sendToRenderer('desktop:saved', { jobId, ok: false, error: state === 'cancelled' ? 'Guardado cancelado' : 'No se pudo guardar el archivo' });
      }
    });
  });
}

ipcMain.handle('desktop:getSettings', (event) => (isTrustedSender(event) ? { downloadDir: getSettings().downloadDir } : null));

ipcMain.handle('desktop:chooseFolder', async (event) => {
  if (!isTrustedSender(event)) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Carpeta donde guardar las descargas',
    defaultPath: getSettings().downloadDir,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return { downloadDir: getSettings().downloadDir };
  return { downloadDir: saveSettings({ downloadDir: result.filePaths[0] }).downloadDir };
});

ipcMain.on('desktop:openFolder', (event) => {
  if (!isTrustedSender(event)) return;
  const dir = getSettings().downloadDir;
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
});

ipcMain.on('desktop:saveJob', (event, payload) => {
  if (!isTrustedSender(event) || !payload) return;
  const { jobId, clientId } = payload;
  if (!/^[a-f0-9]{32}$/.test(String(jobId)) || !/^[a-f0-9]{32}$/.test(String(clientId))) return;
  mainWindow.webContents.downloadURL(`${APP_ORIGIN}/api/jobs/${jobId}/file?client=${clientId}`);
});

ipcMain.on('desktop:showInFolder', (event, jobId) => {
  // Only paths this process itself saved; the renderer never supplies a path.
  if (!isTrustedSender(event) || !savedFiles.has(jobId)) return;
  shell.showItemInFolder(savedFiles.get(jobId));
});

ipcMain.on('desktop:setProgress', (event, value) => {
  if (!isTrustedSender(event) || !mainWindow) return;
  const v = Number(value);
  mainWindow.setProgressBar(Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : -1);
});

/**
 * Kill the server process AND every child it spawned (yt-dlp.exe, ffmpeg.exe),
 * without touching unrelated processes elsewhere on the system. `serverProcess`
 * is forked directly by us, so its PID is the root of a process tree that only
 * contains what our app itself launched; `taskkill /t` walks that tree by PID
 * lineage, so it can only reach our own descendants — not some other program's
 * yt-dlp/ffmpeg instance running separately.
 */
function killServerTree() {
  if (!serverProcess || serverProcess.killed || shuttingDown) return;
  shuttingDown = true;
  const pid = serverProcess.pid;

  if (process.platform === 'win32') {
    // This app only ships Windows binaries (yt-dlp.exe, ffmpeg.exe), so this
    // is the path that matters in practice.
    execFile('taskkill', ['/pid', String(pid), '/t', '/f'], () => {});
  } else {
    serverProcess.kill('SIGKILL');
  }
}

/** Poll http://localhost:PORT until it responds or maxAttempts is exceeded */
function waitForServer(port, maxAttempts, interval, callback) {
  let attempts = 0;
  const check = () => {
    attempts++;
    const req = http.get(`http://127.0.0.1:${port}`, (res) => {
      res.resume();
      callback(null);
    });
    req.on('error', () => {
      if (attempts >= maxAttempts) {
        callback(new Error(`Server did not start after ${maxAttempts} attempts`));
      } else {
        setTimeout(check, interval);
      }
    });
    req.setTimeout(interval, () => { req.destroy(); });
  };
  check();
}

// The page's Aspecto setting also drives the native window theme (acrylic
// tint, scrollbars, context menus). Only these three values are accepted.
const THEME_SOURCES = { auto: 'system', light: 'light', dark: 'dark' };
ipcMain.on('appearance:theme', (event, theme) => {
  if (!isTrustedSender(event) || !Object.prototype.hasOwnProperty.call(THEME_SOURCES, theme)) return;
  nativeTheme.themeSource = THEME_SOURCES[theme];
});

// Interface style: Windows 11 (Mica) or macOS (acrylic "glass").
const UI_MATERIALS = { windows: 'mica', mac: 'acrylic' };
ipcMain.on('appearance:ui', (event, ui) => {
  if (!isTrustedSender(event) || !mainWindow || !Object.prototype.hasOwnProperty.call(UI_MATERIALS, ui)) return;
  if (typeof mainWindow.setBackgroundMaterial === 'function') mainWindow.setBackgroundMaterial(UI_MATERIALS[ui]);
});

ipcMain.on('window:control', (event, action) => {
  if (!isTrustedSender(event) || !mainWindow) return;
  if (action === 'close') mainWindow.close();
  else if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  }
});

function createWindow() {
  // Size to the screen actually available: a fixed height taller than a
  // 1366x768 laptop's work area forced users to maximize the window.
  const { width: workW, height: workH } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(900, Math.round(workW * 0.9)),
    height: Math.min(820, Math.round(workH * 0.92)),
    minWidth: 540,
    minHeight: 500,
    center: true,
    title: 'TubeGrab',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    // No native title bar: the page draws its own (Windows caption buttons or
    // macOS traffic lights, via window:control below) and marks drag regions.
    titleBarStyle: 'hidden',
    // Windows 11 material behind the page's translucent layers: Mica for the
    // default Windows interface, acrylic for the macOS one (appearance:ui).
    backgroundMaterial: 'mica',
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true
  });

  // The preload exposes window.updater to whatever this window displays, so it
  // must only ever display our own local UI: no in-app navigation elsewhere, and
  // external links go to the system browser instead of a new Electron window
  // (which would otherwise inherit the same preload).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });

  // The Windows caption bar swaps its maximize/restore glyph.
  const sendWindowState = () => mainWindow.webContents.send('window:state', { maximized: mainWindow.isMaximized() });
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);

  setupDownloads();

  // Start the Express server. windowsHide keeps this (and anything it in turn
  // spawns, like yt-dlp.exe/ffmpeg.exe) from ever flashing a console window.
  const enginePath = ensureEngine();
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    // TUBEGRAB_ELECTRON tells server.js it already has a native window on the
    // way, so it must not also launch the system browser (see server.js).
    env: { ...process.env, NODE_ENV: 'production', TUBEGRAB_ELECTRON: '1', ...(enginePath ? { TUBEGRAB_YTDLP: enginePath } : {}) },
    windowsHide: true,
  });

  // Wait for the server to be ready before loading the URL (avoids race condition)
  waitForServer(PORT, 30, 200, (err) => {
    if (err) {
      console.error('[Electron] Server failed to start:', err.message);
    }
    if (mainWindow) mainWindow.loadURL(APP_ORIGIN);
    checkForUpdates();
    maintainEngine(false);
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  killServerTree();
  if (process.platform !== 'darwin') app.quit();
});

// Safety net: make sure nothing is left running even if quit happens some
// other way (Cmd+Q on macOS, task manager "end task" on the Electron window, etc.)
app.on('before-quit', killServerTree);
app.on('will-quit', killServerTree);

app.on('activate', function () {
  // Only create a new window if all windows are closed
  if (require('electron').BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
