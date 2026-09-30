const {
  app, BrowserWindow, ipcMain, shell, screen, dialog, nativeTheme, net: electronNet, Tray, Menu, Notification, clipboard,
} = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { fork, execFile, spawn } = require('child_process');

const net = require('net');
const { isLocalFolderPath } = require('./lib/filenames');

// The local UI server's port. Stable across launches (the page's saved
// preferences and history are tied to its origin): PORT, else the one saved
// in settings, else 3000. Only set once our own server confirms it's
// listening there (see startServer), never because *something* answers.
let appPort = null;
let APP_ORIGIN = 'http://localhost:0';

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
// Three builds, each updating to its own release asset:
//  - portable (TubeGrab.exe): one .exe with ffmpeg and yt-dlp inside;
//  - light portable (TubeGrab-Lite.exe): downloads ffmpeg/yt-dlp on first launch;
//  - installed (TubeGrab-Setup.exe): per-user NSIS install, updated by
//    running the new installer silently.
const IS_PORTABLE = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
const IS_LITE = !fs.existsSync(path.join(__dirname, 'bin', 'ffmpeg.exe'));
// A separate data folder (settings, history, engine, single-instance lock), for
// running a test copy next to the user's own TubeGrab without touching it.
if (process.env.TUBEGRAB_USER_DATA && path.isAbsolute(process.env.TUBEGRAB_USER_DATA)) {
  app.setPath('userData', process.env.TUBEGRAB_USER_DATA);
}
const UPDATE_ASSET_NAME = !IS_PORTABLE && app.isPackaged ? 'TubeGrab-Setup.exe' : IS_LITE ? 'TubeGrab-Lite.exe' : 'TubeGrab.exe';
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

// Chromium's network errors, in words a user can act on.
function friendlyNetError(err) {
  const m = String((err && err.message) || err);
  if (/INTERNET_DISCONNECTED|NETWORK_CHANGED|ADDRESS_UNREACHABLE/.test(m)) return 'Sin conexión a Internet';
  if (/NAME_NOT_RESOLVED|NAME_RESOLUTION_FAILED/.test(m)) return 'No se encuentra GitHub (¿sin conexión?)';
  if (/CERT_DATE_INVALID/.test(m)) return 'La fecha y hora del equipo no son correctas';
  if (/CERT_|SSL_|ssl/i.test(m)) return 'Conexión segura rechazada (¿antivirus o red que inspecciona HTTPS?)';
  if (/PROXY|TUNNEL/.test(m)) return 'No se pudo conectar a través del proxy';
  if (/TIMED_OUT|CONNECTION_(RESET|CLOSED|REFUSED|FAILED)/.test(m)) return 'No se pudo conectar con GitHub';
  return m.replace(/^net::/, '');
}

/**
 * GET over Chromium's network stack (electron.net): unlike Node's https, it
 * trusts the Windows certificate store and honours the system proxy, so it
 * works behind antivirus HTTPS scanning and corporate networks just like the
 * browser does. Every redirect hop is checked against the GitHub allowlist.
 */
function httpsGet(rawUrl, redirectsLeft, onResponse, onError) {
  let url;
  try { url = assertAllowedUrl(rawUrl); } catch (err) { onError(err); return; }
  let settled = false;
  const fail = (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(idle);
    try { request.abort(); } catch { /* already finished */ }
    onError(err instanceof Error && !/^net::/.test(err.message) ? err : new Error(friendlyNetError(err)));
  };
  // No bytes for 30 s = give up (reset on every chunk, so big downloads are fine).
  let idle = null;
  const touch = () => { clearTimeout(idle); idle = setTimeout(() => fail(new Error('Tiempo de espera agotado')), 30_000); };

  const request = electronNet.request({ url: url.toString(), redirect: 'manual', useSessionCookies: false, cache: 'no-cache' });
  request.setHeader('User-Agent', 'TubeGrab-Updater');
  request.setHeader('Accept', 'application/json, application/octet-stream');
  request.on('redirect', (statusCode, method, redirectUrl) => {
    if (redirectsLeft <= 0) return fail(new Error('Demasiadas redirecciones'));
    try { assertAllowedUrl(redirectUrl); } catch (err) { return fail(err); }
    redirectsLeft -= 1;
    touch();
    request.followRedirect();
  });
  request.on('response', (res) => {
    if (res.statusCode !== 200) {
      const limited = res.statusCode === 403 || res.statusCode === 429;
      return fail(new Error(limited ? 'GitHub limita las consultas ahora mismo; se reintentará más tarde' : `GitHub respondió ${res.statusCode}`));
    }
    // Still watched after this point: a stall or a dropped connection
    // mid-download aborts the request and rejects through onError.
    res.on('data', touch);
    res.on('end', () => clearTimeout(idle));
    res.on('error', () => clearTimeout(idle));
    onResponse(res);
  });
  request.on('error', fail);
  touch();
  request.end();
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
    scheduleUpdateCheck(UPDATE_RETRY_MS);
  }
}

