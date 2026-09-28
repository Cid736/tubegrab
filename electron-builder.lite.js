// Light portable build (TubeGrab-Lite.exe): same app without ffmpeg and
// yt-dlp inside; it downloads them (SHA-256 verified) on first launch.
const { build } = require('./package.json');

module.exports = {
  ...build,
  win: { ...build.win, target: 'portable' },
  portable: { artifactName: 'TubeGrab-Lite.exe' },
  files: build.files.filter((f) => !/^bin\/|^yt-dlp\.exe$/.test(f)),
};
