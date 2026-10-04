const {
  app, BrowserWindow, ipcMain, shell, screen, dialog, nativeTheme, net: electronNet, Tray, Menu, Notification, clipboard,
  globalShortcut, nativeImage, desktopCapturer,
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

// Hosts allowed for one download: GitHub by default; the subtitles models
// also come from Hugging Face (and its CDN), each file checked by SHA-256.
const githubOnly = (host) => ALLOWED_UPDATE_HOSTS.has(host);
const githubOrHuggingFace = (host) => githubOnly(host) || host === 'huggingface.co' || host.endsWith('.huggingface.co') || host.endsWith('.hf.co');

function assertAllowedUrl(rawUrl, allow = githubOnly) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !allow(url.hostname)) {
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
function httpsGet(rawUrl, redirectsLeft, onResponse, onError, allow = githubOnly) {
  let url;
  try { url = assertAllowedUrl(rawUrl, allow); } catch (err) { onError(err); return; }
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
    try { assertAllowedUrl(redirectUrl, allow); } catch (err) { return fail(err); }
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
function downloadToFile(url, destPath, onProgress, allow = githubOnly) {
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
    }, reject, allow);
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

// === Automatic subtitles: the Whisper engine and its models, on demand ===
// whisper.cpp's Windows build (from its GitHub releases) and one or more
// models (from Hugging Face), each pinned by SHA-256, into userData/whisper.
const whisperInfo = require('./lib/whisper');
const whisperDir = () => path.join(app.getPath('userData'), 'whisper');
let whisperState = { busy: false, progress: null, error: null, what: null };
function setWhisperState(patch) {
  whisperState = { ...whisperState, ...patch };
  sendToRenderer('whisper:state', { ...whisperState, ...whisperInfo.status(whisperDir()) });
}
async function installWhisper(model) {
  if (whisperState.busy || !Object.prototype.hasOwnProperty.call(whisperInfo.MODELS, model)) return;
  const dir = whisperDir();
  setWhisperState({ busy: true, progress: 0, error: null, what: model });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tubegrab-whisper-'));
  try {
    fs.mkdirSync(dir, { recursive: true });
    const have = whisperInfo.status(dir);
    const needEngine = !have.engine;
    const m = whisperInfo.MODELS[model];
    const share = needEngine ? 0.1 : 0;
    if (needEngine) {
      const zip = path.join(work, 'whisper.zip');
      const r = await downloadToFile(whisperInfo.ENGINE.url, zip, (p) => setWhisperState({ progress: Math.round(p * share) }));
      if (r.sha256 !== whisperInfo.ENGINE.sha256) throw new Error('el motor descargado no coincide con su huella SHA-256');
      const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
      await new Promise((resolve, reject) => execFile(tar, ['-xf', zip, '-C', work], { windowsHide: true }, (err) => (err ? reject(err) : resolve())));
      const src = path.join(work, 'Release');
      // Only the program and its libraries (the zip has many other tools).
      for (const name of fs.readdirSync(src)) if (whisperInfo.ENGINE.files.test(name)) fs.copyFileSync(path.join(src, name), path.join(dir, name));
    }
    if (!have.models.includes(model)) {
      const tmp = path.join(work, m.file);
      const r = await downloadToFile(whisperInfo.modelUrl(model), tmp, (p) => setWhisperState({ progress: Math.round(share * 100 + p * (1 - share)) }), githubOrHuggingFace);
      if (r.sha256 !== m.sha256 || r.size !== m.size) throw new Error('el modelo descargado no coincide con su huella SHA-256');
      fs.copyFileSync(tmp, path.join(dir, m.file));
    }
    setWhisperState({ busy: false, progress: 100, what: null });
  } catch (err) {
    console.error('[Whisper] install failed:', err.message);
    setWhisperState({ busy: false, progress: null, error: friendlyNetError(err), what: null });
  } finally {
    fs.rm(work, { recursive: true, force: true }, () => {});
  }
}
ipcMain.handle('whisper:getState', (event) => (isTrustedSender(event) ? { ...whisperState, ...whisperInfo.status(whisperDir()) } : null));
ipcMain.on('whisper:install', (event, model) => { if (isTrustedSender(event)) installWhisper(String(model)); });
ipcMain.handle('whisper:remove', (event, model) => {
  if (!isTrustedSender(event) || whisperState.busy) return null;
  if (model === 'all') fs.rmSync(whisperDir(), { recursive: true, force: true });
  else if (Object.prototype.hasOwnProperty.call(whisperInfo.MODELS, model)) fs.rmSync(path.join(whisperDir(), whisperInfo.MODELS[model].file), { force: true });
  return { ...whisperState, ...whisperInfo.status(whisperDir()) };
});

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
// (display-capture: recording the screen for the Editor, which also needs the user's pick above.)
const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'display-capture']);
function isAppOrigin(url) {
  try { return new URL(url).origin === new URL(APP_ORIGIN).origin; } catch { return false; }
}

function lockDownSession(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    // Recording the screen asks for "media" with no devices: only right after the
    // user picked a screen or window in the app (never the microphone or camera).
    if (permission === 'media') {
      const fresh = pendingCapture && Date.now() - pendingCapture.at < 30000;
      callback(Boolean(fresh) && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 0 && isAppOrigin(details.requestingUrl || webContents.getURL()));
      return;
    }
    callback(ALLOWED_PERMISSIONS.has(permission) && isAppOrigin(details.requestingUrl || webContents.getURL()));
  });
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => (
    ALLOWED_PERMISSIONS.has(permission)
    && isAppOrigin(requestingOrigin || (details && details.requestingUrl) || (webContents && webContents.getURL()))
  ));
}

function setupDownloads() {
  lockDownSession(mainWindow.webContents.session);
  setupCapture(mainWindow.webContents.session);
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
        checkSpace().catch(() => {});
      } else {
        sendToRenderer('desktop:saved', { jobId, ok: false, error: pending.failed === 'cancelled' ? 'Guardado cancelado' : 'No se pudo guardar el archivo' });
      }
    });
  });
}


const { normalizeMediaUrl } = require('./lib/download');

// === A media file of the download folder, from a path relative to it ===
// Only a real file (links resolved) that is inside the folder and has a
// media extension; null otherwise.
function libraryFile(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 2000 || rel.includes('\0')) return null;
  try {
    const root = fs.realpathSync(getSettings().downloadDir);
    const real = fs.realpathSync(path.resolve(root, rel));
    const ext = path.extname(real).slice(1).toLowerCase();
    if (real.startsWith(root + path.sep) && fs.statSync(real).isFile() && SAVE_EXTENSIONS.has(ext)) return real;
  } catch { /* gone */ }
  return null;
}

// Duplicates: the chosen copy goes to the Recycle Bin (it can be restored).
ipcMain.handle('desktop:trashLibraryFile', async (event, rel) => {
  if (!isTrustedSender(event)) return { ok: false };
  const file = libraryFile(rel);
  if (!file) return { ok: false };
  try { await shell.trashItem(file); return { ok: true }; } catch { return { ok: false }; }
});