// Checks again later on its own: soon after a failure (no network yet at
// start-up, GitHub rate limit…), and periodically while the app stays open.
const UPDATE_RETRY_MS = 10 * 60 * 1000;
const UPDATE_PERIOD_MS = 6 * 60 * 60 * 1000;
let updateTimer = null;
function scheduleUpdateCheck(ms) {
  clearTimeout(updateTimer);
  updateTimer = setTimeout(() => {
    checkForUpdates().finally(() => { if (updateState.status !== 'error') scheduleUpdateCheck(UPDATE_PERIOD_MS); });
  }, ms);
  updateTimer.unref?.();
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

  if (!IS_PORTABLE) {
    // Installed copy: the new installer (already SHA-256 verified) updates it
    // in place silently and starts the app again when done.
    const setup = spawn(downloadedExePath, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true });
    setup.unref();
    quitting = true;
    app.quit();
    return;
  }

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
    // A network or device path (e.g. from a tampered backup) falls back to the default folder.
    if (!isLocalFolderPath(settingsCache.downloadDir)) {
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
  } catch (err) {
    console.error('[Engine] seed failed:', err.message);
  }
  // Returned even when missing: the light build downloads it next, and the
  // server looks the path up on every use.
  return target;
}

// === Components the light build downloads on first launch ===
const ffmpegRelease = require('./lib/ffmpeg-release');
const ffmpegUserPath = () => path.join(app.getPath('userData'), 'bin', 'ffmpeg.exe');
/** ffmpeg the server should use: the bundled one, else the downloaded copy. */
function ffmpegPathForServer() {
  const bundled = path.join(__dirname, 'bin', 'ffmpeg.exe');
  return fs.existsSync(bundled) ? bundled : ffmpegUserPath();
}

let componentsState = { status: 'ready', progress: null, error: null }; // ready | downloading | error

function setComponents(patch) {
  componentsState = { ...componentsState, ...patch };
  setEngineState({ components: componentsState });
}

async function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    httpsGet(url, MAX_REDIRECTS, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }, reject);
  });
}

