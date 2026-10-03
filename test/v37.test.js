// v3.7: listening without downloading (lib/stream.js) and lists to listen to (lib/streamlists.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const stream = require('../lib/stream');
const { StreamLists, cleanTrack, pickVideo, MAX_TRACKS } = require('../lib/streamlists');

test('stream: only YouTube video ids, only YouTube media servers', () => {
  assert.ok(stream.isId('dQw4w9WgXcQ'));
  for (const bad of ['', 'dQw4w9WgXc', 'dQw4w9WgXcQQ', '../../etc/x', 'dQw4w9WgX&Q', null]) assert.equal(stream.isId(bad), false, String(bad));
  assert.ok(stream.MEDIA_HOST_RE.test('rr3---sn-h5qzen7s.googlevideo.com'));
  for (const bad of ['googlevideo.com.evil.com', 'evil.com', 'xgooglevideo.com', 'localhost', '127.0.0.1', 'rr3.googlevideo.com.']) assert.equal(stream.MEDIA_HOST_RE.test(bad), false, bad);
});

test('stream: "Artist - Title (Official Video)" → artist and song for the lyrics', () => {
  assert.deepEqual(stream.splitTitle('Daft Punk - Get Lucky (Official Audio)', 'Daft Punk'), { artist: 'Daft Punk', track: 'Get Lucky' });
  assert.deepEqual(stream.splitTitle('Yellow [Official Video]', 'Coldplay'), { artist: 'Coldplay', track: 'Yellow' });
  assert.deepEqual(stream.splitTitle('Tití Me Preguntó', 'Bad Bunny - Topic'), { artist: 'Bad Bunny', track: 'Tití Me Preguntó' });
});

test('stream: a bad id never reaches yt-dlp', async () => {
  await assert.rejects(stream.resolve('nope; rm -rf', { ytDlpPath: 'C:/does/not/exist.exe' }), /no válido/);
  assert.deepEqual(await stream.radio('x', {}, () => { throw new Error('should not run'); }), []);
});

test('lists: the YouTube video whose length matches the song (Topic uploads first)', () => {
  const rs = [
    { id: 'aaaaaaaaaaa', duration: 260, channel: 'Artist VEVO' },
    { id: 'bbbbbbbbbbb', duration: 213, channel: 'Somebody' },
    { id: 'ccccccccccc', duration: 212, channel: 'Artist - Topic' },
  ];
  assert.equal(pickVideo(rs, 212).id, 'ccccccccccc');
  assert.equal(pickVideo(rs, 250).id, 'aaaaaaaaaaa', 'near enough');
  assert.equal(pickVideo(rs, 100).id, 'aaaaaaaaaaa', 'none close: the first');
  assert.equal(pickVideo(rs, null).id, 'aaaaaaaaaaa');
  assert.equal(pickVideo([{ id: 'bad' }], 200), null);
});

test('lists: tracks are cleaned (texts, ids, only YouTube thumbnails)', () => {
  const t = cleanTrack({ title: 'Song\u0000\n', artist: 'A, B', duration: 201.6, yt: 'not-an-id', thumbnail: 'https://evil.example/x.jpg' });
  assert.deepEqual(t, { title: 'Song', artist: 'A, B', duration: 202, query: 'A - Song' });
  assert.equal(cleanTrack({ title: 'x', yt: 'dQw4w9WgXcQ', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }).thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(cleanTrack({ title: '' }), null);
  assert.equal(cleanTrack('x'), null);
});

test('lists: saved, re-read keeping found videos, remembered, removed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-lists-'));
  const file = path.join(dir, 'stream-lists.json');
  try {
    const s = new StreamLists(file);
    assert.throws(() => s.create({ name: 'x', tracks: [] }), /no tiene canciones/);
    const l = s.create({ name: 'Top', source: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', tracks: [{ title: 'One', artist: 'A' }, { title: 'Two', artist: 'B' }] });
    assert.match(l.id, /^[a-f0-9]{16}$/);
    s.remember(l.id, 0, { id: 'dQw4w9WgXcQ', thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' });
    s.remember(l.id, 1, { id: 'evil' });
    const again = new StreamLists(file);
    assert.equal(again.get(l.id).tracks[0].yt, 'dQw4w9WgXcQ');
    assert.equal(again.get(l.id).tracks[1].yt, undefined);
    assert.equal(again.summary()[0].thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    // Updated from the link: what was found stays.
    again.update(l.id, { tracks: [{ title: 'Two', artist: 'B' }, { title: 'One', artist: 'A' }, { title: 'Three', artist: 'C' }] });
    assert.equal(again.get(l.id).tracks[1].yt, 'dQw4w9WgXcQ');
    assert.equal(again.get(l.id).tracks.length, 3);
    again.update(l.id, { name: '  Mi top  ', add: [{ title: 'Four' }] });
    assert.equal(again.get(l.id).name, 'Mi top');
    assert.equal(again.get(l.id).tracks.length, 4);
    assert.equal(again.removeTrack(l.id, 99), null);
    assert.equal(again.removeTrack(l.id, 0).tracks.length, 3);
    // Not a link of those services: not kept.
    const o = again.create({ name: 'o', url: 'javascript:alert(1)', tracks: [{ title: 'x' }] });
    assert.equal(o.url, null);
    assert.ok(again.remove(o.id));
    assert.equal(again.get('../../x'), null);
    // At most MAX_TRACKS songs.
    const big = again.create({ name: 'big', tracks: Array.from({ length: MAX_TRACKS + 50 }, (_, i) => ({ title: `t${i}` })) });
    assert.equal(big.tracks.length, MAX_TRACKS);
    // A tampered file: bad entries dropped.
    fs.writeFileSync(file, JSON.stringify([{ id: 'zz', name: 'bad' }, { id: 'aaaaaaaaaaaaaaaa', name: '<b>', source: 'evil', tracks: [{ title: 'ok' }, 5] }]));
    const t = new StreamLists(file);
    assert.equal(t.lists.length, 1);
    assert.equal(t.lists[0].source, 'own');
    assert.equal(t.lists[0].tracks.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
