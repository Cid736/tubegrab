// v4.2.0: a download as MIDI — the notes taken out of the sound (lib/midi.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ffmpegPath } = require('./helpers');
const download = require('../lib/download');
const midi = require('../lib/midi');
const { safeSaveName } = require('../lib/filenames');

const ffmpeg = ffmpegPath();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-v42-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

const R = midi.RATE;
/** A plucked tone with 8 harmonics, added into buf. */
function tone(buf, note, t0, t1, amp = 0.3) {
  const f = 440 * 2 ** ((note - 69) / 12);
  for (let i = Math.floor(t0 * R); i < t1 * R; i++) {
    const t = i / R - t0;
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f * h * t) / h;
    buf[i] += amp * Math.min(1, t * 50) * Math.exp(-t * 1.5) * v;
  }
}
/** Clicks of noise every half second, like a drum. */
function clicks(buf) {
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let at = 0; at < buf.length - 300; at += R / 2) for (let i = 0; i < 300; i++) buf[at + i] += (rnd() * 2 - 1) * 0.5 * Math.exp(-i / 60);
}
const near = (a, b, tol = 0.12) => Math.abs(a - b) <= tol;

test('midi: a melody, a chord and a re-struck note, with drum clicks ignored', () => {
  const s = new Float32Array(R * 6);
  [60, 64, 67, 72].forEach((n, i) => tone(s, n, i * 0.5, i * 0.5 + 0.5));
  [48, 64, 67].forEach((n) => tone(s, n, 2.5, 4, 0.2));
  tone(s, 62, 4.5, 4.8);
  tone(s, 62, 5, 5.3);
  clicks(s);
  const notes = midi.transcribe(s);
  const melody = notes.filter((n) => n.start < 2.2);
  assert.deepEqual(melody.map((n) => n.note), [60, 64, 67, 72]);
  melody.forEach((n, i) => assert.ok(near(n.start, i * 0.5), `${n.note} starts at ${n.start}`));
  assert.deepEqual(notes.filter((n) => near(n.start, 2.5)).map((n) => n.note).sort(), [48, 64, 67]);
  assert.equal(notes.filter((n) => n.note === 62).length, 2, 'the same note twice stays two notes');
  assert.equal(notes.length, 9, 'nothing made up from the clicks');
  assert.ok(notes.every((n) => n.velocity >= 1 && n.velocity <= 127 && n.end > n.start));
  // Only the melody: one note at a time, the loudest.
  const one = midi.transcribe(s, { maxPoly: midi.MODES.melody });
  assert.deepEqual(one.slice(0, 4).map((n) => n.note), [60, 64, 67, 72]);
  for (let i = 1; i < one.length; i++) assert.ok(one[i].start >= one[i - 1].end - 0.05, 'no two notes at once');
});

test('midi: silence and noise give no notes', () => {
  assert.deepEqual(midi.transcribe(new Float32Array(R * 2)), []);
  const s = new Float32Array(R * 2);
  clicks(s);
  assert.deepEqual(midi.transcribe(s), []);
  assert.deepEqual(midi.transcribe(new Float32Array(100)), [], 'shorter than one frame');
});

/** The note-ons of a format-0 file, read back: [{ tick, note, velocity }] and its header. */
function readMidi(buf) {
  assert.equal(buf.subarray(0, 4).toString('latin1'), 'MThd');
  assert.equal(buf.readUInt16BE(8), 0, 'format 0');
  assert.equal(buf.subarray(14, 18).toString('latin1'), 'MTrk');
  assert.equal(buf.readUInt32BE(18), buf.length - 22, 'track length');
  const ons = [];
  let tempo = null;
  let name = null;
  let tick = 0;
  let i = 22;
  for (;;) {
    let d = 0;
    let c;
    do { c = buf[i++]; d = (d << 7) | (c & 0x7f); } while (c & 0x80);
    tick += d;
    const status = buf[i];
    if (status === 0xff) {
      const type = buf[i + 1];
      const len = buf[i + 2];
      if (type === 0x2f) break;
      if (type === 0x51) tempo = buf.readUIntBE(i + 3, 3);
      if (type === 0x03) name = buf.subarray(i + 3, i + 3 + len).toString('utf8');
      i += 3 + len;
    } else if (status === 0xc0) i += 2;
    else {
      if (status === 0x90) ons.push({ tick, note: buf[i + 1], velocity: buf[i + 2] });
      else assert.equal(status, 0x80);
      i += 3;
    }
  }
  return { ppq: buf.readUInt16BE(12), tempo, name, ons };
}

