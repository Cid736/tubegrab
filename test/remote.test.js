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
    addDownloads: async (clientId, urls, mode) => { calls.push({ clientId, urls, mode }); return urls[0].includes('evil') ? 'invalid' : 'ok'; },
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
    assert.deepEqual(calls.at(-1), { clientId: CLIENT, urls: ['https://youtu.be/abc', 'https://youtu.be/def'], mode: 'video' });
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