// === Mirrored playlists: the folder follows the playlist ===
// Files are named "<title> [<id>].<ext>" inside one folder per playlist. Files
// whose id left the playlist go to the Recycle Bin (never more than half the
// folder at once: a short or failed list must not empty it), and a .m3u8 in
// the playlist's order is written next to them.
const MEDIA_EXT = new Set(['mp3', 'm4a', 'aac', 'opus', 'ogg', 'flac', 'wav', 'webm', 'mp4', 'mkv', 'mov']);
ipcMain.handle('desktop:syncMirror', async (event, info) => {
  if (!isTrustedSender(event) || !info || typeof info !== 'object' || !Array.isArray(info.ids)) return null;
  const ids = info.ids.filter((id) => typeof id === 'string' && /^[\w-]{1,100}$/.test(id)).slice(0, 5000);
  if (!ids.length) return null;
  const dir = path.join(getSettings().downloadDir, safeFolderName(String(info.folder || '')));
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.isSymbolicLink()).map((e) => e.name); } catch { return { removed: 0, kept: 0 }; }
  const byId = new Map();
  for (const n of names) {
    const m = /\[([\w-]{1,100})\]\.([a-z0-9]{2,4})$/i.exec(n);
    if (m && MEDIA_EXT.has(m[2].toLowerCase())) byId.set(m[1], [...(byId.get(m[1]) || []), n]);
  }
  const wanted = new Set(ids);
  const gone = [...byId.keys()].filter((id) => !wanted.has(id));
  let removed = 0;
  if (gone.length && gone.length <= Math.max(1, Math.floor(byId.size / 2))) {
    for (const id of gone) {
      for (const n of byId.get(id)) {
        try { await shell.trashItem(path.join(dir, n)); removed += 1; } catch { /* in use */ }
        // Its lyrics / sheet / poster go with it.
        const base = n.replace(/\.[^.]+$/, '');
        for (const extra of [`${base}.lrc`, `${base}.nfo`, `${base}-poster.jpg`]) if (fs.existsSync(path.join(dir, extra))) shell.trashItem(path.join(dir, extra)).catch(() => {});
      }
      byId.delete(id);
    }
  }
  const lines = ['#EXTM3U', `#PLAYLIST:${String(info.title || info.folder || '').replace(/[\r\n]/g, ' ').slice(0, 200)}`, '#EXTENC:UTF-8', '# TubeGrab'];
  for (const id of ids) {
    const n = (byId.get(id) || [])[0];
    if (n) lines.push(`#EXTINF:-1,${n.replace(/\s*\[[\w-]+\]\.[^.]+$/, '')}`, n);
  }
  try { fs.writeFileSync(path.join(dir, `${safeFolderName(String(info.folder || 'playlist'))}.m3u8`), `${lines.join('\n')}\n`, 'utf8'); } catch { /* not fatal */ }
  return { removed, kept: byId.size, skipped: gone.length > removed ? gone.length - removed : 0 };
});

