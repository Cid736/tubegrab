// Repeating tasks (desktop app): "download this link every day at 3:00"
// (a playlist, a channel's newest videos, a daily show), and a download
// window: downloads only start between two times of day (e.g. at night).
const crypto = require('crypto');
const fs = require('fs');

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_TASKS = 50;
const TICK_MS = 20 * 1000;

const minutes = (hhmm) => { const m = TIME.exec(hhmm); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** Is `date` inside the window from–to (which may go past midnight)? */
function inWindow(win, date = new Date()) {
  if (!win || !win.enabled) return true;
  const a = minutes(win.from);
  const b = minutes(win.to);
  if (a === null || b === null || a === b) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  return a < b ? now >= a && now < b : now >= a || now < b;
}

function cleanTask(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Tarea no válida.');
  if (!TIME.test(String(raw.time))) throw new Error('Hora no válida (hh:mm).');
  const days = [...new Set((Array.isArray(raw.days) ? raw.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!days.length) throw new Error('Elige al menos un día.');
  const name = String(raw.name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
  return { time: String(raw.time), days, name };
}

class Recurring {
  /** `run(task)` queues what the task downloads (returns a promise); `onTick()` runs every 20 s. */
  constructor({ file, run, onTick = () => {}, now = () => new Date() }) {
    this.file = file;
    this.run = run;
    this.onTick = onTick;
    this.now = now;
    this.data = { tasks: [], window: { enabled: false, from: '02:00', to: '07:00' } };
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(raw.tasks)) this.data.tasks = raw.tasks.filter((t) => t && /^[a-f0-9]{16}$/.test(t.id) && TIME.test(t.time) && typeof t.url === 'string').slice(0, MAX_TASKS);
      if (raw.window && typeof raw.window === 'object') {
        this.data.window = {
          enabled: raw.window.enabled === true,
          from: TIME.test(raw.window.from) ? raw.window.from : '02:00',
          to: TIME.test(raw.window.to) ? raw.window.to : '07:00',
        };
      }
    } catch { /* first run */ }
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref();
  }

  save() { try { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2)); } catch { /* not fatal */ } }

  view(clientId) {
    return { tasks: this.data.tasks.filter((t) => t.clientId === clientId).map(({ clientId: _c, ...t }) => t), window: this.data.window };
  }

  /** `options`: the download options (already validated by the caller). */
  add(clientId, { url, options, detail, ...raw }) {
    if (this.data.tasks.length >= MAX_TASKS) throw new Error('Has llegado al máximo de tareas.');
    const t = cleanTask(raw);
    const task = { id: crypto.randomBytes(8).toString('hex'), clientId, url, options, detail: String(detail || '').slice(0, 200), ...t, enabled: true, lastRun: null, lastError: null };
    this.data.tasks.push(task);
    this.save();
    return task;
  }

  update(clientId, id, patch) {
    const task = this.data.tasks.find((t) => t.id === id && t.clientId === clientId);
    if (!task) return null;
    if (typeof patch.enabled === 'boolean') task.enabled = patch.enabled;
    if (patch.time !== undefined || patch.days !== undefined) Object.assign(task, cleanTask({ time: patch.time ?? task.time, days: patch.days ?? task.days, name: task.name }));
    this.save();
    return task;
  }

  remove(clientId, id) {
    this.data.tasks = this.data.tasks.filter((t) => !(t.id === id && t.clientId === clientId));
    this.save();
  }

  setWindow(patch) {
    const w = { ...this.data.window };
    if (typeof patch.enabled === 'boolean') w.enabled = patch.enabled;
    if (patch.from !== undefined) { if (!TIME.test(String(patch.from))) throw new Error('Hora no válida (hh:mm).'); w.from = patch.from; }
    if (patch.to !== undefined) { if (!TIME.test(String(patch.to))) throw new Error('Hora no válida (hh:mm).'); w.to = patch.to; }
    if (w.from === w.to) throw new Error('El horario tiene que empezar y acabar a horas distintas.');
    this.data.window = w;
    this.save();
    return w;
  }

  windowOpen() { return inWindow(this.data.window, this.now()); }

  /** Tasks whose time has come (each at most once a day). */
  due(date = this.now()) {
    const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const day = date.getDay();
    const today = date.toDateString();
    return this.data.tasks.filter((t) => t.enabled && t.time === hhmm && t.days.includes(day) && t.lastRunDay !== today);
  }

  tick() {
    const date = this.now();
    const due = this.due(date);
    for (const task of due) {
      task.lastRun = date.getTime();
      task.lastRunDay = date.toDateString();
      Promise.resolve(this.run(task)).then((r) => { task.lastError = r === true || r === 'ok' ? null : (typeof r === 'string' ? r : null); this.save(); }, (err) => { task.lastError = err.message; this.save(); });
    }
    if (due.length) this.save();
    this.onTick();
  }
}

module.exports = { Recurring, inWindow, cleanTask, minutes };
