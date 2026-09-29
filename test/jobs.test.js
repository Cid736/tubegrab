const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { JobManager } = require('../lib/jobs');

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-jobs-test-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const until = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** A job runner that writes a file after `ms` (or fails / waits to be cancelled). */
const fakeRun = ({ ms = 20, fail = false, name = 'out.mp3' } = {}) => (job, ctx) => new Promise((resolve, reject) => {
  ctx.update({ progress: 50 });
  const t = setTimeout(() => {
    if (fail) return reject(new Error('boom'));
    const file = path.join(ctx.dir, name);
    fs.writeFileSync(file, 'data');
    resolve(file);
  }, ms);
  ctx.setProcess({ exitCode: 0, pid: -1, kill() {} }); // "already exited": killTree leaves it alone
  const poll = setInterval(() => { if (ctx.isCanceled()) { clearTimeout(t); clearInterval(poll); reject(new Error('Cancelado')); } }, 5);
  setTimeout(() => clearInterval(poll), ms + 50);
});

test('runs a job to completion and serves its file only to its owner', async () => {
  const jm = new JobManager({ root });
  const job = jm.create({ clientId: A, type: 'download', title: 't', detail: 'd', run: fakeRun() });
  await until(() => job.status === 'done');
  assert.equal(job.fileName, 'out.mp3');
  assert.equal(job.fileSize, 4);
  assert.ok(jm.filePath(job));
  assert.equal(jm.get(job.id, B), null, 'other client cannot see it');
  assert.equal(jm.listFor(B).length, 0);
  assert.equal(jm.listFor(A)[0]._dir, undefined, 'internals are not exposed');
});

