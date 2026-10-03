// v3.5.0: imported lists, podcasts, MusicBrainz, priorities and the queue
// that survives a restart, repeating tasks and the download window, the
// zip for the phone, best moments, voice removal, animated titles,
// subtitles and lyrics in the library, proxy and SponsorBlock chapters.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { fork, execFileSync } = require('child_process');
const { ROOT, ffmpegPath } = require('./helpers');

const ffmpeg = ffmpegPath();
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-v35-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

// ---- Spotify / Apple Music ----
const importlist = require('../lib/importlist');
test('import: only Spotify / Apple Music list links, read from their pages', () => {
  assert.equal(importlist.parseImportUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=1').url, 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M');
  assert.equal(importlist.parseImportUrl('https://open.spotify.com/intl-es/album/4aawyAB9vmqN3uQ7FjRGTy').kind, 'album');
  assert.equal(importlist.parseImportUrl('https://music.apple.com/us/playlist/hits/pl.f4d106fed2bd41149aaacabb233eb5eb').service, 'apple');
  for (const bad of ['http://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'https://open.spotify.com.evil.com/playlist/x', 'https://open.spotify.com/user/x', 'https://user@open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'javascript:alert(1)', '']) {
    assert.equal(importlist.parseImportUrl(bad), null, bad);
  }
  const spotify = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { state: { data: { entity: { name: 'Mi lista', trackList: [
    { title: 'Canción\u0007 uno', subtitle: 'Artista A, Artista B', duration: 200500 }, { title: '', subtitle: 'x' }] } } } } } })}</script>`;
  assert.deepEqual(importlist.parseSpotify(spotify), { title: 'Mi lista', tracks: [{ title: 'Canción uno', artist: 'Artista A, Artista B', duration: 201 }] });
  assert.equal(importlist.searchQuery({ title: 'Canción uno', artist: 'Artista A, Artista B' }), 'Artista A - Canción uno');
  const apple = `<meta property="og:title" content="Éxitos &amp; más on Apple Music"><script type="application/json" id="serialized-server-data">${JSON.stringify([{ data: { sections: [{ items: [
    { id: '1', title: 'Tema', artistName: 'Grupo', duration: 181270, contentDescriptor: { kind: 'song' } },
    { id: '1', title: 'Tema', artistName: 'Grupo' }, { id: '2', title: 'Vídeo', artistName: 'Grupo', contentDescriptor: { kind: 'musicVideo' } }] }] } }])}</script>`;
  assert.deepEqual(importlist.parseApple(apple), { title: 'Éxitos & más', tracks: [{ title: 'Tema', artist: 'Grupo', duration: 181 }] });
});

// ---- the download side of imports, thumbnails, proxy, SponsorBlock chapters ----
const download = require('../lib/download');
test('download: a search source is plain text; proxy and SponsorBlock modes reach yt-dlp only when valid', () => {
  assert.equal(download.searchUrl('  Queen -\n Bohemian  Rhapsody '), 'ytsearch1:Queen - Bohemian Rhapsody');
  assert.equal(download.searchUrl('x'.repeat(201)), null);
  assert.equal(download.isSearchUrl('ytsearch1:abc'), true);
  assert.equal(download.isSearchUrl('ytsearch10:abc'), false);
  assert.equal(download.isSearchUrl('https://youtu.be/x'), false);
  for (const ok of ['http://proxy.local:8080', 'socks5://127.0.0.1:1080', 'https://user:pa$s@host.example:3128/', 'socks5h://[::1]:9050']) assert.equal(download.parseProxy(ok), ok, ok);
  for (const bad of ['proxy:8080', 'ftp://x:21', 'http://x', 'http://x:99999', 'http://x:80 --exec calc', 'http://x:80\nfoo', '--proxy=x']) assert.equal(download.parseProxy(bad), null, bad);
  const env = { ytDlpPath: 'yt', ffmpegPath: 'ff', dir: work, proxy: 'socks5://127.0.0.1:1080' };
  const url = 'https://www.youtube.com/watch?v=x';
  const mark = download.buildArgs(url, download.parseDownloadOptions({ mode: 'audio', sponsorblock: true, sponsorMode: 'mark' }), env);
  assert.equal(mark[mark.indexOf('--proxy') + 1], 'socks5://127.0.0.1:1080');
  assert.ok(mark.includes('--sponsorblock-mark') && mark.includes('--embed-chapters') && !mark.includes('--sponsorblock-remove'));
  const cut = download.buildArgs(url, download.parseDownloadOptions({ mode: 'audio', sponsorblock: true, sponsorMode: 'x' }), { ...env, proxy: 'bad proxy' });
  assert.ok(cut.includes('--sponsorblock-remove') && !cut.includes('--proxy'));
  const search = download.buildArgs('ytsearch1:Queen - Bohemian Rhapsody', download.parseDownloadOptions({ mode: 'audio' }), env);
  assert.deepEqual(search.slice(-2), ['--', 'ytsearch1:Queen - Bohemian Rhapsody']);
});

// ---- podcasts ----
const podcasts = require('../lib/podcasts');
test('podcasts: a feed\'s episodes (newest first), chapters and safe ffmetadata', () => {
  const feed = `<?xml version="1.0"?><rss xmlns:itunes="x" xmlns:podcast="y"><channel><title>Mi &amp; podcast</title><itunes:image href="https://cdn.example/show.jpg"/>
    <item><title><![CDATA[Episodio 1 <b>viejo</b>]]></title><guid>g1</guid><pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate><enclosure url="https://cdn.example/1.mp3" type="audio/mpeg" length="1"/><itunes:duration>1:02:03</itunes:duration></item>
    <item><title>Episodio 2</title><guid>g2</guid><pubDate>Tue, 02 Jan 2024 10:00:00 GMT</pubDate><enclosure url="http://cdn.example/2.m4a" type="audio/x-m4a"/><podcast:chapters url="https://cdn.example/2.json" type="application/json+chapters"/></item>
    <item><title>Sin audio</title><enclosure url="javascript:alert(1)"/></item>
  </channel></rss>`;
  const p = podcasts.parseFeed(feed);
  assert.equal(p.title, 'Mi & podcast');
  assert.equal(p.image, 'https://cdn.example/show.jpg');
  assert.deepEqual(p.episodes.map((e) => [e.guid, e.title, e.url, e.duration]), [['g2', 'Episodio 2', 'http://cdn.example/2.m4a', null], ['g1', 'Episodio 1 viejo', 'https://cdn.example/1.mp3', 3723]]);
  assert.equal(p.episodes[0].chapters, 'https://cdn.example/2.json');
  assert.throws(() => podcasts.parseFeed('<html>no</html>'), /no es un podcast/);
  const ch = podcasts.parseChapters({ chapters: [{ startTime: 60, title: 'Dos' }, { startTime: 0, title: 'Uno' }, { startTime: 'x' }, { startTime: 90, toc: false }] }, 120);
  assert.deepEqual(ch.map((c) => [c.start, c.title]), [[0, 'Uno'], [60, 'Dos']]);
  const meta = podcasts.ffmeta({ title: 'a=b;c#d\\e\nf' }, ch);
  assert.ok(meta.startsWith(';FFMETADATA1\ntitle=a\\=b\\;c\\#d\\\\e\\\nf\n'));
  assert.match(meta, /\[CHAPTER\]\nTIMEBASE=1\/1000\nSTART=0\nEND=60000\ntitle=Uno/);
});

test('podcasts: subscribing marks what exists, then only new episodes are queued', async () => {
  let episodes = [{ guid: 'a', title: 'A', url: 'https://x/a.mp3' }, { guid: 'b', title: 'B', url: 'https://x/b.mp3' }];
  const queued = [];
  const store = new podcasts.Podcasts({ file: path.join(work, 'pods.json'), enqueue: (p, eps) => queued.push(...eps.map((e) => e.guid)), read: async () => ({ title: 'Show', image: null, episodes }) });
  clearInterval(store.timer);
  const p = await store.add({ clientId: 'c'.repeat(32), url: 'https://feeds.example/rss', backfill: 1 });
  assert.deepEqual(queued, ['a'], 'the newest one, as asked');
  await assert.rejects(store.add({ clientId: 'c'.repeat(32), url: 'https://feeds.example/rss' }), /Ya estás suscrito/);
  await assert.rejects(store.add({ clientId: 'c'.repeat(32), url: 'file:///c:/x' }), /feed/);
  episodes = [{ guid: 'c', title: 'C', url: 'https://x/c.mp3' }, ...episodes];
  assert.equal(await store.check(store.get(p.id, 'c'.repeat(32))), 1);
  assert.deepEqual(queued, ['a', 'c']);
});

// ---- public-only fetching ----
const netfetch = require('../lib/netfetch');
test('netfetch: private, loopback and odd addresses are refused, also by name', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.8', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::7f00:1', '::ffff:a00:1', '2002:7f00:1::', '64:ff9b::7f00:1', '::']) assert.equal(netfetch.isPublicIp(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111', '::ffff:808:808']) assert.equal(netfetch.isPublicIp(ip), true, ip);
  for (const bad of ['http://example.com/', 'https://127.0.0.1/', 'https://[::1]/', 'https://localhost/', 'https://printer.local/', 'https://u:p@example.com/', 'https://example.com:22/']) {
    assert.throws(() => netfetch.checkUrl(bad), Error, bad);
  }
  assert.doesNotThrow(() => netfetch.checkUrl('http://example.com/feed', { allowHttp: true }));
  // A name that resolves to this computer is stopped by the connection's own lookup.
  await assert.rejects(netfetch.get('https://localtest.me/'), /pública|public|No se encuentra/);
});

// ---- the queue: priorities and what comes back after a restart ----
const { JobManager, pendingSpecs } = require('../lib/jobs');
test('jobs: urgent first, "when there\'s time" last; only unfinished downloads are kept for later', async () => {
  const jm = new JobManager({ root: path.join(work, 'jobs') });
  jm.setConcurrency('download', 1);
  jm.setHold(Date.now() + 60_000);
  const started = [];
  const run = (name) => async () => { started.push(name); return null; };
  const c = 'a'.repeat(32);
  const mk = (name, priority) => jm.create({ clientId: c, type: 'download', title: name, run: run(name), retryable: true, priority, persist: { kind: 'download', url: `https://youtu.be/${name}`, opts: {} } });
  mk('normal1');
  const low = mk('low', 'low');
  mk('high', 'high');
  mk('normal2', 'bogus');
  const specs = pendingSpecs(jm);
  assert.deepEqual(specs.map((s) => [s.title, s.priority]), [['high', 'high'], ['normal1', 'normal'], ['normal2', 'normal'], ['low', 'low']]);
  assert.equal(jm.setPriority(low, 'high'), true);
  assert.equal(jm.setPriority(low, 'urgent!'), false);
  jm.setHold(null);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(started[0], 'low', 'the oldest urgent one goes first (it was raised to urgent)');
  // A paused job comes back paused.
  const p = jm.create({ clientId: c, type: 'download', title: 'p', run: run('p'), retryable: true, paused: true, persist: { kind: 'download', url: 'https://youtu.be/p', opts: {} } });
  assert.equal(p.status, 'paused');
  assert.equal(pendingSpecs(jm).find((s) => s.title === 'p').paused, true);
});

