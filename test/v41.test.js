// v4.1.0: a download split with a pasted tracklist, filters for
// subscriptions, and ringtones (iPhone .m4r, Android .ogg).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ffmpegPath } = require('./helpers');
const download = require('../lib/download');
const convert = require('../lib/convert');
const { parseTracklist, splitTracks, trackFileName } = require('../lib/tracklist');
const { Subscriptions, parseFilters, passes } = require('../lib/subscriptions');

const ffmpeg = ffmpegPath();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-v41-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

// ---- tracklist ----
test('tracklist: the lines with a time, in order, with artist and title', () => {
  const text = [
    'Tracklist:',
    '00:00 Intro',
    '1. [03:21] Daft Punk - One More Time',
    'Aphex Twin – Xtal (7:05)',
    '1:02:45 | Último tema',
    'gracias por escuchar ❤',
    '03:21 duplicate start is ignored',
  ].join('\r\n');
  assert.deepEqual(parseTracklist(text), [
    { start: 0, artist: '', title: 'Intro' },
    { start: 201, artist: 'Daft Punk', title: 'One More Time' },
    { start: 425, artist: 'Aphex Twin', title: 'Xtal' },
    { start: 3765, artist: '', title: 'Último tema' },
  ]);
  assert.deepEqual(parseTracklist('0:00 solo una'), [], 'one track is not a split');
  assert.deepEqual(parseTracklist('2024 version 99:99'), []);
  assert.deepEqual(parseTracklist(null), []);
  assert.equal(parseTracklist('0:00\n1:00').map((t) => t.title).join('|'), 'Pista 1|Pista 2', 'a time alone still makes a track');
  // A very long line can't slow it down (no backtracking on separators).
  const t0 = Date.now();
  parseTracklist(`0:00 a${' -'.repeat(50_000)}x\n1:00 b`);
  assert.ok(Date.now() - t0 < 500);
});

test('tracklist: file names never leave the folder nor carry odd characters', () => {
  assert.equal(trackFileName(0, { artist: 'AC/DC', title: 'T.N.T.' }, '.mp3'), '01 - AC_DC - T.N.T.mp3');
  assert.equal(trackFileName(9, { artist: '', title: '..\\..\\evil' }, '.m4a'), '10 - _.._evil.m4a');
  assert.equal(trackFileName(2, { artist: '', title: '...' }, '.mp3'), '03 - Pista 3.mp3');
});

test('tracklist: options, validation and description', () => {
  const list = '0:00 Uno\n2:00 Dos\n4:00 Tres';
  const o = download.parseDownloadOptions({ mode: 'audio', tracklist: list });
  assert.equal(o.tracklist, list);
  assert.equal(download.validateOptions(o), null);
  assert.match(download.describeOptions(o), /3 pistas/);
  assert.equal(download.parseDownloadOptions({ mode: 'video', tracklist: list }).tracklist, null, 'audio only');
  assert.equal(download.parseDownloadOptions({ mode: 'audio', tracklist: { evil: 1 } }).tracklist, null);
  assert.match(download.validateOptions(download.parseDownloadOptions({ mode: 'audio', tracklist: 'hola' })), /dos líneas/);
  assert.match(download.validateOptions(download.parseDownloadOptions({ mode: 'audio', tracklist: list, chapters: true })), /entero/);
  assert.match(download.validateOptions(download.parseDownloadOptions({ mode: 'audio', tracklist: list, playlist: true })), /entero/);
  assert.match(download.validateOptions(download.parseDownloadOptions({ mode: 'audio', tracklist: list, sectionStart: '0:10' })), /entero/);
  assert.equal(download.parseDownloadOptions({ mode: 'audio', tracklist: 'x'.repeat(50_000) }).tracklist.length, 20_000);
});

