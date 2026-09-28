// End-to-end tests against a real server.js process (web mode, localhost).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const net = require('net');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { fork, execFileSync } = require('child_process');
const { ROOT, ffmpegPath, ytDlpPath } = require('./helpers');

const CLIENT = crypto.randomBytes(16).toString('hex');
const OTHER = crypto.randomBytes(16).toString('hex');
const ffmpeg = ffmpegPath();
const NETWORK = process.env.TG_NETWORK === '1';

let server;
let BASE;
let PORT;

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function startServer(port, extraEnv = {}) {
  const child = fork(path.join(ROOT, 'server.js'), [], {
    env: { ...process.env, PORT: String(port), HOST: '', TUBEGRAB_ELECTRON: '', ...extraEnv },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const first = new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
  return { child, first };
}

test.before(async () => {
  PORT = await freePort();
  BASE = `http://localhost:${PORT}`;
  const s = startServer(PORT);
  server = s.child;
  assert.deepEqual(await s.first, { type: 'listening', port: PORT });
});
test.after(() => { if (server) server.kill(); });

const api = (p, opts = {}) => fetch(BASE + p, { ...opts, headers: { 'x-client-id': CLIENT, ...(opts.headers || {}) } });
const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** Raw request, so Host/Origin can be anything (fetch won't let us set Host). */
function raw(method, p, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path: p, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Follows the SSE stream until `predicate(jobsById)` holds. */
async function waitForJobs(predicate, ms = 120_000) {
  const ctrl = new AbortController();
  const res = await fetch(`${BASE}/api/jobs/events?client=${CLIENT}`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  const jobs = new Map();
  let buf = '';
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('stream closed');
      buf += Buffer.from(value).toString('utf8');
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = (/^event: (.+)$/m.exec(block) || [])[1];
        const data = (/^data: (.+)$/m.exec(block) || [])[1];
        if (event === 'snapshot') JSON.parse(data).forEach((j) => jobs.set(j.id, j));
        if (event === 'job') { const j = JSON.parse(data); jobs.set(j.id, j); }
        if (event === 'removed') jobs.delete(JSON.parse(data).id);
      }
      if (predicate(jobs)) return jobs;
    }
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
}

// ---- Hardening ---------------------------------------------------------------
test('security headers and CSP on the page', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline'[^;]*script|script-src[^;]*unsafe/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('x-frame-options') || /frame-ancestors/.test(csp));
});

test('DNS-rebinding guard: only localhost Host headers are answered', async () => {
  assert.equal((await raw('GET', '/', { Host: 'evil.example.com' })).status, 403);
  assert.equal((await raw('GET', '/', { Host: `evil.example.com:${PORT}` })).status, 403);
  assert.equal((await raw('GET', '/', { Host: `localhost:${PORT}` })).status, 200);
  assert.equal((await raw('GET', '/', { Host: `127.0.0.1:${PORT}` })).status, 200);
});

test('cross-site requests are refused (Origin guard)', async () => {
  const res = await api('/api/info', { ...json({ url: 'https://youtu.be/x' }), headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' } });
  assert.equal(res.status, 403);
  const nullOrigin = await api('/api/jobs/download', { ...json({ urls: ['https://youtu.be/x'] }), headers: { 'content-type': 'application/json', origin: 'null' } });
  assert.equal(nullOrigin.status, 403);
});

test('a client id is required and must be well formed', async () => {
  assert.equal((await fetch(`${BASE}/api/jobs/events`)).status, 400);
  assert.equal((await fetch(`${BASE}/api/jobs/events?client=../../x`)).status, 400);
  const res = await fetch(`${BASE}/api/jobs/download`, { ...json({ urls: ['https://youtu.be/x'] }), headers: { 'content-type': 'application/json', 'x-client-id': 'nope' } });
  assert.equal(res.status, 400);
});

test('unknown / malformed job ids are 404, never a path', async () => {
  for (const id of ['..%2f..%2fserver.js', 'a'.repeat(32), '%00', 'x'.repeat(33)]) {
    const res = await api(`/api/jobs/${id}/file`);
    assert.equal(res.status, 404, id);
  }
});

test('static files cannot escape public/', async () => {
  for (const p of ['/../server.js', '/..%2fserver.js', '/%2e%2e/server.js', '/..%5cserver.js', '/lib/jobs.js']) {
    const res = await raw('GET', p, { Host: `localhost:${PORT}` });
    assert.doesNotMatch(res.body, /require\(|JobManager/, p);
  }
});

test('downloads: unsupported links are rejected before anything runs', async () => {
  const res = await api('/api/jobs/download', json({ urls: ['https://evil.example.com/x', 'file:///c:/windows/win.ini', `http://127.0.0.1:${PORT}/`] }));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).rejected.length, 3);
  assert.equal((await api('/api/info', json({ url: 'http://169.254.169.254/latest/meta-data' }))).status, 400);
});

test('oversized or broken JSON is a clean 400', async () => {
  const big = await api('/api/jobs/download', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls: ['x'.repeat(300_000)] }) });
  assert.equal(big.status, 400);
  const broken = await api('/api/jobs/download', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"urls": [' });
  assert.equal(broken.status, 400);
});

test('uploads: only media, known target formats, valid trims', async () => {
  const send = (fields, file) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    if (file) fd.append('file', new Blob([file.data], { type: file.type }), file.name);
    return api('/api/jobs/convert', { method: 'POST', body: fd });
  };
  const media = { data: 'x', type: 'audio/wav', name: 'a.wav' };
  assert.equal((await send({ targetFormat: 'mp3' }, { data: 'MZ', type: 'application/x-msdownload', name: 'evil.exe' })).status, 400);
  assert.equal((await send({ targetFormat: 'mp3' }, { data: '<?php', type: 'application/octet-stream', name: 'x.php' })).status, 400);
  assert.equal((await send({ targetFormat: 'exe' }, media)).status, 400);
  assert.equal((await send({ targetFormat: '__proto__' }, media)).status, 400);
  assert.equal((await send({ targetFormat: 'mp3', trimStart: '10', trimEnd: '5' }, media)).status, 400);
  assert.equal((await send({ targetFormat: 'mp3', trimStart: '1;rm -rf' }, media)).status, 400);
  assert.equal((await send({ targetFormat: 'mp3' })).status, 400, 'no file');
});

test('at most 5 live event streams per client', async () => {
  const ctrls = [];
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const c = new AbortController();
    ctrls.push(c);
    statuses.push((await fetch(`${BASE}/api/jobs/events?client=${OTHER}`, { signal: c.signal })).status);
  }
  ctrls.forEach((c) => c.abort());
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429]);
});

