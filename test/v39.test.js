// v3.9: what you listen to (lib/listenlog.js) and lists in folders, kept up to date.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ListenLog, cleanSong, mainArtist } = require('../lib/listenlog');
const { StreamLists } = require('../lib/streamlists');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tg-listen-'));
const song = (id, title, artist, extra = {}) => ({ key: `yt:${id}`, title, artist, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, dur: 200, ...extra });

test('listen log: only songs we know how to name, cleaned', () => {
  assert.equal(cleanSong({ key: 'yt:short', title: 'x' }), null);
  assert.equal(cleanSong({ key: 'http://evil', title: 'x' }), null);
  assert.equal(cleanSong({ key: 'yt:dQw4w9WgXcQ', title: '' }), null);
  assert.equal(cleanSong({ key: 'f:a\u0000b', title: 'x' }), null);
  const c = cleanSong({ key: 'yt:dQw4w9WgXcQ', title: ' Never\nGonna ', artist: 'Rick', thumb: 'https://evil.example/x.jpg', dur: -5 });
  assert.deepEqual(c, { title: 'Never Gonna', artist: 'Rick', yt: 'dQw4w9WgXcQ' });
  assert.equal(mainArtist('Bad Bunny, Jhay Cortez feat. X'), 'Bad Bunny');
  assert.equal(mainArtist('Sensato & Pitbull'), 'Sensato');
});

test('listen log: plays, smart lists, a yearly summary, kept on disk, paused, wiped', () => {
  const dir = tmp();
  const file = path.join(dir, 'h.json');
  let now = Date.UTC(2026, 2, 10, 20, 0, 0);
  try {
    const log = new ListenLog(file, { now: () => now });
    assert.equal(log.add(song('aaaaaaaaaaa', 'Uno', 'Artista A'), 3), null, 'under 5 s: not kept');
    assert.equal(log.add(song('aaaaaaaaaaa', 'Uno', 'Artista A'), 20), 0, 'heard, not a play yet');
    assert.equal(log.add(song('aaaaaaaaaaa', 'Uno', 'Artista A'), 120), 1);
    for (let i = 0; i < 3; i++) log.add(song('bbbbbbbbbbb', 'Dos', 'Artista B, Otro'), 180);
    log.add({ key: 'f:Música/C - Tres.mp3', title: 'Tres', artist: 'C', dur: 100 }, 60);
    // Months later: Uno again; Dos (3 plays) is now "to rediscover".
    now = Date.UTC(2026, 6, 1, 9, 0, 0);
    log.add(song('aaaaaaaaaaa', 'Uno', 'Artista A'), 200);
    const s = log.smart();
    assert.deepEqual(s.top.map((x) => x.title), ['Uno'], 'last 90 days only');
    assert.equal(s.top[0].plays, 1);
    assert.deepEqual(s.forgotten.map((x) => x.title), ['Dos']);
    assert.deepEqual(s.artists.map((a) => a.name), ['Artista A']);
    assert.equal(s.artists[0].seed.yt, 'aaaaaaaaaaa');
    const y = log.summary(2026, 0);
    assert.equal(y.plays, 6);
    assert.equal(y.songs, 3);
    assert.equal(y.secs, 20 + 120 + 540 + 60 + 200);
    assert.equal(y.topSongs[0].title, 'Dos');
    assert.equal(y.topArtists[0].name, 'Artista B');
    assert.equal(y.months[2], 20 + 120 + 540 + 60);
    assert.equal(y.months[6], 200);
    assert.equal(y.hours[20], 740);
    assert.deepEqual(y.years, [2026]);
    assert.equal(log.summary(2025, 0).secs, 0);
    // A time zone two hours ahead: 20:00 UTC is 22:00 there.
    assert.equal(log.summary(2026, -120).hours[22], 740);
    // On disk, read back the same.
    const again = new ListenLog(file, { now: () => now });
    assert.deepEqual(again.summary(2026, 0), y);
    // Paused: nothing kept.
    again.settings({ paused: true });
    assert.equal(again.add(song('ccccccccccc', 'Cuatro', 'D'), 100), null);
    assert.equal(new ListenLog(file).paused, true);
    again.clear();
    assert.equal(new ListenLog(file).events.length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('listen log: a tampered file is read safely', () => {
  const dir = tmp();
  const file = path.join(dir, 'h.json');
  try {
    fs.writeFileSync(file, JSON.stringify({
      tracks: { 'yt:aaaaaaaaaaa': { title: 'ok' }, 'yt:../../x': { title: 'evil' }, 'f:x': { title: '' }, __proto__: { title: 'p' } },
      events: [[1, 'yt:aaaaaaaaaaa', 60], [2, 'yt:../../x', 60], ['3', 'yt:aaaaaaaaaaa', 60], [4, 'yt:aaaaaaaaaaa', 1e9], 'nope', [5, 'nope', 5]],
    }));
    const log = new ListenLog(file);
    assert.deepEqual([...log.tracks.keys()], ['yt:aaaaaaaaaaa']);
    assert.deepEqual(log.events, [[1, 'yt:aaaaaaaaaaa', 60]]);
    fs.writeFileSync(file, '{broken');
    assert.equal(new ListenLog(file).events.length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('lists: folders, "keep it up to date" only for lists from a link, a mosaic of covers', () => {
  const dir = tmp();
  const file = path.join(dir, 'l.json');
  try {
    const s = new StreamLists(file);
    const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    const fromLink = s.create({ name: 'Top', source: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', tracks: [{ title: 'One', artist: 'A' }] });
    const mine = s.create({ name: 'Mía', tracks: ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd', 'eeeeeeeeeee'].map((id) => ({ title: id, yt: id, thumbnail: thumb(id) })) });
    assert.equal(fromLink.sync, true, 'from a link: kept up to date by default');
    assert.equal(mine.sync, false);
    s.update(mine.id, { folder: '  Para correr\u0000 ', sync: true });
    assert.equal(s.get(mine.id).folder, 'Para correr');
    assert.equal(s.get(mine.id).sync, false, 'no link, nothing to keep up to date');
    s.update(mine.id, { folder: 'x'.repeat(100) });
    assert.equal(s.get(mine.id).folder.length, 60);
    s.update(mine.id, { folder: '' });
    assert.equal(s.get(mine.id).folder, null);
    const sum = s.summary().find((l) => l.id === mine.id);
    assert.equal(sum.thumbs.length, 4);
    // Due: read again after 12 h; switched off, never.
    assert.deepEqual(s.dueForSync(Date.now()), []);
    assert.deepEqual(s.dueForSync(Date.now() + 13 * 3600 * 1000), [fromLink.id]);
    s.update(fromLink.id, { sync: false });
    assert.deepEqual(s.dueForSync(Date.now() + 13 * 3600 * 1000), []);
    s.update(fromLink.id, { sync: true });
    s.update(fromLink.id, { tracks: [{ title: 'One', artist: 'A' }, { title: 'Two', artist: 'B' }] });
    assert.ok(s.get(fromLink.id).syncedAt >= Date.now() - 1000);
    assert.equal(new StreamLists(file).get(fromLink.id).sync, true, 'kept on disk');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
