// A song turned into a MIDI file (its notes, not its sound), worked out here:
// ffmpeg decodes it to mono samples and plain JavaScript, in a worker thread
// so the server keeps answering, finds the notes. Each frame's spectrum is
// split into its steady part and its hits (a light harmonic/percussive split,
// so drums don't become notes), every note from C2 to C7 is scored by the
// energy at its harmonics, and the strongest are picked one by one, taking
// each one's harmonics out before looking for the next. Frames are joined
// into notes, the tempo comes from analysis.js, and the result is a standard
// MIDI file (format 0, piano). Approximate: works best with one instrument
// or a clear melody; a full mix gives a sketch to fix by hand.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { fft, detectBpm } = require('./analysis');

const RATE = 11025;
const WIN = 2048;
const NFFT = 4096;
const HOP = 256;
const FPS = RATE / HOP;
const LOW = 36; // C2
const HIGH = 96; // C7
const HARMONICS = 6;
const MAX_HZ = 5000;
const MAX_SECONDS = 20 * 60;
const MIN_FRAMES = 4; // ~90 ms: anything shorter is noise
const PPQ = 480;
const MODES = { all: 6, melody: 1 };

const hz = (note) => 440 * 2 ** ((note - 69) / 12);

/** Bin ranges of each note's harmonics (± a third of a semitone). */
function harmonicBins() {
  const binHz = RATE / NFFT;
  const table = [];
  for (let n = LOW; n <= HIGH; n++) {
    const ranges = [];
    for (let h = 1; h <= HARMONICS && h * hz(n) < MAX_HZ; h++) {
      const f = h * hz(n);
      const a = Math.floor((f * 2 ** (-0.33 / 12)) / binHz);
      const b = Math.max(a, Math.ceil((f * 2 ** (0.33 / 12)) / binHz));
      ranges.push([a, b, 0.85 ** (h - 1)]);
    }
    table.push(ranges);
  }
  return table;
}

const peak = (x, a, b) => { let m = 0; for (let k = a; k <= b; k++) if (x[k] > m) m = x[k]; return m; };

/**
 * The notes in mono samples at RATE Hz: [{ note, start, end, velocity }]
 * (seconds). `maxPoly` notes at most at once (1 = only the melody).
 */
function transcribe(samples, { maxPoly = MODES.all, onProgress = null } = {}) {
  const bins = Math.ceil(MAX_HZ / (RATE / NFFT)) + 2;
  const table = harmonicBins();
  const count = HIGH - LOW + 1;
  const win = new Float64Array(WIN);
  for (let i = 0; i < WIN; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (WIN - 1));
  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  const frames = Math.max(0, Math.floor((samples.length - WIN) / HOP) + 1);
  const sal = Array.from({ length: frames }, () => new Float32Array(count));
  const firsts = [];
  // Log spectra of the last 7 frames, for the time median.
  const ring = new Map();
  const spectrum = (t) => {
    let energy = 0;
    for (let i = 0; i < WIN; i++) { const v = samples[t * HOP + i]; re[i] = v * win[i]; im[i] = 0; energy += v * v; }
    re.fill(0, WIN); im.fill(0, WIN);
    const x = new Float32Array(bins);
    if (energy / WIN < 1e-7) return x; // silence
    fft(re, im);
    for (let k = 0; k < bins; k++) x[k] = Math.log1p((100 * Math.hypot(re[k], im[k])) / (WIN / 4));
    return x;
  };
  const sorted = new Float64Array(7);
  const work = new Float64Array(bins);
  const prefix = new Float64Array(bins + 1);
  const localMean = (k, r) => {
    const a = Math.max(0, k - r);
    const b = Math.min(bins - 1, k + r);
    return (prefix[b + 1] - prefix[a]) / (b - a + 1);
  };
  const analyse = (c) => {
    const near = [];
    for (let t = c - 3; t <= c + 3; t++) if (ring.has(t)) near.push(ring.get(t));
    const x = ring.get(c);
    prefix[0] = 0;
    for (let k = 0; k < bins; k++) prefix[k + 1] = prefix[k] + x[k];
    // Steady (median over time) against broadband (mean over frequency).
    for (let k = 0; k < bins; k++) {
      let n = 0;
      for (const f of near) {
        const v = f[k];
        let j = n++;
        while (j > 0 && sorted[j - 1] > v) { sorted[j] = sorted[j - 1]; j--; }
        sorted[j] = v;
      }
      const h = sorted[n >> 1];
      const p = localMean(k, 10);
      work[k] = h ? x[k] * ((h * h) / (h * h + p * p)) : 0;
    }
    // Whitened: only what stands above its surroundings.
    prefix[0] = 0;
    for (let k = 0; k < bins; k++) prefix[k + 1] = prefix[k] + work[k];
    const white = new Float64Array(bins);
    for (let k = 0; k < bins; k++) white[k] = Math.max(0, work[k] - localMean(k, 24));
    const picked = [];
    let first = 0;
    for (let round = 0; round < maxPoly; round++) {
      let best = -1;
      let bestScore = 0;
      for (let i = 0; i < count; i++) {
        if (picked.some((p) => Math.abs(p - i) <= 1)) continue;
        const ranges = table[i];
        let score = 0;
        let strongest = 0;
        for (const [a, b, w] of ranges) { const m = peak(white, a, b); score += w * m; if (m > strongest) strongest = m; }
        // No fundamental at all: an octave (or more) below the real note.
        if (peak(white, ranges[0][0], ranges[0][1]) < 0.25 * strongest) continue;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best < 0 || (first && bestScore < 0.3 * first)) break;
      if (!first) { first = bestScore; firsts.push(first); }
      picked.push(best);
      sal[c][best] = bestScore;
      // Its harmonics mostly out, so the next note isn't one of them.
      for (const [a, b] of table[best]) for (let k = Math.max(0, a - 1); k <= Math.min(bins - 1, b + 1); k++) white[k] *= 0.2;
    }
  };
  let lastReport = 0;
  for (let t = 0; t < frames; t++) {
    ring.set(t, spectrum(t));
    if (t >= 3) { analyse(t - 3); ring.delete(t - 6); }
    if (onProgress && t - lastReport >= 500) { lastReport = t; onProgress(t / frames); }
  }
  for (let c = Math.max(0, frames - 3); c < frames; c++) analyse(c);
  return notesFrom(sal, firsts);
}