// ---- Real conversion through the API ------------------------------------------
test('convert end to end: upload → progress → file → private → release', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async () => {
  const wav = path.join(os.tmpdir(), `tg-e2e-${process.pid}.wav`);
  execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', wav]);
  const fd = new FormData();
  fd.append('targetFormat', 'mp3');
  fd.append('audioBitrate', '128');
  fd.append('file', new Blob([fs.readFileSync(wav)], { type: 'audio/wav' }), 'Mi canción.wav');
  fs.rmSync(wav, { force: true });
  const res = await api('/api/jobs/convert', { method: 'POST', body: fd });
  assert.equal(res.status, 200);
  const { id } = await res.json();

  const jobs = await waitForJobs((m) => m.get(id) && ['done', 'error'].includes(m.get(id).status));
  const job = jobs.get(id);
  assert.equal(job.status, 'done', job.error);
  assert.equal(job.fileName, 'Mi canción.mp3');
  assert.equal(job.retryable, false);

  const file = await api(`/api/jobs/${id}/file`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /filename\*=UTF-8''Mi%20canci%C3%B3n\.mp3/);
  const bytes = Buffer.from(await file.arrayBuffer());
  assert.equal(bytes.length, job.fileSize);
  assert.ok(bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff, 'is an MP3');

  // Other clients can't see, fetch, retry or delete it.
  assert.equal((await fetch(`${BASE}/api/jobs/${id}/file?client=${OTHER}`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/jobs/${id}`, { method: 'DELETE', headers: { 'x-client-id': OTHER } })).status, 404);
  assert.equal((await api(`/api/jobs/${id}/retry`, { method: 'POST' })).status, 409, 'finished conversions are not retryable');

  assert.equal((await api(`/api/jobs/${id}/file`, { method: 'DELETE' })).status, 200);
  assert.equal((await api(`/api/jobs/${id}/file`)).status, 404, 'released');
  assert.equal((await api(`/api/jobs/${id}`, { method: 'DELETE' })).status, 200);
});

test('new endpoints validate their input', async () => {
  const cfg = await (await api('/api/config')).json();
  assert.equal(cfg.desktop, false);
  assert.ok(['auto', 'off'].includes(cfg.hwAccel));
  assert.equal((await api('/api/config', json({ downloadConcurrency: 6 }))).status, 403, 'web version cannot change server settings');
  assert.equal((await api('/api/subscriptions')).status, 404, 'subscriptions are desktop-only');
  assert.equal((await api('/api/search', json({ query: '' }))).status, 400);
  assert.equal((await api('/api/search', json({ query: 'x'.repeat(201) }))).status, 400);
  assert.equal((await api('/api/playlist', json({ url: 'https://evil.example.com/list' }))).status, 400);
  const bad = await api('/api/jobs/download', json({ urls: ['https://youtu.be/x'], sectionStart: '9', sectionEnd: '3' }));
  assert.equal(bad.status, 400);
  const items = await api('/api/jobs/download', json({ items: [{ url: 'https://evil.example.com/v', title: 'x' }] }));
  assert.equal(items.status, 400, 'picked items go through the same allowlist');
  const fake = 'a'.repeat(32);
  for (const action of ['pause', 'resume', 'move']) assert.equal((await api(`/api/jobs/${fake}/${action}`, json({}))).status, 404);
  assert.equal((await api(`/api/jobs/${fake}/file?n=../../x`)).status, 404);
});

test('compress, image and merge through the API', { skip: !ffmpeg && 'ffmpeg not found', timeout: 180_000 }, async () => {
  const clip = path.join(os.tmpdir(), `tg-api-${process.pid}.mp4`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=d=6',
    '-shortest', '-c:v', 'libx264', '-c:a', 'aac', clip]);
  const blob = new Blob([fs.readFileSync(clip)], { type: 'video/mp4' });
  fs.rmSync(clip, { force: true });
  const send = async (endpoint, fields, files) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    files.forEach(([field, name]) => fd.append(field, blob, name));
    return api(endpoint, { method: 'POST', body: fd });
  };
  assert.equal((await send('/api/jobs/compress', { targetMb: '0' }, [['file', 'a.mp4']])).status, 400);
  assert.equal((await send('/api/jobs/image', { targetFormat: 'bmp', imageMode: 'frame' }, [['file', 'a.mp4']])).status, 400);
  assert.equal((await send('/api/jobs/merge', { targetFormat: 'mp4' }, [['files', 'solo.mp4']])).status, 400, 'merging needs two files');
  assert.equal((await send('/api/jobs/merge', { targetFormat: 'gif' }, [['files', 'a.mp4'], ['files', 'b.mp4']])).status, 400);
  for (const bad of [
    { segments: '[[5,2]]', targetFormat: 'original' },
    { segments: 'x', targetFormat: 'original' },
    { segments: '[[0,2]]', targetFormat: 'gif' },
    { segments: '[[0,2]]', targetFormat: 'mp4', mode: 'fast' },
  ]) assert.equal((await send('/api/jobs/edit', bad, [['file', 'a.mp4']])).status, 400, JSON.stringify(bad));

  const ids = [];
  for (const [endpoint, fields, files] of [
    ['/api/jobs/compress', { targetMb: '1' }, [['file', 'grande.mp4']]],
    ['/api/jobs/image', { targetFormat: 'jpg', imageMode: 'frame', time: '2' }, [['file', 'foto.mp4']]],
    ['/api/jobs/merge', { targetFormat: 'mkv' }, [['files', 'uno.mp4'], ['files', 'dos.mp4']]],
    ['/api/jobs/edit', { segments: '[[0,1.5],[3,4]]', targetFormat: 'original', mode: 'exact' }, [['file', 'corte.mp4']]],
  ]) {
    const res = await send(endpoint, fields, files);
    assert.equal(res.status, 200, endpoint);
    ids.push((await res.json()).id);
  }
  const jobs = await waitForJobs((m) => ids.every((id) => m.get(id) && ['done', 'error'].includes(m.get(id).status)));
  const names = ids.map((id) => { const j = jobs.get(id); assert.equal(j.status, 'done', j.error); return j.fileName; });
  assert.deepEqual(names, ['grande (1 MB).mp4', 'foto (2 s).jpg', 'uno (unido).mkv', 'corte (editado).mp4']);
  const img = await api(`/api/jobs/${ids[1]}/file?n=0`);
  assert.equal(img.status, 200);
  assert.equal((await api(`/api/jobs/${ids[1]}/file?n=1`)).status, 404);
});

// ---- Real downloads (network; TG_NETWORK=1) -----------------------------------
test('download from YouTube: audio + video, cancel and retry', { skip: (!NETWORK && 'set TG_NETWORK=1') || (!ytDlpPath() && 'yt-dlp not found'), timeout: 600_000 }, async () => {
  const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo", 19 s
  const a = await (await api('/api/jobs/download', json({ urls: [url], mode: 'audio', audioFormat: 'mp3', metadata: true }))).json();
  const v = await (await api('/api/jobs/download', json({ urls: [url], mode: 'video', quality: '360', container: 'mp4', sponsorblock: true }))).json();
  assert.equal(a.created, 1);
  assert.equal(v.created, 1);
  const jobs = await waitForJobs((m) => m.size >= 2 && [...m.values()].filter((j) => j.type === 'download').every((j) => ['done', 'error'].includes(j.status)), 540_000);
  for (const j of jobs.values()) {
    if (j.type !== 'download') continue;
    assert.equal(j.status, 'done', `${j.detail}: ${j.error}`);
    const file = await api(`/api/jobs/${j.id}/file`);
    assert.equal(file.status, 200);
    assert.ok(Number(file.headers.get('content-length')) > 50_000, j.fileName);
  }

  // Cancel a queued/running download, then retry it to completion.
  await (await api('/api/jobs/download', json({ urls: ['https://youtu.be/jNQXAC9IVRw'], mode: 'audio', audioFormat: 'opus' }))).json();
  const running = await waitForJobs((m) => [...m.values()].some((j) => j.detail && j.detail.startsWith('OPUS') && j.status !== 'queued'));
  const target = [...running.values()].find((j) => j.detail.startsWith('OPUS'));
  await api(`/api/jobs/${target.id}/cancel`, { method: 'POST' });
  const canceled = await waitForJobs((m) => m.get(target.id) && m.get(target.id).status === 'canceled');
  assert.equal(canceled.get(target.id).retryable, true);
  let retried = 409;
  for (let i = 0; i < 40 && retried === 409; i++) {
    retried = (await api(`/api/jobs/${target.id}/retry`, { method: 'POST' })).status;
    if (retried === 409) await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(retried, 200);
  const after = await waitForJobs((m) => ['done', 'error'].includes((m.get(target.id) || {}).status), 300_000);
  assert.equal(after.get(target.id).status, 'done', after.get(target.id).error);
});

test('download a video whose title has non-ASCII characters (IF/ELIF/ELSE → ⧸)', { skip: (!NETWORK && 'set TG_NETWORK=1') || (!ytDlpPath() && 'yt-dlp not found'), timeout: 300_000 }, async () => {
  const r = await (await api('/api/jobs/download', json({ urls: ['https://www.youtube.com/watch?v=vA4r_MPRNsg'], mode: 'audio', audioFormat: 'opus', audioBitrate: '96' }))).json();
  assert.equal(r.created, 1);
  const jobs = await waitForJobs((m) => [...m.values()].some((j) => j.detail.startsWith('OPUS 96') && ['done', 'error'].includes(j.status)), 280_000);
  const job = [...jobs.values()].find((j) => j.detail.startsWith('OPUS 96'));
  assert.equal(job.status, 'done', job.error);
  assert.match(job.fileName, /IF⧸ELIF⧸ELSE\.opus$/);
  assert.match(job.title, /IF\/ELIF\/ELSE/);
});

// ---- Desktop start-up handshake ----------------------------------------------------
for (const address of ['127.0.0.1', '::1']) {
  // ::1 matters because "localhost" resolves to it too: another program there
  // would otherwise answer for http://localhost:PORT instead of us.
  test(`reports "port-in-use" to its parent when another program holds the port on ${address}`, async (t) => {
    const blocker = net.createServer();
    try {
      await new Promise((resolve, reject) => { blocker.once('error', reject); blocker.listen(0, address, resolve); });
    } catch (err) {
      if (address === '::1') return t.skip('no IPv6 loopback here');
      throw err;
    }
    const { child, first } = startServer(blocker.address().port);
    try {
      assert.deepEqual(await first, { type: 'port-in-use' });
    } finally {
      child.kill();
      blocker.close();
    }
  });
}
test('answers on the IPv6 loopback too (same app, Host guard allows [::1])', async (t) => {
  const res = await new Promise((resolve) => {
    http.get({ host: '::1', port: PORT, path: '/', headers: { Host: `[::1]:${PORT}` } }, resolve).on('error', () => resolve(null));
  });
  if (!res) return t.skip('no IPv6 loopback here');
  res.resume();
  assert.equal(res.statusCode, 200);
});

test('TUBEGRAB_USERS makes the instance private (Basic auth)', async () => {
  const port = await freePort();
  const { child, first } = startServer(port, { TUBEGRAB_USERS: 'ana:s3creta, luis:otra:con:dos-puntos' });
  try {
    await first;
    const get = (headers = {}) => fetch(`http://localhost:${port}/`, { headers });
    const basic = (u, p) => ({ authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` });
    const none = await get();
    assert.equal(none.status, 401);
    assert.match(none.headers.get('www-authenticate'), /^Basic realm="TubeGrab"/);
    assert.equal((await get(basic('ana', 'mala'))).status, 401);
    assert.equal((await get(basic('nadie', 's3creta'))).status, 401);
    assert.equal((await get(basic('ana', 's3creta'))).status, 200);
    assert.equal((await get(basic('luis', 'otra:con:dos-puntos'))).status, 200);
    // The API is behind the login too.
    const apiRes = await fetch(`http://localhost:${port}/api/jobs`, { headers: { 'x-client-id': CLIENT } });
    assert.equal(apiRes.status, 401);
  } finally {
    child.kill();
  }
});

test('without TUBEGRAB_USERS the page stays open', async () => {
  assert.equal((await fetch(`${BASE}/`)).status, 200);
});
