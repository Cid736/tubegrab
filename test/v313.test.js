// v3.13: reviewing the library, the official audio, downloads checked,
// albums' songs. (News of your artists moved to Escuchar, with its tests.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { LibInfo, parseInfo, issuesOf } = require('../lib/libinfo');
const { officialAudio, CLIP_RE } = require('../lib/download');
const { checkMedia } = require('../lib/verify');
const { probe, INPUT_DEMUXERS } = require('../lib/convert');
const { albumTracks } = require('../lib/musicbrainz');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tg-v313-'));
const FFMPEG = path.join(__dirname, '..', 'bin', 'ffmpeg.exe');

const STDERR_M4A = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'x.m4a':
  Duration: 00:03:33.04, start: 0.025057, bitrate: 133 kb/s
  Stream #0:0[0x1](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 96 kb/s (default)
  Stream #0:1[0x0]: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 600x600, 90k tbr, 90k tbn (attached pic)`;

test('review: what a song is, from ffmpeg (quality of the audio itself, tags, cover, where it came from)', () => {
  const i = parseInfo(';FFMETADATA1\ntitle=Despacito\nartist=Luis Fonsi\nalbum=Vida\npurl=https://www.youtube.com/watch?v=kJQP7kiw5Fk\n', STDERR_M4A);
  assert.equal(i.codec, 'aac');
  assert.equal(i.bitrate, 96, 'the audio stream, not the total (a cover inflates it)');
  assert.equal(i.cover, true);
  assert.equal(Math.round(i.duration), 213);
  assert.equal(i.source, 'https://www.youtube.com/watch?v=kJQP7kiw5Fk');
  assert.deepEqual(issuesOf(i, { name: 'x.m4a', lrc: false }), ['quality', 'lyrics']);
  assert.deepEqual(issuesOf(i, { name: 'x.m4a', lrc: true }), ['quality'], 'a .lrc next to it counts as lyrics');
  const mp3 = parseInfo('', 'Duration: 00:02:00.00, start: 0.0, bitrate: 192 kb/s\n  Stream #0:0: Audio: mp3 (mp3float), 44100 Hz, stereo, fltp, 192 kb/s');
  assert.deepEqual(issuesOf(mp3, { name: 'y.mp3' }), ['tags', 'cover', 'lyrics'], 'good quality; no tags, cover or lyrics');
  const flac = parseInfo('title=a\nartist=b\nlyrics=la la\n', 'Duration: 00:02:00.00, start: 0.0, bitrate: 900 kb/s\n  Stream #0:0: Audio: flac, 44100 Hz, stereo, s16');
  assert.deepEqual(issuesOf(flac, { name: 'z.flac' }), ['cover'], 'lossless is never "low quality"');
  assert.equal(parseInfo('comment=https://evil.example/x\n', 'Duration: 00:00:10.00').source, null, 'only YouTube / SoundCloud sources');
});

