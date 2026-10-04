// "Control from your phone" (desktop app): a small page on the local network
// where a paired phone can send download links to this PC and watch them,
// and (v3.10) see what's playing and control it: play / pause, next,
// volume, or type a song for the PC to play.
// It is NOT the app's own server exposed to the network: a separate server
// with three routes, no JavaScript, only on the WiFi address, and only for a
// phone that scanned the pairing QR (secret code → cookie).
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const { lanAddress } = require('./library');

const COOKIE = 'tg_remote';
const MAX_BODY = 16 * 1024;
const MAX_CONNECTIONS = 32;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

// The page in the phone's language (Spanish or English). Messages after
// sending are fixed: the page never echoes anything the phone sent.
const TEXT = {
  es: {
    title: 'Descargar en el PC', paste: 'Pega aquí uno o varios enlaces (YouTube, TikTok, Instagram…)', audio: 'Audio', video: 'Vídeo',
    format: 'Formato', quality: 'Calidad', best: 'La mejor', send: 'Enviar al PC', profile: 'Perfil', noProfile: 'Ninguno (lo de abajo)', empty: 'Lo que mandes aparecerá aquí y se guardará en la carpeta de descargas del PC.',
    pair: 'Para usar esta página, escanea con el móvil el código QR de TubeGrab → Ajustes → Sistema → Control desde el móvil.',
    expired: 'Código caducado', rescan: 'Vuelve a escanear el código QR en TubeGrab → Ajustes → Sistema.', wait: 'Demasiados intentos. Espera un minuto.',
    status: { queued: 'En cola', running: 'Descargando', processing: 'Procesando', paused: 'En pausa', done: 'Guardado en el PC', error: 'Error', canceled: 'Cancelado' },
    tabs: { dl: 'Descargar', music: 'Música' },
    music: {
      title: 'Lo que suena en el PC', nothing: 'No suena nada en el PC. Pon algo aquí abajo o en TubeGrab.', paused: 'En pausa', playing: 'Sonando', volume: 'Volumen', muted: 'silenciado',
      prev: 'Anterior', toggle: 'Reproducir / pausa', next: 'Siguiente', voldown: 'Bajar volumen', volup: 'Subir volumen', mute: 'Silenciar',
      search: 'Busca una canción y sonará en el PC', play: 'Poner', upNext: 'A continuación', find: 'Buscar una canción',
      sent: { ok: 'Hecho.', looking: 'Buscando… sonará en unos segundos.', empty: 'Escribe qué canción quieres.', failed: 'No se pudo. ¿Está TubeGrab abierto?' },
    },
    m: {
      ok: 'Enviado al PC. Aparecerá en la cola de TubeGrab.', empty: 'Pega al menos un enlace.', invalid: 'Ese enlace no es de un sitio compatible.',
      busy: 'Hay demasiadas descargas en la cola; espera a que acaben algunas.', failed: 'No se pudo enviar. ¿Está TubeGrab abierto?',
    },
  },
  en: {
    title: 'Download on the PC', paste: 'Paste one or more links here (YouTube, TikTok, Instagram…)', audio: 'Audio', video: 'Video',
    format: 'Format', quality: 'Quality', best: 'Best', send: 'Send to the PC', profile: 'Profile', noProfile: 'None (the choices below)', empty: "What you send shows up here and is saved to the PC's downloads folder.",
    pair: "To use this page, scan TubeGrab's QR code with your phone: Settings → System → Control from your phone.",
    expired: 'Code expired', rescan: 'Scan the QR code again in TubeGrab → Settings → System.', wait: 'Too many attempts. Wait a minute.',
    status: { queued: 'Queued', running: 'Downloading', processing: 'Processing', paused: 'Paused', done: 'Saved on the PC', error: 'Error', canceled: 'Canceled' },
    tabs: { dl: 'Download', music: 'Music' },
    music: {
      title: 'Playing on the PC', nothing: 'Nothing is playing on the PC. Put something on below or in TubeGrab.', paused: 'Paused', playing: 'Playing', volume: 'Volume', muted: 'muted',
      prev: 'Previous', toggle: 'Play / pause', next: 'Next', voldown: 'Volume down', volup: 'Volume up', mute: 'Mute',
      search: 'Search for a song and it will play on the PC', play: 'Play', upNext: 'Up next', find: 'Search for a song',
      sent: { ok: 'Done.', looking: 'Looking for it… it will play in a few seconds.', empty: 'Type the song you want.', failed: "Couldn't do it. Is TubeGrab open?" },
    },
    m: {
      ok: "Sent to the PC. It'll show up in TubeGrab's queue.", empty: 'Paste at least one link.', invalid: "That link isn't from a supported site.",
      busy: 'Too many downloads queued; wait for some to finish.', failed: "Couldn't send it. Is TubeGrab open?",
    },
  },
};
const MESSAGE_KIND = { ok: 'ok', empty: 'error', invalid: 'error', busy: 'error', failed: 'error' };
const AUDIO_CHOICES = ['mp3', 'm4a', 'opus', 'flac'];
const QUALITY_CHOICES = ['best', '1080', '720', '480'];
const langOf = (req) => (/^\s*en\b/i.test(req.headers['accept-language'] || '') ? 'en' : 'es');
// What the phone can ask the player for (the app checks them again).
const MUSIC_ACTIONS = ['prev', 'toggle', 'next', 'voldown', 'volup', 'mute'];
const YT_THUMB = /^https:\/\/i\d?\.ytimg\.com\/[\w\-/.]{1,200}(\?[\w\-=&%.]{0,300})?$/;
const fmtTime = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

