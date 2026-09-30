// Library (desktop): only media files inside the download folder, by
// unguessable id; and the LAN share server: only shared files, by token, for
// a limited time.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { Library, ShareServer, lanAddress, SHARE_TTL_MS } = require('../lib/library');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-library-test-'));
test.after(() => fs.rmSync(work, { recursive: true, force: true }));

function makeTree() {
  const root = fs.mkdtempSync(path.join(work, 'dl-'));
  const put = (rel, data = 'x') => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); return f; };
  put('canción.mp3', 'song');
  put('Artista/Álbum/01 - tema.flac', 'flac');
  put('vídeos/clip.mp4', 'video');
  put('.oculta/secreta.mp3');
  put('notas.txt');
  put('virus.exe');
  put('a/b/c/d/e/f/demasiado-hondo.mp3');
  const outside = path.join(work, `fuera-${Date.now()}.mp3`);
  fs.writeFileSync(outside, 'secret');
  let linked = false;
  try { fs.symlinkSync(outside, path.join(root, 'enlace.mp3')); linked = true; } catch { /* no symlink rights on this machine */ }
  return { root, outside, linked };
}

test('scan: media files only, no hidden folders, no links, limited depth', () => {
  const { root } = makeTree();
  const lib = new Library({ rootFn: () => root });
  const { files } = lib.scan();
  assert.deepEqual(files.map((f) => `${f.folder}|${f.name}|${f.kind}`).sort(), [
    'Artista/Álbum|01 - tema.flac|audio', '|canción.mp3|audio', 'vídeos|clip.mp4|video',
  ].sort());
  for (const f of files) assert.match(f.id, /^[a-f0-9]{32}$/);
  assert.notEqual(new Library({ rootFn: () => root }).idFor('canción.mp3'), lib.idFor('canción.mp3'), 'ids change every run');
  assert.deepEqual(new Library({ rootFn: () => null }).scan().files, []);
});

test('resolve: only ids from the scan, only real files inside the folder', () => {
  const { root, outside, linked } = makeTree();
  const lib = new Library({ rootFn: () => root });
  const { files } = lib.scan();
  const song = files.find((f) => f.name === 'canción.mp3');
  assert.equal(fs.readFileSync(lib.resolve(song.id), 'utf8'), 'song');
  for (const bad of ['', 'x', '0'.repeat(32), '../canción.mp3', { toString: () => song.id.toUpperCase() }]) assert.equal(lib.resolve(bad), null, String(bad));
  // A tampered map entry pointing outside is refused by the real-path check.
  lib.byId.set('a'.repeat(32), '../' + path.basename(outside));
  assert.equal(lib.resolve('a'.repeat(32)), null);
  if (linked) {
    lib.byId.set('b'.repeat(32), 'enlace.mp3');
    assert.equal(lib.resolve('b'.repeat(32)), null, 'a link to a file outside the folder');
  }
  fs.rmSync(path.join(root, 'canción.mp3'));
  assert.equal(lib.resolve(song.id), null, 'deleted since the scan');
});

test('lanAddress: private addresses, real adapters first', () => {
  const nic = (address, extra = {}) => ({ address, family: 'IPv4', internal: false, ...extra });
  assert.equal(lanAddress({ 'vEthernet (WSL)': [nic('172.20.1.1')], WiFi: [nic('192.168.1.20')] }), '192.168.1.20');
  assert.equal(lanAddress({ Ethernet: [nic('10.0.0.5')] }), '10.0.0.5');
  assert.equal(lanAddress({ lo: [nic('127.0.0.1', { internal: true })], WAN: [nic('83.1.2.3')], v6: [{ address: 'fe80::1', family: 'IPv6' }] }), null);
});

const get = (url, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request(url, { method }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.on('error', reject);
  req.end();
});

test('share server: only the shared file, by token, escaped, until it expires', async () => {
  let clock = Date.now();
  const server = new ShareServer({ lanAddressFn: () => '127.0.0.1', now: () => clock });
  const file = path.join(work, 'compartir.mp3');
  fs.writeFileSync(file, 'contenido-del-archivo');
  try {
    const share = await server.share(file, '<script>alert(1)</script> canción.mp3');
    assert.match(share.url, /^http:\/\/127\.0\.0\.1:\d+\/s\/[a-f0-9]{32}$/);
    const page = await get(share.url);
    assert.equal(page.status, 200);
    assert.ok(!page.body.toString().includes('<script>'), 'name escaped');
    assert.match(page.headers['content-security-policy'], /default-src 'none'/);
    const dl = await get(`${share.url}/file`);
    assert.equal(dl.body.toString(), 'contenido-del-archivo');
    assert.match(dl.headers['content-disposition'], /^attachment;/);
    const base = share.url.replace(/\/s\/.*/, '');
    for (const p of ['/', '/api/jobs', `/s/${'0'.repeat(32)}`, `/s/${share.token}/../../etc/passwd`, `/s/${share.token}x`]) {
      assert.equal((await get(base + p)).status, 404, p);
    }
    assert.equal((await get(share.url, 'POST')).status, 405);
    clock += SHARE_TTL_MS + 1;
    assert.equal((await get(`${share.url}/file`)).status, 404, 'expired');
    server.prune();
    assert.equal(server.server, null, 'stops when nothing is shared');
  } finally {
    server.stop();
  }
});

test('share server: no local network → clear error, nothing listening', async () => {
  const server = new ShareServer({ lanAddressFn: () => null });
  await assert.rejects(server.share(__filename, 'x'), /red WiFi o local/);
  assert.equal(server.server, null);
});

test('tubegrab:// links: only the exact form, only supported sites', () => {
  const { protocolUrlFrom } = require('../lib/protocol');
  const yt = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const link = (u) => `tubegrab://download?url=${encodeURIComponent(u)}`;
  assert.equal(protocolUrlFrom(['TubeGrab.exe', link(yt)]), yt);
  assert.ok(protocolUrlFrom(['x', link('https://youtu.be/jNQXAC9IVRw')]));
  for (const argv of [
    [], ['--flag'], [link('https://evil.example.com/x.mp4')], [link('file:///C:/Windows/system.ini')], [link('javascript:alert(1)')],
    [`tubegrab://open?url=${encodeURIComponent(yt)}`], [`tubegrab://download/extra?url=${encodeURIComponent(yt)}`],
    ['tubegrab://download'], [`http://download?url=${encodeURIComponent(yt)}`], [link(yt) + 'x'.repeat(5000)], [123, null],
  ]) {
    assert.equal(protocolUrlFrom(argv), null, JSON.stringify(argv).slice(0, 80));
  }
});
