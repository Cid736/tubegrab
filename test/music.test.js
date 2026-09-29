// Music tools: metadata from yt-dlp, lyrics from LRCLIB (with a fake server),
// and the tag editor with real ffmpeg.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseMeta } = require('../lib/download');
const lyrics = require('../lib/lyrics');
const tags = require('../lib/tags');
const { ffmpegPath } = require('./helpers');

const ffmpeg = ffmpegPath();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-music-test-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

/** A fake fetch: `routes` maps '/api/get' / '/api/search' to { status, body }. */
function fakeFetch(routes, seen = []) {
  return async (url, init) => {
    const u = new URL(url);
    seen.push({ host: u.host, path: u.pathname, params: Object.fromEntries(u.searchParams), ua: init.headers['User-Agent'], redirect: init.redirect });
    const r = routes[u.pathname] || { status: 404, body: '' };
    const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status || 200, headers: r.headers || {} });
  };
}

test('parseMeta keeps only known, short, plain fields', () => {
  const nul = String.fromCharCode(0);
  const meta = parseMeta(JSON.stringify({ artist: `Queen${nul}`, album: 'A Night at the Opera', duration: 355, title: { evil: 1 }, x: 'no', uploader: 'u'.repeat(500) }));
  assert.deepEqual(meta, { artist: 'Queen', album: 'A Night at the Opera', uploader: 'u'.repeat(200), duration: 355 });
  for (const bad of ['nope', '[]', 'null', '"x"']) assert.equal(parseMeta(bad), null, bad);
});

test('lyrics: title clean-up and synced lines only', () => {
  assert.equal(lyrics.cleanTitle('Bohemian Rhapsody (Official Video Remastered) [HD]'), 'Bohemian Rhapsody');
  assert.equal(lyrics.cleanTitle('Tití Me Preguntó ft. Someone'), 'Tití Me Preguntó');
  const synced = lyrics.cleanSynced('[00:01.00] uno\nbasura sin tiempo\n[00:02.50] dos\n[ar:evil]\n[01:02:03.4] ok');
  assert.equal(synced, '[00:01.00] uno\n[00:02.50] dos');
});

