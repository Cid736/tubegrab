// Tempo (BPM) and musical key of a song, worked out here from its sound:
// ffmpeg decodes up to 90 s of it to mono samples, and plain JavaScript does
// the rest (spectral flux + autocorrelation for the tempo, a chromagram
// matched against the Krumhansl–Schmuckler key profiles for the key).
const { spawn } = require('child_process');
const { INPUT_DEMUXERS } = require('./convert');

const RATE = 22050;
const MAX_SECONDS = 90;
const SAFE_INPUT = ['-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS];

const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// Camelot wheel (DJ notation): same number = keys that mix well.
const CAMELOT_MAJOR = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const CAMELOT_MINOR = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** Mono float samples at RATE Hz: up to 90 s from the middle of the song. */
function decode(ffmpegPath, file, duration = null) {
  return new Promise((resolve, reject) => {
    // Skip intros: from 30 s in when the song is long enough.
    const seek = duration && duration > MAX_SECONDS + 40 ? ['-ss', '30'] : [];
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...seek, ...SAFE_INPUT, '-i', file, '-t', String(MAX_SECONDS),
      '-map', '0:a:0', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'], { windowsHide: true });
    const chunks = [];
    let size = 0;
    const cap = RATE * MAX_SECONDS * 4 + 4096;
    p.stdout.on('data', (c) => { if (size < cap) { chunks.push(c); size += c.length; } });
    p.stderr.resume();
    p.on('error', (e) => reject(new Error(`No se pudo iniciar ffmpeg: ${e.message}`)));
    p.on('close', (code) => {
      if (code !== 0 || !size) return reject(new Error('No se pudo leer el sonido del archivo.'));
      const buf = Buffer.concat(chunks).subarray(0, Math.floor(Math.min(size, cap) / 4) * 4);
      // Copy into an aligned buffer (a Node Buffer may start at any offset).
      const out = new Float32Array(buf.length / 4);
      for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
      resolve(out);
    });
  });
}

/** In-place radix-2 FFT of re/im (length a power of two). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Magnitude spectra of Hann-windowed frames: calls onFrame(mags) for each. */
function stft(samples, size, hop, onFrame) {
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const mags = new Float64Array(size / 2);
  for (let start = 0; start + size <= samples.length; start += hop) {
    for (let i = 0; i < size; i++) { re[i] = samples[start + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < size / 2; k++) mags[k] = Math.hypot(re[k], im[k]);
    onFrame(mags);
  }
}

/** Beats per minute (70–180), or null when there's no steady beat to find. */
function detectBpm(samples, rate = RATE) {
  const size = 1024;
  const hop = 256;
  const fps = rate / hop;
  const flux = [];
  let prev = null;
  stft(samples, size, hop, (mags) => {
    const cur = new Float64Array(mags.length);
    let sum = 0;
    for (let k = 1; k < mags.length; k++) {
      cur[k] = Math.log1p(100 * mags[k]);
      if (prev) sum += Math.max(0, cur[k] - prev[k]);
    }
    flux.push(sum);
    prev = cur;
  });
  if (flux.length < fps * 6) return null;
  // Onset envelope minus its local average: peaks only.
  const w = Math.round(fps / 2);
  const env = flux.map((v, i) => {
    let s = 0; let n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(flux.length - 1, i + w); j++) { s += flux[j]; n += 1; }
    return Math.max(0, v - s / n);
  });
  const ac = (lag) => {
    let s = 0;
    for (let i = lag; i < env.length; i++) s += env[i] * env[i - lag];
    return s / (env.length - lag);
  };
  const minLag = Math.floor((60 * fps) / 180);
  const maxLag = Math.ceil((60 * fps) / 70);
  const scores = [];
  let energy = 0;
  for (let i = 0; i < env.length; i++) energy += env[i] * env[i];
  energy /= env.length;
  if (!energy) return null;
  let best = -1;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    // Prefer the usual tempo range (log-normal around 120) and reward a beat
    // that also shows up at twice the period (the bar structure).
    const weight = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    const s = (ac(lag) + 0.5 * ac(lag * 2)) * weight;
    scores[lag] = s;
    if (s > best) { best = s; bestLag = lag; }
  }
  if (best / energy < 0.05) return null;
  // Finer: the same beat four periods later (4× the lag resolution), with a
  // parabolic fit between neighbouring lags.
  const k = 4 * bestLag < env.length / 2 ? 4 : 1;
  let lag = k * bestLag;
  let peak = ac(lag);
  for (let l = lag - k; l <= lag + k; l++) { const v = ac(l); if (v > peak) { peak = v; lag = l; } }
  const a = ac(lag - 1);
  const c = ac(lag + 1);
  const denom = a - 2 * peak + c;
  const shift = denom ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  return Math.round((60 * fps * k) / (lag + shift));
}

function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0; let dx = 0; let dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** { key: 'Am', camelot: '8A' } or null (no clear pitch, e.g. noise or speech). */
function detectKey(samples, rate = RATE) {
  const size = 8192;
  const chroma = new Float64Array(12);
  const binHz = rate / size;
  const pcOf = [];
  for (let k = 0; k < size / 2; k++) {
    const f = k * binHz;
    pcOf[k] = f < 55 || f > 2000 ? -1 : (((Math.round(12 * Math.log2(f / 440)) + 9) % 12) + 12) % 12;
  }
  stft(samples, size, size / 2, (mags) => {
    for (let k = 0; k < mags.length; k++) if (pcOf[k] >= 0) chroma[pcOf[k]] += mags[k] * mags[k];
  });
  const total = chroma.reduce((a, b) => a + b, 0);
  if (!total) return null;
  let best = { r: -2, key: null, camelot: null };
  for (let root = 0; root < 12; root++) {
    const rotated = Array.from({ length: 12 }, (_, i) => chroma[(i + root) % 12]);
    const maj = pearson(rotated, MAJOR_PROFILE);
    const min = pearson(rotated, MINOR_PROFILE);
    if (maj > best.r) best = { r: maj, key: NOTES[root], camelot: CAMELOT_MAJOR[root] };
    if (min > best.r) best = { r: min, key: `${NOTES[root]}m`, camelot: CAMELOT_MINOR[root] };
  }
  return best.r > 0.3 ? { key: best.key, camelot: best.camelot } : null;
}

/** Both at once from a file: { bpm, key, camelot } (fields null when not found). */
async function analyzeFile(ffmpegPath, file, duration = null) {
  const samples = await decode(ffmpegPath, file, duration);
  const key = detectKey(samples);
  return { bpm: detectBpm(samples), key: key ? key.key : null, camelot: key ? key.camelot : null };
}

module.exports = { analyzeFile, detectBpm, detectKey, decode, fft, RATE, NOTES };