/** Frame scores → notes: a threshold, short gaps filled, re-struck notes split. */
function notesFrom(sal, firsts) {
  if (!firsts.length) return [];
  const sortedFirsts = Float64Array.from(firsts).sort();
  const top = sortedFirsts[Math.floor(sortedFirsts.length * 0.95)] || sortedFirsts[sortedFirsts.length - 1];
  const threshold = Math.max(0.3, 0.18 * top);
  const time = (frame) => (frame * HOP + WIN * 0.3) / RATE;
  const velocity = (mean) => {
    const r = Math.log(mean / threshold) / Math.log(Math.max(top, threshold * 1.01) / threshold);
    return Math.max(1, Math.min(127, Math.round(35 + 85 * Math.min(1, Math.max(0, r)))));
  };
  const notes = [];
  const frames = sal.length;
  for (let i = 0; i < (sal[0] ? sal[0].length : 0); i++) {
    const s = new Float64Array(frames);
    for (let t = 0; t < frames; t++) s[t] = sal[t][i] >= threshold ? sal[t][i] : 0;
    for (let t = 1; t < frames - 2; t++) {
      if (!s[t] && s[t - 1] && (s[t + 1] || s[t + 2])) s[t] = Math.min(s[t - 1], s[t + 1] || s[t + 2]);
    }
    let start = -1;
    let sum = 0;
    let loudest = 0;
    const close = (end) => {
      if (end - start >= MIN_FRAMES) notes.push({ note: LOW + i, start: time(start), end: time(end), velocity: velocity(sum / (end - start)) });
      start = -1;
    };
    for (let t = 0; t <= frames; t++) {
      const v = t < frames ? s[t] : 0;
      if (start >= 0 && (!v || (t - start >= MIN_FRAMES && s[t - 1] < 0.45 * loudest && v > 1.5 * s[t - 1]))) close(t);
      if (v && start < 0) { start = t; sum = 0; loudest = 0; }
      if (start >= 0) { sum += v; if (v > loudest) loudest = v; }
    }
  }
  return notes.sort((a, b) => a.start - b.start || a.note - b.note);
}

/** Variable-length quantity, as MIDI writes delta times. */
function vlq(n) {
  const bytes = [n & 0x7f];
  for (n >>= 7; n > 0; n >>= 7) bytes.unshift((n & 0x7f) | 0x80);
  return bytes;
}