test('review: each song read once (until it changes), gone ones forgotten, kept on disk', async () => {
  const dir = tmp();
  try {
    let calls = 0;
    const inspectFn = async () => { calls++; return { bitrate: 96, codec: 'mp3', title: 't', artist: 'a', cover: true, lyrics: true }; };
    const file = path.join(dir, 'info.json');
    const li = new LibInfo(file, { ffmpegPath: () => 'ffmpeg', safeInput: [], inspectFn });
    const songs = [{ rel: 'A.mp3', full: 'x', size: 1, mtime: 1, kind: 'audio' }, { rel: 'B.mp4', full: 'y', size: 2, mtime: 2, kind: 'video' }];
    await li.refresh(songs);
    assert.equal(calls, 1, 'only audio');
    await li.refresh(songs);
    assert.equal(calls, 1, 'not again');
    songs[0].mtime = 5;
    assert.equal(li.get(songs[0]), null, 'changed: read again');
    await li.refresh(songs);
    assert.equal(calls, 2);
    assert.equal(new LibInfo(file, { ffmpegPath: () => 'ffmpeg', safeInput: [], inspectFn }).get(songs[0]).bitrate, 96, 'kept on disk');
    await li.refresh([]);
    assert.equal(li.cache.size, 0, 'gone files forgotten');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('official audio: a music video → the song\'s official audio, never another version', async () => {
  const clip = { id: 'clipclipcli', title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)', channel: 'Rick Astley', duration: 213 };
  const r = (id, title, channel, duration) => ({ id: id.padEnd(11, 'x'), title, channel, duration });
  const run = (results, info = clip) => officialAudio('https://www.youtube.com/watch?v=clipclipcli', {}, { info: async () => info, find: async () => results });
  assert.equal(await run([r('a', 'Never Gonna Give You Up (Pianoforte) (Official Audio)', 'Rick Astley', 209)]), null, 'another version');
  assert.equal(await run([r('b', 'Rick Astley - Never Gonna Give You Up [HQ]', 'Fan channel', 213)]), null, 'someone else\'s upload');
  assert.equal(await run([r('c', 'Never Gonna Give You Up | Live', 'Rick Astley', 230)]), null, 'longer than the clip / live');
  assert.equal(await run([r('d', 'Never Gonna Give You Up', 'Rick Astley - Topic', 212)]), 'https://www.youtube.com/watch?v=dxxxxxxxxxx', 'the "Topic" one');
  assert.equal(await run([r('e', 'Never Gonna Give You Up (2022 Remaster)', 'Rick Astley', 214)]), 'https://www.youtube.com/watch?v=exxxxxxxxxx', 'their own channel, not a clip');
  assert.equal(await run([r('f', 'Rick Astley - Never Gonna Give You Up (Official Audio)', 'Rick Astley', 213)]), 'https://www.youtube.com/watch?v=fxxxxxxxxxx');
  assert.equal(await run([r('g', 'Never Gonna Give You Up', 'Rick Astley - Topic', 212)], { ...clip, title: 'Rick Astley - Never Gonna Give You Up' }), null, 'not a clip: as it is');
  assert.equal(await run([], null), null);
  assert.ok(CLIP_RE.test('BAD BUNNY - NUEVAYoL (Video Oficial)'));
  assert.ok(!CLIP_RE.test('Bohemian Rhapsody (Remastered 2011)'));
});

test('downloads checked: a whole file passes, a cut or short one doesn\'t', async (t) => {
  if (!fs.existsSync(FFMPEG)) { t.skip('no ffmpeg'); return; }
  const dir = tmp();
  try {
    const good = path.join(dir, 'good.mp3');
    execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=duration=40', '-b:a', '128k', good]);
    const args = { ffmpegPath: FFMPEG, probe, demuxers: INPUT_DEMUXERS };
    assert.deepEqual(await checkMedia({ ...args, file: good, expected: 40 }), { ok: true });
    assert.equal((await checkMedia({ ...args, file: good, expected: 90 })).reason, 'short', 'much shorter than the video said');
    const cut = path.join(dir, 'cut.m4a');
    execFileSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=duration=40', cut]);
    const buf = fs.readFileSync(cut);
    fs.writeFileSync(cut, buf.subarray(0, Math.floor(buf.length / 2)));
    assert.equal((await checkMedia({ ...args, file: cut, expected: 40 })).ok, false, 'half a file');
    fs.writeFileSync(path.join(dir, 'junk.mp3'), 'not audio');
    assert.equal((await checkMedia({ ...args, file: path.join(dir, 'junk.mp3'), expected: null })).reason, 'unreadable');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('albums: the official release\'s songs, in order', async () => {
  const asked = [];
  const fetchJson = async (url) => {
    asked.push(url);
    if (url.includes('/release?')) {
      return { releases: [
        { id: '11111111-1111-1111-1111-111111111111', title: 'Vida (Live)', score: 100, date: '2019', 'release-group': { 'primary-type': 'Album' } },
        { id: '22222222-2222-2222-2222-222222222222', title: 'Vida', score: 100, date: '2020', 'release-group': { 'primary-type': 'Album' } },
        { id: '33333333-3333-3333-3333-333333333333', title: 'Vida', score: 100, date: '2019-02-01', 'release-group': { 'primary-type': 'Album' }, 'artist-credit': [{ name: 'Luis Fonsi' }] },
        { id: 'not-a-uuid', title: 'Vida', score: 100 },
      ] };
    }
    return { media: [{ tracks: [{ position: 1, title: 'Despacito', length: 228000 }, { position: 2, title: 'Échame la culpa\u0007', length: 173000 }] }] };
  };
  const r = await albumTracks({ artist: 'Luis Fonsi', album: 'Vida' }, { fetchJson });
  assert.equal(r.release.id, '33333333-3333-3333-3333-333333333333', 'the earliest official album with that very name');
  assert.deepEqual(r.tracks, [{ disc: 1, n: 1, title: 'Despacito', length: 228 }, { disc: 1, n: 2, title: 'Échame la culpa', length: 173 }]);
  assert.ok(asked[0].startsWith('https://musicbrainz.org/ws/2/release?'));
  assert.equal(await albumTracks({ artist: '', album: 'x' }, { fetchJson }), null);
  assert.equal(await albumTracks({ artist: 'a', album: 'Nada' }, { fetchJson: async () => ({ releases: [] }) }), null);
});