class RemoteServer {
  /**
   * `file`: where the pairing is kept. `addDownloads(clientId, urls, choices)`
   * → Promise<'ok'|'invalid'|'busy'|'failed'>. `listJobs(clientId)` → recent jobs.
   * `listProfiles(clientId)` → [{ id, name }] (the app's download profiles).
   */
  constructor({ file, addDownloads, listJobs, listProfiles = () => [], playerCommand = () => false, lanAddressFn = lanAddress }) {
    this.file = file;
    this.addDownloads = addDownloads;
    // The music: what the app's player last said, and how to ask it for something.
    this.playerCommand = playerCommand;
    this.player = null;
    this.listJobs = listJobs;
    this.listProfiles = listProfiles;
    this.lanAddressFn = lanAddressFn;
    this.server = null;
    this.address = null;
    this.port = null;
    this.failures = new Map(); // ip -> [timestamps] of wrong pairing codes
    this.config = this.load();
  }

  load() {
    try {
      const c = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (/^[a-f0-9]{64}$/.test(c.token) && /^[a-f0-9]{32}$/.test(c.clientId)) {
        return { enabled: c.enabled === true, token: c.token, clientId: c.clientId, port: Number.isInteger(c.port) && c.port > 1024 && c.port < 65536 ? c.port : 0 };
      }
    } catch { /* first time */ }
    return { enabled: false, token: crypto.randomBytes(32).toString('hex'), clientId: null, port: 0 };
  }

  save() {
    try { fs.writeFileSync(this.file, JSON.stringify(this.config)); } catch { /* not fatal */ }
  }

  session() {
    return crypto.createHmac('sha256', this.config.token).update('tubegrab-remote-session').digest('hex');
  }

  /** State for the app's settings page: on/off and, when on, the pairing link. */
  async status() {
    if (!this.config.enabled) return { enabled: false };
    const address = this.lanAddressFn();
    if (!address) return { enabled: true, error: 'No estás conectado a una red WiFi o local.' };
    if (this.address !== address) { this.stop(); await this.start(address); }
    return { enabled: true, url: `http://${this.address}:${this.port}/`, pairUrl: `http://${this.address}:${this.port}/pair/${this.config.token}` };
  }

  async enable(clientId) {
    this.config.enabled = true;
    this.config.clientId = clientId;
    this.save();
    return this.status();
  }

  disable() {
    this.config.enabled = false;
    this.save();
    this.stop();
    return { enabled: false };
  }

  /** New pairing code: every phone paired so far is signed out. */
  async reset() {
    this.config.token = crypto.randomBytes(32).toString('hex');
    this.save();
    return this.status();
  }

  /** On start-up: back on if it was on (same port when possible, so the phone's bookmark keeps working). */
  async autoStart() {
    if (this.config.enabled && this.config.clientId) { try { await this.status(); } catch { /* network not ready */ } }
  }