// ---- repeating tasks and the download window ----
const { Recurring, inWindow } = require('../lib/recurring');
test('recurring: the window (also past midnight) and tasks once a day at their time', () => {
  const at = (h, m) => new Date(2026, 9, 5, h, m); // a Monday
  assert.equal(inWindow({ enabled: true, from: '02:00', to: '07:00' }, at(3, 0)), true);
  assert.equal(inWindow({ enabled: true, from: '02:00', to: '07:00' }, at(7, 0)), false);
  assert.equal(inWindow({ enabled: true, from: '23:00', to: '06:00' }, at(1, 0)), true);
  assert.equal(inWindow({ enabled: true, from: '23:00', to: '06:00' }, at(12, 0)), false);
  assert.equal(inWindow({ enabled: false, from: '23:00', to: '06:00' }, at(12, 0)), true);
  let now = at(2, 59);
  const ran = [];
  const r = new Recurring({ file: path.join(work, 'rec.json'), run: (t) => { ran.push(t.url); return 'ok'; }, now: () => now });
  clearInterval(r.timer);
  const c = 'b'.repeat(32);
  r.add(c, { url: 'https://youtu.be/a', options: {}, time: '03:00', days: [1] });
  r.add(c, { url: 'https://youtu.be/b', options: {}, time: '03:00', days: [2] });
  assert.throws(() => r.add(c, { url: 'u', time: '25:00', days: [1] }), /Hora/);
  assert.throws(() => r.add(c, { url: 'u', time: '03:00', days: [9] }), /día/);
  r.tick();
  now = at(3, 0);
  r.tick();
  r.tick();
  assert.deepEqual(ran, ['https://youtu.be/a'], 'Monday\'s only, once');
  assert.equal(r.view('c'.repeat(32)).tasks.length, 0, 'tasks are per client');
  assert.throws(() => r.setWindow({ from: '05:00', to: '05:00' }), /distintas/);
});

