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
  // blob: only for pictures and media the page makes from the user's own files; never for scripts.
  assert.match(csp, /img-src 'self' data: https: blob:/);
  assert.doesNotMatch(csp, /(script-src|default-src)[^;]*blob:/);
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
    { segments: '[[0,2]]', targetFormat: 'bmp' },
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
  const { child, first } = startServer(port, { TUBEGRAB_USERS: 'ana:s3creta-larga, luis:otra:con:dos-puntos' });
  try {
    await first;
    const get = (headers = {}) => fetch(`http://localhost:${port}/`, { headers });
    const basic = (u, p) => ({ authorization: `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}` });
    const none = await get();
    assert.equal(none.status, 401);
    assert.match(none.headers.get('www-authenticate'), /^Basic realm="TubeGrab"/);
    assert.equal((await get(basic('ana', 'mala'))).status, 401);
    assert.equal((await get(basic('nadie', 's3creta-larga'))).status, 401);
    assert.equal((await get(basic('ana', 's3creta-larga'))).status, 200);
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

test('a broken TUBEGRAB_USERS stops the server (never runs open), without printing passwords', async () => {
  for (const spec of ['solousuario', 'ana:corta', 'ana:clave-larga,', 'ana:clave-larga,ana:Otra-Secreta']) {
    const port = await freePort();
    const { child, first } = startServer(port, { TUBEGRAB_USERS: spec });
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c; });
    const code = await new Promise((resolve) => child.once('exit', resolve));
    await assert.rejects(first, /exited 1/, spec);
    assert.equal(code, 1, spec);
    assert.match(stderr, /TUBEGRAB_USERS no es válida/);
    for (const secret of ['corta', 'Otra-Secreta']) assert.ok(!stderr.includes(secret), `${spec}: ${stderr}`);
  }
});

test('failed logins are limited per IP (then even the right password waits)', async () => {
  const port = await freePort();
  const { child, first } = startServer(port, { TUBEGRAB_USERS: 'ana:clave-larga' });
  try {
    await first;
    const get = (pass) => fetch(`http://localhost:${port}/`, { headers: pass ? { authorization: `Basic ${Buffer.from(`ana:${pass}`).toString('base64')}` } : {} });
    assert.equal((await get('clave-larga')).status, 200, 'right password works');
    for (let i = 0; i < 30; i++) assert.equal((await get(`mala-${i}`)).status, 401);
    const blocked = await get('clave-larga');
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('ratelimit') || blocked.headers.get('ratelimit-reset') || blocked.headers.get('retry-after'));
  } finally {
    child.kill();
  }
});