// === Mini player: a small window on top of the others ===
// Moved by dragging it anywhere but its buttons (the page sends how far the
// pointer went; only the mini window itself can), and it opens where it was left.
// It can also be an overlay over a game: see-through, on top of everything,
// fixed in place, and even letting clicks through to what's behind.
let miniWindow = null;
const MINI_SIZES = { normal: { width: 360, height: 128 }, compact: { width: 300, height: 64 } };
const MINI_TALL = 470;
const MINI_DEFAULTS = { opacity: 1, hoverFull: true, onTop: true, locked: false, clickThrough: false, compact: false, noFocus: true };
/** The mini player's own settings, each checked (they drive window calls). */
function miniPrefs() {
  const raw = getSettings().miniPrefs || {};
  const out = { ...MINI_DEFAULTS };
  if (Number.isFinite(raw.opacity)) out.opacity = Math.min(1, Math.max(0.2, Math.round(raw.opacity * 20) / 20));
  for (const k of ['hoverFull', 'onTop', 'locked', 'clickThrough', 'compact', 'noFocus']) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  return out;
}
const miniSize = () => MINI_SIZES[miniPrefs().compact ? 'compact' : 'normal'];
let miniExpanded = false;
let miniHovered = false;
let miniGrabbed = false; // Ctrl held over it while clicks pass through
// Where it was before the search opened (it may move up to fit), to go back there.
let miniBeforeExpand = null;
let miniMovedWhileOpen = false;
function miniPosition() {
  const saved = getSettings().miniPos;
  const size = miniSize();
  if (saved && Number.isInteger(saved.x) && Number.isInteger(saved.y)) {
    // Only if it's still on a screen (a monitor may have been unplugged).
    const fits = screen.getAllDisplays().some(({ workArea: w }) => saved.x >= w.x - 40 && saved.y >= w.y - 10 && saved.x + 80 <= w.x + w.width && saved.y + 40 <= w.y + w.height);
    if (fits) return saved;
  }
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - size.width - 20, y: workArea.y + workArea.height - size.height - 20 };
}
/** Opacity, on top, clicks through: what the settings say, now. */
function applyMiniPrefs() {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  const p = miniPrefs();
  // Fully visible while the pointer is on it (or the search is open), if so chosen.
  const full = (p.hoverFull && miniHovered) || miniExpanded || miniGrabbed;
  miniWindow.setOpacity(full ? 1 : p.opacity);
  // "screen-saver" also stays above games in borderless / windowed mode.
  miniWindow.setAlwaysOnTop(p.onTop, p.onTop ? 'screen-saver' : 'normal');
  const through = p.clickThrough && !miniGrabbed && !miniExpanded;
  miniWindow.setIgnoreMouseEvents(through, through ? { forward: true } : undefined);
  // Over a game: its buttons work without taking the keyboard from the game
  // (a fullscreen game that loses focus minimizes itself). The search needs typing.
  miniWindow.setFocusable(!(p.noFocus && !miniExpanded));
  miniWindow.webContents.send('mini:prefs', { ...p, through, expanded: miniExpanded, full });
}
// A game that comes to the front can put itself above "always on top"
// windows; while the mini player should stay on top, it's put back up there.
let miniTopTimer = null;
function keepMiniOnTop() {
  clearInterval(miniTopTimer);
  miniTopTimer = setInterval(() => {
    if (!miniWindow || miniWindow.isDestroyed()) { clearInterval(miniTopTimer); miniTopTimer = null; return; }
    if (!miniPrefs().onTop || !miniWindow.isVisible() || miniWindow.isFocused()) return;
    miniWindow.setAlwaysOnTop(true, 'screen-saver');
    miniWindow.moveTop();
  }, 1500);
}
function openMini() {
  if (miniWindow && !miniWindow.isDestroyed()) { miniWindow.show(); miniWindow.focus(); return; }
  const pos = miniPosition();
  miniExpanded = false;
  miniBeforeExpand = null;
  miniWindow = new BrowserWindow({
    ...miniSize(), ...pos,
    frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: false, maximizable: false, fullscreenable: false,
    title: 'TubeGrab', icon: path.join(__dirname, 'build', 'icon.ico'), backgroundColor: '#1c1c1e',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  miniWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  miniWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  miniWindow.webContents.on('will-attach-webview', (e) => e.preventDefault());
  miniWindow.webContents.on('did-finish-load', applyMiniPrefs);
  miniWindow.loadURL(`${APP_ORIGIN}/mini.html`);
  applyMiniPrefs();
  keepMiniOnTop();
  // Moved by Windows (keyboard, snap) too: remembered either way.
  miniWindow.on('moved', () => { if (!miniExpanded) saveMiniPosSoon(); });
  // Reached with Alt+Tab or a click: usable even if clicks pass through, and
  // never left half-grabbed after switching windows.
  miniWindow.on('focus', () => { miniGrabbed = true; applyMiniPrefs(); });
  miniWindow.on('blur', () => { miniGrabbed = false; miniHovered = false; applyMiniPrefs(); });
  miniWindow.on('show', applyMiniPrefs);
  miniWindow.on('restore', applyMiniPrefs);
  miniWindow.on('closed', () => {
    clearInterval(miniTopTimer);
    miniTopTimer = null;
    miniWindow = null;
    // Its visualizer bars stop.
    sendToRenderer('player:command', { cmd: 'miniClosed' });
    miniGrabbed = false;
    miniHovered = false;
    // The main window was closed while the mini player kept the music going:
    // now it really closes (or stays in the tray, if that's what you chose).
    if (!closedBehindMini || !mainWindow || mainWindow.isVisible()) return;
    closedBehindMini = false;
    if (getSettings().closeToTray === true) sendToRenderer('player:command', { cmd: 'pause' });
    else { quitting = true; app.quit(); }
  });
}
/** The search drawer: taller (moved up only if it must, to fit), then back exactly where it was. */
function expandMini(tall) {
  if (!miniWindow || miniWindow.isDestroyed() || tall === miniExpanded) return;
  const size = miniSize();
  const [x, y] = miniWindow.getPosition();
  if (tall) {
    miniBeforeExpand = { x, y };
    const { workArea: w } = screen.getDisplayMatching({ x, y, width: size.width, height: MINI_TALL });
    miniExpanded = true;
    miniWindow.setBounds({ x, y: Math.max(w.y, Math.min(y, w.y + w.height - MINI_TALL)), width: size.width, height: MINI_TALL });
    applyMiniPrefs();
    // The search box takes typing (only while it's open).
    miniWindow.focus();
    return;
  } else {
    miniExpanded = false;
    const back = miniBeforeExpand && !miniMovedWhileOpen ? miniBeforeExpand : { x, y };
    miniMovedWhileOpen = false;
    miniBeforeExpand = null;
    miniWindow.setBounds({ x: back.x, y: back.y, width: size.width, height: size.height });
    saveMiniPosSoon();
  }
  applyMiniPrefs();
}
/** To a corner of its screen, 12 px in. */
function snapMini(corner) {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  const [x, y] = miniWindow.getPosition();
  const [width, height] = miniWindow.getSize();
  const { workArea: w } = screen.getDisplayMatching({ x, y, width, height });
  const m = 12;
  const nx = corner.endsWith('l') ? w.x + m : w.x + w.width - width - m;
  const ny = corner.startsWith('t') ? w.y + m : w.y + w.height - height - m;
  miniWindow.setPosition(nx, ny);
  if (miniExpanded) miniBeforeExpand = { x: nx, y: corner.startsWith('t') ? ny : w.y + w.height - miniSize().height - m };
  saveMiniPosSoon();
}
function setMiniPrefs(patch) {
  const cur = miniPrefs();
  const next = { ...cur };
  if (Number.isFinite(patch.opacity)) next.opacity = Math.min(1, Math.max(0.2, Math.round(patch.opacity * 20) / 20));
  for (const k of ['hoverFull', 'onTop', 'locked', 'clickThrough', 'compact', 'noFocus']) if (typeof patch[k] === 'boolean') next[k] = patch[k];
  saveSettings({ miniPrefs: next });
  // Compact or not: another size, keeping the same bottom-right corner on screen.
  if (next.compact !== cur.compact && miniWindow && !miniWindow.isDestroyed() && !miniExpanded) {
    const [x, y] = miniWindow.getPosition();
    const size = miniSize();
    const { workArea: w } = screen.getDisplayMatching({ x, y, width: size.width, height: size.height });
    miniWindow.setBounds({ x: Math.min(x, w.x + w.width - size.width), y: Math.min(y, w.y + w.height - size.height), ...size });
  }
  applyMiniPrefs();
}
// The main window hidden because it was closed with the mini player open.
let closedBehindMini = false;
let miniHintShown = false;
let miniSaveTimer = null;
function saveMiniPosSoon() {
  clearTimeout(miniSaveTimer);
  miniSaveTimer = setTimeout(() => { if (miniWindow && !miniWindow.isDestroyed() && !miniExpanded) { const [x, y] = miniWindow.getPosition(); saveSettings({ miniPos: { x, y } }); } }, 400);
}
ipcMain.on('desktop:openMini', (event) => {
  if (!isTrustedSender(event) || event.sender !== (mainWindow && mainWindow.webContents)) return;
  openMini();
});
ipcMain.on('mini:move', (event, delta) => {
  if (!isTrustedSender(event) || !miniWindow || miniWindow.isDestroyed() || event.sender !== miniWindow.webContents || !delta || typeof delta !== 'object') return;
  // Fixed in place: dragging does nothing.
  if (miniPrefs().locked) return;
  const dx = Math.round(Number(delta.dx));
  const dy = Math.round(Number(delta.dy));
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 4000 || Math.abs(dy) > 4000) return;
  const [x, y] = miniWindow.getPosition();
  miniWindow.setPosition(x + dx, y + dy);
  // Moved by hand with the search open: closing it keeps the new place.
  if (miniExpanded) miniMovedWhileOpen = true;
  else saveMiniPosSoon();
});
// What's playing, as the main page last said (for the mini window, the
// taskbar buttons, Last.fm and Discord).
let playerNow = { title: '', sub: '', artist: '', track: '', playing: false, time: 0, duration: 0, cover: null, active: false };
// The main page's player → the mini window; the mini window's buttons → the main page.
ipcMain.on('player:state', (event, state) => {
  if (!isTrustedSender(event) || !mainWindow || event.sender !== mainWindow.webContents || !state || typeof state !== 'object') return;
  const text = (v, n = 300) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
  const clean = {
    title: text(state.title), sub: text(state.sub), artist: text(state.artist, 200), track: text(state.track, 200),
    playing: state.playing === true, time: Number(state.time) || 0, duration: Number(state.duration) || 0,
    cover: typeof state.cover === 'string' && (/^\/api\/library\/cover\?client=[a-f0-9]{32}&id=[a-f0-9]{32}$/.test(state.cover) || YT_THUMB_RE.test(state.cover)) ? state.cover : null,
    volume: Number.isFinite(Number(state.volume)) ? Math.min(1, Math.max(0, Number(state.volume))) : 1, muted: state.muted === true,
    // What comes next (the mini window's "Up next"), titles only.
    upNext: Array.isArray(state.upNext) ? state.upNext.slice(0, 30).map((x) => ({ title: text(x && x.title, 200), sub: text(x && x.sub, 120), n: Number.isInteger(x && x.n) ? x.n : -1 })) : [],
    streaming: state.streaming === true, shuffle: state.shuffle === true, repeat: state.repeat === true, radio: state.radio === true,
  };
  clean.active = Boolean(clean.title);
  const was = playerNow;
  playerNow = clean;
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('player:state', clean);
  if (was.active !== clean.active || was.playing !== clean.playing) updateThumbar();
  scrobbler.onState(clean);
  discord.onState(clean);
});
// The visualizer's bars (main page → mini window): up to 32 numbers 0–255.
ipcMain.on('player:levels', (event, levels) => {
  if (!isTrustedSender(event) || !mainWindow || event.sender !== mainWindow.webContents || !Array.isArray(levels)) return;
  if (!miniWindow || miniWindow.isDestroyed() || !miniWindow.isVisible()) return;
  miniWindow.webContents.send('player:levels', levels.slice(0, 32).map((v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))));
});
const PLAYER_COMMANDS = ['toggle', 'next', 'prev', 'hello', 'stop', 'volup', 'voldown', 'mute', 'seekf', 'seekb', 'shuffle', 'repeat', 'radio', 'save'];
ipcMain.on('player:command', (event, cmd) => {
  if (!isTrustedSender(event) || !miniWindow || event.sender !== miniWindow.webContents) return;
  if (cmd === 'close') { miniWindow.close(); return; }
  if (cmd === 'open') { showWindow(); return; }
  if (cmd === 'hello') applyMiniPrefs();
  if (PLAYER_COMMANDS.includes(cmd)) sendToRenderer('player:command', { cmd });
  else if (cmd && typeof cmd === 'object' && cmd.cmd === 'seek' && Number.isFinite(cmd.value)) sendToRenderer('player:command', { cmd: 'seek', value: cmd.value });
  else if (cmd && typeof cmd === 'object' && cmd.cmd === 'volume' && Number.isFinite(cmd.value)) sendToRenderer('player:command', { cmd: 'volume', value: Math.min(1, Math.max(0, cmd.value)) });
  else if (cmd && typeof cmd === 'object' && cmd.cmd === 'jump' && Number.isInteger(cmd.value) && cmd.value >= 0 && cmd.value < 10000) sendToRenderer('player:command', { cmd: 'jump', value: cmd.value });
  // Songs found in the mini window, played from YouTube without saving them.
  else if (cmd && typeof cmd === 'object' && (cmd.cmd === 'stream' || cmd.cmd === 'enqueue')) {
    const items = cleanStreamItems(cmd.items);
    if (!items.length) return;
    const index = Number.isInteger(cmd.index) && cmd.index >= 0 && cmd.index < items.length ? cmd.index : 0;
    sendToRenderer('player:command', { cmd: cmd.cmd, items, value: index });
  } else if (cmd && typeof cmd === 'object' && cmd.cmd === 'expand') {
    expandMini(cmd.value === true);
  } else if (cmd && typeof cmd === 'object' && cmd.cmd === 'snap' && ['tl', 'tr', 'bl', 'br'].includes(cmd.value)) {
    snapMini(cmd.value);
  } else if (cmd && typeof cmd === 'object' && cmd.cmd === 'miniPrefs' && cmd.value && typeof cmd.value === 'object') {
    setMiniPrefs(cmd.value);
  } else if (cmd && typeof cmd === 'object' && (cmd.cmd === 'hover' || cmd.cmd === 'grab')) {
    // Pointer over it (full opacity) / Ctrl held over it (usable while clicks pass through).
    if (cmd.cmd === 'hover') miniHovered = cmd.value === true;
    else miniGrabbed = cmd.value === true;
    if (cmd.cmd === 'hover' && !miniHovered) miniGrabbed = false;
    applyMiniPrefs();
  }
});
// A YouTube thumbnail (the only pictures a song from YouTube shows).
const YT_THUMB_RE = /^https:\/\/i\d?\.ytimg\.com\/[A-Za-z0-9_\-/.]{1,200}(\?[A-Za-z0-9_\-=&%.]{0,300})?$/;
/** Songs from the mini window's search: YouTube ids and short texts only. */
function cleanStreamItems(list) {
  if (!Array.isArray(list)) return [];
  const text = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
  return list.slice(0, 50).filter((x) => x && typeof x === 'object' && /^[A-Za-z0-9_-]{11}$/.test(String(x.id))).map((x) => ({
    id: String(x.id), title: text(x.title, 300), channel: text(x.channel, 120),
    duration: Number.isFinite(x.duration) && x.duration > 0 && x.duration < 86400 * 2 ? x.duration : null,
    thumbnail: typeof x.thumbnail === 'string' && YT_THUMB_RE.test(x.thumbnail) ? x.thumbnail : null,
  }));
}

