// Same loudness for every song (EBU R128, two passes): the first pass
// measures, the second applies the exact correction. The sound is re-encoded
// in its own format and quality; pictures, tags and video are copied as is.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { INPUT_DEMUXERS } = require('./convert');

// -14 LUFS is what streaming services play music at.
const TARGET = { I: -14, TP: -1, LRA: 11 };
const SAFE_INPUT = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS];

// Extension → how its sound is encoded again. `ogg`: tags live on the audio stream.
const CODECS = {
  mp3: { codec: 'libmp3lame', lossy: true, rate: '44100', extra: ['-id3v2_version', '3'] },
  m4a: { codec: 'aac', lossy: true, rate: '44100' },
  aac: { codec: 'aac', lossy: true, rate: '44100' },
  opus: { codec: 'libopus', lossy: true, rate: '48000', ogg: true },
  ogg: { codec: 'libvorbis', lossy: true, rate: '44100', ogg: true },
  flac: { codec: 'flac', lossy: false, rate: '44100' },
  wav: { codec: 'pcm_s16le', lossy: false, rate: '44100' },
  // Videos: the picture is copied; only the sound changes.
  mp4: { codec: 'aac', lossy: true, rate: '48000', video: true },
  mkv: { codec: 'aac', lossy: true, rate: '48000', video: true },
  webm: { codec: 'libopus', lossy: true, rate: '48000', video: true },
  mov: { codec: 'aac', lossy: true, rate: '48000', video: true },
};

function ffmpeg(ffmpegPath, args, setProcess) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-y', '-hide_banner', '-nostats', ...args], { windowsHide: true });
    if (setProcess) setProcess(p);
    let err = '';
    p.stderr.on('data', (c) => { err = (err + c.toString('utf8')).slice(-20000); });
    p.on('error', (e) => reject(new Error(`No se pudo iniciar ffmpeg: ${e.message}`)));
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(Object.assign(new Error('No se pudo normalizar el volumen.'), { stderr: err }))));
  });
}

/** loudnorm's JSON report (the last {...} block of its output) → numbers, or null. */
function parseMeasure(stderr) {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end < start) return null;
  let raw;
  try { raw = JSON.parse(stderr.slice(start, end + 1)); } catch { return null; }
  const out = {};
  for (const [k, from] of [['I', 'input_i'], ['TP', 'input_tp'], ['LRA', 'input_lra'], ['thresh', 'input_thresh'], ['offset', 'target_offset']]) {
    const n = Number(raw[from]);
    if (!Number.isFinite(n)) return null;
    out[k] = n;
  }
  return out;
}

const supports = (file) => Object.prototype.hasOwnProperty.call(CODECS, path.extname(file).slice(1).toLowerCase());

/**
 * Normalizes `file` in place. `bitrate`: kbps for lossy formats (default 192,
 * or 160 for Opus). Returns the measured loudness before, or null if the file
 * was already right (within 0.5 LU) or silent.
 */
async function normalizeFile({ ffmpegPath, file, bitrate = null, setProcess = null }) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const c = CODECS[ext];
  if (!c) throw new Error('Este formato no se puede normalizar.');
  const measureFilter = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`;
  const report = await ffmpeg(ffmpegPath, [...SAFE_INPUT, '-i', file, '-map', '0:a:0', '-af', measureFilter, '-f', 'null', '-'], setProcess);
  const m = parseMeasure(report);
  // Silence (-inf) or already at the target: nothing to do.
  if (!m || m.I < -70 || Math.abs(m.I - TARGET.I) < 0.5) return null;
  const apply = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${m.LRA}`
    + `:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true`;
  const tmp = path.join(path.dirname(file), `norm-tmp.${ext}`);
  const kbps = Number(bitrate) > 0 ? Math.round(Number(bitrate)) : (c.codec === 'libopus' ? 160 : 192);
  const args = [...SAFE_INPUT, '-i', file];
  if (c.ogg) {
    // Ogg/Opus: tags (and the embedded cover) are on the audio stream.
    args.push('-map', '0:a:0', '-map_metadata', '0', '-map_metadata:s:a:0', '0:s:a:0');
  } else {
    args.push('-map', '0', '-map_metadata', '0', '-c', 'copy');
  }
  args.push('-af', apply, '-c:a', c.codec, '-ar', c.rate);
  if (c.lossy) args.push('-b:a', `${kbps}k`);
  args.push(...(c.extra || []), tmp);
  try {
    await ffmpeg(ffmpegPath, args, setProcess);
    fs.renameSync(tmp, file);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  return m.I;
}

module.exports = { normalizeFile, parseMeasure, supports, TARGET, CODECS };