// ---- the zip for the phone ----
const { writeZip, crc32, entryNames } = require('../lib/zipstream');
test('zip: stored entries with sizes and CRCs that a zip reader accepts; safe names', async () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.deepEqual(entryNames(['a.mp3', 'A.mp3', '../x/y.mp3', '.oculto']), ['a.mp3', 'A (2).mp3', '__x_y.mp3', '_oculto']);
  const a = path.join(work, 'a.bin');
  const b = path.join(work, 'b.bin');
  fs.writeFileSync(a, Buffer.alloc(70000, 3));
  fs.writeFileSync(b, 'hola');
  const out = path.join(work, 'z.zip');
  const ws = fs.createWriteStream(out);
  await writeZip([{ path: a, name: 'Canción.mp3' }, { path: b, name: 'b.txt' }], ws);
  await new Promise((r) => ws.end(r));
  const z = fs.readFileSync(out);
  const end = z.length - 22;
  assert.equal(z.readUInt32LE(end), 0x06054b50);
  assert.equal(z.readUInt16LE(end + 10), 2);
  if (process.platform === 'win32') {
    const dir = path.join(work, 'unz');
    fs.mkdirSync(dir);
    execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', out, '-C', dir]);
    assert.equal(fs.readFileSync(path.join(dir, 'Canción.mp3')).length, 70000);
    assert.equal(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8'), 'hola');
  }
});

