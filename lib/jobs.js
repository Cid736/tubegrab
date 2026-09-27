// In-memory job queue for downloads and conversions. Each job runs one external
// process (yt-dlp or ffmpeg) in its own temp directory, reports progress, and
// keeps its output file until the client removes it or it expires.
const { EventEmitter } = require('events');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const JOBS_DIR = path.join(os.tmpdir(), 'tubegrab-jobs');
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
  constructor({ maxPerClient = 50, maxTotal = 300 } = {}) {
    super();
    this.setMaxListeners(0);
    this.maxPerClient = maxPerClient;
    this.maxTotal = maxTotal;
    this.jobs = new Map();
    fs.rmSync(JOBS_DIR, { recursive: true, force: true });
    fs.mkdirSync(JOBS_DIR, { recursive: true });
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
  create({ clientId, type, title, detail, run, cleanupInput }) {
    const id = crypto.randomBytes(16).toString('hex');
    const dir = path.join(JOBS_DIR, id);
    fs.mkdirSync(dir);
    const job = {
      id, clientId, type, title, detail,
      status: 'queued', stage: 'En cola', progress: null, speed: null, eta: null,
      error: null, fileName: null, fileSize: null,
      createdAt: Date.now(), finishedAt: null,
      _dir: dir, _run: run, _proc: null, _filePath: null, _cleanupInput: cleanupInput,
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
    this.update(job, { status: 'running', stage: 'Iniciando…', progress: null });
    const ctx = {
      dir: job._dir,
      update: (patch) => this.update(job, patch),
      setProcess: (proc) => { job._proc = proc; },
      isCanceled: () => job.status === 'canceled',
    };
    try {
      const filePath = await job._run(job, ctx);
      if (job.status === 'canceled') return;
      const stat = fs.statSync(filePath);
      job._filePath = filePath;
      this.update(job, {
        status: 'done', stage: 'Completado', progress: 100, speed: null, eta: null,
        fileName: path.basename(filePath), fileSize: stat.size, finishedAt: Date.now(),
      });
    } catch (err) {
      if (job.status === 'canceled') return;
      this.update(job, { status: 'error', stage: 'Error', error: err.message || 'Error desconocido', speed: null, eta: null, finishedAt: Date.now() });
      fs.rm(job._dir, { recursive: true, force: true }, () => {});
    } finally {
      job._proc = null;
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
    setTimeout(() => fs.rm(job._dir, { recursive: true, force: true }, () => {}), 1500);
    this.schedule();
  }

  remove(job) {
    this.cancel(job);
    this.jobs.delete(job.id);
    setTimeout(() => fs.rm(job._dir, { recursive: true, force: true }, () => {}), 1500);
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
  return { id, type, title, detail, status, stage, progress, speed, eta, error, fileName, fileSize, createdAt, finishedAt, released: Boolean(released) };
}

module.exports = { JobManager, killTree };