/** A standard MIDI file (format 0, one track, piano) from notes in seconds. */
function writeMidi(notes, { bpm = 120, name = '' } = {}) {
  const tempo = Number.isFinite(bpm) && bpm >= 30 && bpm <= 300 ? bpm : 120;
  const ticks = (sec) => Math.max(0, Math.round((sec * tempo * PPQ) / 60));
  const events = [];
  for (const n of notes) {
    const on = ticks(n.start);
    const off = Math.max(on + 1, ticks(n.end));
    events.push({ tick: on, order: 1, bytes: [0x90, n.note, n.velocity] }, { tick: off, order: 0, bytes: [0x80, n.note, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track = [];
  const title = Buffer.from(String(name).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120), 'utf8');
  if (title.length) track.push(0, 0xff, 0x03, ...vlq(title.length), ...title);
  const us = Math.round(60000000 / tempo);
  track.push(0, 0xff, 0x51, 0x03, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff);
  track.push(0, 0xff, 0x58, 0x04, 4, 2, 24, 8); // 4/4
  track.push(0, 0xc0, 0); // Acoustic Grand Piano
  let last = 0;
  for (const e of events) { track.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; }
  track.push(0, 0xff, 0x2f, 0);
  const head = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(track.length);
  return Buffer.concat([head, Buffer.from([0x4d, 0x54, 0x72, 0x6b]), len, Buffer.from(track)]);
}

/** Mono float samples at RATE Hz, up to MAX_SECONDS from the start. */
function decode(ffmpegPath, file, setProcess) {
  const { INPUT_DEMUXERS } = require('./convert');
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file', '-format_whitelist', INPUT_DEMUXERS,
      '-i', file, '-t', String(MAX_SECONDS), '-map', '0:a:0', '-ac', '1', '-ar', String(RATE), '-f', 'f32le', 'pipe:1'], { windowsHide: true });
    if (setProcess) setProcess(p);
    const chunks = [];
    let size = 0;
    p.stdout.on('data', (c) => { chunks.push(c); size += c.length; });
    p.stderr.resume();
    p.on('error', (e) => reject(new Error(`No se pudo iniciar ffmpeg: ${e.message}`)));
    p.on('close', (code) => {
      if (code !== 0 || !size) return reject(new Error('No se pudo leer el sonido del archivo.'));
      const buf = Buffer.concat(chunks, size);
      const out = new Float32Array(Math.floor(size / 4));
      for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
      resolve(out);
    });
  });
}

/** Notes and tempo, worked out in a worker thread (cancellable). */
function transcribeInWorker(samples, { maxPoly, onProgress, isCanceled }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { tubegrabMidi: true, maxPoly, samples }, transferList: [samples.buffer] });
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearInterval(poll); fn(v); } };
    const poll = setInterval(() => {
      if (isCanceled && isCanceled()) { worker.terminate(); finish(reject, new Error('Cancelado')); }
    }, 300);
    worker.on('message', (m) => {
      if (m.progress !== undefined) { if (onProgress) onProgress(m.progress); return; }
      finish(resolve, m);
    });
    worker.on('error', (e) => finish(reject, e));
    worker.on('exit', (code) => finish(reject, new Error(code ? 'No se pudieron sacar las notas.' : 'Cancelado')));
  });
}

/**
 * file → a .mid next to it (same name). Returns { file, notes, bpm }.
 * Throws when no notes were found (speech, noise, silence).
 */
async function fileToMidi({ ffmpegPath, file, title, mode = 'all', setProcess, isCanceled, onProgress }) {
  const samples = await decode(ffmpegPath, file, setProcess);
  if (isCanceled && isCanceled()) throw new Error('Cancelado');
  const { notes, bpm } = await transcribeInWorker(samples, { maxPoly: MODES[mode] || MODES.all, onProgress, isCanceled });
  if (!notes.length) throw new Error('No se encontraron notas en el audio.');
  const out = path.join(path.dirname(file), `${path.basename(file, path.extname(file))}.mid`);
  fs.writeFileSync(out, writeMidi(notes, { bpm, name: title || path.basename(file, path.extname(file)) }));
  return { file: out, notes: notes.length, bpm };
}

if (!isMainThread && workerData && workerData.tubegrabMidi) {
  const samples = workerData.samples;
  const notes = transcribe(samples, { maxPoly: workerData.maxPoly, onProgress: (p) => parentPort.postMessage({ progress: p }) });
  // The tempo from up to 90 s in the middle (enough for a steady beat).
  const mid = Math.max(0, Math.floor(samples.length / 2 - 45 * RATE));
  const bpm = detectBpm(samples.subarray(mid, mid + 90 * RATE), RATE);
  parentPort.postMessage({ notes, bpm });
}

module.exports = { transcribe, notesFrom, writeMidi, vlq, fileToMidi, RATE, MODES, LOW, HIGH, MAX_SECONDS };
