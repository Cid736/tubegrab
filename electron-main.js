const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const http = require('http');

let mainWindow;
let serverProcess;

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
    backgroundColor: '#050508',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true
  });

  // Start the Express server
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    env: { ...process.env, NODE_ENV: 'production' }
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
  // Kill the server process when the window is closed
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  // Only create a new window if all windows are closed
  if (require('electron').BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