test('tracklist: a downloaded file really splits into tagged tracks', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(work, 'split-'));
  const src = path.join(dir, 'mix.mp3');
  // With chapters of its own, like a video that has them.
  const meta = path.join(dir, 'chapters.txt');
  fs.writeFileSync(meta, ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1\nSTART=0\nEND=5\ntitle=Capitulo A\n[CHAPTER]\nTIMEBASE=1/1\nSTART=5\nEND=9\ntitle=Capitulo B\n');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=440:d=9', '-i', meta, '-map_metadata', '1', '-c:a', 'libmp3lame', '-b:a', '128k', src]);
  const tracks = parseTracklist('0:00 Uno\n0:03 Artista - Dos\n0:06 Tres\n0:30 fuera del archivo');
  const seen = [];
  const files = await splitTracks({ ffmpegPath: ffmpeg, file: src, tracks, duration: 9, album: 'Mi mezcla', dir, onTrack: (i, n) => seen.push(`${i + 1}/${n}`) });
  assert.deepEqual(files.map((f) => path.basename(f)), ['01 - Uno.mp3', '02 - Artista - Dos.mp3', '03 - Tres.mp3']);
  assert.deepEqual(seen, ['1/3', '2/3', '3/3']);
  const info = await convert.probe(ffmpeg, files[1]);
  assert.ok(info.duration > 2.5 && info.duration < 3.5, `track 2 lasts ${info.duration}`);
  let stderr = '';
  try { execFileSync(ffmpeg, ['-hide_banner', '-i', files[1]], { stdio: 'pipe' }); } catch (e) { stderr = String(e.stderr); }
  assert.match(stderr, /title\s*:\s*Dos/);
  assert.match(stderr, /artist\s*:\s*Artista/);
  assert.match(stderr, /album\s*:\s*Mi mezcla/);
  assert.doesNotMatch(stderr, /Chapter #|Capitulo/, 'the whole file\'s chapters are left out');
  await assert.rejects(splitTracks({ ffmpegPath: ffmpeg, file: src, tracks: parseTracklist('0:30 a\n0:40 b'), duration: 9, dir }), /no encaja/);
});

// ---- subscription filters ----
test('subscription filters: cleaned, and what gets through', () => {
  assert.equal(parseFilters(null), null);
  assert.equal(parseFilters({ noShorts: 'yes', minMinutes: 'x', include: '  ,, ' }), null, 'nothing real set');
  const f = parseFilters({ noShorts: true, minMinutes: '2', maxMinutes: '1', include: 'Entrevista, PODCAST', exclude: 'tráiler' });
  assert.deepEqual(f, { noShorts: true, minMinutes: 2, maxMinutes: null, include: ['entrevista', 'podcast'], exclude: ['trailer'] }, 'a max under the min is dropped; words folded');
  assert.equal(parseFilters({ maxMinutes: 99999 }), null);
  assert.equal(parseFilters({ include: 'a,'.repeat(100) }).include.length, 20);
  const e = (title, duration, url = 'https://www.youtube.com/watch?v=x') => ({ title, duration, url });
  assert.equal(passes(e('Podcast 12', 3600), f), true);
  assert.equal(passes(e('Podcast corto', 50), f), false, 'a Short by its length');
  assert.equal(passes(e('Podcast', null, 'https://www.youtube.com/shorts/abc'), f), false, 'a Short by its link');
  assert.equal(passes(e('Podcast', 90), f), false, 'under the minimum');
  assert.equal(passes(e('Podcast', null), f), true, 'unknown length passes the length filters');
  assert.equal(passes(e('ENTREVISTA con Ana', 600), f), true);
  assert.equal(passes(e('Vlog', 600), f), false, 'none of the words');
  assert.equal(passes(e('Podcast — Tráiler', 600), f), false, 'an excluded word, accents aside');
  assert.equal(passes(e('anything', 1), null), true);
});