/** Light build: fetches whatever is missing (yt-dlp, ffmpeg), each verified by SHA-256. */
async function ensureComponents() {
  if (process.platform !== 'win32') return;
  const needYtdlp = !fs.existsSync(engineUserPath());
  const ffmpegDir = path.dirname(ffmpegUserPath());
  const stamp = path.join(ffmpegDir, 'ffmpeg.version');
  const needFfmpeg = ffmpegPathForServer() === ffmpegUserPath()
    && !(fs.existsSync(ffmpegUserPath()) && fs.existsSync(path.join(ffmpegDir, 'ffprobe.exe'))
      && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === ffmpegRelease.STAMP);
  if (!needYtdlp && !needFfmpeg) return;

  setComponents({ status: 'downloading', progress: 0, error: null });
  try {
    fs.mkdirSync(ffmpegDir, { recursive: true });
    if (needYtdlp) {
      // yt-dlp: the latest release, checked against its published SHA2-256SUMS.
      const base = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
      const [exe, sums] = await Promise.all([fetchBuffer(`${base}/yt-dlp.exe`), fetchBuffer(`${base}/SHA2-256SUMS`)]);
      const line = sums.toString('utf8').split('\n').find((l) => /\syt-dlp\.exe$/.test(l.trim()));
      const expected = line && line.trim().split(/\s+/)[0].toLowerCase();
      if (!expected || crypto.createHash('sha256').update(exe).digest('hex') !== expected) {
        throw new Error('yt-dlp descargado no coincide con su huella SHA-256');
      }
      fs.writeFileSync(engineUserPath(), exe);
      setComponents({ progress: needFfmpeg ? 10 : 100 });
    }
    if (needFfmpeg) {
      const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tubegrab-ffmpeg-'));
      try {
        const zip = path.join(work, 'ffmpeg.zip');
        const result = await downloadToFile(ffmpegRelease.ZIP_URL, zip, (p) => setComponents({ progress: 10 + Math.round(p * 0.85) }));
        if (result.sha256 !== ffmpegRelease.ZIP_SHA256) throw new Error('ffmpeg descargado no coincide con su huella SHA-256');
        // Windows' own tar (bsdtar) reads zip files.
        const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
        await new Promise((resolve, reject) => execFile(tar, ['-xf', zip, '-C', work], { windowsHide: true }, (err) => (err ? reject(err) : resolve())));
        const src = path.join(work, ...ffmpegRelease.ZIP_BIN_DIR.split('/'));
        for (const exe of ['ffmpeg.exe', 'ffprobe.exe']) fs.copyFileSync(path.join(src, exe), path.join(ffmpegDir, exe));
        fs.writeFileSync(stamp, `${ffmpegRelease.STAMP}\n`);
      } finally {
        fs.rm(work, { recursive: true, force: true }, () => {});
      }
    }
    setComponents({ status: 'ready', progress: 100 });
  } catch (err) {
    console.error('[Components] download failed:', err.message);
    setComponents({ status: 'error', error: friendlyNetError(err) });
  }
}

ipcMain.on('components:retry', (event) => {
  if (isTrustedSender(event) && componentsState.status === 'error') ensureComponents().then(() => maintainEngine(false));
});

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
const jobFileMatch = (url) => new RegExp(`^${APP_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/jobs/([a-f0-9]{32})/file\\?client=[a-f0-9]{32}&n=(\\d{1,4})$`).exec(url);

const { safeSaveName, safeFolderName, SAVE_EXTENSIONS } = require('./lib/filenames');

// Files this app itself saved, per job (kept across restarts so History can
// open them later). The renderer only ever names a job id, never a path.
const SAVED_PATH = () => path.join(app.getPath('userData'), 'saved.json');
const SAVED_MAX = 500;
let savedFiles = null; // Map jobId -> [absolute paths]
function saved() {
  if (!savedFiles) {
    savedFiles = new Map();
    try {
      for (const [id, paths] of Object.entries(JSON.parse(fs.readFileSync(SAVED_PATH(), 'utf8')))) {
        if (/^[a-f0-9]{32}$/.test(id) && Array.isArray(paths)) savedFiles.set(id, paths.filter((p) => typeof p === 'string' && path.isAbsolute(p)));
      }
    } catch { /* first run */ }
  }
  return savedFiles;
}
function rememberSaved(jobId, paths) {
  const map = saved();
  map.delete(jobId);
  map.set(jobId, paths);
  while (map.size > SAVED_MAX) map.delete(map.keys().next().value);
  try { fs.writeFileSync(SAVED_PATH(), JSON.stringify(Object.fromEntries(map))); } catch { /* not fatal */ }
}
const pendingSaves = new Map(); // jobId -> { dir, total, paths: [], failed }

function uniquePath(dir, fileName) {
  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  let candidate = path.join(dir, fileName);
  for (let i = 1; fs.existsSync(candidate); i++) candidate = path.join(dir, `${base} (${i})${ext}`);
  return candidate;
}

// Electron grants every permission a page asks for unless told otherwise.
// This UI only needs notifications and reading the clipboard (paste a link).
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
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
    const match = jobFileMatch(item.getURL());
    if (!match) return; // anything else keeps Electron's normal save dialog
    const jobId = match[1];
    const pending = pendingSaves.get(jobId) || { dir: getSettings().downloadDir, total: 1, paths: [], failed: false };
    pendingSaves.set(jobId, pending);
    try { fs.mkdirSync(pending.dir, { recursive: true }); } catch { /* reported on failure below */ }
    const target = uniquePath(pending.dir, safeSaveName(item.getFilename()));
    item.setSavePath(target);
    item.once('done', (_e, state) => {
      if (state === 'completed') pending.paths.push(target); else pending.failed = state;
      if (pending.paths.length + (pending.failed ? 1 : 0) < pending.total && !pending.failed) return;
      pendingSaves.delete(jobId);
      if (pending.paths.length) rememberSaved(jobId, pending.paths);
      if (!pending.failed) {
        sendToRenderer('desktop:saved', { jobId, ok: true, count: pending.paths.length });
      } else {
        sendToRenderer('desktop:saved', { jobId, ok: false, error: pending.failed === 'cancelled' ? 'Guardado cancelado' : 'No se pudo guardar el archivo' });
      }
    });
  });
}