test('editor API: logo must be a small picture; texts and speeds are validated', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async () => {
  const clip = path.join(os.tmpdir(), `tg-edit-api-${process.pid}.mp4`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=4', '-f', 'lavfi', '-i', 'sine=d=4',
    '-shortest', '-c:v', 'libx264', '-c:a', 'aac', clip]);
  const video = new Blob([fs.readFileSync(clip)], { type: 'video/mp4' });
  fs.rmSync(clip, { force: true });
  const pngPath = path.join(os.tmpdir(), `tg-logo-${process.pid}.png`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=64x32:d=1', '-frames:v', '1', pngPath]);
  const png = fs.readFileSync(pngPath);
  fs.rmSync(pngPath, { force: true });
  const send = async (fields, logo) => {
    const fd = new FormData();
    Object.entries({ segments: '[[0,2]]', targetFormat: 'original', mode: 'exact', ...fields }).forEach(([k, v]) => fd.append(k, v));
    fd.append('file', video, 'clip.mp4');
    if (logo) fd.append('logo', logo.blob, logo.name);
    const res = await api('/api/jobs/edit', { method: 'POST', body: fd });
    return { status: res.status, body: await res.json() };
  };
  const logoPos = { logoPos: 'br' };
  assert.equal((await send(logoPos, { blob: new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), name: 'x.svg' })).status, 400, 'SVG');
  assert.equal((await send(logoPos, { blob: video, name: 'x.png' })).status, 400, 'a video posing as a PNG (wrong type)');
  assert.equal((await send(logoPos, { blob: new Blob([png], { type: 'image/png' }), name: 'x.exe' })).status, 400, 'wrong extension');
  assert.equal((await send(logoPos, { blob: new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }), name: 'big.png' })).status, 400, 'over 5 MB');
  assert.equal((await send(logoPos)).status, 400, 'logo options without the picture');
  assert.equal((await send({ texts: '[{"text":"x","pos":"left","size":"m"}]' })).status, 400, 'bad text');
  assert.equal((await send({ mode: 'fast', segments: '[[0,2,2]]' })).status, 400, 'speed with fast cuts');
  assert.equal((await send({ mode: 'fast', texts: '[{"text":"x","pos":"top","size":"m"}]' })).status, 400, 'text with fast cuts');
  assert.equal((await send({ targetFormat: 'sticker', mode: 'fast' })).status, 400, 'animated with fast cuts');

  const ok = await send({ ...logoPos, texts: '[{"text":"Hola","pos":"top","size":"m"}]', segments: '[[0,2,2]]' }, { blob: new Blob([png], { type: 'image/png' }), name: 'logo.png' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const jobs = await waitForJobs((m) => m.get(ok.body.id) && ['done', 'error'].includes(m.get(ok.body.id).status));
  const job = jobs.get(ok.body.id);
  assert.equal(job.status, 'done', job.error);
  assert.match(job.detail, /velocidad · texto · logo/);
});

test('tag editor API: reads, validates and writes tags; scheduling is desktop-only', { skip: !ffmpeg && 'ffmpeg not found', timeout: 120_000 }, async () => {
  const mp3 = path.join(os.tmpdir(), `tg-tags-${process.pid}.mp3`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=d=2', '-metadata', 'title=Viejo', '-metadata', 'artist=Alguien', mp3]);
  const song = new Blob([fs.readFileSync(mp3)], { type: 'audio/mpeg' });
  fs.rmSync(mp3, { force: true });
  const form = (fields, files) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    files.forEach(([field, blob, name]) => fd.append(field, blob, name));
    return fd;
  };
  const read = await api('/api/tags/read', { method: 'POST', body: form({}, [['files', song, 'a.mp3'], ['files', song, 'b.mp3']]) });
  assert.equal(read.status, 200);
  const data = await read.json();
  assert.deepEqual(data.files.map((f) => [f.name, f.tags.title, f.tags.artist, f.coverOk]), [['a.mp3', 'Viejo', 'Alguien', true], ['b.mp3', 'Viejo', 'Alguien', true]]);
  assert.equal((await api('/api/tags/read', { method: 'POST', body: form({}, [['files', song, 'a.wav']]) })).status, 400, 'not a tag format');

  const send = (fields, files = [['files', song, 'a.mp3']]) => api('/api/jobs/tags', { method: 'POST', body: form(fields, files) });
  assert.equal((await send({ tags: '[{"title":"x"},{"title":"y"}]' })).status, 400, 'one entry per file');
  assert.equal((await send({ tags: '[{"track":"tres"}]' })).status, 400, 'bad track');
  assert.equal((await send({ tags: '[{"title":"x"}]' }, [['files', song, 'a.mp3'], ['cover', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'c.svg']])).status, 400, 'SVG cover');
  const ok = await send({ tags: JSON.stringify([{ title: 'Nuevo', artist: 'Yo', album: 'Disco' }]), rename: 'true' });
  assert.equal(ok.status, 200);
  const { id } = await ok.json();
  const jobs = await waitForJobs((m) => m.get(id) && ['done', 'error'].includes(m.get(id).status));
  assert.equal(jobs.get(id).status, 'done', jobs.get(id).error);
  assert.equal(jobs.get(id).fileName, 'Yo - Nuevo.mp3');
  assert.equal(jobs.get(id).title, 'Disco');

  // The shared web instance can't hold everybody's queue.
  assert.equal((await api('/api/schedule')).status, 404);
  assert.equal((await api('/api/schedule', json({ at: '02:00' }))).status, 404);
});