// ---- best moments ----
const { pickHighlights } = require('../lib/highlights');
test('best moments: the loudest stretches, not overlapping, in time order', () => {
  const levels = new Array(240).fill(-40); // 2 minutes, every half second
  for (let i = 60; i < 80; i++) levels[i] = -10; // 30–40 s
  for (let i = 180; i < 200; i++) levels[i] = -12; // 90–100 s
  const got = pickHighlights(levels, [92, 93, 94], { clip: 10, count: 2, duration: 120 });
  assert.equal(got.length, 2);
  assert.ok(got[0].start >= 28 && got[0].start <= 32, JSON.stringify(got));
  assert.ok(got[1].start >= 88 && got[1].start <= 92, JSON.stringify(got));
  assert.ok(got[0].end <= got[1].start);
});

// ---- voice and titles ----
const convert = require('../lib/convert');
test('convert: voice removal / vocals only from the list; animated titles', () => {
  const mp3 = convert.formatFor('mp3').config;
  const af = (body) => { const a = convert.buildAudioArgs(mp3, body); return a[a.indexOf('-af') + 1]; };
  assert.match(af({ voice: 'karaoke' }), /stereotools=mlev=0\.015625/);
  assert.match(af({ voice: 'vocals', speed: '1.5' }), /stereotools=slev=0\.015625.*atempo=1\.5/);
  assert.equal(convert.buildAudioArgs(mp3, { voice: 'constructor' }).includes('-af'), false);
  assert.equal(convert.describeConvert('audio', mp3, { voice: 'karaoke' }), 'MP3 · sin voz');
  assert.deepEqual(convert.typeSteps('Hola tú'), ['H', 'Ho', 'Hol', 'Hola', 'Hola t', 'Hola tú']);
  assert.ok(convert.typeSteps('palabra '.repeat(100)).length <= 60);
  const fx = convert.parseEditEffects({ texts: JSON.stringify([{ text: 'Hola', pos: 'top', size: 'm', from: 1, to: 4, anim: 'fade' }, { text: 'Ab', pos: 'bottom', size: 's', anim: 'type' }]) });
  const a = convert.editArgs({ inputPath: 'x', segs: [[0, 10, 1]], withVideo: true, withAudio: false, config: convert.formatFor('mp4').config, body: {}, fx, out: 'o.mp4' });
  const g = a.graph.join(';');
  assert.match(g, /textfile=text0\.txt[^;]*:alpha='min\(/);
  assert.match(g, /textfile=text1_0\.txt[^;]*enable='\(1\)\*gte\(t,0\.000\)\*lt\(t,/);
  assert.match(g, /textfile=text1_1\.txt/);
});

// ---- library: subtitles, lyrics search, many files to the phone ----
const { Library, ShareServer, srtToVtt } = require('../lib/library');
test('library: a video\'s .srt next to it, as WebVTT; songs found by a line of their lyrics', async () => {
  const root = path.join(work, 'lib');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'Peli.mp4'), 'v');
  fs.writeFileSync(path.join(root, 'Peli.es.srt'), '1\n00:00:01,000 --> 00:00:02,500\n<font color="red">Hola</font> <i>mundo</i>\n');
  fs.writeFileSync(path.join(root, 'Otra.srt'), 'x');
  fs.writeFileSync(path.join(root, 'Cancion.mp3'), 'a');
  fs.writeFileSync(path.join(root, 'Cancion.lrc'), '[00:01.00]Bajo la lluvia de abril\n[00:05.00]otra línea');
  fs.writeFileSync(path.join(root, 'Otra.mp3'), 'b');
  const lib = new Library({ rootFn: () => root });
  const files = lib.scan().files;
  const video = files.find((f) => f.name === 'Peli.mp4');
  const subs = lib.subtitlesFor(video.id);
  assert.deepEqual(subs.map((s) => [path.basename(s.path), s.lang]), [['Peli.es.srt', 'es']]);
  assert.equal(srtToVtt(fs.readFileSync(subs[0].path, 'utf8')), 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHola <i>mundo</i>\n');
  const p = lib.indexLyrics(async (file) => (file.endsWith('Otra.mp3') ? 'Letra en la etiqueta' : ''));
  assert.equal(p.total, 2);
  await new Promise((r) => setTimeout(r, 50));
  const song = files.find((f) => f.name === 'Cancion.mp3');
  assert.deepEqual(lib.searchLyrics('LLUVIA de Abril'), [{ id: song.id, line: 'Bajo la lluvia de abril' }]);
  assert.equal(lib.searchLyrics('etiqueta').length, 1);
  assert.deepEqual(lib.searchLyrics('ll'), [], 'at least 3 letters');
});

test('share to the phone: a list page, each file and the zip, only by token', async () => {
  const s = new ShareServer({ lanAddressFn: () => '127.0.0.1' });
  const a = path.join(work, 'uno.mp3');
  fs.writeFileSync(a, Buffer.alloc(2000, 1));
  const share = await s.shareMany([{ path: a, name: 'Uno <b>.mp3' }, { path: a, name: 'Dos.mp3' }], 'Mi <lista>');
  try {
    const base = share.url;
    const page = await (await fetch(base)).text();
    assert.ok(page.includes('Mi &lt;lista&gt;') && page.includes('Uno &lt;b&gt;.mp3') && !page.includes('<b>'));
    assert.equal((await (await fetch(`${base}/1`)).arrayBuffer()).byteLength, 2000);
    assert.equal((await fetch(`${base}/7`)).status, 404);
    const zip = await fetch(`${base}/zip`);
    assert.equal(zip.headers.get('content-type'), 'application/zip');
    assert.ok((await zip.arrayBuffer()).byteLength > 4000);
    assert.equal((await fetch(base.replace(/[a-f0-9]{32}$/, 'f'.repeat(32)))).status, 404);
    assert.equal((await fetch(`${base}/file`)).status, 404, 'not a single-file share');
  } finally {
    s.stop();
  }
});

// ---- the server ----
const freePort = () => new Promise((resolve) => { const srv = net.createServer().listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); }); });
function start(port, env) {
  const child = fork(path.join(ROOT, 'server.js'), [], { env: { ...process.env, PORT: String(port), HOST: '', ...env }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const first = new Promise((resolve) => child.once('message', resolve));
  return { child, first };
}
const CLIENT = 'c'.repeat(32);
const H = { 'x-client-id': CLIENT, 'content-type': 'application/json' };
test('server (desktop): the queue comes back after a restart; priorities; imported songs and thumbnails are checked', { timeout: 60_000 }, async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-v35-srv-'));
  const env = { TUBEGRAB_ELECTRON: '1', TUBEGRAB_DATA_DIR: data, TUBEGRAB_YTDLP: path.join(data, 'no-yt-dlp.exe') };
  let port = await freePort();
  let s = start(port, env);
  const post = (p, body, base = `http://localhost:${port}`) => fetch(`${base}${p}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  try {
    await s.first;
    // Held until later, so nothing starts.
    assert.equal((await post('/api/schedule', { at: '04:00' })).status, 200);
    const r = await post('/api/jobs/download', { mode: 'audio', priority: 'high', items: [{ query: 'Queen - Bohemian Rhapsody', title: 'Bohemian Rhapsody' }, { url: 'https://evil.example/x' }] });
    assert.deepEqual(await r.json(), { created: 1, rejected: ['https://evil.example/x'] });
    assert.equal((await post('/api/jobs/download', { mode: 'audio', playlist: true, items: [{ query: 'x' }] })).status, 400, 'a search is never a playlist');
    assert.equal((await post('/api/jobs/thumbnail', { url: 'file:///c:/windows/win.ini' })).status, 400);
    assert.equal((await (await post('/api/jobs/thumbnail', { urls: ['https://youtu.be/dQw4w9WgXcQ'], format: 'png' })).json()).created, 1);
    assert.equal((await post('/api/import', { url: 'https://evil.example/playlist/1' })).status, 400);
    assert.equal((await post('/api/config', { proxy: 'http://x:80 --exec calc' })).status, 400);
    assert.equal((await post('/api/config', { acoustidKey: 'a b' })).status, 400);
    await new Promise((res) => setTimeout(res, 2200));
    const saved = JSON.parse(fs.readFileSync(path.join(data, 'queue.json'), 'utf8'));
    assert.deepEqual(saved.map((x) => [x.kind, x.url, x.priority]), [['download', 'ytsearch1:Queen - Bohemian Rhapsody', 'high'], ['thumb', 'https://youtu.be/dQw4w9WgXcQ', 'normal']]);
    s.child.kill();
    await new Promise((res) => s.child.once('exit', res));
    // A tampered queue file: only valid entries come back.
    saved.push({ kind: 'download', url: 'https://evil.example/x', clientId: CLIENT }, { kind: 'podcast', clientId: CLIENT, episode: { url: 'file:///c:/x' }, podcast: {} }, { kind: 'download', url: 'https://youtu.be/x', clientId: 'nope' });
    fs.writeFileSync(path.join(data, 'queue.json'), JSON.stringify(saved));
    port = await freePort();
    s = start(port, env);
    await s.first;
    const res = await fetch(`http://localhost:${port}/api/jobs/events?client=${CLIENT}`);
    const reader = res.body.getReader();
    let text = '';
    while (!text.includes('\n\n')) text += new TextDecoder().decode((await reader.read()).value);
    reader.cancel();
    const snap = JSON.parse(/event: snapshot\ndata: (.*)\n/.exec(text)[1]);
    // (No longer held: the schedule isn't kept across restarts, so they may already be starting.)
    assert.deepEqual(snap.map((j) => [j.title, j.priority]), [['Bohemian Rhapsody', 'high'], ['https://youtu.be/dQw4w9WgXcQ', 'normal']]);
    const job = snap[1];
    assert.equal((await post(`/api/jobs/${job.id}/priority`, { priority: 'low' })).status, 200);
    assert.equal((await post(`/api/jobs/${job.id}/priority`, { priority: 'now' })).status, 409);
    // Repeating tasks and podcasts only with valid input.
    assert.equal((await post('/api/recurring', { url: 'https://evil.example/x', time: '03:00', days: [1] })).status, 400);
    assert.equal((await post('/api/recurring', { url: 'https://youtu.be/x', time: '03:00', days: [1] })).status, 200);
    assert.equal((await post('/api/recurring/window', { enabled: true, from: '02:00', to: '02:00' })).status, 400);
    assert.equal((await post('/api/podcasts', { url: 'https://127.0.0.1/feed.xml' })).status, 400);
    assert.equal((await post('/api/podcasts', { url: 'file:///c:/feed.xml' })).status, 400);
    assert.equal((await fetch(`http://localhost:${port}/api/library/subs?id=${'0'.repeat(32)}`, { headers: H })).status, 200);
    assert.equal((await fetch(`http://localhost:${port}/api/library/subs?id=${'0'.repeat(32)}&n=0`, { headers: H })).status, 404);
    assert.equal((await post('/api/library/share-many', { ids: ['../x'] })).status, 404);
  } finally {
    s.child.kill();
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('server (web): the desktop-only parts are absent; proxy and AcoustID key stay hidden', { timeout: 30_000 }, async () => {
  const port = await freePort();
  const s = start(port, { TUBEGRAB_ELECTRON: '' });
  try {
    await s.first;
    const base = `http://localhost:${port}`;
    for (const p of ['/api/podcasts', '/api/recurring', '/api/library/subs?id=x', '/api/library/lyrics-search?q=abc']) assert.equal((await fetch(`${base}${p}`, { headers: H })).status, 404, p);
    assert.equal((await fetch(`${base}/api/library/share-many`, { method: 'POST', headers: H, body: '{}' })).status, 404);
    const cfg = await (await fetch(`${base}/api/config`)).json();
    assert.equal(cfg.proxy, '');
    assert.equal(cfg.acoustidKey, '');
    assert.equal((await fetch(`${base}/api/config`, { method: 'POST', headers: H, body: JSON.stringify({ proxy: 'http://x:8080' }) })).status, 403);
  } finally {
    s.child.kill();
  }
});

test('voice removal and animated titles really run through ffmpeg', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async () => {
  const src = path.join(work, 'tone.mp4');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=320x240:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-ac', '2', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src]);
  const ctx = () => { const dir = fs.mkdtempSync(path.join(work, 'job-')); return { dir, update() {}, setProcess() {}, isCanceled: () => false }; };
  const out = await convert.runConvert({ inputPath: src, originalName: 't.mp4', targetFormat: 'mp3', body: { voice: 'karaoke' }, ffmpegPath: ffmpeg })({}, ctx());
  assert.ok(fs.statSync(out).size > 1000);
  const texts = JSON.stringify(['fade', 'slide', 'rise', 'type'].map((anim, i) => ({ text: `Texto ${i}`, pos: ['top', 'center', 'bottom', 'center'][i], size: 'm', from: 0.2, to: 2.8, anim })));
  const ed = await convert.runEdit({ inputPath: src, originalName: 't.mp4', segments: [[0, 3, 1]], targetFormat: 'mp4', mode: 'exact', body: { texts }, ffmpegPath: ffmpeg })({}, ctx());
  assert.ok(fs.statSync(ed).size > 1000);
});