const { normalizeMediaUrl } = require('./lib/download');

// === Browser extension: tubegrab://download?url=… opens the app with the link ===
// Registered for this user only (HKCU). Any web page could open such a link
// (the browser asks first), so all it can ever do is fill in the download
// box with a link from a supported site: the user still presses Download.
const PROTOCOL = 'tubegrab';
const { protocolUrlFrom } = require('./lib/protocol');
let pendingProtocolUrl = null;

function deliverProtocolUrl(url) {
  showWindow();
  sendToRenderer('desktop:pasteUrl', { url });
}
function registerProtocol() {
  if (!app.isPackaged) return;
  // The portable build runs from a temp copy: point Windows at the real .exe.
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  // "exe" -- "%1": after "--" Chromium reads no more switches, so nothing in
  // the link can ever be taken as a command-line option (e.g. --gpu-launcher).
  try { app.setAsDefaultProtocolClient(PROTOCOL, exe, ['--']); } catch (err) { console.warn('[Protocol]', err.message); }
}
pendingProtocolUrl = protocolUrlFrom(process.argv);

// Copies the extension somewhere stable (the portable app's own folder is
// temporary) and opens it, for "Load unpacked" in Chrome / Edge / Brave.
ipcMain.handle('desktop:installExtension', (event) => {
  if (!isTrustedSender(event)) return null;
  const dest = path.join(app.getPath('userData'), 'browser-extension');
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(path.join(__dirname, 'extension'), dest, { recursive: true });
    shell.openPath(dest);
    return { path: dest };
  } catch (err) {
    return { error: err.message };
  }
});


// === Phone notifications through ntfy (https://ntfy.sh): free, no account ===
// The phone subscribes to a channel ("topic") with a long random name; the
// app posts a short message there when a long task finishes. Only file names
// and "done"/"failed" are sent, and only if the user turned it on.
const NTFY_DEFAULTS = { enabled: false, server: 'https://ntfy.sh', topic: '', when: 'long', errors: true };
const NTFY_LONG_SECONDS = 60;
const ntfySent = [];
const randomTopic = () => `tubegrab-${crypto.randomBytes(12).toString('hex')}`;