// === Player buttons in the taskbar thumbnail (⏮ ⏯ ⏭) ===
// Small white glyphs drawn here, pixel by pixel (no image files needed).
function glyph(kind) {
  const S = 16;
  const buf = Buffer.alloc(S * S * 4);
  const inTri = (px, py, a, b, c) => {
    const d = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    const d1 = d([px, py], a, b); const d2 = d([px, py], b, c); const d3 = d([px, py], c, a);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
  const rect = (px, py, x0, y0, x1, y1) => px >= x0 && px <= x1 && py >= y0 && py <= y1;
  const shapes = {
    play: (x, y) => inTri(x, y, [4.5, 2.5], [4.5, 13.5], [13, 8]),
    pause: (x, y) => rect(x, y, 3.5, 2.5, 6.5, 13.5) || rect(x, y, 9.5, 2.5, 12.5, 13.5),
    prev: (x, y) => rect(x, y, 2.5, 2.5, 4.5, 13.5) || inTri(x, y, [13.5, 2.5], [13.5, 13.5], [5, 8]),
    next: (x, y) => rect(x, y, 11.5, 2.5, 13.5, 13.5) || inTri(x, y, [2.5, 2.5], [2.5, 13.5], [11, 8]),
  }[kind];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let hit = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (shapes(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) hit += 1;
      const a = Math.round((hit / 16) * 255);
      const i = (y * S + x) * 4;
      buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255; buf[i + 3] = a; // BGRA
    }
  }
  return nativeImage.createFromBitmap(buf, { width: S, height: S, scaleFactor: 1 });
}
let glyphs = null;
function updateThumbar() {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;
  if (!playerNow.active) { mainWindow.setThumbarButtons([]); return; }
  if (!glyphs) glyphs = { play: glyph('play'), pause: glyph('pause'), prev: glyph('prev'), next: glyph('next') };
  const send = (cmd) => () => sendToRenderer('player:command', { cmd });
  mainWindow.setThumbarButtons([
    { tooltip: 'Anterior', icon: glyphs.prev, click: send('prev') },
    { tooltip: playerNow.playing ? 'Pausa' : 'Reproducir', icon: playerNow.playing ? glyphs.pause : glyphs.play, click: send('toggle') },
    { tooltip: 'Siguiente', icon: glyphs.next, click: send('next') },
  ]);
}

// === Keyboard shortcuts for the player, the user's own (also with the window in the background) ===
const SHORTCUT_ACTIONS = ['toggle', 'next', 'prev', 'stop', 'volup', 'voldown', 'mute', 'seekf', 'seekb', 'mini', 'overlay', 'show'];
const SHORTCUT_DEFAULTS = {
  toggle: 'MediaPlayPause', next: 'MediaNextTrack', prev: 'MediaPreviousTrack', stop: 'MediaStop',
  volup: 'Control+Alt+Up', voldown: 'Control+Alt+Down', mute: 'Control+Alt+0', seekf: 'Control+Alt+Right', seekb: 'Control+Alt+Left',
  mini: 'Control+Alt+P', overlay: 'Control+Alt+O', show: 'Control+Alt+T',
};
const ACCEL_MODS = new Set(['Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl', 'Alt', 'Shift', 'Super', 'Meta']);
const ACCEL_LONE = /^(MediaPlayPause|MediaNextTrack|MediaPreviousTrack|MediaStop|VolumeUp|VolumeDown|VolumeMute|F([1-9]|1\d|2[0-4])|num[0-9]|numadd|numsub|nummult|numdiv|numdec|Insert|Home|End|PageUp|PageDown)$/;
const ACCEL_KEY = /^([A-Z0-9]|F([1-9]|1\d|2[0-4])|Up|Down|Left|Right|Space|Tab|Backspace|Delete|Insert|Enter|Home|End|PageUp|PageDown|Plus|num[0-9]|numadd|numsub|nummult|numdiv|numdec|[,.\-=;'/\\`[\]]|MediaPlayPause|MediaNextTrack|MediaPreviousTrack|MediaStop|VolumeUp|VolumeDown|VolumeMute)$/;
/** "Control+Alt+P" → itself if it's a combination we accept (letters need a modifier), else null. */
function cleanAccelerator(raw) {
  const v = String(raw || '').trim();
  if (!v || v.length > 60) return null;
  const parts = v.split('+');
  if (v.endsWith('++')) parts.splice(-2, 2, 'Plus');
  const key = parts.pop();
  const mods = parts;
  if (!ACCEL_KEY.test(key) || new Set(mods).size !== mods.length || !mods.every((m) => ACCEL_MODS.has(m))) return null;
  // Any key, alone or with modifiers (see globalOk for where it works).
  return [...mods, key].join('+');
}
/**
 * Whether a shortcut can work with TubeGrab in the background. A plain key
 * that types something (a letter, Space, an arrow…), alone or with Shift,
 * would stop typing it in every other program: those only work in TubeGrab.
 */
function globalOk(acc) {
  const parts = String(acc).split('+');
  const key = parts.pop();
  if (parts.some((m) => m !== 'Shift')) return true;
  return ACCEL_LONE.test(key);
}
function shortcutSettings() {
  const raw = getSettings().shortcuts || {};
  const keys = {};
  for (const a of SHORTCUT_ACTIONS) {
    const v = raw.keys && Object.prototype.hasOwnProperty.call(raw.keys, a) ? raw.keys[a] : SHORTCUT_DEFAULTS[a];
    keys[a] = v === '' ? '' : (cleanAccelerator(v) || SHORTCUT_DEFAULTS[a]);
  }
  return { global: raw.global !== false, keys };
}
let shortcutFailed = [];
let lastShortcut = null;
function applyShortcuts() {
  globalShortcut.unregisterAll();
  shortcutFailed = [];
  const s = shortcutSettings();
  if (!s.global) return;
  const seen = new Set();
  for (const a of SHORTCUT_ACTIONS) {
    const acc = s.keys[a];
    if (!acc || seen.has(acc)) continue;
    seen.add(acc);
    // Only in TubeGrab (the page handles it): never taken from other programs.
    if (!globalOk(acc)) continue;
    const fire = () => {
      // Seen in Ajustes: did it arrive?
      lastShortcut = { action: a, at: Date.now() };
      if (a === 'overlay') { setMiniPrefs({ clickThrough: !miniPrefs().clickThrough }); return; }
      if (a === 'show') showWindow();
      else if (a === 'mini') { if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close(); else openMini(); }
      else sendToRenderer('player:command', { cmd: a });
    };
    let ok = false;
    try { ok = globalShortcut.register(acc, fire); } catch { ok = false; }
    // Taken by another program (or Windows itself).
    if (!ok) shortcutFailed.push(a);
  }
}
const shortcutView = () => {
  const s = shortcutSettings();
  return { ...s, defaults: SHORTCUT_DEFAULTS, failed: shortcutFailed, last: lastShortcut, localOnly: SHORTCUT_ACTIONS.filter((a) => s.keys[a] && !globalOk(s.keys[a])) };
};
ipcMain.handle('desktop:getShortcuts', (event) => (isTrustedSender(event) ? shortcutView() : null));
ipcMain.handle('desktop:setShortcuts', (event, patch) => {
  if (!isTrustedSender(event) || !patch || typeof patch !== 'object') return null;
  const cur = shortcutSettings();
  const next = { global: typeof patch.global === 'boolean' ? patch.global : cur.global, keys: { ...cur.keys } };
  if (patch.reset === true) next.keys = { ...SHORTCUT_DEFAULTS };
  if (patch.keys && typeof patch.keys === 'object') {
    for (const a of SHORTCUT_ACTIONS) {
      if (!Object.prototype.hasOwnProperty.call(patch.keys, a)) continue;
      const v = patch.keys[a];
      if (v === '') next.keys[a] = '';
      else { const c = cleanAccelerator(v); if (!c) return { ...shortcutView(), error: 'Esa combinación no vale: usa Ctrl, Alt o Mayús con otra tecla, una tecla F o una tecla multimedia.' }; next.keys[a] = c; }
    }
  }
  saveSettings({ shortcuts: next });
  applyShortcuts();
  return shortcutView();
});
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch { /* not ready */ } });

