// Shared bits for the test suite (not a test file itself).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** The ffmpeg the server would use: FFMPEG_BIN, bin/ffmpeg.exe, else ffmpeg-static. */
function ffmpegPath() {
  const candidates = [
    process.env.FFMPEG_BIN,
    process.platform === 'win32' ? path.join(ROOT, 'bin', 'ffmpeg.exe') : null,
  ];
  try { candidates.push(require('ffmpeg-static')); } catch { /* not installed */ }
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

/** yt-dlp as the server would find it (null if missing). */
function ytDlpPath() {
  const p = path.join(ROOT, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  return fs.existsSync(p) ? p : null;
}

module.exports = { ROOT, ffmpegPath, ytDlpPath };
