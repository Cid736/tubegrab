// Names for files the desktop app writes into the user's download folder.
const path = require('path');

// Only media files are ever written there: whatever the name says, nothing
// executable (.exe, .lnk, .bat…) can land in the user's folder.
const SAVE_EXTENSIONS = new Set([
  'mp3', 'm4a', 'aac', 'opus', 'ogg', 'oga', 'flac', 'wav', 'aiff', 'wma', 'ac3', 'mka', 'webm', 'weba',
  'mp4', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'mpg', '3gp', 'ogv', 'gif', 'm4v', 'ts',
  // Subtitles saved next to a video, lyrics next to a song, and images taken from one.
  'srt', 'vtt', 'lrc', 'jpg', 'png', 'webp',
  // Sheets for media servers, transcripts and playlists.
  'nfo', 'txt', 'm3u8',
]);
// Device names Windows can't create as files (also with any extension).
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;

function safeSaveName(name) {
  let cleaned = path.basename(String(name || '').replace(/\\/g, '/'))
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 200) || 'descarga';
  if (!SAVE_EXTENSIONS.has(path.extname(cleaned).slice(1).toLowerCase())) cleaned += '.bin';
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** A single folder name (never a path) for jobs that produce several files. */
function safeFolderName(name) {
  // Separators become "_" (so "AC/DC" stays readable and can't form a path).
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
    .replace(/[.\s]+$/g, '') || 'TubeGrab';
  return WINDOWS_RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
}

/**
 * A folder on this computer's own disks: "C:\\…" (or "/…" off Windows).
 * Never a network share (\\\\server\\share, //server/share: Windows would
 * send the user's credentials to that server just by looking at it) nor a
 * device path (\\\\?\\…, \\\\.\\…).
 */
function isLocalFolderPath(dir, platform = process.platform) {
  if (typeof dir !== 'string' || !dir || dir.length > 1000 || dir.includes('\0')) return false;
  if (platform === 'win32') return /^[a-zA-Z]:[\\/]/.test(dir) && !/[\\/][\\/]/.test(dir.slice(2));
  return dir.startsWith('/') && !dir.startsWith('//');
}

module.exports = { safeSaveName, safeFolderName, isLocalFolderPath, SAVE_EXTENSIONS };
