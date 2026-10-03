// Download profiles ("Música FLAC", "Vídeo para el móvil"…: a named set of
// download options) and rules ("from this channel → this profile, into this
// folder"), per client. Every option goes through the download options'
// own validation; names and folders are plain short text.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseDownloadOptions } = require('./download');
const { safeFolderName } = require('./filenames');

const MAX_PROFILES = 50;
const MAX_RULES = 100;
const MAX_CLIENTS = 500;
const ID_RE = /^[a-f0-9]{16}$/;
// Per-download choices that never belong in a profile.
const NOT_IN_PROFILE = ['playlist', 'chapters', 'sectionStart', 'sectionEnd', 'live'];

const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

/** A profile from the page (or the file) → the stored form, or null. */
function cleanProfile(raw, id = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = cleanText(raw.name, 60);
  if (!name) return null;
  const opts = parseDownloadOptions(raw.options && typeof raw.options === 'object' ? raw.options : {});
  for (const k of NOT_IN_PROFILE) delete opts[k];
  return { id: ID_RE.test(String(id || raw.id)) ? String(id || raw.id) : crypto.randomBytes(8).toString('hex'), name, options: opts, both: raw.both === true };
}

function cleanRule(raw, profiles, id = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const match = cleanText(raw.match, 100);
  if (!match) return null;
  const profile = ID_RE.test(String(raw.profile)) && profiles.some((p) => p.id === raw.profile) ? String(raw.profile) : '';
  const folder = cleanText(raw.folder, 80) ? safeFolderName(cleanText(raw.folder, 80)) : '';
  if (!profile && !folder) return null;
  return { id: ID_RE.test(String(id || raw.id)) ? String(id || raw.id) : crypto.randomBytes(8).toString('hex'), match, profile, folder };
}

/** The first rule whose text appears in the channel / uploader / link (case and accents ignored). */
function matchRule(rules, { channel = '', uploader = '', url = '' } = {}) {
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hay = [channel, uploader, url].map(fold);
  return rules.find((r) => hay.some((h) => h && h.includes(fold(r.match)))) || null;
}

class ProfileStore {
  constructor({ file = null } = {}) {
    this.file = file;
    this.data = new Map(); // clientId -> { profiles, rules }
    if (file) {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        for (const [client, v] of Object.entries(raw || {}).slice(0, MAX_CLIENTS)) {
          if (!/^[a-f0-9]{32}$/.test(client) || !v || typeof v !== 'object') continue;
          const profiles = (Array.isArray(v.profiles) ? v.profiles : []).slice(0, MAX_PROFILES).map((p) => cleanProfile(p)).filter(Boolean);
          const rules = (Array.isArray(v.rules) ? v.rules : []).slice(0, MAX_RULES).map((r) => cleanRule(r, profiles)).filter(Boolean);
          this.data.set(client, { profiles, rules });
        }
      } catch { /* none yet */ }
    }
  }

  of(clientId) {
    let d = this.data.get(clientId);
    if (!d) {
      if (this.data.size >= MAX_CLIENTS) this.data.delete(this.data.keys().next().value);
      d = { profiles: [], rules: [] };
      this.data.set(clientId, d);
    }
    return d;
  }

  save() {
    if (!this.file) return;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.data), null, 2));
    } catch { /* not fatal */ }
  }

  list(clientId) {
    const d = this.of(clientId);
    return { profiles: d.profiles, rules: d.rules };
  }

  /** Adds (no id) or replaces (id) a profile. Returns it, or throws a message. */
  saveProfile(clientId, raw) {
    const d = this.of(clientId);
    const i = raw && ID_RE.test(String(raw.id)) ? d.profiles.findIndex((p) => p.id === raw.id) : -1;
    const p = cleanProfile(raw, i >= 0 ? raw.id : null);
    if (!p) throw new Error('Ponle un nombre al perfil.');
    if (i >= 0) d.profiles[i] = p;
    else {
      if (d.profiles.length >= MAX_PROFILES) throw new Error('Has llegado al máximo de perfiles.');
      d.profiles.push(p);
    }
    this.save();
    return p;
  }

  removeProfile(clientId, id) {
    const d = this.of(clientId);
    d.profiles = d.profiles.filter((p) => p.id !== id);
    // Rules that pointed at it keep only their folder (or go).
    d.rules = d.rules.map((r) => (r.profile === id ? { ...r, profile: '' } : r)).filter((r) => r.profile || r.folder);
    this.save();
  }

  saveRule(clientId, raw) {
    const d = this.of(clientId);
    const i = raw && ID_RE.test(String(raw.id)) ? d.rules.findIndex((r) => r.id === raw.id) : -1;
    const r = cleanRule(raw, d.profiles, i >= 0 ? raw.id : null);
    if (!r) throw new Error('Escribe qué canal o texto busca la regla, y elige un perfil o una carpeta.');
    if (i >= 0) d.rules[i] = r;
    else {
      if (d.rules.length >= MAX_RULES) throw new Error('Has llegado al máximo de reglas.');
      d.rules.push(r);
    }
    this.save();
    return r;
  }

  removeRule(clientId, id) {
    const d = this.of(clientId);
    d.rules = d.rules.filter((r) => r.id !== id);
    this.save();
  }

  profile(clientId, id) {
    return this.of(clientId).profiles.find((p) => p.id === id) || null;
  }
}

module.exports = { ProfileStore, cleanProfile, cleanRule, matchRule, MAX_PROFILES, MAX_RULES };