test('midi: the file is a standard MIDI file at the song\'s tempo', () => {
  assert.deepEqual(midi.vlq(0), [0]);
  assert.deepEqual(midi.vlq(127), [0x7f]);
  assert.deepEqual(midi.vlq(128), [0x81, 0x00]);
  assert.deepEqual(midi.vlq(0x0fffffff), [0xff, 0xff, 0xff, 0x7f]);
  const notes = [{ note: 60, start: 0, end: 0.5, velocity: 100 }, { note: 64, start: 0.5, end: 1, velocity: 80 }, { note: 67, start: 0.5, end: 1.5, velocity: 60 }];
  const out = readMidi(midi.writeMidi(notes, { bpm: 90, name: 'Canción\u0007 ñ' }));
  assert.equal(out.ppq, 480);
  assert.equal(out.tempo, Math.round(60000000 / 90));
  assert.equal(out.name, 'Canción ñ', 'control characters left out');
  // 0.5 s at 90 BPM = 0.75 beats = 360 ticks.
  assert.deepEqual(out.ons, [{ tick: 0, note: 60, velocity: 100 }, { tick: 360, note: 64, velocity: 80 }, { tick: 360, note: 67, velocity: 60 }]);
  assert.equal(readMidi(midi.writeMidi(notes, { bpm: null })).tempo, 500000, 'no tempo found: 120 BPM');
  assert.equal(readMidi(midi.writeMidi([])).ons.length, 0);
});

test('midi: a sound file becomes a .mid next to it (worker thread)', { skip: !ffmpeg }, async () => {
  const wav = path.join(work, 'escala.wav');
  // C major scale, 0.4 s each, as a real file through ffmpeg.
  const notes = [60, 62, 64, 65, 67, 69, 71, 72];
  const expr = notes.map((n, i) => {
    const f = (440 * 2 ** ((n - 69) / 12)).toFixed(3);
    return `between(t,${i * 0.4},${i * 0.4 + 0.38})*(sin(2*PI*${f}*t)+0.5*sin(4*PI*${f}*t)+0.3*sin(6*PI*${f}*t))*0.3`;
  }).join('+');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=3.4`, wav]);
  const progress = [];
  const done = await midi.fileToMidi({ ffmpegPath: ffmpeg, file: wav, title: 'Escala', onProgress: (p) => progress.push(p), isCanceled: () => false });
  assert.equal(done.file, path.join(work, 'escala.mid'));
  const out = readMidi(fs.readFileSync(done.file));
  assert.equal(out.name, 'Escala');
  assert.deepEqual(out.ons.map((n) => n.note), notes);
  // A file with no notes in it is an error, not an empty .mid.
  const quiet = path.join(work, 'silencio.wav');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '2', quiet]);
  await assert.rejects(midi.fileToMidi({ ffmpegPath: ffmpeg, file: quiet }), /No se encontraron notas/);
  assert.ok(!fs.existsSync(path.join(work, 'silencio.mid')));
});

test('midi: canceling stops the worker', { skip: !ffmpeg }, async () => {
  const wav = path.join(work, 'largo.wav');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=240', wav]);
  let canceled = false;
  setTimeout(() => { canceled = true; }, 200);
  await assert.rejects(midi.fileToMidi({ ffmpegPath: ffmpeg, file: wav, isCanceled: () => canceled }), /Cancelado/);
});

test('download as MIDI: options, description, yt-dlp gets a WAV', () => {
  const o = download.parseDownloadOptions({ mode: 'audio', audioFormat: 'midi', midiNotes: 'melody' });
  assert.equal(o.audioFormat, 'midi');
  assert.equal(o.midiNotes, 'melody');
  assert.equal(download.parseDownloadOptions({ mode: 'audio', audioFormat: 'midi', midiNotes: 'x' }).midiNotes, 'all');
  assert.equal(download.parseDownloadOptions({ mode: 'audio', audioFormat: 'mp3', midiNotes: 'melody' }).midiNotes, 'all');
  assert.equal(download.describeOptions(o), 'MIDI · solo la melodía');
  assert.equal(download.validateOptions(o), null);
  assert.match(download.validateOptions({ ...o, live: true }), /MIDI/);
  const args = download.buildArgs('https://www.youtube.com/watch?v=dQw4w9WgXcQ', o, { ffmpegPath: 'ffmpeg', dir: work });
  assert.equal(args[args.indexOf('--audio-format') + 1], 'wav');
  assert.ok(!args.includes('--embed-thumbnail'));
  assert.equal(safeSaveName('Canción.mid'), 'Canción.mid', '.mid can be saved');
});

// v4.0.4 shipped an unescaped apostrophe in i18n.js: the whole English table
// failed to load and nothing caught it (the other tests read it as text).
test('every script of the page parses', () => {
  const vm = require('vm');
  const dir = path.join(__dirname, '..', 'public');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f }), f);
  }
});

test('download as MIDI: the WAV is replaced by its .mid after downloading', { skip: !ffmpeg }, async () => {
  const dir = fs.mkdtempSync(path.join(work, 'job-'));
  const wav = path.join(dir, 'Canción.wav');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=261.63:d=1.5', wav]);
  const stages = [];
  const ctx = { dir, update: (u) => { if (u.stage) stages.push(u.stage); }, setProcess: () => {}, isCanceled: () => false };
  const opts = download.parseDownloadOptions({ mode: 'audio', audioFormat: 'midi', lyrics: true, bpm: true });
  const files = await download.finishDownload([wav], opts, { ffmpegPath: ffmpeg }, ctx, { title: 'Canción' });
  assert.deepEqual(files, [path.join(dir, 'Canción.mid')]);
  assert.ok(!fs.existsSync(wav), 'the WAV is gone');
  assert.deepEqual(readMidi(fs.readFileSync(files[0])).ons.map((n) => n.note), [60]);
  assert.deepEqual(stages, ['Sacando las notas…'], 'no lyrics or tags for a MIDI');
});