test('respects concurrency: 1 conversion at a time, 3 downloads', async () => {
  const jm = new JobManager({ root });
  const convs = [1, 2, 3].map(() => jm.create({ clientId: A, type: 'convert', title: 'c', run: fakeRun({ ms: 80 }) }));
  const dls = [1, 2, 3, 4].map(() => jm.create({ clientId: A, type: 'download', title: 'd', run: fakeRun({ ms: 80 }) }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(convs.filter((j) => j.status === 'running').length, 1);
  assert.equal(dls.filter((j) => j.status === 'running').length, 3);
  await until(() => [...convs, ...dls].every((j) => j.status === 'done'));
});

test('per-client and total limits', async () => {
  const jm = new JobManager({ root, maxPerClient: 2, maxTotal: 3 });
  assert.ok(jm.canCreate(A, 2));
  assert.ok(!jm.canCreate(A, 3));
  const a = jm.create({ clientId: A, type: 'download', title: 'x', run: fakeRun({ ms: 10 }) });
  const b = jm.create({ clientId: B, type: 'download', title: 'x', run: fakeRun({ ms: 10 }) });
  assert.ok(!jm.canCreate(B, 2), 'total cap');
  await until(() => a.status === 'done' && b.status === 'done');
});

test('cancel, then retry a download; a failed one can be retried too', async () => {
  const jm = new JobManager({ root });
  const job = jm.create({ clientId: A, type: 'download', title: 't', run: fakeRun({ ms: 300 }), retryable: true });
  await until(() => job.status === 'running');
  jm.cancel(job);
  assert.equal(job.status, 'canceled');
  assert.equal(jm.listFor(A)[0].retryable, true);
  await until(() => jm.retry(job), 2000); // allowed once the old run has settled
  await until(() => job.status === 'done');
  assert.ok(fs.existsSync(jm.filePath(job)), 'the retried file survives the old cancel cleanup');
  await new Promise((r) => setTimeout(r, 1700)); // past cancel()'s delayed folder removal
  assert.ok(jm.filePath(job), 'still there after the delayed cleanup');

  const failing = jm.create({ clientId: A, type: 'download', title: 'f', run: fakeRun({ fail: true }), retryable: true });
  await until(() => failing.status === 'error');
  assert.equal(failing.error, 'boom');
  assert.ok(jm.retry(failing));
  assert.equal(failing.status === 'queued' || failing.status === 'running', true);
});

test('conversions and finished jobs are not retryable', async () => {
  const jm = new JobManager({ root });
  const conv = jm.create({ clientId: A, type: 'convert', title: 'c', run: fakeRun({ fail: true }) });
  await until(() => conv.status === 'error');
  assert.equal(jm.retry(conv), false);
  assert.equal(jm.listFor(A)[0].retryable, false);
  const ok = jm.create({ clientId: A, type: 'download', title: 'd', run: fakeRun(), retryable: true });
  await until(() => ok.status === 'done');
  assert.equal(jm.retry(ok), false);
});

test('remove deletes the job and its files; releaseFile keeps it listed', async () => {
  const jm = new JobManager({ root });
  const a = jm.create({ clientId: A, type: 'download', title: 'a', run: fakeRun() });
  const b = jm.create({ clientId: A, type: 'download', title: 'b', run: fakeRun() });
  await until(() => a.status === 'done' && b.status === 'done');
  jm.releaseFile(a);
  assert.equal(jm.filePath(a), null);
  assert.equal(jm.listFor(A).find((j) => j.id === a.id).released, true);
  jm.remove(b);
  assert.equal(jm.get(b.id, A), null);
});

test('a job can produce several files; each is served by index', async () => {
  const jm = new JobManager({ root });
  const job = jm.create({
    clientId: A, type: 'download', title: 'álbum', source: 'https://youtu.be/x', request: { mode: 'audio' },
    run: (j, ctx) => {
      const files = ['01 - uno.mp3', '02 - dos.mp3'].map((n) => { const p = path.join(ctx.dir, n); fs.writeFileSync(p, n); return p; });
      return Promise.resolve(files);
    },
  });
  await until(() => job.status === 'done');
  const view = jm.listFor(A)[0];
  assert.deepEqual(view.files.map((f) => f.name), ['01 - uno.mp3', '02 - dos.mp3']);
  assert.equal(view.fileName, '2 archivos');
  assert.equal(view.source, 'https://youtu.be/x');
  assert.deepEqual(view.request, { mode: 'audio' });
  assert.match(jm.filePath(job, 1), /02 - dos\.mp3$/);
  assert.equal(jm.filePath(job, 2), null);
});

test('pause keeps the folder and resume continues in it; move reorders the waiting queue', async () => {
  const jm = new JobManager({ root });
  jm.setConcurrency('download', 1);
  const dirs = [];
  const slow = (ms) => (job, ctx) => new Promise((resolve, reject) => {
    dirs.push(ctx.dir);
    fs.writeFileSync(path.join(ctx.dir, 'partial.part'), 'x');
    const timer = setTimeout(() => { const p = path.join(ctx.dir, 'out.mp3'); fs.writeFileSync(p, 'data'); resolve(p); }, ms);
    ctx.setProcess({ exitCode: 0, pid: -1 });
    const poll = setInterval(() => { if (ctx.isCanceled()) { clearTimeout(timer); clearInterval(poll); reject(new Error('Cancelado')); } }, 5);
    setTimeout(() => clearInterval(poll), ms + 50);
  });
  const a = jm.create({ clientId: A, type: 'download', title: 'a', run: slow(300), retryable: true });
  const b = jm.create({ clientId: A, type: 'download', title: 'b', run: slow(50), retryable: true });
  const c = jm.create({ clientId: A, type: 'download', title: 'c', run: slow(50), retryable: true });
  await until(() => a.status === 'running');
  assert.ok(jm.move(c, 'top'), 'c jumps ahead of b');
  assert.ok(jm.pause(a));
  assert.equal(a.status, 'paused');
  await until(() => c.status === 'running' || c.status === 'done');
  assert.equal(b.status, 'queued', 'b waits: c was moved to the top');
  assert.ok(fs.existsSync(path.join(dirs[0], 'partial.part')), 'paused job keeps its partial files');
  assert.ok(jm.resume(a));
  await until(() => [a, b, c].every((j) => j.status === 'done'), 5000);
  assert.equal(dirs.filter((d) => d === dirs[0]).length, 2, 'resumed in the same folder');
  assert.equal(jm.move(a, 'up'), false, 'finished jobs cannot move');
  assert.equal(jm.pause(a), false);
});

test('concurrency can be changed within limits', () => {
  const jm = new JobManager({ root });
  jm.setConcurrency('download', 99);
  assert.equal(jm.concurrency.download, 6);
  jm.setConcurrency('convert', 0);
  assert.equal(jm.concurrency.convert, 1);
  jm.setConcurrency('__proto__', 3);
  jm.setConcurrency('download', 'x');
  assert.equal(jm.concurrency.download, 6);
});

test('each process has its own folder; stale folders of dead processes are swept', () => {
  const stale = path.join(root, '999999');
  const old = path.join(root, 'deadbeef'.repeat(4)); // pre-2.4 layout
  fs.mkdirSync(stale, { recursive: true });
  fs.mkdirSync(old, { recursive: true });
  const jm = new JobManager({ root });
  assert.equal(path.basename(jm.dir), String(process.pid));
  return until(() => !fs.existsSync(stale) && !fs.existsSync(old), 2000);
});

test('scheduled start: downloads wait, conversions don\'t; start now or at the time', async () => {
  const jm = new JobManager({ root });
  const holds = [];
  jm.on('hold', (u) => holds.push(u));
  const until1 = jm.setHold(Date.now() + 60_000);
  assert.ok(until1 > Date.now());
  const dl = jm.create({ clientId: A, type: 'download', title: 'd', detail: '', run: fakeRun() });
  const cv = jm.create({ clientId: A, type: 'convert', title: 'c', detail: '', run: fakeRun() });
  await until(() => cv.status === 'done');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(dl.status, 'queued', 'held');
  jm.setHold(null);
  await until(() => dl.status === 'done');

  // And by itself when the time comes.
  jm.setHold(Date.now() + 150);
  const dl2 = jm.create({ clientId: A, type: 'download', title: 'd2', detail: '', run: fakeRun() });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(dl2.status, 'queued');
  await until(() => dl2.status === 'done', 3000);
  assert.equal(jm.holdUntil, null);
  assert.ok(holds.includes(null));
  for (const bad of [NaN, Date.now() - 1000, 'mañana']) assert.equal(jm.setHold(bad), null, String(bad));
});