test('subscription filters: applied on subscribing and on each check; what is skipped stays seen', async () => {
  const enq = [];
  let list = [
    { id: 'a', url: 'https://youtu.be/a', title: 'Short', duration: 30 },
    { id: 'b', url: 'https://youtu.be/b', title: 'Video largo', duration: 900 },
  ];
  const subs = new Subscriptions({
    file: path.join(work, `subs-${Date.now()}.json`),
    latest: async () => ({ title: 'Canal', entries: list }),
    enqueue: (sub, entries) => enq.push(entries.map((x) => x.id)),
  });
  clearInterval(subs.timer);
  const client = 'f'.repeat(32);
  const sub = await subs.add({ clientId: client, url: 'https://youtube.com/@canal', options: {}, backfill: 1, filters: { noShorts: true } });
  assert.deepEqual(sub.filters.noShorts, true);
  assert.deepEqual(enq, [['b']], 'the newest one that passes');
  list = [{ id: 'c', url: 'https://youtu.be/c', title: 'Otro short', duration: 20 }, ...list];
  assert.equal(await subs.check(subs.get(sub.id, client)), 0);
  assert.ok(subs.get(sub.id, client).seen.includes('c'), 'skipped, but seen');
  // Filters changed later; turned off with an empty set.
  assert.equal(subs.update(subs.get(sub.id, client), { filters: { exclude: 'directo' } }).filters.exclude[0], 'directo');
  assert.equal(subs.update(subs.get(sub.id, client), { filters: {} }).filters, null);
  // A mirror never takes filters.
  const m = await subs.add({ clientId: client, url: 'https://youtube.com/playlist?list=PL1', options: {}, mirror: true, filters: { noShorts: true } });
  assert.equal(m.filters, null);
  assert.equal(subs.update(subs.get(m.id, client), { filters: { noShorts: true } }).filters, null);
});

// ---- ringtones ----
test('ringtones: capped length, a fade-out, and the iPhone muxer', () => {
  const m4r = convert.formatFor('m4r');
  assert.equal(m4r.kind, 'audio');
  assert.equal(m4r.config.ext, 'm4r');
  const args = convert.buildAudioArgs(m4r.config, { audioBitrate: '256' }, { duration: 25 });
  assert.deepEqual(args.slice(-4), ['-t', '40', '-f', 'ipod']);
  assert.ok(args.includes(`afade=t=out:st=${25 - convert.RINGTONE_FADE_S}:d=${convert.RINGTONE_FADE_S}`));
  const long = convert.buildAudioArgs(m4r.config, {}, { duration: 600 });
  assert.ok(long.includes(`afade=t=out:st=${40 - convert.RINGTONE_FADE_S}:d=${convert.RINGTONE_FADE_S}`), 'fades at the cap, not the end of the song');
  const android = convert.buildAudioArgs(convert.formatFor('ringtone').config, {}, { duration: 600 });
  assert.equal(convert.formatFor('ringtone').config.ext, 'ogg');
  assert.ok(android.includes('30') && !android.includes('ipod'));
  assert.ok(!convert.buildAudioArgs(convert.formatFor('mp3').config, {}).includes('-t'), 'other formats untouched');
});

test('ringtones: a long song really comes out as a 40 s .m4r', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async () => {
  const src = path.join(work, 'song.mp3');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=330:d=60', '-c:a', 'libmp3lame', src]);
  const dir = fs.mkdtempSync(path.join(work, 'ring-'));
  const ctx = { dir, update() {}, setProcess() {}, isCanceled: () => false };
  const out = await convert.runConvert({ inputPath: src, originalName: 'Canción.mp3', targetFormat: 'm4r', body: { audioBitrate: '256' }, ffmpegPath: ffmpeg })({}, ctx);
  assert.equal(path.basename(out), 'Canción.m4r');
  const info = await convert.probe(ffmpeg, out);
  assert.ok(info.ok && info.hasAudio);
  assert.ok(info.duration > 39 && info.duration <= 40.2, `lasts ${info.duration}`);
});
