// "Control from the phone": only a paired phone, only our own form, only on
// our own address; nothing the phone sends is echoed back as HTML.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { RemoteServer } = require('../lib/remote');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-remote-test-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));
const CLIENT = 'c'.repeat(32);

function request(port, method, p, { headers = {}, body = null, host } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: { Host: host || `127.0.0.1:${port}`, ...headers } }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function makeServer(extra = {}) {
  const calls = [];
  const jobs = [{ title: '<script>alert(1)</script> vídeo', status: 'running', progress: 42 }, { title: 'x', fileName: 'Canción.mp3', status: 'done' }];
  const server = new RemoteServer({
    file: path.join(work, `remote-${Math.random()}.json`),
    lanAddressFn: () => '127.0.0.1',
    addDownloads: async (clientId, urls, opts) => { calls.push({ clientId, urls, ...opts }); return urls[0].includes('evil') ? 'invalid' : 'ok'; },
    listJobs: () => jobs,
    ...extra,
  });
  return { server, calls };
}

test('off by default; on → a pairing link on the local address', async () => {
  const { server } = makeServer();
  assert.deepEqual(await server.status(), { enabled: false });
  const st = await server.enable(CLIENT);
  try {
    assert.match(st.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.match(st.pairUrl, /\/pair\/[a-f0-9]{64}$/);
    assert.equal(server.server.address().address, '127.0.0.1');
  } finally {
    server.disable();
  }
  assert.equal(server.server, null);
});

test('pairing, cookie, form and the attacks around them', async () => {
  const { server, calls } = makeServer();
  const st = await server.enable(CLIENT);
  const { port } = server;
  const token = st.pairUrl.split('/pair/')[1];
  try {
    assert.equal((await request(port, 'GET', '/')).status, 401, 'not paired');
    assert.equal((await request(port, 'GET', `/pair/${token}`, { host: `evil.example:${port}` })).status, 421, 'DNS rebinding: foreign Host');
    assert.equal((await request(port, 'GET', `/pair/${'0'.repeat(64)}`)).status, 403, 'wrong code');
    const ok = await request(port, 'GET', `/pair/${token}`);
    assert.equal(ok.status, 303);
    const cookie = ok.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const jar = { Cookie: cookie.split(';')[0] };

    const home = await request(port, 'GET', '/?m=<script>', { headers: jar });
    assert.equal(home.status, 200);
    assert.match(home.headers['content-security-policy'], /default-src 'none'/);
    assert.ok(!home.body.includes('<script>'), 'titles escaped, unknown message ignored');
    assert.ok(home.body.includes('42%') && home.body.includes('Canción.mp3'));
    assert.match(home.body, /http-equiv="refresh"/, 'refreshes while something is running');

    const form = (urls, mode = 'video') => new URLSearchParams({ urls, mode }).toString();
    const form_ = { 'Content-Type': 'application/x-www-form-urlencoded', ...jar };
    const sent = await request(port, 'POST', '/add', { headers: form_, body: form('https://youtu.be/abc\nhttps://youtu.be/def') });
    assert.equal(sent.status, 303);
    assert.equal(sent.headers.location, '/?m=ok');
    assert.deepEqual(calls.at(-1), { clientId: CLIENT, urls: ['https://youtu.be/abc', 'https://youtu.be/def'], mode: 'video', audioFormat: 'mp3', quality: '1080', profile: null });
    await request(port, 'POST', '/add', { headers: form_, body: new URLSearchParams({ urls: 'https://youtu.be/q', mode: 'audio', audioFormat: 'flac', quality: '720' }).toString() });
    assert.deepEqual(calls.at(-1), { clientId: CLIENT, urls: ['https://youtu.be/q'], mode: 'audio', audioFormat: 'flac', quality: '720', profile: null });
    await request(port, 'POST', '/add', { headers: form_, body: new URLSearchParams({ urls: 'https://youtu.be/q', audioFormat: 'exe;rm', quality: '99999' }).toString() });
    assert.deepEqual([calls.at(-1).audioFormat, calls.at(-1).quality], ['mp3', '1080'], 'unknown choices fall back');
    const en = await request(port, 'GET', '/', { headers: { ...jar, 'Accept-Language': 'en-GB,en;q=0.9' } });
    assert.match(en.body, /Download on the PC/);
    assert.match(en.body, /<html lang="en">/);
    assert.equal((await request(port, 'POST', '/add', { headers: form_, body: form('https://evil.example/x') })).headers.location, '/?m=invalid');
    assert.equal((await request(port, 'POST', '/add', { headers: form_, body: form('') })).headers.location, '/?m=empty');

    const before = calls.length;
    assert.equal((await request(port, 'POST', '/add', { headers: { ...form_, Origin: 'https://evil.example' }, body: form('https://youtu.be/x') })).status, 403, 'another site');
    assert.equal((await request(port, 'POST', '/add', { headers: { 'Content-Type': 'application/json', ...jar }, body: '{"urls":"x"}' })).status, 415);
    assert.equal((await request(port, 'POST', '/add', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form('https://youtu.be/x') })).status, 401, 'no cookie');
    await assert.rejects(request(port, 'POST', '/add', { headers: form_, body: `urls=${'a'.repeat(40000)}` }), 'oversized body is cut');
    assert.equal(calls.length, before, 'none of those reached the queue');
    assert.equal((await request(port, 'DELETE', '/', { headers: jar })).status, 404);

    // A new code signs every paired phone out.
    await server.reset();
    assert.equal((await request(port, 'GET', '/', { headers: jar })).status, 401);
    // Brute force of the pairing code is capped.
    for (let i = 0; i < 10; i++) await request(port, 'GET', `/pair/${'1'.repeat(64)}`);
    assert.equal((await request(port, 'GET', `/pair/${'1'.repeat(64)}`)).status, 429);
  } finally {
    server.disable();
  }
});