// === Last.fm: what you listen to, scrobbled to your account ===
// With your own free API account (last.fm/api/account/create): its key and
// secret stay in this computer's settings; the page never gets the secret.
const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';
function lastfmSettings() {
  const raw = getSettings().lastfm || {};
  const hex32 = (v) => (/^[a-f0-9]{32}$/i.test(String(v || '')) ? String(v) : '');
  return { enabled: raw.enabled === true, key: hex32(raw.key), secret: hex32(raw.secret), session: /^[A-Za-z0-9_-]{10,64}$/.test(String(raw.session || '')) ? raw.session : '', user: String(raw.user || '').slice(0, 64), token: /^[A-Za-z0-9_-]{10,64}$/.test(String(raw.token || '')) ? raw.token : '' };
}
const lastfmView = () => { const s = lastfmSettings(); return { enabled: s.enabled, key: s.key, hasSecret: Boolean(s.secret), connected: Boolean(s.session), user: s.user, waiting: Boolean(s.token) }; };
async function lastfmCall(method, params, { post = false } = {}) {
  const s = lastfmSettings();
  const all = { ...params, method, api_key: s.key };
  const sig = crypto.createHash('md5').update(Object.keys(all).sort().map((k) => `${k}${all[k]}`).join('') + s.secret, 'utf8').digest('hex');
  const body = new URLSearchParams({ ...all, api_sig: sig, format: 'json' }).toString();
  const res = await electronNet.fetch(post ? LASTFM_API : `${LASTFM_API}?${body}`, {
    method: post ? 'POST' : 'GET', headers: post ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}, body: post ? body : undefined,
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (data.error) throw new Error(String(data.message || 'Last.fm respondió con un error').slice(0, 200));
  return data;
}
const scrobbler = (() => {
  let cur = null; // { key, artist, track, duration, startedAt, played, last, done, nowSent }
  return {
    onState(st) {
      const s = lastfmSettings();
      if (!s.enabled || !s.session || !s.key || !s.secret || !st.active) { cur = null; return; }
      const artist = st.artist || '';
      const track = st.track || st.title;
      if (!artist || !track) return;
      const key = `${artist}|${track}`;
      if (!cur || cur.key !== key) cur = { key, artist, track, duration: st.duration, startedAt: Math.floor(Date.now() / 1000), played: 0, last: st.time, done: false, nowSent: false };
      if (st.playing && !cur.nowSent) {
        cur.nowSent = true;
        lastfmCall('track.updateNowPlaying', { artist, track, sk: s.session, ...(st.duration ? { duration: String(Math.round(st.duration)) } : {}) }, { post: true }).catch(() => {});
      }
      // Count only real listening (not jumps), then scrobble at half or 4 minutes.
      const step = st.time - cur.last;
      if (st.playing && step > 0 && step < 5) cur.played += step;
      cur.last = st.time;
      cur.duration = st.duration || cur.duration;
      if (!cur.done && cur.duration > 30 && cur.played >= Math.min(240, cur.duration / 2)) {
        cur.done = true;
        lastfmCall('track.scrobble', { artist, track, timestamp: String(cur.startedAt), sk: s.session, ...(cur.duration ? { duration: String(Math.round(cur.duration)) } : {}) }, { post: true }).catch((err) => console.warn('[Last.fm]', err.message));
      }
    },
  };
})();
ipcMain.handle('desktop:getLastfm', (event) => (isTrustedSender(event) ? lastfmView() : null));
ipcMain.handle('desktop:setLastfm', async (event, patch) => {
  if (!isTrustedSender(event) || !patch || typeof patch !== 'object') return null;
  const s = { ...(getSettings().lastfm || {}) };
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if (typeof patch.key === 'string') { if (patch.key && !/^[a-f0-9]{32}$/i.test(patch.key.trim())) return { ...lastfmView(), error: 'La clave (API key) son 32 letras y números.' }; s.key = patch.key.trim(); }
  if (typeof patch.secret === 'string' && patch.secret.trim()) { if (!/^[a-f0-9]{32}$/i.test(patch.secret.trim())) return { ...lastfmView(), error: 'El secreto (shared secret) son 32 letras y números.' }; s.secret = patch.secret.trim(); }
  if (patch.disconnect === true) { s.session = ''; s.user = ''; s.token = ''; }
  saveSettings({ lastfm: s });
  try {
    if (patch.connect === true) {
      // Step 1: a token, approved by you on last.fm in the browser.
      const { token } = await lastfmCall('auth.getToken', {});
      if (!/^[A-Za-z0-9_-]{10,64}$/.test(String(token || ''))) throw new Error('Last.fm no dio permiso.');
      saveSettings({ lastfm: { ...s, token } });
      shell.openExternal(`https://www.last.fm/api/auth/?api_key=${encodeURIComponent(lastfmSettings().key)}&token=${encodeURIComponent(token)}`);
    } else if (patch.finish === true) {
      // Step 2: once approved, the session that scrobbles.
      const cur = lastfmSettings();
      const data = await lastfmCall('auth.getSession', { token: cur.token });
      const sk = data.session && data.session.key;
      if (!/^[A-Za-z0-9_-]{10,64}$/.test(String(sk || ''))) throw new Error('Aún no lo has aceptado en last.fm.');
      saveSettings({ lastfm: { ...getSettings().lastfm, session: sk, user: String(data.session.name || '').slice(0, 64), token: '', enabled: true } });
    }
  } catch (err) {
    return { ...lastfmView(), error: err.message };
  }
  return lastfmView();
});

// === Discord: "Listening to …" on your profile ===
// Discord's local connection (a named pipe), with the id of an application
// of your own (discord.com/developers, free): only the song's title, artist
// and time are sent, and only while it's on.
const discord = (() => {
  let sock = null;
  let ready = false;
  let connecting = false;
  let lastTry = 0;
  let lastSent = '';
  const appId = () => { const d = getSettings().discord || {}; return d.enabled === true && /^\d{15,22}$/.test(String(d.appId || '')) ? String(d.appId) : null; };
  function frame(op, obj) {
    const json = Buffer.from(JSON.stringify(obj), 'utf8');
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0);
    head.writeInt32LE(json.length, 4);
    return Buffer.concat([head, json]);
  }
  function close() { if (sock) { try { sock.destroy(); } catch { /* gone */ } } sock = null; ready = false; lastSent = ''; }
  function connect(id, i = 0) {
    if (connecting || process.platform !== 'win32' || Date.now() - lastTry < 15000) return;
    connecting = true;
    lastTry = Date.now();
    const s = net.createConnection(`\\\\?\\pipe\\discord-ipc-${i}`);
    s.once('connect', () => {
      connecting = false;
      sock = s;
      s.write(frame(0, { v: 1, client_id: id }));
    });
    let buf = Buffer.alloc(0);
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]).subarray(-65536);
      while (buf.length >= 8) {
        const len = buf.readInt32LE(4);
        if (len < 0 || len > 60000 || buf.length < 8 + len) break;
        let msg = null;
        try { msg = JSON.parse(buf.subarray(8, 8 + len).toString('utf8')); } catch { /* ignore */ }
        buf = buf.subarray(8 + len);
        if (msg && msg.evt === 'READY') { ready = true; push(playerNow, true); }
      }
    });
    s.on('error', () => { connecting = false; if (sock === s) close(); else if (i < 9) { lastTry = 0; connect(id, i + 1); } });
    s.on('close', () => { if (sock === s) close(); });
  }
  function push(st, force = false) {
    const id = appId();
    if (!id) { close(); return; }
    if (!sock || !ready) { connect(id); return; }
    const activity = st.active && st.playing ? {
      type: 2,
      details: (st.track || st.title).slice(0, 120),
      ...(st.artist ? { state: st.artist.slice(0, 120) } : {}),
      timestamps: st.duration ? { start: Math.round(Date.now() - st.time * 1000), end: Math.round(Date.now() + (st.duration - st.time) * 1000) } : { start: Math.round(Date.now() - st.time * 1000) },
    } : null;
    const sig = JSON.stringify(activity && { ...activity, timestamps: undefined, t: Math.round(st.time / 15) });
    if (!force && sig === lastSent) return;
    lastSent = sig;
    try { sock.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: crypto.randomUUID() })); } catch { close(); }
  }
  return { onState: (st) => push(st), close };
})();
ipcMain.handle('desktop:getDiscord', (event) => { if (!isTrustedSender(event)) return null; const d = getSettings().discord || {}; return { enabled: d.enabled === true, appId: /^\d{15,22}$/.test(String(d.appId || '')) ? String(d.appId) : '' }; });
ipcMain.handle('desktop:setDiscord', (event, patch) => {
  if (!isTrustedSender(event) || !patch || typeof patch !== 'object') return null;
  const d = { ...(getSettings().discord || {}) };
  if (typeof patch.enabled === 'boolean') d.enabled = patch.enabled;
  if (typeof patch.appId === 'string') { if (patch.appId.trim() && !/^\d{15,22}$/.test(patch.appId.trim())) return { error: 'El ID de la aplicación son solo números (18 o 19 cifras).' }; d.appId = patch.appId.trim(); }
  saveSettings({ discord: d });
  discord.close();
  if (d.enabled) discord.onState(playerNow);
  return { enabled: d.enabled === true, appId: d.appId || '' };
});

