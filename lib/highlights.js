// "Best moments" for a summary or a short: the liveliest stretches of a
// video, by how loud it gets (cheering, music kicking in, shouting) and how
// often the picture cuts. The sound is read once as it streams out of ffmpeg
// (never all in memory); scene cuts come from ffmpeg's scene detector.
const { spawn } = require('child_process');
const { INPUT_DEMUXERS, detectScenes, probe } = require('./convert');

const RATE = 8000;
const STEP = 0.5; // seconds per loudness value
const SAFE_INPUT = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS];

/** Loudness (dB) every half second, for the whole file. */
function loudness(ffmpegPath, file, { setProcess = null } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...SAFE_INPUT, '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(RATE), '-f', 's16le', 'pipe:1'], { windowsHide: true });
    if (setProcess) setProcess(p);
    const per = Math.round(RATE * STEP);
    const out = [];
    let sum = 0;
    let n = 0;
    let carry = null;
    p.stdout.on('data', (chunk) => {
      let buf = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 2);
      carry = usable < buf.length ? buf.subarray(usable) : null;
      for (let i = 0; i < usable; i += 2) {
        const v = buf.readInt16LE(i) / 32768;
        sum += v * v;
        if (++n === per) {
          out.push(10 * Math.log10(sum / n + 1e-10));
          sum = 0;
          n = 0;
          if (out.length > 4 * 3600 * 2) { p.kill(); break; } // 4 hours is plenty
        }
      }
      buf = null;
    });
    p.stderr.resume();
    p.on('error', () => reject(new Error('No se pudo iniciar ffmpeg.')));
    p.on('close', (code) => (out.length ? resolve(out) : reject(new Error(code === 0 ? 'Este archivo no tiene sonido.' : 'No se pudo leer el sonido del archivo.'))));
  });
}

/**
 * Picks `count` stretches of `clip` seconds that don't overlap, by score
 * (louder than usual + more cuts than usual), returned in time order.
 * `levels`: dB every STEP s; `cuts`: scene-change times.
 */
function pickHighlights(levels, cuts, { clip = 10, count = 5, duration = levels.length * STEP } = {}) {
  const secs = Math.max(1, Math.floor(duration));
  const loud = new Float64Array(secs);
  for (let s = 0; s < secs; s++) {
    const a = levels[Math.floor(s / STEP)] ?? -100;
    const b = levels[Math.floor(s / STEP) + 1] ?? a;
    loud[s] = Math.max(-90, (a + b) / 2);
  }
  const mean = loud.reduce((x, y) => x + y, 0) / secs;
  const sd = Math.sqrt(loud.reduce((x, y) => x + (y - mean) ** 2, 0) / secs) || 1;
  const cutAt = new Float64Array(secs);
  for (const t of cuts) if (t >= 0 && t < secs) cutAt[Math.floor(t)] += 1;
  // Each cut in a second counts like being half a deviation louder.
  const score = new Float64Array(secs);
  for (let s = 0; s < secs; s++) score[s] = (loud[s] - mean) / sd + 0.5 * Math.min(cutAt[s], 3);
  // Sum over every window of `clip` seconds (prefix sums).
  const len = Math.min(secs, Math.max(2, Math.round(clip)));
  const pre = new Float64Array(secs + 1);
  for (let s = 0; s < secs; s++) pre[s + 1] = pre[s] + score[s];
  const windows = [];
  for (let s = 0; s + len <= secs; s++) windows.push({ start: s, sum: pre[s + len] - pre[s] });
  windows.sort((a, b) => b.sum - a.sum);
  const picked = [];
  for (const w of windows) {
    if (picked.length >= count) break;
    // Not overlapping (and a little gap) with what's already picked; skip
    // the very first seconds (intros, logos) unless the file is short.
    if (secs > 60 && w.start < 3) continue;
    if (picked.some((p) => w.start < p.start + len + 1 && p.start < w.start + len + 1)) continue;
    picked.push(w);
  }
  return picked.sort((a, b) => a.start - b.start).map((w) => ({ start: w.start, end: Math.min(duration, w.start + len), score: Math.round((w.sum / len) * 100) / 100 }));
}

/** The best moments of a file: [{ start, end, score }]. */
async function detectHighlights(ffmpegPath, file, { clip = 10, count = 5, setProcess = null } = {}) {
  const info = await probe(ffmpegPath, file);
  if (!info || !info.duration) throw new Error('No se pudo leer la duración del archivo.');
  if (!info.hasAudio) throw new Error('Este archivo no tiene sonido.');
  const levels = await loudness(ffmpegPath, file, { setProcess });
  const cuts = info.hasVideo ? await detectScenes(ffmpegPath, file, { setProcess }).catch(() => []) : [];
  return pickHighlights(levels, cuts, { clip, count, duration: info.duration });
}

module.exports = { detectHighlights, pickHighlights, loudness };