test('remembered across restarts (same code and port), and a corrupt file is ignored', async () => {
  const file = path.join(work, 'persist.json');
  const opts = { file, lanAddressFn: () => '127.0.0.1', addDownloads: async () => 'ok', listJobs: () => [] };
  const a = new RemoteServer(opts);
  const st = await a.enable(CLIENT);
  const { port } = a;
  a.stop();
  const b = new RemoteServer(opts);
  await b.autoStart();
  try {
    assert.equal(b.port, port);
    assert.equal((await b.status()).pairUrl, st.pairUrl);
  } finally {
    b.disable();
  }
  fs.writeFileSync(file, '{"token":"../x","clientId":"nope","enabled":true}');
  assert.equal(new RemoteServer(opts).config.enabled, false);
});

// v3.10: the music page — what's playing (escaped) and the player's buttons,
// only for the paired phone and our own form. (Since the split, "play a song
// by its name" from YouTube lives in Escuchar, not here.)
test('music: what is playing, the buttons, and the attacks', async () => {
  const sent = [];
  const { server } = makeServer({ playerCommand: (cmd) => { sent.push(cmd); return true; } });
  const st = await server.enable(CLIENT);
  const { port } = server;
  const token = st.pairUrl.split('/pair/')[1];
  try {
    const formHeaders = (jar) => ({ 'Content-Type': 'application/x-www-form-urlencoded', ...jar });
    assert.equal((await request(port, 'GET', '/music')).status, 401, 'not paired');
    assert.equal((await request(port, 'POST', '/music', { headers: formHeaders({}), body: 'a=toggle' })).status, 401, 'not paired: nothing pressed');
    assert.equal(sent.length, 0);
    const ok = await request(port, 'GET', `/pair/${token}`);
    const jar = { Cookie: ok.headers['set-cookie'][0].split(';')[0] };
    // Nothing playing yet
    const empty = await request(port, 'GET', '/music', { headers: jar });
    assert.equal(empty.status, 200);
    assert.match(empty.body, /No suena nada/);
    // Something playing: titles escaped, no pictures at all (the policy forbids them)
    server.setPlayer({ title: '<script>alert(1)</script>', artist: 'A&B', playing: true, time: 61, duration: 200, volume: 0.4, cover: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', upNext: [{ title: '<b>siguiente</b>' }] });
    const page = await request(port, 'GET', '/music', { headers: jar });
    assert.ok(!page.body.includes('<script>alert'), 'title escaped');
    assert.ok(page.body.includes('&lt;b&gt;siguiente'), 'up next escaped');
    assert.ok(page.body.includes('A&amp;B'));
    assert.ok(!page.body.includes('<img'), 'no pictures');
    assert.match(page.body, /Volumen 40 %/);
    assert.match(page.headers['content-security-policy'], /img-src 'none'/);
    assert.ok(!/script-src/.test(page.headers['content-security-policy']), 'still no scripts at all');
    server.setPlayer({ title: 'x', cover: 'https://evil.example/x.jpg' });
    assert.ok(!(await request(port, 'GET', '/music', { headers: jar })).body.includes('evil.example'), 'other pictures never shown');
    // The buttons
    for (const a of ['prev', 'toggle', 'next', 'voldown', 'volup', 'mute']) {
      const r = await request(port, 'POST', '/music', { headers: formHeaders(jar), body: `a=${a}` });
      assert.equal(r.status, 303);
      assert.equal(r.headers.location, '/music?m=ok');
    }
    assert.deepEqual(sent.map((c) => c.cmd), ['prev', 'toggle', 'next', 'voldown', 'volup', 'mute']);
    // Unknown actions do nothing — "play a song by its name" included (gone with the split)
    for (const body of ['a=quit', 'a=stream&items=x', 'a=', 'a=play&q=despacito', 'a=playQuery&q=despacito']) {
      const r = await request(port, 'POST', '/music', { headers: formHeaders(jar), body });
      assert.equal(r.headers.location, '/music?m=failed', body);
    }
    assert.equal(sent.length, 6, 'nothing else reached the player');
    // Another site can't press the buttons (origin), nor send something else than our form
    assert.equal((await request(port, 'POST', '/music', { headers: { ...formHeaders(jar), Origin: 'http://evil.example' }, body: 'a=toggle' })).status, 403);
    assert.equal((await request(port, 'POST', '/music', { headers: { 'Content-Type': 'application/json', ...jar }, body: '{"a":"toggle"}' })).status, 415);
    assert.equal((await request(port, 'POST', '/music', { headers: formHeaders(jar), body: `a=toggle&q=${'y'.repeat(5000)}` }).catch(() => ({ status: 0 }))).status !== 303, true, 'too big: dropped');
    assert.equal(sent.length, 6);
    // The old search page is gone
    assert.notEqual((await request(port, 'GET', '/music/search', { headers: jar })).status, 200);
  } finally {
    server.disable();
  }
});

test('v3.14: your library on the phone — only paired, only library files, seeking by ranges, names escaped', async () => {
  const song = path.join(work, 'song.mp3');
  fs.writeFileSync(song, Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256)));
  const ID = 'a'.repeat(32);
  const lib = [
    { id: ID, name: '<img src=x onerror=alert(1)>.mp3', folder: 'Rock', kind: 'audio' },
    { id: 'b'.repeat(32), name: 'Despacito.mp3', folder: '', kind: 'audio' },
    { id: 'c'.repeat(32), name: 'notes.txt', folder: '', kind: 'other' },
  ];
  const { server } = makeServer({ listLibrary: () => lib, libraryFile: (id) => (id === ID ? song : null) });
  const st = await server.enable(CLIENT);
  const { port } = server;
  try {
    assert.equal((await request(port, 'GET', '/lib')).status, 401, 'not paired');
    assert.equal((await request(port, 'GET', `/lib/file?id=${ID}`)).status, 401, 'the files neither');
    const ok = await request(port, 'GET', `/pair/${st.pairUrl.split('/pair/')[1]}`);
    const jar = { Cookie: ok.headers['set-cookie'][0].split(';')[0] };
    const page = await request(port, 'GET', '/lib', { headers: jar });
    assert.equal(page.status, 200);
    assert.ok(!page.body.includes('<img src=x'), 'names escaped');
    assert.ok(page.body.includes('Despacito') && !page.body.includes('notes'), 'only audio and video');
    assert.ok(!/script-src/.test(page.headers['content-security-policy']), 'no script on the list');
    const found = await request(port, 'GET', '/lib?q=despa', { headers: jar });
    assert.ok(found.body.includes('Despacito') && !found.body.includes('Rock'));
    const play = await request(port, 'GET', `/lib/play?id=${ID}&q=`, { headers: jar });
    assert.equal(play.status, 200);
    const nonce = /script-src 'nonce-([^']+)'/.exec(play.headers['content-security-policy']);
    assert.ok(nonce && play.body.includes(`nonce="${nonce[1]}"`), 'its one script, by nonce');
    assert.match(play.headers['content-security-policy'], /media-src 'self'/);
    assert.ok(play.body.includes(`id="next" href="/lib/play?id=${'b'.repeat(32)}"`), 'the next one follows');
    assert.equal((await request(port, 'GET', `/lib/play?id=${'f'.repeat(32)}`, { headers: jar })).status, 404);
    // The file: whole, or a range; nothing outside the library.
    const whole = await request(port, 'GET', `/lib/file?id=${ID}`, { headers: jar });
    assert.equal(whole.status, 200);
    assert.equal(whole.headers['content-type'], 'audio/mpeg');
    assert.equal(whole.headers['content-length'], '1000');
    const part = await request(port, 'GET', `/lib/file?id=${ID}`, { headers: { ...jar, Range: 'bytes=10-19' } });
    assert.equal(part.status, 206);
    assert.equal(part.headers['content-range'], 'bytes 10-19/1000');
    assert.equal(part.headers['content-length'], '10');
    assert.equal((await request(port, 'GET', `/lib/file?id=${ID}`, { headers: { ...jar, Range: 'bytes=-100' } })).headers['content-range'], 'bytes 900-999/1000');
    assert.equal((await request(port, 'GET', `/lib/file?id=${ID}`, { headers: { ...jar, Range: 'bytes=5000-' } })).status, 416);
    for (const id of ['b'.repeat(32), 'c'.repeat(32), '../../etc/passwd', '', 'A'.repeat(32)]) assert.equal((await request(port, 'GET', `/lib/file?id=${id}`, { headers: jar })).status, 404, id);
  } finally {
    server.disable();
  }
});