test('lyrics: asks only lrclib.net, over HTTPS, with our User-Agent and no redirects', async () => {
  const seen = [];
  const found = await lyrics.findLyrics({ artist: 'Queen', title: 'Bohemian Rhapsody (Official Video)', duration: 354.6 },
    { fetchImpl: fakeFetch({ '/api/get': { body: { plainLyrics: 'Is this the real life?', syncedLyrics: '[00:00.15] Is this the real life?' } } }, seen) });
  assert.deepEqual(found, { plain: 'Is this the real life?', synced: '[00:00.15] Is this the real life?' });
  assert.equal(seen[0].host, 'lrclib.net');
  assert.deepEqual(seen[0].params, { artist_name: 'Queen', track_name: 'Bohemian Rhapsody', duration: '355' });
  assert.match(seen[0].ua, /^TubeGrab\//);
  assert.equal(seen[0].redirect, 'error');
});

test('lyrics: falls back to search, matching the duration; nothing / instrumental → null', async () => {
  const list = [{ duration: 100, plainLyrics: 'otra canción' }, { duration: 356, plainLyrics: 'la buena' }];
  const found = await lyrics.findLyrics({ artist: 'A', title: 'B', duration: 355 }, { fetchImpl: fakeFetch({ '/api/search': { body: list } }) });
  assert.equal(found.plain, 'la buena');
  assert.equal(await lyrics.findLyrics({ artist: 'A', title: 'B' }, { fetchImpl: fakeFetch({}) }), null);
  assert.equal(await lyrics.findLyrics({ artist: 'A', title: 'B' }, { fetchImpl: fakeFetch({ '/api/get': { body: { instrumental: true } } }) }), null);
  assert.equal(await lyrics.findLyrics({ artist: '', title: 'B' }, { fetchImpl: () => { throw new Error('should not ask'); } }), null);
});

test('lyrics: huge or broken answers are refused', async () => {
  const big = { '/api/get': { body: 'x'.repeat(600 * 1024) } };
  await assert.rejects(lyrics.findLyrics({ artist: 'A', title: 'B' }, { fetchImpl: fakeFetch(big) }), /demasiado grande/);
  await assert.rejects(lyrics.findLyrics({ artist: 'A', title: 'B' }, { fetchImpl: fakeFetch({ '/api/get': { status: 500, body: 'x' } }) }), /500/);
  await assert.rejects(lyrics.findLyrics({ artist: 'A', title: 'B' }, { fetchImpl: fakeFetch({ '/api/get': { body: '{nope' } }) }));
  const controls = await lyrics.findLyrics({ artist: 'A', title: 'B' },
    { fetchImpl: fakeFetch({ '/api/get': { body: { plainLyrics: `hola${String.fromCharCode(27)}[31m\r\nadiós${String.fromCharCode(0)}` } } }) });
  assert.equal(controls.plain, 'hola[31m\nadiós');
});

test('parseTagList: one entry per file, known fields, sane values', () => {
  assert.deepEqual(tags.parseTagList(JSON.stringify([{ title: ' Hola ', track: '3/12', date: '2024', evil: 'x' }]), 1), [{ title: 'Hola', track: '3/12', date: '2024' }]);
  const one = (o) => JSON.stringify([o]);
  for (const [raw, n] of [['x', 1], ['[]', 1], [one({}), 2], [one({ title: 5 }), 1], [one({ track: 'tres' }), 1], [one({ date: '24' }), 1],
    [one({ title: 'a'.repeat(301) }), 1], ['[null]', 1], ['[[]]', 1]]) {
    assert.equal(tags.parseTagList(raw, n), null, raw);
  }
  assert.deepEqual(tags.parseTagList(one({ title: 'a\nb' }), 1), [{ title: 'a b' }], 'no line breaks outside lyrics');
});

test('tag editor with real ffmpeg', { skip: !ffmpeg && 'ffmpeg not found', timeout: 180_000 }, async (t) => {
  const song = (ext) => {
    const f = path.join(work, `song.${ext}`);
    execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=d=2', '-metadata', 'title=Viejo', f]);
    return f;
  };
  const cover = path.join(work, 'cover.png');
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-frames:v', '1', cover]);
  const tricky = { title: 'Título = raro; #1 \\ fin', artist: 'Ñandú & Co', album: 'Álbum', album_artist: 'Varios', track: '7/12', date: '2024', genre: 'Pop', lyrics: 'Línea uno\nLínea = dos; #3 \\' };

  for (const ext of ['mp3', 'm4a', 'flac', 'opus']) {
    await t.test(`${ext}: every field round-trips exactly`, async () => {
      const out = path.join(work, `out.${ext}`);
      await tags.writeTags({ ffmpegPath: ffmpeg, inputPath: song(ext), ext, tags: tricky, coverPath: cover, out });
      const read = await tags.readTags(ffmpeg, out, `out.${ext}`);
      assert.deepEqual(read.tags, { ...tricky, disc: '' });
      assert.equal(read.hasCover, ext !== 'opus', 'cover only where the format supports it');
    });
  }
  await t.test('empty value clears a tag', async () => {
    const out = path.join(work, 'clear.mp3');
    await tags.writeTags({ ffmpegPath: ffmpeg, inputPath: song('mp3'), ext: 'mp3', tags: { title: '' }, out });
    assert.equal((await tags.readTags(ffmpeg, out, 'clear.mp3')).tags.title, '');
  });
  await t.test('job: rename, same names, hostile names and lyrics (fake LRCLIB)', async () => {
    const dir = fs.mkdtempSync(path.join(work, 'job-'));
    const inputs = [{ path: song('mp3'), name: '../../evil.mp3' }, { path: song('mp3'), name: 'b.mp3' }, { path: song('flac'), name: 'CON.flac' }];
    const tagList = [{ artist: 'Queen', title: 'Bohemian Rhapsody' }, { artist: 'Queen', title: 'Bohemian Rhapsody' }, { title: 'x' }];
    const fetchImpl = fakeFetch({ '/api/get': { body: { plainLyrics: 'Is this the real life?', syncedLyrics: '[00:00.15] Is this the real life?\n[ar:x]' } } });
    const out = await tags.runTags({ inputs, tagList, rename: true, lyrics: true, ffmpegPath: ffmpeg, fetchImpl })(
      {}, { dir, update() {}, setProcess() {}, isCanceled: () => false },
    );
    assert.deepEqual(out.map((f) => path.basename(f)), [
      'Queen - Bohemian Rhapsody.mp3', 'Queen - Bohemian Rhapsody.lrc', 'Queen - Bohemian Rhapsody (2).mp3', 'Queen - Bohemian Rhapsody (2).lrc', '_CON.flac',
    ]);
    for (const f of out) assert.equal(path.dirname(f), dir);
    assert.equal(fs.readFileSync(out[1], 'utf8'), '[00:00.15] Is this the real life?\n', 'only LRC lines');
    assert.equal((await tags.readTags(ffmpeg, out[0], 'x.mp3')).tags.lyrics, 'Is this the real life?');
    assert.deepEqual(fs.readdirSync(dir).sort(), out.map((f) => path.basename(f)).sort(), 'no temp files');
  });
});
