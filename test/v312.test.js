// v3.12: lists kept downloaded, several songs at once, "Deshacer", chapters.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { StreamLists, cleanTrack, cleanList } = require('../lib/streamlists');
const { parseChapters, readChapters, cleanChapters, fromYouTube } = require('../lib/chapters');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tg-v312-'));
const CLIENT = 'a'.repeat(32);
const songs = (...names) => names.map((title) => ({ title, artist: 'X' }));

test('keep downloaded: only a real client and small options; "sent" survives the list being read again', () => {
  assert.equal(cleanList({ id: 'b'.repeat(16), name: 'L', tracks: songs('a'), keep: { client: 'nope', opts: {} } }).keep, null);
  assert.equal(cleanList({ id: 'b'.repeat(16), name: 'L', tracks: songs('a'), keep: { client: CLIENT, opts: 'x' } }).keep, null);
  assert.equal(cleanList({ id: 'b'.repeat(16), name: 'L', tracks: songs('a'), keep: { client: CLIENT, opts: { big: 'x'.repeat(4000) } } }).keep, null);
  assert.deepEqual(cleanList({ id: 'b'.repeat(16), name: 'L', tracks: songs('a'), keep: { client: CLIENT, opts: { mode: 'audio' } } }).keep, { client: CLIENT, opts: { mode: 'audio' } });
  assert.equal(cleanTrack({ title: 'a', got: 'yes' }).got, undefined, 'only true');
  const dir = tmp();
  try {
    const s = new StreamLists(path.join(dir, 'l.json'));
    const l = s.create({ name: 'L', url: 'https://open.spotify.com/playlist/x', tracks: songs('Uno', 'Dos') });
    s.update(l.id, { keep: { client: CLIENT, opts: { mode: 'audio' } } });
    assert.equal(s.summary()[0].keep, true);
    s.markGot(l.id, [0]);
    // Read again from Spotify: "Uno" keeps its mark, the new "Tres" doesn't have it.
    s.update(l.id, { tracks: songs('Tres', 'Uno', 'Dos') });
    assert.deepEqual(s.get(l.id).tracks.map((t) => Boolean(t.got)), [false, true, false]);
    s.update(l.id, { keep: null });
    assert.equal(new StreamLists(path.join(dir, 'l.json')).get(l.id).keep, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('several songs: moved together, removed together and put back where they were', () => {
  const dir = tmp();
  try {
    const s = new StreamLists(path.join(dir, 'l.json'));
    const l = s.create({ name: 'L', tracks: songs('A', 'B', 'C', 'D', 'E') });
    const order = () => s.get(l.id).tracks.map((t) => t.title).join('');
    s.update(l.id, { moveMany: { from: [0, 2], to: 4 } });
    assert.equal(order(), 'BDACE', 'A and C before E');
    s.update(l.id, { moveMany: { from: [3, 4], to: 0 } });
    assert.equal(order(), 'CEBDA');
    for (const moveMany of [{ from: [0, 1, 2, 3, 4], to: 0 }, { from: [9], to: 0 }, { from: 'x', to: 1 }, { from: [1], to: 'x' }, { from: [-1, 1.5], to: 2 }]) s.update(l.id, { moveMany });
    assert.equal(order(), 'CEBDA', 'nonsense moves change nothing');
    const r = s.removeTracks(l.id, [4, 0, 0, 9, -1, 'x']);
    assert.deepEqual(r.removed.map((x) => [x.at, x.track.title]), [[0, 'C'], [4, 'A']]);
    assert.equal(order(), 'EBD');
    s.update(l.id, { insert: r.removed });
    assert.equal(order(), 'CEBDA', 'back where they were');
    assert.equal(s.removeTracks(l.id, []), null);
    assert.equal(s.removeTracks('nope', [0]), null);
    s.update(l.id, { insert: [{ at: 99, track: { title: 'Z' } }, { at: 1, track: { title: '' } }, { at: 'x', track: { title: 'Y' } }, null] });
    assert.equal(order(), 'CEBDAZ', 'only real songs, at a real place');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a list deleted can come back for a while (with its link and settings), then not', () => {
  const dir = tmp();
  try {
    const s = new StreamLists(path.join(dir, 'l.json'));
    const l = s.create({ name: 'L', url: 'https://open.spotify.com/playlist/x', tracks: songs('A') });
    s.update(l.id, { folder: 'Mis cosas' });
    assert.equal(s.remove(l.id, 1000), true);
    assert.equal(s.get(l.id), null);
    const back = s.restore(l.id, 2000);
    assert.equal(back.folder, 'Mis cosas');
    assert.equal(back.url, 'https://open.spotify.com/playlist/x');
    assert.equal(s.restore(l.id, 3000), null, 'only once');
    s.remove(l.id, 10000);
    assert.equal(s.restore(l.id, 10000 + 11 * 60 * 1000), null, 'too late');
    assert.equal(s.remove('nope'), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('chapters: read from ffmpeg\'s description, cleaned; YouTube\'s too', () => {
  const stderr = `Input #0, mov,mp4,m4a, from 'x.m4a':
  Duration: 00:16:00.00, start: 0.000000, bitrate: 65 kb/s
  Chapters:
    Chapter #0:0: start 0.000000, end 300.000000
      Metadata:
        title           : Capítulo uno
    Chapter #0:1: start 300.000000, end 600.000000
      Metadata:
        title           : Dos\u0007 <b>
    Chapter #0:2: start 600.000000, end 960.000000
  Stream #0:0[0x1](und): Audio: aac (LC)
      Metadata:
        title           : not a chapter`;
  assert.deepEqual(parseChapters(stderr), [
    { start: 0, end: 300, title: 'Capítulo uno' }, { start: 300, end: 600, title: 'Dos <b>' }, { start: 600, end: 960, title: '3' },
  ]);
  assert.deepEqual(parseChapters('Duration: 00:03:00.00'), [], 'none');
  assert.deepEqual(cleanChapters([{ start: 5, end: 9, title: 'only one' }]), [], 'a single chapter is no chapters');
  assert.deepEqual(cleanChapters([{ start: 'x' }, { start: -1 }, { start: 1e9 }, { start: 30, end: 10, title: 'b' }, { start: 0, title: 'a' }]), [{ start: 0, end: null, title: 'a' }, { start: 30, end: null, title: 'b' }]);
  assert.deepEqual(fromYouTube([{ start_time: 0, end_time: 61.234, title: 'Intro' }, { start_time: 61.234, end_time: 120, title: 'Parte 1' }]), [{ start: 0, end: 61.2, title: 'Intro' }, { start: 61.2, end: 120, title: 'Parte 1' }]);
  assert.deepEqual(fromYouTube(null), []);
});

test('chapters: a real file with chapters, read with ffmpeg', async (t) => {
  let ffmpeg;
  try { ffmpeg = require('../lib/convert') && path.join(__dirname, '..', 'bin', 'ffmpeg.exe'); } catch { ffmpeg = null; }
  if (!ffmpeg || !fs.existsSync(ffmpeg)) { t.skip('no ffmpeg'); return; }
  const dir = tmp();
  try {
    const meta = path.join(dir, 'meta.txt');
    fs.writeFileSync(meta, ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1\nSTART=0\nEND=2\ntitle=Uno\n[CHAPTER]\nTIMEBASE=1/1\nSTART=2\nEND=4\ntitle=Dos\n');
    const file = path.join(dir, 'libro.m4a');
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=duration=4', '-i', meta, '-map_metadata', '1', '-map_chapters', '1', file]);
    const ch = await readChapters(ffmpeg, file, ['-protocol_whitelist', 'file']);
    assert.deepEqual(ch.map((c) => [c.start, c.title]), [[0, 'Uno'], [2, 'Dos']]);
    assert.deepEqual(await readChapters(ffmpeg, path.join(dir, 'missing.m4a'), []), []);
    assert.deepEqual(await readChapters(path.join(dir, 'no-ffmpeg.exe'), file, []), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