// === Notifications with buttons: "Abrir" / "Mostrar en la carpeta" ===
// The page says which job finished; the file is the one this app saved for it.
ipcMain.on('desktop:notifyDone', (event, info) => {
  if (!isTrustedSender(event) || !info || typeof info !== 'object' || !Notification.isSupported()) return;
  const paths = savedFor(info.jobId);
  if (!paths.length) return;
  const text = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
  const note = new Notification({
    title: text(info.title, 120) || 'TubeGrab', body: text(info.body, 250), silent: false,
    actions: [{ type: 'button', text: paths.length > 1 ? 'Abrir la carpeta' : 'Abrir' }, { type: 'button', text: 'Mostrar en la carpeta' }],
  });
  const open = () => { if (paths.length === 1) shell.openPath(paths[0]); else shell.openPath(path.dirname(paths[0])); };
  note.on('action', (_e, index) => {
    const i = typeof index === 'number' ? index : (_e && _e.actionIndex);
    if (i === 0) open(); else if (i === 1) shell.showItemInFolder(paths[0]);
  });
  note.on('click', showWindow);
  note.show();
});

// === Automatic backup: the same file as "Exportar", every week, into a folder you choose ===
const AUTO_BACKUP_KEEP = 8;
function autoBackupSettings() {
  const raw = getSettings().autoBackup || {};
  return { enabled: raw.enabled === true, dir: isLocalFolderPath(raw.dir) ? raw.dir : null, days: [1, 7, 30].includes(raw.days) ? raw.days : 7, last: Number(raw.last) || 0 };
}
ipcMain.handle('desktop:getAutoBackup', (event) => {
  if (!isTrustedSender(event)) return null;
  const s = autoBackupSettings();
  return { ...s, due: s.enabled && Boolean(s.dir) && Date.now() - s.last >= s.days * 24 * 3600 * 1000 };
});
ipcMain.handle('desktop:setAutoBackup', async (event, patch) => {
  if (!isTrustedSender(event) || !patch || typeof patch !== 'object') return null;
  const s = { ...(getSettings().autoBackup || {}) };
  if (patch.choose === true) {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Carpeta para las copias de seguridad', properties: ['openDirectory', 'createDirectory'] });
    if (!result.canceled && result.filePaths[0] && isLocalFolderPath(result.filePaths[0])) s.dir = result.filePaths[0];
  }
  if (typeof patch.enabled === 'boolean') s.enabled = patch.enabled;
  if ([1, 7, 30].includes(patch.days)) s.days = patch.days;
  saveSettings({ autoBackup: s });
  const v = autoBackupSettings();
  return { ...v, due: v.enabled && Boolean(v.dir) && Date.now() - v.last >= v.days * 24 * 3600 * 1000 };
});
// The page builds the backup (it holds the history); only "TubeGrab-copia-*.json" files of ours are written or pruned.
ipcMain.handle('desktop:writeAutoBackup', (event, text) => {
  if (!isTrustedSender(event) || typeof text !== 'string' || Buffer.byteLength(text) > MAX_BACKUP_BYTES) return { ok: false };
  const s = autoBackupSettings();
  if (!s.enabled || !s.dir) return { ok: false };
  try { JSON.parse(text); } catch { return { ok: false }; }
  try {
    fs.mkdirSync(s.dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(s.dir, `TubeGrab-copia-${stamp}.json`), text, 'utf8');
    const ours = fs.readdirSync(s.dir).filter((n) => /^TubeGrab-copia-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    for (const n of ours.slice(0, Math.max(0, ours.length - AUTO_BACKUP_KEEP))) fs.rmSync(path.join(s.dir, n), { force: true });
    saveSettings({ autoBackup: { ...getSettings().autoBackup, last: Date.now() } });
    return { ok: true, file: `TubeGrab-copia-${stamp}.json` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// === Record the screen (or a window) straight into the Editor ===
// The page lists what can be recorded, the user picks one here, and only that
// pick (within 30 s, once) is handed to the page's getDisplayMedia request.
let pendingCapture = null;
ipcMain.handle('desktop:screenSources', async (event) => {
  if (!isTrustedSender(event)) return null;
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 } });
  return sources.slice(0, 40).map((s) => ({ id: s.id, name: String(s.name || '').slice(0, 120), screen: s.id.startsWith('screen:'), thumb: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL() }));
});
ipcMain.handle('desktop:pickScreenSource', (event, pick) => {
  if (!isTrustedSender(event) || !pick || typeof pick !== 'object' || typeof pick.id !== 'string' || !/^(screen|window):[\w:.-]{1,60}$/.test(pick.id)) return false;
  pendingCapture = { id: pick.id, audio: pick.audio === true, at: Date.now() };
  return true;
});
function setupCapture(ses) {
  ses.setDisplayMediaRequestHandler((request, callback) => {
    const p = pendingCapture;
    pendingCapture = null;
    const from = (request.frame && request.frame.url) || request.securityOrigin || '';
    if (!p || Date.now() - p.at > 30000 || !isAppOrigin(from)) { callback({}); return; }
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((list) => {
      const s = list.find((x) => x.id === p.id);
      // The computer's own sound (loopback) only when asked for, and only with a whole screen.
      if (!s) callback({}); else callback({ video: s, ...(p.audio && s.id.startsWith('screen:') ? { audio: 'loopback' } : {}) });
    }, () => callback({}));
  });
}

// === AcoustID's fpcalc (recognising songs by their sound), on demand ===
const FPCALC = {
  url: 'https://github.com/acoustid/chromaprint/releases/download/v1.6.1/chromaprint-fpcalc-1.6.1-windows-x86_64.zip',
  sha256: '735d6182b38e9f364b84ce6f4ccd682c75e2851de89735711d6b762d12b92a4e',
  exeSha256: '00dcc56d911f2dea84737aa9dc8e2d118c9eb7a037d815d1ed001d8593e8fbee',
  dir: 'chromaprint-fpcalc-1.6.1-windows-x86_64',
};
const fpcalcPath = () => path.join(app.getPath('userData'), 'fpcalc', 'fpcalc.exe');
let fpcalcBusy = false;
ipcMain.handle('desktop:getFpcalc', (event) => (isTrustedSender(event) ? { installed: fs.existsSync(fpcalcPath()), busy: fpcalcBusy } : null));
ipcMain.handle('desktop:installFpcalc', async (event) => {
  if (!isTrustedSender(event) || fpcalcBusy || process.platform !== 'win32') return null;
  fpcalcBusy = true;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tubegrab-fpcalc-'));
  try {
    const zip = path.join(work, 'fpcalc.zip');
    const r = await downloadToFile(FPCALC.url, zip);
    if (r.sha256 !== FPCALC.sha256) throw new Error('fpcalc descargado no coincide con su huella SHA-256');
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    await new Promise((resolve, reject) => execFile(tar, ['-xf', zip, '-C', work], { windowsHide: true }, (err) => (err ? reject(err) : resolve())));
    const exe = path.join(work, FPCALC.dir, 'fpcalc.exe');
    if (crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex') !== FPCALC.exeSha256) throw new Error('fpcalc.exe no coincide con su huella SHA-256');
    fs.mkdirSync(path.dirname(fpcalcPath()), { recursive: true });
    fs.copyFileSync(exe, fpcalcPath());
    return { installed: true, busy: false };
  } catch (err) {
    return { installed: fs.existsSync(fpcalcPath()), busy: false, error: friendlyNetError(err) };
  } finally {
    fpcalcBusy = false;
    fs.rm(work, { recursive: true, force: true }, () => {});
  }
});

// === Disk space: a warning, or the oldest files to the Recycle Bin ===
const SPACE_DEFAULTS = { minFreeGb: 0, maxFolderGb: 0, policy: 'warn' };
const GB = 1024 ** 3;
function spaceSettings() {
  const raw = getSettings().space || {};
  const n = (v, max) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.min(max, Math.round(Number(v) * 10) / 10) : 0);
  return { minFreeGb: n(raw.minFreeGb, 10000), maxFolderGb: n(raw.maxFolderGb, 100000), policy: raw.policy === 'trash' ? 'trash' : 'warn' };
}
function folderFiles(root) {
  const out = [];
  const walk = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length > 20000 || e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 5) walk(full, depth + 1); continue; }
      if (!e.isFile()) continue;
      try { const st = fs.statSync(full); out.push({ path: full, size: st.size, mtime: st.mtimeMs }); } catch { /* gone */ }
    }
  };
  walk(root, 0);
  return out;
}
function favouritePaths(root) {
  // The library's favourites and stars (kept by the server in the same data folder).
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'library.json'), 'utf8'));
    return new Set(Object.entries(meta).filter(([, m]) => m && (m.fav === true || m.rating >= 4)).map(([rel]) => path.join(root, ...rel.split('/')).toLowerCase()));
  } catch { return new Set(); }
}
let spaceBusy = false;
async function checkSpace({ notify = true } = {}) {
  if (spaceBusy) return null;
  spaceBusy = true;
  try {
    const s = spaceSettings();
    const root = getSettings().downloadDir;
    let free = null;
    try { const st = fs.statfsSync(fs.existsSync(root) ? root : path.parse(root).root); free = st.bavail * st.bsize; } catch { /* unknown */ }
    const files = s.maxFolderGb || notify ? folderFiles(root) : [];
    let used = files.reduce((a, f) => a + f.size, 0);
    let removed = 0;
    const over = s.maxFolderGb > 0 && used > s.maxFolderGb * GB;
    if (over && s.policy === 'trash') {
      // Oldest first; never favourites, 4–5 stars, or anything from the last week.
      const keep = favouritePaths(root);
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
      // Only audio and video: never the user's own pictures, texts or lists.
      const media = files.filter((f) => MEDIA_EXT.has(path.extname(f.path).slice(1).toLowerCase()) && f.mtime < weekAgo && !keep.has(f.path.toLowerCase()))
        .sort((a, b) => a.mtime - b.mtime);
      for (const f of media) {
        if (used <= s.maxFolderGb * GB) break;
        try { await shell.trashItem(f.path); used -= f.size; removed += 1; } catch { /* in use */ }
      }
    }
    const state = {
      ...s, freeGb: free === null ? null : Math.round((free / GB) * 10) / 10, folderGb: Math.round((used / GB) * 100) / 100,
      lowFree: s.minFreeGb > 0 && free !== null && free < s.minFreeGb * GB, overFolder: s.maxFolderGb > 0 && used > s.maxFolderGb * GB, removed,
    };
    if (notify && (state.lowFree || state.overFolder || removed)) {
      sendToRenderer('desktop:space', state);
      if (Notification.isSupported() && (!mainWindow || !mainWindow.isFocused())) {
        const body = removed ? `Se han movido ${removed} archivos antiguos a la papelera para no pasar de ${s.maxFolderGb} GB.`
          : state.lowFree ? `Quedan ${state.freeGb} GB libres en el disco de tus descargas.` : `Tu carpeta de descargas ocupa ${state.folderGb} GB (límite: ${s.maxFolderGb} GB).`;
        new Notification({ title: 'TubeGrab · espacio', body, silent: true }).show();
      }
    }
    return state;
  } finally {
    spaceBusy = false;
  }
}
ipcMain.handle('desktop:getSpace', (event) => (isTrustedSender(event) ? checkSpace({ notify: false }) : null));
ipcMain.handle('desktop:setSpace', (event, patch) => {
  if (!isTrustedSender(event) || !patch || typeof patch !== 'object') return null;
  const cur = spaceSettings();
  const next = { ...cur };
  for (const k of ['minFreeGb', 'maxFolderGb']) if (Number.isFinite(Number(patch[k])) && Number(patch[k]) >= 0) next[k] = Number(patch[k]);
  if (['warn', 'trash'].includes(patch.policy)) next.policy = patch.policy;
  saveSettings({ space: next });
  return checkSpace({ notify: false });
});