test('scheduling in the desktop app', async () => {
  const port = await freePort();
  const { child, first } = startServer(port, { TUBEGRAB_ELECTRON: '1' });
  try {
    await first;
    const post = (at) => fetch(`http://localhost:${port}/api/schedule`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ at }) });
    for (const bad of ['25:00', '2:00', '02:60', 'mañana', '02:00; rm']) assert.equal((await post(bad)).status, 400, bad);
    const set = await (await post('03:30')).json();
    const when = new Date(set.until);
    assert.deepEqual([when.getHours(), when.getMinutes()], [3, 30]);
    assert.ok(set.until > Date.now() && set.until - Date.now() <= 24 * 3600 * 1000);
    assert.equal((await (await fetch(`http://localhost:${port}/api/schedule`)).json()).until, set.until);
    assert.equal((await (await post(null)).json()).until, null);
  } finally {
    child.kill();
  }
});

test('library API (desktop): list, play with Range, share with a QR; absent on the web', async () => {
  assert.equal((await api('/api/library')).status, 404, 'web instance');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-libapi-'));
  const dl = path.join(data, 'Descargas');
  fs.mkdirSync(path.join(dl, 'Artista'), { recursive: true });
  fs.writeFileSync(path.join(dl, 'Artista', 'tema.mp3'), Buffer.alloc(1000, 7));
  fs.writeFileSync(path.join(dl, 'no.txt'), 'x');
  fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ downloadDir: dl }));
  const port = await freePort();
  const { child, first } = startServer(port, { TUBEGRAB_ELECTRON: '1', TUBEGRAB_DATA_DIR: data });
  const base = `http://localhost:${port}`;
  const h = { 'x-client-id': CLIENT };
  try {
    await first;
    assert.equal((await fetch(`${base}/api/library`)).status, 400, 'needs the client id');
    const list = await (await fetch(`${base}/api/library`, { headers: h })).json();
    assert.deepEqual(list.files.map((f) => `${f.folder}/${f.name}`), ['Artista/tema.mp3']);
    const { id } = list.files[0];
    const part = await fetch(`${base}/api/library/file?client=${CLIENT}&id=${id}`, { headers: { Range: 'bytes=100-199' } });
    assert.equal(part.status, 206);
    assert.equal((await part.arrayBuffer()).byteLength, 100);
    assert.equal((await fetch(`${base}/api/library/file?client=${CLIENT}&id=${'0'.repeat(32)}`)).status, 404);
    assert.equal((await fetch(`${base}/api/library/file?client=${CLIENT}&id=../no.txt`)).status, 404);
    const share = await fetch(`${base}/api/library/share`, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    const body = await share.json();
    if (share.status === 200) {
      assert.match(body.url, /^http:\/\/(10|172|192)\.[\d.]+:\d+\/s\/[a-f0-9]{32}$/);
      assert.match(body.qr, /^data:image\/svg\+xml;base64,/);
      assert.equal((await fetch(`${base}/api/library/share/${body.token}`, { method: 'DELETE', headers: h })).status, 200);
    } else {
      assert.match(body.error, /red WiFi o local/, 'only acceptable failure: no LAN here');
    }
  } finally {
    child.kill();
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('a rejected upload leaves nothing on disk (a big video + a bad logo, three times)', async () => {
  const uploads = path.join(os.tmpdir(), 'tubegrab-jobs', String(server.pid), 'uploads');
  const count = () => { try { return fs.readdirSync(uploads).length; } catch { return 0; } };
  const before = count();
  const big = new Blob([Buffer.alloc(8 * 1024 * 1024, 1)], { type: 'video/mp4' });
  for (let i = 0; i < 3; i++) {
    const fd = new FormData();
    fd.append('segments', '[[0,1]]');
    fd.append('targetFormat', 'original');
    fd.append('file', big, 'grande.mp4');
    fd.append('logo', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'x.svg');
    assert.equal((await api('/api/jobs/edit', { method: 'POST', body: fd })).status, 400);
  }
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(count(), before);
});

test('control from the phone (desktop): pair through the QR link; links go through the normal checks; absent on the web', async () => {
  assert.equal((await api('/api/remote')).status, 404, 'web instance');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-remote-api-'));
  const port = await freePort();
  const { child, first } = startServer(port, { TUBEGRAB_ELECTRON: '1', TUBEGRAB_DATA_DIR: data });
  const base = `http://localhost:${port}`;
  const h = { 'x-client-id': CLIENT, 'content-type': 'application/json' };
  try {
    await first;
    const on = await (await fetch(`${base}/api/remote`, { method: 'POST', headers: h, body: JSON.stringify({ enabled: true }) })).json();
    if (on.error) { assert.match(on.error, /red WiFi o local/); return; } // no LAN on this machine
    assert.match(on.qr, /^data:image\/svg\+xml;base64,/);
    assert.equal(on.pairUrl, undefined, 'the secret link only travels inside the QR');
    const pairUrl = Buffer.from(on.qr.split(',')[1], 'base64').toString().length > 0; // QR present
    assert.ok(pairUrl);
    const remoteFile = JSON.parse(fs.readFileSync(path.join(data, 'remote.json'), 'utf8'));
    const lan = new URL(on.url);
    const get = (p, headers = {}, body = null) => new Promise((resolve, reject) => {
      const req = http.request({ host: lan.hostname, port: lan.port, path: p, method: body ? 'POST' : 'GET', headers }, (res) => {
        let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
    const paired = await get(`/pair/${remoteFile.token}`);
    assert.equal(paired.status, 303);
    const cookie = paired.headers['set-cookie'][0].split(';')[0];
    const body = new URLSearchParams({ urls: 'https://evil.example/video.mp4', mode: 'audio' }).toString();
    const sent = await get('/add', { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }, body);
    assert.equal(sent.headers.location, '/?m=invalid', 'the app\'s own allowlist said no');
    const off = await (await fetch(`${base}/api/remote`, { method: 'POST', headers: h, body: JSON.stringify({ enabled: false }) })).json();
    assert.equal(off.enabled, false);
    await assert.rejects(get('/', { Cookie: cookie }), 'nothing listening once off');
  } finally {
    child.kill();
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('"start now" and library marks are desktop-only (a web visitor can\'t skip the shared limits)', async () => {
  const id = 'a'.repeat(32);
  assert.equal((await api(`/api/jobs/${id}/now`, json({}))).status, 404);
  assert.equal((await api('/api/library/meta', json({ id, fav: true }))).status, 404);
});

test('v3.4.0 on the web: profiles and "already have it" per visitor; desktop-only parts absent', async () => {
  const seen = await (await api('/api/seen', json({ urls: ['https://youtu.be/dQw4w9WgXcQ'] }))).json();
  assert.deepEqual(seen.found, {});
  const saved = await (await api('/api/profiles', json({ name: 'Mío', options: { mode: 'video', quality: '720' } }))).json();
  assert.equal(saved.profiles[0].options.quality, '720');
  const other = await (await fetch(`${BASE}/api/profiles`, { headers: { 'x-client-id': OTHER } })).json();
  assert.deepEqual(other.profiles, [], 'another visitor sees none of them');
  assert.equal((await api('/api/rules', json({ match: 'x' }))).status, 400);
  for (const p of ['/api/library/playlists', '/api/library/duplicates', '/api/cast', '/api/watch', `/api/library/lyrics?id=${'a'.repeat(32)}`]) {
    assert.equal((await api(p)).status, 404, p);
  }
  assert.equal((await api('/api/cast/devices', json({}))).status, 404);
  const tr = await api('/api/jobs/transcribe', { method: 'POST' });
  assert.equal(tr.status, 400, 'no engine here: refused');
  assert.equal((await api(`/api/jobs/${'a'.repeat(32)}/stop`, json({}))).status, 404);
});
