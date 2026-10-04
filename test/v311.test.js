// v3.11: favourites (lib/likes.js), songs moved in a list, the video found for
// a song kept in the right one, and a Spotify profile's public lists.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Likes } = require('../lib/likes');
const { StreamLists } = require('../lib/streamlists');
const importlist = require('../lib/importlist');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tg-v311-'));

test('favourites: added once, newest first, kept on disk, removed; junk refused', () => {
  const dir = tmp();
  const file = path.join(dir, 'likes.json');
  let now = 1000;
  try {
    const l = new Likes(file, { now: () => now });
    assert.equal(l.add({ key: 'yt:dQw4w9WgXcQ', title: 'Never Gonna', artist: 'Rick', thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', dur: 213 }), 1);
    now = 2000;
    assert.equal(l.add({ key: 'f:Queen - Bohemian.mp3', title: 'Bohemian', artist: 'Queen' }), 2);
    now = 3000;
    assert.equal(l.add({ key: 'yt:dQw4w9WgXcQ', title: 'Never Gonna', artist: 'Rick' }), 2, 'once');
    assert.deepEqual(l.list().map((s) => s.key), ['yt:dQw4w9WgXcQ', 'f:Queen - Bohemian.mp3']);
    // Not songs: refused.
    for (const bad of [null, {}, { key: 'yt:short', title: 'x' }, { key: 'http://evil', title: 'x' }, { key: 'f:a\u0000b', title: 'x' }, { key: 'yt:dQw4w9WgXcQ', title: '' }]) assert.equal(l.add(bad), null);
    assert.equal(l.add({ key: 'yt:kJQP7kiw5Fk', title: 'Despacito', thumb: 'https://evil.example/x.jpg' }), 3);
    assert.equal(l.list()[0].thumb, undefined, 'only YouTube pictures');
    const again = new Likes(file);
    assert.equal(again.list().length, 3);
    assert.equal(again.remove('yt:dQw4w9WgXcQ'), 2);
    assert.equal(again.remove('yt:nothere0000'), 2);
    assert.equal(new Likes(file).has('yt:dQw4w9WgXcQ'), false);
    // A broken file: starts empty instead of failing.
    fs.writeFileSync(file, '{not json');
    assert.equal(new Likes(file).list().length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('lists: a song moved to another place; nonsense moves ignored', () => {
  const dir = tmp();
  try {
    const s = new StreamLists(path.join(dir, 'l.json'));
    const l = s.create({ name: 'L', tracks: ['A', 'B', 'C', 'D'].map((title) => ({ title, artist: 'X' })) });
    const titles = () => s.get(l.id).tracks.map((t) => t.title).join('');
    s.update(l.id, { move: { from: 0, to: 2 } });
    assert.equal(titles(), 'BCAD');
    s.update(l.id, { move: { from: 3, to: 0 } });
    assert.equal(titles(), 'DBCA');
    for (const move of [{ from: -1, to: 0 }, { from: 0, to: 9 }, { from: 1.5, to: 0 }, { from: '1', to: 0 }, { from: 2, to: 2 }, null]) s.update(l.id, { move });
    assert.equal(titles(), 'DBCA');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('lists: the video found for a song goes to that song, even after the list changed', () => {
  const dir = tmp();
  try {
    const s = new StreamLists(path.join(dir, 'l.json'));
    const l = s.create({ name: 'L', tracks: [{ title: 'Uno', artist: 'A' }, { title: 'Dos', artist: 'B' }, { title: 'Tres', artist: 'C' }] });
    const q = (n) => s.get(l.id).tracks[n].query;
    const dosQuery = q(1);
    // "Dos" was asked for at place 1; meanwhile "Uno" was removed (Dos is now at 0, Tres at 1).
    s.removeTrack(l.id, 0);
    s.remember(l.id, 1, { id: 'dQw4w9WgXcQ' }, dosQuery);
    const t = s.get(l.id).tracks;
    assert.equal(t[0].title, 'Dos');
    assert.equal(t[0].yt, 'dQw4w9WgXcQ', 'the song looked up');
    assert.equal(t[1].yt, undefined, 'not its new neighbour');
    // A search no song of the list has: nothing changes.
    s.remember(l.id, 1, { id: 'kJQP7kiw5Fk' }, 'otra cosa');
    assert.equal(s.get(l.id).tracks[1].yt, undefined);
    // The old way (no search given) still works by place.
    s.remember(l.id, 1, { id: 'kJQP7kiw5Fk' });
    assert.equal(s.get(l.id).tracks[1].yt, 'kJQP7kiw5Fk');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('spotify profile: only open.spotify.com/user/<id> links', () => {
  assert.deepEqual(importlist.parseProfileUrl('https://open.spotify.com/user/abc.def_1?si=x'), { id: 'abc.def_1', url: 'https://open.spotify.com/user/abc.def_1' });
  assert.equal(importlist.parseProfileUrl('https://open.spotify.com/intl-es/user/x').id, 'x');
  for (const bad of ['http://open.spotify.com/user/x', 'https://evil.com/user/x', 'https://open.spotify.com.evil.com/user/x', 'https://open.spotify.com/user/../x',
    'https://open.spotify.com/user/x/playlists', 'https://u:p@open.spotify.com/user/x', 'https://open.spotify.com:8443/user/x', 'https://open.spotify.com/user/a%2Fb', 'javascript:alert(1)', '', null]) {
    assert.equal(importlist.parseProfileUrl(bad), null, String(bad));
  }
  assert.equal(importlist.isImportUrl('https://open.spotify.com/user/x'), false, 'a profile is not a playlist');
});

test('spotify profile: its public playlists from the page, links built by us', () => {
  const state = {
    entities: { items: { 'spotify:user:pepe': { __typename: 'User', name: 'Pepe\u0007 López', publicPlaylistsV2: { totalCount: 14, items: [
      { _uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M', data: { name: 'Mis éxitos', uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' } },
      { _uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M', data: { name: 'repe' } },
      { _uri: 'spotify:playlist:evil"><script>', data: { name: 'x' } },
      { _uri: 'spotify:album:37i9dQZF1DX0XUsuxWHRQd', data: { name: 'not a playlist' } },
      { data: { name: 'Otra', uri: 'spotify:playlist:37i9dQZF1DX0XUsuxWHRQd' } },
    ] } } } },
  };
  const html = `<html><script id="initialState" type="text/plain">${Buffer.from(JSON.stringify(state)).toString('base64')}</script></html>`;
  const p = importlist.parseProfile(html, 'pepe');
  assert.equal(p.name, 'Pepe López');
  assert.equal(p.total, 14);
  assert.deepEqual(p.playlists, [
    { name: 'Mis éxitos', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' },
    { name: 'Otra', url: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd' },
  ]);
  // Plain JSON works too; no data block: the links on the page.
  assert.equal(importlist.parseProfile(`<script id="initialState">${JSON.stringify(state)}</script>`, 'pepe').playlists.length, 2);
  const links = importlist.parseProfile('<a href="/playlist/37i9dQZF1DXcBWIGoYBM5M">x</a><a href="/playlist/bad">y</a>', 'pepe');
  assert.deepEqual(links.playlists.map((x) => x.url), ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M']);
  assert.equal(importlist.parseProfile('<html></html>', 'pepe').playlists.length, 0);
});

test('spotify profile: read through the page (no lists → a clear error)', async () => {
  let asked = null;
  const page = `<script id="initialState">${JSON.stringify({ entities: { items: { 'spotify:user:pepe': { name: 'Pepe', publicPlaylistsV2: { totalCount: 1, items: [{ _uri: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M', data: { name: 'Una' } }] } } } } })}</script>`;
  const r = await importlist.readProfile('https://open.spotify.com/user/pepe', { fetchText: async (url) => { asked = url; return page; } });
  assert.equal(asked, 'https://open.spotify.com/user/pepe');
  assert.equal(r.playlists.length, 1);
  await assert.rejects(importlist.readProfile('https://open.spotify.com/user/pepe', { fetchText: async () => '<html></html>' }), /ninguna lista pública/);
  await assert.rejects(importlist.readProfile('https://evil.com/user/pepe', { fetchText: async () => page }), /perfil de Spotify/);
});
