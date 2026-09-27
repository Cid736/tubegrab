const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork, execFile } = require('child_process');
const http = require('http');

let mainWindow;
let serverProcess;
let shuttingDown = false;

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
    width: 1000,
    height: 800,
    title: 'TubeGrab Pro',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#050508',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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
