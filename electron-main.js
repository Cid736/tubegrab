const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { fork, execFile, spawn } = require('child_process');
const http = require('http');

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
let pendingUpdate = null; // { downloadUrl, version }
let downloadedExePath = null;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TubeGrab-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        httpJson(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GitHub respondió ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

function downloadToFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TubeGrab-Updater' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadToFile(res.headers.location, destPath, onProgress).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Descarga respondió ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let downloaded = 0;
      const file = fs.createWriteStream(destPath);
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        if (total > 0 && onProgress) onProgress(Math.round((downloaded / total) * 100));
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    }).on('error', reject);
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
    const remoteVersion = String(release.tag_name || '').replace(/^v/, '');
    if (!remoteVersion || !isNewerVersion(remoteVersion, app.getVersion())) return;

    const asset = (release.assets || []).find((a) => a.name === UPDATE_ASSET_NAME);
    if (!asset) return;

    pendingUpdate = { downloadUrl: asset.browser_download_url, version: remoteVersion };
    sendToRenderer('updater:available', { version: remoteVersion });
  } catch (err) {
    console.error('[Updater] check failed:', err.message);
  }
}

ipcMain.on('updater:download', async () => {
  if (!pendingUpdate) return;
  try {
    const destPath = path.join(os.tmpdir(), `TubeGrab-update-${pendingUpdate.version}.exe`);
    await downloadToFile(pendingUpdate.downloadUrl, destPath, (percent) => sendToRenderer('updater:progress', { percent }));
    downloadedExePath = destPath;
    sendToRenderer('updater:downloaded');
  } catch (err) {
    sendToRenderer('updater:error', err.message);
  }
});

ipcMain.on('updater:install', () => {
  if (!downloadedExePath) return;

  // electron-builder's portable launcher exposes the real on-disk exe path here;
  // process.execPath would instead point at the self-extracted temp copy.
  const targetExePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const pid = process.pid;
  const psScript = [
    `Wait-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    `Start-Sleep -Milliseconds 500`,
    `Move-Item -Force '${downloadedExePath}' '${targetExePath}'`,
    `Start-Process '${targetExePath}'`,
  ].join('; ');

  const helper = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
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
  mainWindow = new BrowserWindow({
    width: 560,
    height: 820,
    minWidth: 380,
    minHeight: 520,
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

  // Start the Express server. windowsHide keeps this (and anything it in turn
  // spawns, like yt-dlp.exe/ffmpeg.exe) from ever flashing a console window.
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    // TUBEGRAB_ELECTRON tells server.js it already has a native window on the
    // way, so it must not also launch the system browser (see server.js).
    env: { ...process.env, NODE_ENV: 'production', TUBEGRAB_ELECTRON: '1' },
    windowsHide: true,
  });

  // Wait for the server to be ready before loading the URL (avoids race condition)
  const PORT = process.env.PORT || 3000;
  waitForServer(PORT, 30, 200, (err) => {
    if (err) {
      console.error('[Electron] Server failed to start:', err.message);
    }
    if (mainWindow) mainWindow.loadURL(`http://localhost:${PORT}`);
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