// === Command line: "TubeGrab.exe --download <link> [--audio[=mp3]] [--video[=1080]] [--profile=Name]" ===
// The link goes to the open app (or the one starting), which queues it with
// those choices; only links to supported sites, and only these options.
function cliRequestFrom(argv) {
  // Only our own switches before "--": whatever comes after it (a
  // tubegrab:// link from a web page) can never become a download request.
  const end = argv.indexOf('--');
  const own = end === -1 ? argv : argv.slice(0, end);
  const i = own.indexOf('--download');
  if (i === -1) return null;
  argv = own;
  const url = normalizeMediaUrl(argv[i + 1] || '');
  if (!url) return null;
  const req = { url, mode: null, format: null, quality: null, profile: null };
  for (const a of argv.slice(i + 2)) {
    const m = /^--(audio|video|mp3|m4a|opus|flac|wav|mp4|mkv|webm|profile)(?:=(.{1,60}))?$/.exec(a);
    if (!m) continue;
    if (m[1] === 'profile') req.profile = m[2] || null;
    else if (m[1] === 'audio' || m[1] === 'video') { req.mode = m[1]; if (m[2]) req[m[1] === 'audio' ? 'format' : 'quality'] = m[2]; }
    else if (['mp3', 'm4a', 'opus', 'flac', 'wav'].includes(m[1])) { req.mode = 'audio'; req.format = m[1]; }
    else { req.mode = 'video'; req.container = m[1]; }
  }
  return req;
}
let pendingCli = cliRequestFrom(process.argv);
function deliverCli(req) {
  sendToRenderer('desktop:cliDownload', req);
}