  start(address) {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.headersTimeout = 10000;
      server.requestTimeout = 15000;
      server.maxConnections = MAX_CONNECTIONS;
      const listen = (port) => server.listen(port, address, () => {
        this.server = server;
        this.address = address;
        this.port = server.address().port;
        if (this.config.port !== this.port) { this.config.port = this.port; this.save(); }
        resolve();
      });
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && this.config.port) { this.config.port = 0; server.once('error', reject); listen(0); } else reject(err);
      });
      listen(this.config.port || 0);
    });
  }

  stop() {
    if (this.server) { this.server.close(); this.server.closeAllConnections?.(); }
    this.server = null;
    this.address = null;
    this.port = null;
  }

  /** What's playing, as the app says (titles, times and a YouTube cover only). */
  setPlayer(state) {
    if (!state || typeof state !== 'object') { this.player = null; return; }
    const text = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);
    this.player = {
      title: text(state.title, 300), artist: text(state.artist || state.sub, 200), playing: state.playing === true, muted: state.muted === true,
      time: Number(state.time) || 0, duration: Number(state.duration) || 0, at: Date.now(),
      volume: Number.isFinite(Number(state.volume)) ? Math.min(1, Math.max(0, Number(state.volume))) : 1,
      cover: typeof state.cover === 'string' && YT_THUMB.test(state.cover) ? state.cover : null,
      upNext: Array.isArray(state.upNext) ? state.upNext.slice(0, 5).map((x) => text(x && x.title, 200)) : [],
    };
  }

  tooManyFailures(ip) {
    const now = Date.now();
    const list = (this.failures.get(ip) || []).filter((t) => now - t < 60 * 1000);
    this.failures.set(ip, list);
    return list.length >= 10;
  }

  send(res, code, html, extra = {}) {
    res.writeHead(code, {
      'Content-Type': 'text/html; charset=utf-8',
      // Pictures only from YouTube's thumbnails (the song's cover on the music page).
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https://i.ytimg.com https://i1.ytimg.com https://i2.ytimg.com https://i3.ytimg.com https://i4.ytimg.com https://i9.ytimg.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
      ...extra,
    });
    res.end(html);
  }

  page(title, body, refresh = false, lang = 'es') {
    return `<!doctype html><html lang="${lang === 'en' ? 'en' : 'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="4">' : ''}<title>${escapeHtml(title)}</title><style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#111;color:#eee;margin:0;padding:20px;max-width:560px;margin:auto}
h1{font-size:20px;margin:6px 0 16px}textarea{width:100%;box-sizing:border-box;min-height:96px;border-radius:12px;border:1px solid #333;background:#1c1c1e;color:#eee;padding:12px;font-size:16px}
.row{display:flex;gap:10px;margin:12px 0}label{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;border-radius:12px;background:#1c1c1e;border:1px solid #333;font-size:16px}
button{width:100%;padding:14px;border:0;border-radius:12px;background:#0a84ff;color:#fff;font-size:17px;font-weight:600}
.msg{padding:12px;border-radius:12px;margin-bottom:14px}.ok{background:#12351d}.error{background:#3d1414}
ul{list-style:none;padding:0;margin:18px 0 0}li{padding:10px 0;border-bottom:1px solid #2a2a2a}li small{display:block;color:#999;margin-top:2px}
p{color:#aaa;font-size:14px}select{flex:1;padding:12px;border-radius:12px;border:1px solid #333;background:#1c1c1e;color:#eee;font-size:16px}
.opts{display:flex;gap:10px;margin:0 0 12px}.opts span{display:block;color:#999;font-size:12px;margin:0 0 4px 4px}.opts div{flex:1;display:flex;flex-direction:column}
nav{display:flex;gap:8px;margin:0 0 16px}nav a{flex:1;text-align:center;padding:10px;border-radius:12px;background:#1c1c1e;color:#ddd;text-decoration:none;font-weight:600}nav a.on{background:#0a84ff;color:#fff}
.now{display:flex;gap:14px;align-items:center;margin:0 0 16px}.now img,.now .ph{width:84px;height:84px;border-radius:12px;object-fit:cover;background:#2c2c2e;flex:none}.now b{display:block;font-size:17px}.now small{display:block;color:#999;margin-top:3px}
.ctl{display:flex;gap:10px;margin:0 0 10px}.ctl button{flex:1;padding:16px 0;font-size:22px;background:#2c2c2e}.ctl button.big{background:#0a84ff}
input[type=search]{width:100%;box-sizing:border-box;padding:14px;border-radius:12px;border:1px solid #333;background:#1c1c1e;color:#eee;font-size:16px;margin:0 0 10px}
a.more{display:block;text-align:center;padding:14px;border-radius:12px;background:#1c1c1e;color:#0a84ff;text-decoration:none;font-weight:600;margin:6px 0}</style></head><body>${body}</body></html>`;
  }

  handle(req, res) {
    // Only requests addressed to this exact address: a web page can't reach
    // us through a name of its own (DNS rebinding).
    if (req.headers.host !== `${this.address}:${this.port}`) return this.send(res, 421, this.page('TubeGrab', '<p>Dirección no válida.</p>'));
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ip = req.socket.remoteAddress || '';
    const lang = langOf(req);
    const T = TEXT[lang];

    const pair = /^\/pair\/([a-f0-9]{64})$/.exec(url.pathname);
    if (req.method === 'GET' && pair) {
      if (this.tooManyFailures(ip)) return this.send(res, 429, this.page('TubeGrab', `<p>${T.wait}</p>`, false, lang));
      if (!safeEqual(pair[1], this.config.token)) {
        this.failures.get(ip).push(Date.now());
        return this.send(res, 403, this.page('TubeGrab', `<h1>${T.expired}</h1><p>${T.rescan}</p>`, false, lang));
      }
      return this.send(res, 303, '', {
        Location: '/',
        'Set-Cookie': `${COOKIE}=${this.session()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
      });
    }

    const cookie = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
    if (!cookie || !safeEqual(cookie.slice(COOKIE.length + 1), this.session())) {
      return this.send(res, 401, this.page('TubeGrab', `<h1>TubeGrab</h1><p>${T.pair}</p>`, false, lang));
    }

    if (req.method === 'POST' && url.pathname === '/add') {
      // Only our own form: same origin (plus the SameSite cookie).
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) return this.send(res, 403, this.page('TubeGrab', '<p>Origen no permitido.</p>'));
      if (!/^application\/x-www-form-urlencoded\b/.test(req.headers['content-type'] || '')) return this.send(res, 415, this.page('TubeGrab', '<p>Formato no válido.</p>'));
      let body = '';
      let tooBig = false;
      req.setEncoding('utf8');
      req.on('data', (c) => { body += c; if (body.length > MAX_BODY) { tooBig = true; req.destroy(); } });
      req.on('end', async () => {
        if (tooBig) return;
        const form = new URLSearchParams(body);
        const urls = String(form.get('urls') || '').split(/\s+/).map((u) => u.trim()).filter(Boolean).slice(0, 20);
        const mode = form.get('mode') === 'video' ? 'video' : 'audio';
        // Only choices from these lists; the download API checks them again.
        const audioFormat = AUDIO_CHOICES.includes(form.get('audioFormat')) ? form.get('audioFormat') : 'mp3';
        const quality = QUALITY_CHOICES.includes(form.get('quality')) ? form.get('quality') : '1080';
        // A profile of the app's own (by its id), or none.
        const profiles = this.listProfiles(this.config.clientId) || [];
        const profile = profiles.some((p) => p.id === form.get('profile')) ? form.get('profile') : null;
        let result = 'empty';
        if (urls.length) {
          try { result = await this.addDownloads(this.config.clientId, urls, { mode, audioFormat, quality, profile }); } catch { result = 'failed'; }
        }
        this.send(res, 303, '', { Location: `/?m=${Object.prototype.hasOwnProperty.call(MESSAGE_KIND, result) ? result : 'failed'}` });
      });
      return undefined;
    }

    const nav = (on) => `<nav><a href="/"${on === 'dl' ? ' class="on"' : ''}>${T.tabs.dl}</a><a href="/music"${on === 'music' ? ' class="on"' : ''}>${T.tabs.music}</a></nav>`;
    const M = T.music;
    if (req.method === 'POST' && url.pathname === '/music') {
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) return this.send(res, 403, this.page('TubeGrab', '<p>Origen no permitido.</p>'));
      if (!/^application\/x-www-form-urlencoded\b/.test(req.headers['content-type'] || '')) return this.send(res, 415, this.page('TubeGrab', '<p>Formato no válido.</p>'));
      let body = '';
      let tooBig = false;
      req.setEncoding('utf8');
      req.on('data', (c) => { body += c; if (body.length > 2048) { tooBig = true; req.destroy(); } });
      req.on('end', () => {
        if (tooBig) return;
        const form = new URLSearchParams(body);
        const a = form.get('a');
        let result = 'failed';
        if (MUSIC_ACTIONS.includes(a)) result = this.playerCommand({ cmd: a }) ? 'ok' : 'failed';
        else if (a === 'play') {
          const q = String(form.get('q') || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200);
          result = !q ? 'empty' : this.playerCommand({ cmd: 'playQuery', q }) ? 'looking' : 'failed';
        }
        this.send(res, 303, '', { Location: `/music?m=${result}` });
      });
      return undefined;
    }
    if (req.method === 'GET' && url.pathname === '/music') {
      const m = url.searchParams.get('m');
      const msg = m && Object.prototype.hasOwnProperty.call(M.sent, m) ? `<div class="msg ${m === 'ok' || m === 'looking' ? 'ok' : 'error'}">${escapeHtml(M.sent[m])}</div>` : '';
      const p = this.player && this.player.title ? this.player : null;
      // The time now, counting since the app last said it.
      const time = p ? Math.min(p.duration || Infinity, p.time + (p.playing ? (Date.now() - p.at) / 1000 : 0)) : 0;
      const now = p ? `<div class="now">${p.cover ? `<img src="${escapeHtml(p.cover)}" alt="">` : '<span class="ph"></span>'}<div><b>${escapeHtml(p.title)}</b><small>${escapeHtml(p.artist)}</small>
<small>${p.playing ? M.playing : M.paused} · ${fmtTime(time)} / ${fmtTime(p.duration)} · ${M.volume} ${Math.round(p.volume * 100)} %${p.muted ? ` (${M.muted})` : ''}</small></div></div>` : `<p>${M.nothing}</p>`;
      const btn = (a, label, glyph, cls = '') => `<button name="a" value="${a}" title="${label}" aria-label="${label}"${cls ? ` class="${cls}"` : ''}>${glyph}</button>`;
      const controls = `<form method="post" action="/music" class="ctl">${btn('prev', M.prev, '⏮')}${btn('toggle', M.toggle, p && p.playing ? '⏸' : '▶', 'big')}${btn('next', M.next, '⏭')}</form>
<form method="post" action="/music" class="ctl">${btn('voldown', M.voldown, '−')}${btn('mute', M.mute, '🔇')}${btn('volup', M.volup, '+')}</form>`;
      const next = p && p.upNext.length ? `<p>${M.upNext}</p><ul>${p.upNext.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '';
      return this.send(res, 200, this.page('TubeGrab', `${nav('music')}<h1>${M.title}</h1>${msg}${now}${controls}<a class="more" href="/music/search">${M.find}</a>${next}`, true, lang));
    }
    if (req.method === 'GET' && url.pathname === '/music/search') {
      // Its own page: the music page reloads itself, which would wipe what you type.
      return this.send(res, 200, this.page('TubeGrab', `${nav('music')}<h1>${M.find}</h1>
<form method="post" action="/music"><input type="search" name="q" maxlength="200" placeholder="${escapeHtml(M.search)}" autocomplete="off" required autofocus><button name="a" value="play">${M.play}</button></form>`, false, lang));
    }

    if (req.method === 'GET' && url.pathname === '/') {
      const m = url.searchParams.get('m');
      const msg = Object.prototype.hasOwnProperty.call(MESSAGE_KIND, m) ? [MESSAGE_KIND[m], T.m[m]] : null;
      const jobs = (this.listJobs(this.config.clientId) || []).slice(-15).reverse();
      const active = jobs.some((j) => ['queued', 'running', 'processing'].includes(j.status));
      const items = jobs.map((j) => `<li>${escapeHtml(j.fileName && j.status === 'done' ? j.fileName : j.title)}<small>${escapeHtml(T.status[j.status] || j.status)}${Number.isFinite(j.progress) && j.status === 'running' ? ` · ${j.progress}%` : ''}</small></li>`).join('');
      const opt = (v, label, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${label}</option>`;
      const profiles = (this.listProfiles(this.config.clientId) || []).slice(0, 50);
      const profileRow = profiles.length ? `<div class="opts"><div><span>${T.profile}</span><select name="profile">${opt('', T.noProfile, true)}${profiles.map((p) => opt(escapeHtml(p.id), escapeHtml(p.name), false)).join('')}</select></div></div>` : '';
      return this.send(res, 200, this.page('TubeGrab', `${nav('dl')}<h1>${T.title}</h1>
${msg ? `<div class="msg ${msg[0]}">${escapeHtml(msg[1])}</div>` : ''}
<form method="post" action="/add"><textarea name="urls" placeholder="${escapeHtml(T.paste)}" autocomplete="off" required></textarea>
${profileRow}
<div class="row"><label><input type="radio" name="mode" value="audio" checked> ${T.audio}</label><label><input type="radio" name="mode" value="video"> ${T.video}</label></div>
<div class="opts"><div><span>${T.format} (${T.audio})</span><select name="audioFormat">${AUDIO_CHOICES.map((v) => opt(v, v.toUpperCase(), v === 'mp3')).join('')}</select></div>
<div><span>${T.quality} (${T.video})</span><select name="quality">${QUALITY_CHOICES.map((v) => opt(v, v === 'best' ? T.best : `${v}p`, v === '1080')).join('')}</select></div></div>
<button type="submit">${T.send}</button></form>
${items ? `<ul>${items}</ul>` : `<p>${T.empty}</p>`}`, active, lang));
    }
    return this.send(res, 404, this.page('TubeGrab', '<p>No encontrado.</p>'));
  }
}

module.exports = { RemoteServer, COOKIE };