function ntfyServerOk(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash;
  } catch { return false; }
}
function ntfySettings() {
  const raw = getSettings().ntfy || {};
  const n = { ...NTFY_DEFAULTS };
  if (typeof raw.enabled === 'boolean') n.enabled = raw.enabled;
  if (typeof raw.server === 'string' && ntfyServerOk(raw.server)) n.server = new URL(raw.server).origin;
  if (typeof raw.topic === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(raw.topic)) n.topic = raw.topic;
  if (['long', 'all'].includes(raw.when)) n.when = raw.when;
  if (typeof raw.errors === 'boolean') n.errors = raw.errors;
  if (!n.topic) { n.topic = randomTopic(); saveSettings({ ntfy: n }); }
  return n;
}
function ntfyQr(n) {
  const qr = require('qrcode-generator')(0, 'M');
  qr.addData(`${n.server}/${n.topic}`);
  qr.make();
  return `data:image/svg+xml;base64,${Buffer.from(qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true })).toString('base64')}`;
}
async function ntfyPost(n, { title, message, ok }) {
  const now = Date.now();
  while (ntfySent.length && now - ntfySent[0] > 60 * 60 * 1000) ntfySent.shift();
  if (ntfySent.length >= 30) return { ok: false, error: 'Demasiados avisos en la última hora.' };
  ntfySent.push(now);
  const clean = (v, max) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
  try {
    const res = await electronNet.fetch(`${n.server}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: n.topic, title: clean(title, 120), message: clean(message, 300) || ' ', tags: [ok ? 'white_check_mark' : 'x'] }),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? { ok: true } : { ok: false, error: `ntfy respondió ${res.status}` };
  } catch {
    return { ok: false, error: 'No se pudo contactar con el servidor de avisos.' };
  }
}

ipcMain.handle('desktop:getNtfy', (event) => {
  if (!isTrustedSender(event)) return null;
  const n = ntfySettings();
  return { ...n, qr: ntfyQr(n) };
});
ipcMain.handle('desktop:setNtfy', (event, patch) => {
  if (!isTrustedSender(event) || !patch || typeof patch !== 'object') return null;
  const n = ntfySettings();
  if (typeof patch.enabled === 'boolean') n.enabled = patch.enabled;
  if (['long', 'all'].includes(patch.when)) n.when = patch.when;
  if (typeof patch.errors === 'boolean') n.errors = patch.errors;
  if (typeof patch.server === 'string') { if (!ntfyServerOk(patch.server)) return { error: 'El servidor tiene que ser una dirección https://' }; n.server = new URL(patch.server).origin; }
  if (patch.newTopic === true) n.topic = randomTopic();
  saveSettings({ ntfy: n });
  return { ...n, qr: ntfyQr(n) };
});
ipcMain.handle('desktop:testNtfy', (event) => {
  if (!isTrustedSender(event)) return null;
  return ntfyPost(ntfySettings(), { title: 'TubeGrab', message: 'Aviso de prueba: si lo ves, ya está todo listo.', ok: true });
});
// A finished task, from the page: sent only if it's on and it qualifies.
ipcMain.on('desktop:jobFinished', (event, info) => {
  if (!isTrustedSender(event) || !info || typeof info !== 'object') return;
  const n = ntfySettings();
  if (!n.enabled) return;
  const ok = info.ok === true;
  if (!ok && !n.errors) return;
  const seconds = Number(info.seconds) || 0;
  if (ok && n.when === 'long' && seconds < NTFY_LONG_SECONDS) return;
  ntfyPost(n, { title: typeof info.title === 'string' ? info.title : 'TubeGrab', message: info.message, ok });
});

// === Library: show a file of the download folder in Explorer ===
// The page sends a path relative to the folder; only a real media file that
// is really inside it (links resolved) is shown.
ipcMain.on('desktop:showLibraryFile', (event, rel) => {
  if (!isTrustedSender(event) || typeof rel !== 'string' || rel.length > 2000 || rel.includes('\0')) return;
  try {
    const root = fs.realpathSync(getSettings().downloadDir);
    const real = fs.realpathSync(path.resolve(root, rel));
    const ext = path.extname(real).slice(1).toLowerCase();
    if (real.startsWith(root + path.sep) && fs.statSync(real).isFile() && SAVE_EXTENSIONS.has(ext)) shell.showItemInFolder(real);
  } catch { /* gone */ }
});

// === Backup: settings, history and subscriptions to a .json file and back ===
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
ipcMain.handle('desktop:exportBackup', async (event, text) => {
  if (!isTrustedSender(event) || typeof text !== 'string' || Buffer.byteLength(text) > MAX_BACKUP_BYTES) return { ok: false };
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Guardar copia de seguridad de TubeGrab',
    defaultPath: path.join(app.getPath('documents'), `TubeGrab-copia-${stamp}.json`),
    filters: [{ name: 'Copia de TubeGrab', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  const file = /\.json$/i.test(result.filePath) ? result.filePath : `${result.filePath}.json`;
  fs.writeFileSync(file, text, 'utf8');
  return { ok: true };
});
ipcMain.handle('desktop:importBackup', async (event) => {
  if (!isTrustedSender(event)) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Abrir copia de seguridad de TubeGrab',
    filters: [{ name: 'Copia de TubeGrab', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const st = fs.statSync(result.filePaths[0]);
  if (!st.isFile() || st.size > MAX_BACKUP_BYTES) return { error: 'El archivo no es una copia de TubeGrab.' };
  return { text: fs.readFileSync(result.filePaths[0], 'utf8') };
});
// From a backup: only an existing folder on this computer is accepted.
ipcMain.handle('desktop:setDownloadDir', (event, dir) => {
  // Only a local folder: a backup naming \\\\server\\share would make Windows
  // hand the user's network credentials to that server when it's checked.
  if (!isTrustedSender(event) || !isLocalFolderPath(dir)) return { ok: false };
  try {
    if (!fs.statSync(dir).isDirectory()) return { ok: false };
  } catch { return { ok: false }; }
  saveSettings({ downloadDir: dir });
  return { ok: true };
});

const cookiesFile = () => path.join(app.getPath('userData'), 'cookies.txt');

ipcMain.handle('desktop:getSettings', (event) => {
  if (!isTrustedSender(event)) return null;
  const s = getSettings();
  return {
    downloadDir: s.downloadDir,
    hasCookies: fs.existsSync(cookiesFile()),
    closeToTray: s.closeToTray === true,
    clipboardWatch: s.clipboardWatch === true,
    organize: ORGANIZE.includes(s.organize) ? s.organize : 'none',
    flavor: !IS_PORTABLE && app.isPackaged ? 'installed' : IS_LITE ? 'lite' : 'portable',
  };
});

// Downloads into folders by artist (and album), or straight into the folder.
const ORGANIZE = ['none', 'artist', 'artist-album'];

// Booleans, and `organize` from its list; anything else is ignored.
ipcMain.on('desktop:setOptions', (event, patch) => {
  if (!isTrustedSender(event) || !patch || typeof patch !== 'object') return;
  const next = {};
  for (const key of ['closeToTray', 'clipboardWatch']) if (typeof patch[key] === 'boolean') next[key] = patch[key];
  if (ORGANIZE.includes(patch.organize)) next.organize = patch.organize;
  saveSettings(next);
  applyClipboardWatch();
});

// === System tray, close-to-tray and copied-link detection ===
let tray = null;
let quitting = false;
let trayHintShown = false;
app.on('before-quit', () => { quitting = true; });

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function setupTray() {
  if (tray) return;
  tray = new Tray(path.join(__dirname, 'build', 'icon.ico'));
  tray.setToolTip('TubeGrab');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir TubeGrab', click: showWindow },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

// Close button with "keep running in the tray" on: hide instead of quitting,
// so downloads and subscriptions carry on.
function onWindowClose(event) {
  if (quitting || getSettings().closeToTray !== true) return;
  event.preventDefault();
  mainWindow.hide();
  if (!trayHintShown && Notification.isSupported()) {
    trayHintShown = true;
    new Notification({ title: 'TubeGrab sigue abierto', body: 'Está en la bandeja del sistema. Haz clic en su icono para volver, o "Salir" para cerrarlo.', silent: true }).show();
  }
}

let clipboardTimer = null;
let lastClipboard = '';

// Polls the clipboard (only while enabled): a supported link copied in any
// other app offers a one-click download. Nothing leaves the computer.
function applyClipboardWatch() {
  clearInterval(clipboardTimer);
  clipboardTimer = null;
  if (getSettings().clipboardWatch !== true) return;
  // Electron 44's clipboard.readText() returns a Promise (older versions a
  // string), and the clipboard can be locked by another app or hold something
  // that isn't text: any read problem is just "nothing new", never an error.
  const readClipboard = async () => {
    try {
      const value = await clipboard.readText();
      return typeof value === 'string' ? value : '';
    } catch {
      return '';
    }
  };
  let reading = false;
  readClipboard().then((v) => { lastClipboard = v; });
  clipboardTimer = setInterval(async () => {
    if (reading) return;
    reading = true;
    try {
      const text = await readClipboard();
      if (!text || text === lastClipboard) return;
      lastClipboard = text;
      const value = text.trim();
      const url = value.length < 2048 && !/\s/.test(value) ? normalizeMediaUrl(value) : null;
      if (!url || !mainWindow || mainWindow.isDestroyed() || mainWindow.isFocused() || !Notification.isSupported()) return;
      console.log('[Clipboard] offering a copied link');
      const note = new Notification({ title: 'Enlace copiado', body: 'Haz clic para descargarlo con TubeGrab.', silent: true });
      note.on('click', () => {
        showWindow();
        sendToRenderer('desktop:pasteUrl', { url });
      });
      note.show();
    } catch (err) {
      console.error('[Clipboard] check failed:', err.message);
    } finally {
      reading = false;
    }
  }, 1500);
}

// Opens the data folder (where cookies.txt goes). The renderer can't pick the path.
ipcMain.on('desktop:openDataFolder', (event) => {
  if (!isTrustedSender(event)) return;
  shell.openPath(app.getPath('userData'));
});

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

const MAX_FILES_PER_JOB = 300;

ipcMain.on('desktop:saveJob', (event, payload) => {
  if (!isTrustedSender(event) || !payload) return;
  const { jobId, clientId } = payload;
  if (!/^[a-f0-9]{32}$/.test(String(jobId)) || !/^[a-f0-9]{32}$/.test(String(clientId)) || pendingSaves.has(jobId)) return;
  const count = Math.min(MAX_FILES_PER_JOB, Math.max(1, Math.floor(Number(payload.count) || 1)));
  // Downloads can go into Artist / Album folders (setting). Every name is
  // sanitised here into a single folder name, never used as a path.
  let base = getSettings().downloadDir;
  const organize = getSettings().organize;
  const artist = typeof payload.artist === 'string' ? payload.artist.trim() : '';
  const album = typeof payload.album === 'string' ? payload.album.trim() : '';
  if ((organize === 'artist' || organize === 'artist-album') && artist) {
    base = path.join(base, safeFolderName(artist));
    if (organize === 'artist-album' && album) base = path.join(base, safeFolderName(album));
  }
  // Several files (chapters, video + subtitles) go together in a subfolder
  // named after the job, unless the page says they belong side by side
  // (a song and its .lrc lyrics).
  const folder = typeof payload.folder === 'string' ? payload.folder : '';
  const dir = count > 1 && folder ? uniquePath(base, safeFolderName(folder)) : base;
  pendingSaves.set(jobId, { dir, total: count, paths: [], failed: false });
  for (let n = 0; n < count; n++) {
    mainWindow.webContents.downloadURL(`${APP_ORIGIN}/api/jobs/${jobId}/file?client=${clientId}&n=${n}`);
  }
});

// Only paths this app itself saved (looked up by job id) can be shown or
// opened; the renderer never supplies a path.
const savedFor = (jobId) => (/^[a-f0-9]{32}$/.test(String(jobId)) ? (saved().get(jobId) || []).filter((p) => fs.existsSync(p)) : []);

ipcMain.on('desktop:showInFolder', (event, jobId) => {
  const paths = isTrustedSender(event) ? savedFor(jobId) : [];
  if (paths.length) shell.showItemInFolder(paths[0]);
});

ipcMain.on('desktop:openSaved', (event, jobId) => {
  const paths = isTrustedSender(event) ? savedFor(jobId) : [];
  // One file opens in its app; several (chapters…) open their folder.
  if (paths.length === 1) shell.openPath(paths[0]);
  else if (paths.length > 1) shell.openPath(path.dirname(paths[0]));
});

ipcMain.handle('desktop:savedExists', (event, ids) => {
  if (!isTrustedSender(event) || !Array.isArray(ids)) return {};
  return Object.fromEntries(ids.slice(0, 200).map((id) => [id, savedFor(id).length > 0]));
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

/** A port nothing is listening on right now (the OS picks it). */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Forks server.js on `port` and resolves once *that child* reports it is
 * listening (IPC message), so the window can never be pointed at some other
 * program that happens to answer on the same port. If the port is taken, a
 * free one is picked and remembered, keeping the origin stable from then on.
 */
function startServer(port, enginePath, retriesLeft = 2) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'server.js'), [], {
      // TUBEGRAB_ELECTRON tells server.js it already has a native window on the
      // way, so it must not also launch the system browser (see server.js).
      env: {
        ...process.env, NODE_ENV: 'production', TUBEGRAB_ELECTRON: '1', PORT: String(port),
        TUBEGRAB_DATA_DIR: app.getPath('userData'),
        // Where downloads go when the user hasn't picked a folder (the library reads it).
        TUBEGRAB_DEFAULT_DOWNLOADS: path.join(app.getPath('downloads'), 'TubeGrab'),
        FFMPEG_BIN: ffmpegPathForServer(),
        ...(enginePath ? { TUBEGRAB_YTDLP: enginePath } : {}),
      },
      windowsHide: true,
    });
    serverProcess = child;
    let handedOff = false; // this child gave up its port; a new one takes over
    const timer = setTimeout(() => reject(new Error('el servidor no arrancó a tiempo')), 30_000);
    child.on('message', async (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'listening' && msg.port === port) {
        clearTimeout(timer);
        resolve(port);
      } else if (msg.type === 'port-in-use') {
        clearTimeout(timer);
        handedOff = true;
        if (retriesLeft <= 0) return reject(new Error(`el puerto ${port} está ocupado`));
        try {
          const next = await findFreePort();
          console.warn(`[Electron] Port ${port} is in use; switching to ${next}.`);
          saveSettings({ port: next });
          resolve(await startServer(next, enginePath, retriesLeft - 1));
        } catch (err) { reject(err); }
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (!handedOff && !shuttingDown) reject(new Error(`el servidor terminó (código ${code})`));
    });
  });
}

function preferredPort() {
  const fromEnv = Number(process.env.PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536) return fromEnv;
  const saved = Number(getSettings().port);
  return Number.isInteger(saved) && saved >= 1024 && saved < 65536 ? saved : 3000;
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

  mainWindow.on('close', onWindowClose);
  setupDownloads();
  setupTray();
  applyClipboardWatch();

  // Start the Express server. windowsHide keeps this (and anything it in turn
  // spawns, like yt-dlp.exe/ffmpeg.exe) from ever flashing a console window.
  startServer(preferredPort(), ensureEngine()).then((port) => {
    appPort = port;
    APP_ORIGIN = `http://localhost:${appPort}`;
    if (mainWindow) {
      mainWindow.loadURL(APP_ORIGIN);
      // A tubegrab:// link that launched the app (browser extension): hand it
      // over once the page is there to receive it.
      if (pendingProtocolUrl) mainWindow.webContents.once('did-finish-load', () => { deliverProtocolUrl(pendingProtocolUrl); pendingProtocolUrl = null; });
    }
    checkForUpdates().finally(() => { if (updateState.status !== 'error') scheduleUpdateCheck(UPDATE_PERIOD_MS); });
    // Light build: fetch ffmpeg / yt-dlp first if they're not there yet.
    ensureComponents().then(() => maintainEngine(false));
  }, (err) => {
    console.error('[Electron] Server failed to start:', err.message);
    dialog.showErrorBox('TubeGrab', `No se pudo iniciar TubeGrab: ${err.message}.`);
    app.quit();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// One instance at a time: a second launch just brings the open window forward
// (two copies would fight over the same port, engine and settings).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // (It may be hidden in the tray.) A tubegrab:// link opened while running
  // arrives here too.
  app.on('second-instance', (_event, argv) => {
    showWindow();
    const url = protocolUrlFrom(argv);
    if (url) deliverProtocolUrl(url);
  });
  app.on('ready', registerProtocol);
  app.on('ready', createWindow);
}

app.on('window-all-closed', function () {
  killServerTree();
  if (process.platform !== 'darwin') app.quit();
});

// Portable build: Windows needs a Start menu shortcut to show notifications,
// and one is created pointing at this run's temporary copy of the app — a
// dead link once it exits. Remove ours on quit, and dead ones left by
// earlier runs on start. Only links to a "TubeGrab Pro.exe" inside the temp
// folder are touched (never the installer's shortcut or anything else).
function cleanPortableShortcuts({ onlyCurrent }) {
  if (process.platform !== 'win32' || !IS_PORTABLE) return;
  const dir = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => /\.lnk$/i.test(n)); } catch { return; }
  const tmp = path.resolve(os.tmpdir()).toLowerCase();
  for (const name of names) {
    const file = path.join(dir, name);
    let target = '';
    try { target = shell.readShortcutLink(file).target || ''; } catch { continue; }
    const resolved = path.resolve(target).toLowerCase();
    const ours = path.basename(resolved) === path.basename(process.execPath).toLowerCase() && resolved.startsWith(`${tmp}${path.sep}`);
    if (!ours) continue;
    const isCurrent = resolved === path.resolve(process.execPath).toLowerCase();
    if (onlyCurrent ? isCurrent : (!isCurrent && !fs.existsSync(target))) {
      try { fs.rmSync(file, { force: true }); } catch { /* in use: next time */ }
    }
  }
}
app.on('ready', () => cleanPortableShortcuts({ onlyCurrent: false }));
app.on('will-quit', () => cleanPortableShortcuts({ onlyCurrent: true }));

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
