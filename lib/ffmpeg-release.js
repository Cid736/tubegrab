// The ffmpeg build TubeGrab uses on Windows (gyan.dev "essentials", published
// on GitHub), pinned by SHA-256. Shared by scripts/fetch-ffmpeg.js (bundled
// into the full .exe at build time) and the light .exe (downloads it on first
// launch).
const VERSION = '9.0.2';

module.exports = {
  VERSION,
  ZIP_URL: `https://github.com/GyanD/codexffmpeg/releases/download/${VERSION}/ffmpeg-${VERSION}-essentials_build.zip`,
  ZIP_SHA256: '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba',
  // Folder inside the zip that holds ffmpeg.exe and ffprobe.exe.
  ZIP_BIN_DIR: `ffmpeg-${VERSION}-essentials_build/bin`,
  STAMP: `${VERSION} 60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba`,
};