// "tubegrab" in any terminal: a small .cmd in the user's WindowsApps folder
// (already on PATH). The installed app runs its own command-line tool (with
// progress in the terminal); the portable one hands the link to the app.
const cliCmdPath = () => path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'Microsoft', 'WindowsApps', 'tubegrab.cmd');
ipcMain.handle('desktop:getCli', (event) => (isTrustedSender(event) ? { available: app.isPackaged && process.platform === 'win32', installed: fs.existsSync(cliCmdPath()), portable: IS_PORTABLE } : null));
ipcMain.handle('desktop:installCli', (event, on) => {
  if (!isTrustedSender(event) || !app.isPackaged || process.platform !== 'win32') return null;
  const file = cliCmdPath();
  try {
    if (on === false) { fs.rmSync(file, { force: true }); return { available: true, installed: false, portable: IS_PORTABLE }; }
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    if (/["%\r\n]/.test(exe) || /["%\r\n]/.test(__dirname)) throw new Error('ruta no válida');
    const script = IS_PORTABLE
      ? ['@echo off', 'if "%~1"=="" (echo Uso: tubegrab "enlace" [--mp3^|--flac^|--video=1080^|--profile=Nombre] & exit /b 1)', `start "" "${exe}" --download %*`]
      : ['@echo off', 'setlocal', 'set ELECTRON_RUN_AS_NODE=1', `"${exe}" "${path.join(__dirname, 'cli.js')}" %*`];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${script.join('\r\n')}\r\n`);
    return { available: true, installed: true, portable: IS_PORTABLE };
  } catch (err) {
    return { available: true, installed: fs.existsSync(file), portable: IS_PORTABLE, error: err.message };
  }
});

// === Watch folder: chosen here (never a path from the page) ===
ipcMain.handle('desktop:chooseWatchFolder', async (event) => {
  if (!isTrustedSender(event)) return null;
  const result = await dialog.showOpenDialog(mainWindow, { title: 'Carpeta que TubeGrab vigila', properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0] || !isLocalFolderPath(result.filePaths[0])) return { dir: null, canceled: true };
  const file = path.join(app.getPath('userData'), 'watch.json');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first time */ }
  cfg.dir = result.filePaths[0];
  cfg.done = [];
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  if (serverProcess && serverProcess.connected) serverProcess.send({ type: 'watch-reload' });
  return { dir: cfg.dir };
});

// === Start with Windows (in the tray) ===
// Registered for this user; the login launch passes --hidden so the window
// stays in the tray (downloads, subscriptions and schedules keep working).
const STARTED_HIDDEN = process.argv.includes('--hidden');
const startupExe = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
ipcMain.handle('desktop:getStartup', (event) => {
  if (!isTrustedSender(event)) return null;
  if (!app.isPackaged) return { available: false, enabled: false };
  return { available: true, enabled: app.getLoginItemSettings({ path: startupExe(), args: ['--hidden'] }).openAtLogin };
});
ipcMain.handle('desktop:setStartup', (event, enabled) => {
  if (!isTrustedSender(event) || typeof enabled !== 'boolean' || !app.isPackaged) return null;
  app.setLoginItemSettings({ openAtLogin: enabled, path: startupExe(), args: ['--hidden'] });
  return { available: true, enabled: app.getLoginItemSettings({ path: startupExe(), args: ['--hidden'] }).openAtLogin };
});

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
    { label: 'Descargar el enlace copiado', click: downloadCopiedLink },
    { label: 'Abrir la carpeta de descargas', click: () => { const dir = getSettings().downloadDir; fs.mkdirSync(dir, { recursive: true }); shell.openPath(dir); } },
    { label: 'Pausar todo', click: () => sendToRenderer('desktop:trayAction', { action: 'pause' }) },
    { label: 'Reanudar todo', click: () => sendToRenderer('desktop:trayAction', { action: 'resume' }) },
    { type: 'separator' },
    { label: 'Reproducir / pausa', click: () => sendToRenderer('player:command', { cmd: 'toggle' }) },
    { label: 'Siguiente canción', click: () => sendToRenderer('player:command', { cmd: 'next' }) },
    { label: 'Mini reproductor', click: openMini },
    { label: 'Mini reproductor: volver a usarlo con el ratón', click: () => setMiniPrefs({ clickThrough: false }) },
    { type: 'separator' },
    { label: 'Salir', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

// Tray: download the link on the clipboard straight away (with the options
// last used), without opening the window. Only links to supported sites.
async function downloadCopiedLink() {
  let text = '';
  try { text = String(await clipboard.readText() || '').trim(); } catch { /* locked */ }
  const url = text.length < 2048 && !/\s/.test(text) ? normalizeMediaUrl(text) : null;
  if (url) {
    sendToRenderer('desktop:quickDownload', { url });
  } else if (Notification.isSupported()) {
    new Notification({ title: 'TubeGrab', body: 'No hay ningún enlace de un sitio compatible copiado.', silent: true }).show();
  }
}

// Close button with "keep running in the tray" on: hide instead of quitting,
// so downloads and subscriptions carry on.
function onWindowClose(event) {
  // The mini player is open: the music goes on there (the page that plays it
  // stays alive, just hidden). Closing the mini player then closes the app.
  if (!quitting && miniWindow && !miniWindow.isDestroyed()) {
    event.preventDefault();
    mainWindow.hide();
    closedBehindMini = true;
    if (!miniHintShown && Notification.isSupported()) {
      miniHintShown = true;
      new Notification({ title: 'La música sigue sonando', body: 'TubeGrab sigue en el mini reproductor. Ciérralo para salir, o pulsa ↗ para volver a la ventana.', silent: true }).show();
    }
    return;
  }
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
  // A folder of its own for this job (a mirrored playlist, a channel rule):
  // one name, inside the downloads folder, never a path.
  const into = typeof payload.into === 'string' && payload.into.trim() ? payload.into.trim().slice(0, 100) : '';
  if (into) base = path.join(getSettings().downloadDir, safeFolderName(into));
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
        TUBEGRAB_WHISPER_DIR: whisperDir(),
        TUBEGRAB_FPCALC: fpcalcPath(),
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
    // Started with Windows: stay in the tray until the user opens it.
    show: !STARTED_HIDDEN,
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
  applyShortcuts();
  // The taskbar buttons are lost when the window is hidden and shown again.
  mainWindow.on('show', updateThumbar);
  mainWindow.on('show', () => { closedBehindMini = false; });

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
      if (pendingCli) mainWindow.webContents.once('did-finish-load', () => { setTimeout(() => { deliverCli(pendingCli); pendingCli = null; }, 1500); });
      mainWindow.webContents.once('did-finish-load', () => setTimeout(() => checkSpace().catch(() => {}), 10000));
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
    const cli = cliRequestFrom(argv);
    // From the command line: queued without bringing the window forward.
    if (cli) { deliverCli(cli); return; }
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
