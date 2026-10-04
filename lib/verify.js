// After each download: is the file whole? It has to open, last about as long
// as the video said, and its last seconds have to decode (a cut or broken
// download fails there). Cheap: no full decode.
const { spawn } = require('child_process');

const SAFE = (demuxers) => ['-protocol_whitelist', 'file', '-format_whitelist', demuxers];

function tailDecodes(ffmpegPath, file, demuxers) {
  return new Promise((resolve) => {
    let err = '';
    let p;
    try { p = spawn(ffmpegPath, ['-hide_banner', '-v', 'error', '-sseof', '-8', ...SAFE(demuxers), '-i', file, '-map', '0:a:0?', '-map', '0:v:0?', '-f', 'null', '-'], { windowsHide: true }); } catch { resolve(true); return; }
    const timer = setTimeout(() => { p.kill(); resolve(true); }, 60000); // slow disk: not a broken file
    p.stderr.on('data', (c) => { err = (err + c.toString('utf8')).slice(-4000); });
    p.on('error', () => { clearTimeout(timer); resolve(true); });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && !/(invalid data|corrupt|error while decoding|truncat|moov atom not found|end of file)/i.test(err));
    });
  });
}

/** { ok, reason } — reason: 'unreadable' | 'short' | 'broken'. `expected`: the video's length (s), when known. */
async function checkMedia({ ffmpegPath, file, expected = null, probe, demuxers }) {
  const info = await probe(ffmpegPath, file).catch(() => null);
  if (!info || !info.ok || !(info.hasAudio || info.hasVideo)) return { ok: false, reason: 'unreadable' };
  if (Number.isFinite(expected) && expected > 30 && Number.isFinite(info.duration) && info.duration < expected * 0.9 - 2) return { ok: false, reason: 'short' };
  if (!(await tailDecodes(ffmpegPath, file, demuxers))) return { ok: false, reason: 'broken' };
  return { ok: true };
}

module.exports = { checkMedia, tailDecodes };
