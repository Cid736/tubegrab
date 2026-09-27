// In-memory job queue for downloads and conversions. Each job runs one external
// process (yt-dlp or ffmpeg) in its own temp directory, reports progress, and
// keeps its output file until the client removes it or it expires.
const { EventEmitter } = require('events');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// One folder per server process, so two running copies (desktop app + web
// server, or a test run) never delete each other's files.
const JOBS_ROOT = path.join(os.tmpdir(), 'tubegrab-jobs');

function isRunning(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

/** Removes what crashed/killed earlier runs left behind (their pid is gone). */
function sweepStale(root) {
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const pid = /^\d+$/.test(entry.name) ? Number(entry.name) : null;
    if (pid === process.pid || (pid && isRunning(pid))) continue;
    fs.rm(path.join(root, entry.name), { recursive: true, force: true }, () => {});
  }
}
const JOB_TTL_MS = 60 * 60 * 1000;
// Downloads are network-bound, conversions CPU-bound.
const CONCURRENCY = { download: 3, convert: 1 };

const ACTIVE = new Set(['queued', 'running', 'processing']);

function killTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true }, () => {});
  } else {
    proc.kill('SIGKILL');
  }
}

class JobManager extends EventEmitter {
  constructor({ maxPerClient = 50, maxTotal = 300, root = JOBS_ROOT } = {}) {
    super();
    this.setMaxListeners(0);
    this.maxPerClient = maxPerClient;
    this.maxTotal = maxTotal;
    this.jobs = new Map();
    this.dir = path.join(root, String(process.pid));
    sweepStale(root);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    setInterval(() => this.expire(), 5 * 60 * 1000).unref();
  }

  countFor(clientId) {
    let n = 0;
    for (const job of this.jobs.values()) if (job.clientId === clientId) n += 1;
    return n;
  }

  canCreate(clientId, count = 1) {
    return this.countFor(clientId) + count <= this.maxPerClient && this.jobs.size + count <= this.maxTotal;
  }

  /** `run(job, ctx)` must resolve with the absolute path of the output file. */
  /** `retryable`: the job can run again from scratch (downloads; a conversion's upload is gone). */
  create({ clientId, type, title, detail, run, cleanupInput, retryable = false }) {
    const id = crypto.randomBytes(16).toString('hex');
    const dir = path.join(this.dir, id);
    fs.mkdirSync(dir);
    const job = {
      id, clientId, type, title, detail,
      status: 'queued', stage: 'En cola', progress: null, speed: null, eta: null,
      error: null, fileName: null, fileSize: null,
      createdAt: Date.now(), finishedAt: null,
      _dir: dir, _run: run, _proc: null, _filePath: null, _cleanupInput: cleanupInput, _retryable: retryable,
    };
    this.jobs.set(id, job);
    this.emitUpdate(job);
    this.schedule();
    return job;
  }

  get(id, clientId) {
    const job = this.jobs.get(id);
    return job && job.clientId === clientId ? job : null;
  }

  listFor(clientId) {
    return [...this.jobs.values()].filter((j) => j.clientId === clientId).map(publicView);
  }

  update(job, patch) {
    if (!ACTIVE.has(job.status) && !('status' in patch)) return;
    Object.assign(job, patch);
    this.emitUpdate(job);
  }

  emitUpdate(job) {
    this.emit('update', job.clientId, publicView(job));
  }

  schedule() {
    for (const type of Object.keys(CONCURRENCY)) {
      let running = 0;
      for (const job of this.jobs.values()) {
        if (job.type === type && (job.status === 'running' || job.status === 'processing')) running += 1;
      }
      for (const job of this.jobs.values()) {
        if (running >= CONCURRENCY[type]) break;
        if (job.type === type && job.status === 'queued') {
          running += 1;
          this.start(job);
        }
      }
    }
  }

