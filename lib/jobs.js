// In-memory job queue for downloads and conversions. Each job runs one external
// process (yt-dlp or ffmpeg) in its own temp directory, reports progress, and
// keeps its output file(s) until the client removes them or they expire.
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
const DEFAULT_CONCURRENCY = { download: 3, convert: 1 };
const MAX_CONCURRENCY = { download: 6, convert: 4 };

const ACTIVE = new Set(['queued', 'running', 'processing']);
// A paused job keeps its folder (yt-dlp resumes its .part files) and doesn't
// count towards concurrency.
const WAITING = new Set(['queued', 'paused']);

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
    this.concurrency = { ...DEFAULT_CONCURRENCY };
    // Scheduled start: downloads wait in the queue until this moment (ms), or null.
    this.holdUntil = null;
    this.holdTimer = null;
    this.jobs = new Map();
    this.order = 0;
    this.dir = path.join(root, String(process.pid));
    sweepStale(root);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    setInterval(() => this.expire(), 5 * 60 * 1000).unref();
  }

  /** How many jobs of a type run at once (desktop setting). */
  setConcurrency(type, n) {
    if (!Object.prototype.hasOwnProperty.call(MAX_CONCURRENCY, type)) return;
    const value = Math.round(Number(n));
    if (!Number.isFinite(value)) return;
    this.concurrency[type] = Math.min(MAX_CONCURRENCY[type], Math.max(1, value));
    this.schedule();
  }

  /**
   * Downloads wait until `until` (ms since epoch); null starts them now.
   * Conversions are never held. Returns the moment in force (or null).
   */
  setHold(until) {
    clearTimeout(this.holdTimer);
    this.holdTimer = null;
    this.holdUntil = Number.isFinite(until) && until > Date.now() ? until : null;
    if (this.holdUntil) {
      // setTimeout tops out at ~24.8 days; a schedule is at most a day away.
      this.holdTimer = setTimeout(() => { this.holdUntil = null; this.holdTimer = null; this.emit('hold', null); this.schedule(); }, this.holdUntil - Date.now());
      this.holdTimer.unref();
    }
    this.emit('hold', this.holdUntil);
    this.schedule();
    return this.holdUntil;
  }

  countFor(clientId) {
    let n = 0;
    for (const job of this.jobs.values()) if (job.clientId === clientId) n += 1;
    return n;
  }

  canCreate(clientId, count = 1) {
    return this.countFor(clientId) + count <= this.maxPerClient && this.jobs.size + count <= this.maxTotal;
  }

  /**
   * `run(job, ctx)` resolves with the absolute path of the output file, or an
   * array of paths (e.g. one file per chapter, or video + subtitles).
   * `retryable`: the job can run again from scratch (downloads; a conversion's
   * upload is gone). `source`: the link it came from (shown, and used by the
   * client to download it again later), with `request` = the options used.
   */
  create({ clientId, type, title, detail, run, cleanupInput, retryable = false, source = null, request = null, live = false, saveFolder = null }) {
    const id = crypto.randomBytes(16).toString('hex');
    const dir = path.join(this.dir, id);
    fs.mkdirSync(dir);
    const job = {
      id, clientId, type, title, detail, source, request,
      status: 'queued', stage: 'En cola', progress: null, speed: null, eta: null,
      error: null, fileName: null, fileSize: null, files: [],
      createdAt: Date.now(), finishedAt: null,
      _dir: dir, _run: run, _proc: null, _files: [], _cleanupInput: cleanupInput, _retryable: retryable,
      _order: this.order++,
      _live: Boolean(live),
      // A folder (one name, inside the downloads folder) the app saves it into.
      saveFolder: typeof saveFolder === 'string' && saveFolder ? saveFolder.slice(0, 100) : null,
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
    return [...this.jobs.values()].filter((j) => j.clientId === clientId).sort((a, b) => a._order - b._order).map(publicView);
  }

  update(job, patch) {
    if (!ACTIVE.has(job.status) && !('status' in patch)) return;
    Object.assign(job, patch);
    this.emitUpdate(job);
  }

  emitUpdate(job) {
    this.emit('update', job.clientId, publicView(job));
  }

  /**
   * "Start now": this queued job starts at once, even with every slot busy or
   * the downloads held until a time. Returns false if it isn't waiting.
   */
  startNow(job) {
    if (job.status !== 'queued' && job.status !== 'paused') return false;
    job._urgent = true;
    if (job.status === 'paused') this.resume(job); else this.schedule();
    return true;
  }

  schedule() {
    const byOrder = [...this.jobs.values()].sort((a, b) => a._order - b._order);
    // Jobs asked to start now go first, outside the limits.
    for (const job of byOrder) {
      if (job._urgent && job.status === 'queued' && !job._proc) { job._urgent = false; this.start(job); }
    }
    for (const type of Object.keys(this.concurrency)) {
      if (type === 'download' && this.holdUntil && Date.now() < this.holdUntil) continue;
      let running = 0;
      for (const job of byOrder) {
        if (job.type === type && (job.status === 'running' || job.status === 'processing')) running += 1;
      }
      for (const job of byOrder) {
        if (running >= this.concurrency[type]) break;
        // A paused-then-resumed job waits until its old process has exited.
        if (job.type === type && job.status === 'queued' && !job._proc) {
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
    let myProc = null;
    this.update(job, { status: 'running', stage: 'Iniciando…', progress: null });
    const ctx = {
      dir: job._dir,
      update: (patch) => { if (!stale()) this.update(job, patch); },
      setProcess: (proc) => { myProc = proc; if (!stale()) job._proc = proc; },
      isCanceled: () => stale() || job.status === 'canceled' || job.status === 'paused',
      // "Stop and save" (live recordings): the process is killed on purpose.
      isStopping: () => !stale() && job._stopping === true,
    };
    try {
      const result = await job._run(job, ctx);
      if (stale() || job.status === 'canceled' || job.status === 'paused') return;
      const paths = (Array.isArray(result) ? result : [result]).filter(Boolean);
      if (!paths.length) throw new Error('No se generó ningún archivo.');
      job._files = paths;
      const files = paths.map((p) => ({ name: path.basename(p), size: fs.statSync(p).size }));
      this.update(job, {
        status: 'done', stage: 'Completado', progress: 100, speed: null, eta: null,
        files,
        fileName: files.length === 1 ? files[0].name : `${files.length} archivos`,
        fileSize: files.reduce((acc, f) => acc + f.size, 0),
        finishedAt: Date.now(),
      });
    } catch (err) {
      if (stale() || job.status === 'canceled' || job.status === 'paused') return;
      const dir = job._dir;
      this.update(job, { status: 'error', stage: 'Error', error: err.message || 'Error desconocido', speed: null, eta: null, finishedAt: Date.now() });
      fs.rm(dir, { recursive: true, force: true }, () => {});
    } finally {
      // This run's process has exited: a waiting resume/retry may start now.
      if (!stale() || job._proc === myProc) job._proc = null;
      if (job._cleanupInput && !stale()) job._cleanupInput();
      this.schedule();
    }
  }

  cancel(job) {
    if (!ACTIVE.has(job.status) && job.status !== 'paused') return;
    this.update(job, { status: 'canceled', stage: 'Cancelado', speed: null, eta: null, finishedAt: Date.now() });
    killTree(job._proc);
    if (job._cleanupInput && !job._proc) job._cleanupInput();
    // Give the killed process a moment to release its files before deleting.
    // (The folder is captured now: a retry in the meantime gets a new one.)
    const dir = job._dir;
    setTimeout(() => fs.rm(dir, { recursive: true, force: true }, () => {}), 1500);
    this.schedule();
  }

  /**
   * A live recording: stops it now and keeps what was recorded (the run sees
   * isStopping() and saves the pieces). Returns false if it isn't recording.
   */
  stop(job) {
    if (!job._live || job.status !== 'running' || !job._proc || job._stopping) return false;
    job._stopping = true;
    this.update(job, { stage: 'Parando la grabación…' });
    killTree(job._proc);
    return true;
  }

  /** Stops a download for now, keeping what it already fetched. */
  pause(job) {
    if (!job._retryable || !ACTIVE.has(job.status)) return false;
    // The current run becomes stale: whatever it does while dying is ignored.
    job._runId = (job._runId || 0) + 1;
    this.update(job, { status: 'paused', stage: 'En pausa', speed: null, eta: null });
    killTree(job._proc);
    this.schedule();
    return true;
  }

  /** `schedule: false` when resuming several at once (then schedule once, in queue order). */
  resume(job, { schedule = true } = {}) {
    if (job.status !== 'paused') return false;
    this.update(job, { status: 'queued', stage: 'En cola' });
    // Its old process may still be exiting; the finally in start() reschedules.
    if (schedule) this.schedule();
    return true;
  }

  /** Moves a waiting job within its client's queue: 'up' | 'down' | 'top'. */
  move(job, where) {
    if (!WAITING.has(job.status)) return false;
    const waiting = [...this.jobs.values()]
      .filter((j) => j.clientId === job.clientId && WAITING.has(j.status))
      .sort((a, b) => a._order - b._order);
    const i = waiting.indexOf(job);
    if (where === 'top') {
      const first = [...this.jobs.values()].reduce((min, j) => Math.min(min, j._order), Infinity);
      job._order = first - 1;
    } else if (where === 'up' || where === 'down') {
      const other = waiting[where === 'up' ? i - 1 : i + 1];
      if (!other) return false;
      [job._order, other._order] = [other._order, job._order];
      this.emitUpdate(other);
    } else {
      return false;
    }
    this.emitUpdate(job);
    this.emit('reordered', job.clientId);
    this.schedule();
    return true;
  }

  /** Puts a failed or cancelled download back in the queue, in a fresh folder. */
  retry(job) {
    // Not while a cancelled run's process is still shutting down.
    if (!job._retryable || !['error', 'canceled'].includes(job.status) || job._proc) return false;
    job._dir = path.join(this.dir, `${job.id}-${crypto.randomBytes(4).toString('hex')}`);
    fs.mkdirSync(job._dir);
    job._stopping = false;
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

  /** Frees the output files (e.g. once the desktop app saved them) but keeps the job listed. */
  releaseFile(job) {
    if (job.status !== 'done' || !job._files.length) return;
    job._files = [];
    fs.rm(job._dir, { recursive: true, force: true }, () => {});
    this.update(job, { status: 'done', released: true });
  }

  /** Path of output file `n` (0-based), if it still exists. */
  filePath(job, n = 0) {
    const p = job.status === 'done' && job._files[n];
    return p && fs.existsSync(p) ? p : null;
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
    id, type, title, detail, source, request, status, stage, progress, speed, eta, error, fileName, fileSize, files, createdAt, finishedAt, released, meta, saveFolder,
  } = job;
  return {
    id, type, title, detail, source, request, status, stage, progress, speed, eta, error, fileName, fileSize, files, createdAt, finishedAt,
    meta: meta || null,
    order: job._order,
    released: Boolean(released),
    retryable: Boolean(job._retryable) && (status === 'error' || status === 'canceled'),
    pausable: Boolean(job._retryable) && ACTIVE.has(status) && !job._live,
    stoppable: Boolean(job._live) && status === 'running' && !job._stopping,
    saveFolder: saveFolder || null,
  };
}

module.exports = { JobManager, killTree };
