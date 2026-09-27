const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
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

async function checkForUpdates() {
  // Nothing to compare against when running from source.
  if (!app.isPackaged) return;

  try {
    const release = await httpJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    // tag_name ends up in UI text and in comparisons; accept strict X.Y.Z only.
    const remoteVersion = String(release.tag_name || '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(remoteVersion)) return;
    if (!isNewerVersion(remoteVersion, app.getVersion())) return;

    const asset = (release.assets || []).find((a) => a.name === UPDATE_ASSET_NAME);
    // GitHub publishes a sha256 digest per asset; without one we can't verify
    // the download, so don't offer the update at all.
    const digestMatch = asset && /^sha256:([0-9a-f]{64})$/i.exec(String(asset.digest || ''));
    if (!asset || !digestMatch) return;

    pendingUpdate = {
      downloadUrl: asset.browser_download_url,
      version: remoteVersion,
      sha256: digestMatch[1].toLowerCase(),
      size: asset.size,
    };
    sendToRenderer('updater:available', { version: remoteVersion });
  } catch (err) {
    console.error('[Updater] check failed:', err.message);
  }
}

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

  const helper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, TG_PID: String(process.pid), TG_SRC: downloadedExePath, TG_DST: targetExePath },
  });
  helper.unref();

  app.quit();
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

function createWindow() {
  // Size to the screen actually available: a fixed height taller than a
  // 1366x768 laptop's work area forced users to maximize the window.
  const { width: workW, height: workH } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1180, Math.round(workW * 0.9)),
    height: Math.min(820, Math.round(workH * 0.92)),
    minWidth: 380,
    minHeight: 500,
    center: true,
    title: 'TubeGrab Pro',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#050508',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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

  // Start the Express server. windowsHide keeps this (and anything it in turn
  // spawns, like yt-dlp.exe/ffmpeg.exe) from ever flashing a console window.
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    // TUBEGRAB_ELECTRON tells server.js it already has a native window on the
    // way, so it must not also launch the system browser (see server.js).
    env: { ...process.env, NODE_ENV: 'production', TUBEGRAB_ELECTRON: '1' },
    windowsHide: true,
  });

  // Wait for the server to be ready before loading the URL (avoids race condition)
  waitForServer(PORT, 30, 200, (err) => {
    if (err) {
      console.error('[Electron] Server failed to start:', err.message);
    }
    if (mainWindow) mainWindow.loadURL(APP_ORIGIN);
    checkForUpdates();
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