  async start(job) {
    // Each run gets a number: a stale, cancelled run that settles late must
    // never touch the job once a retry has started a new one.
    const runId = (job._runId || 0) + 1;
    job._runId = runId;
    const stale = () => job._runId !== runId;
    this.update(job, { status: 'running', stage: 'Iniciando…', progress: null });
    const ctx = {
      dir: job._dir,
      update: (patch) => { if (!stale()) this.update(job, patch); },
      setProcess: (proc) => { if (!stale()) job._proc = proc; },
      isCanceled: () => stale() || job.status === 'canceled',
    };
    try {
      const filePath = await job._run(job, ctx);
      if (stale() || job.status === 'canceled') return;
      const stat = fs.statSync(filePath);
      job._filePath = filePath;
      this.update(job, {
        status: 'done', stage: 'Completado', progress: 100, speed: null, eta: null,
        fileName: path.basename(filePath), fileSize: stat.size, finishedAt: Date.now(),
      });
    } catch (err) {
      if (stale() || job.status === 'canceled') return;
      const dir = job._dir;
      this.update(job, { status: 'error', stage: 'Error', error: err.message || 'Error desconocido', speed: null, eta: null, finishedAt: Date.now() });
      fs.rm(dir, { recursive: true, force: true }, () => {});
    } finally {
      if (!stale()) job._proc = null;
      if (job._cleanupInput) job._cleanupInput();
      this.schedule();
    }
  }

  cancel(job) {
    if (!ACTIVE.has(job.status)) return;
    this.update(job, { status: 'canceled', stage: 'Cancelado', speed: null, eta: null, finishedAt: Date.now() });
    killTree(job._proc);
    if (job._cleanupInput && !job._proc) job._cleanupInput();
    // Give the killed process a moment to release its files before deleting.
    // (The folder is captured now: a retry in the meantime gets a new one.)
    const dir = job._dir;
    setTimeout(() => fs.rm(dir, { recursive: true, force: true }, () => {}), 1500);
    this.schedule();
  }

  /** Puts a failed or cancelled download back in the queue, in a fresh folder. */
  retry(job) {
    // Not while a cancelled run's process is still shutting down.
    if (!job._retryable || !['error', 'canceled'].includes(job.status) || job._proc) return false;
    job._dir = path.join(this.dir, `${job.id}-${crypto.randomBytes(4).toString('hex')}`);
    fs.mkdirSync(job._dir);
    this.update(job, {
      status: 'queued', stage: 'En cola', progress: null, speed: null, eta: null, error: null, finishedAt: null,
    });
    this.schedule();
    return true;
  }

  remove(job) {
    this.cancel(job);
    this.jobs.delete(job.id);
    const dir = job._dir;
    setTimeout(() => fs.rm(dir, { recursive: true, force: true }, () => {}), 1500);
    this.emit('removed', job.clientId, job.id);
  }

  /** Frees the output file (e.g. once the desktop app saved it) but keeps the job listed. */
  releaseFile(job) {
    if (job.status !== 'done' || !job._filePath) return;
    job._filePath = null;
    fs.rm(job._dir, { recursive: true, force: true }, () => {});
    this.update(job, { status: 'done', released: true });
  }

  filePath(job) {
    return job.status === 'done' && job._filePath && fs.existsSync(job._filePath) ? job._filePath : null;
  }

  expire() {
    const now = Date.now();
    for (const job of [...this.jobs.values()]) {
      if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) this.remove(job);
    }
  }
}

function publicView(job) {
  const {
    id, type, title, detail, status, stage, progress, speed, eta, error, fileName, fileSize, createdAt, finishedAt, released,
  } = job;
  return {
    id, type, title, detail, status, stage, progress, speed, eta, error, fileName, fileSize, createdAt, finishedAt,
    released: Boolean(released),
    retryable: Boolean(job._retryable) && (status === 'error' || status === 'canceled'),
  };
}

module.exports = { JobManager, killTree };
