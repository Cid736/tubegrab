// Loaded synchronously in <head>: applies the saved appearance before first
// paint (no flash of the wrong theme) and exposes window.tgPrefs to app.js.
(function () {
  var KEY = 'tubegrab_prefs';
  var UI_KEY = 'tubegrab_ui';
  // A picture of the user's own as the background: a JPEG the page itself made
  // (scaled down), kept apart from the prefs because of its size.
  var WALLPAPER_KEY = 'tubegrab_wallpaper';
  var WALLPAPER_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+\/]+=*$/;
  var MAX_WALLPAPER = 3 * 1024 * 1024;
  var DEFAULTS = {
    uiDefault: 'windows', lang: 'es', rateLimit: '', theme: 'auto', accent: 'blue', wall: 'aurora', glass: 'tinted', size: 'medium',
    remember: true, notify: true, sound: false, onboarded: false, accentColor: '#0a84ff', highContrast: false, reduceMotion: false, nameTemplate: '',
    warnDuplicates: true,
  };
  // "#rrggbb" only: it ends up in a CSS variable.
  var HEX_RE = /^#[0-9a-fA-F]{6}$/;
  // File-name template (the server checks it again): tags and safe characters only.
  var NAME_RE = /^[\p{L}\p{N} _\-.,()[\]!&'+#@{}]*$/u;
  // Every stored value is checked against a fixed list: prefs end up in
  // attributes and CSS, so nothing arbitrary from storage is ever applied.
  var ALLOWED = {
    uiDefault: ['windows', 'mac'],
    lang: ['es', 'en'],
    rateLimit: ['', '500K', '1M', '2M', '5M', '10M', '20M'],
    theme: ['auto', 'light', 'dark'],
    accent: ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'graphite', 'custom'],
    wall: ['aurora', 'ocean', 'sunset', 'forest', 'graphite', 'none', 'custom'],
    glass: ['clear', 'tinted', 'solid'],
    size: ['small', 'medium', 'large'],
  };

  function sanitize(raw) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = raw ? raw[k] : undefined;
      var ok = k === 'accentColor' ? typeof v === 'string' && HEX_RE.test(v)
        : k === 'nameTemplate' ? typeof v === 'string' && v.length <= 120 && NAME_RE.test(v) && (v === '' || /\{(title|id)\}/.test(v))
        : ALLOWED[k] ? ALLOWED[k].indexOf(v) !== -1 : typeof v === 'boolean';
      out[k] = ok ? v : DEFAULTS[k];
    });
    out.last = raw && raw.last && typeof raw.last === 'object' && !Array.isArray(raw.last) ? raw.last : {};
    return out;
  }

  function load() {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return sanitize(null); }
  }

  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var prefs = load();

  // Interface in use: the toolbar switch changes it for this session only
  // (survives reloads); each launch starts with the favourite, prefs.uiDefault.
  var ui = prefs.uiDefault;
  try {
    var sessionUi = sessionStorage.getItem(UI_KEY);
    if (ALLOWED.uiDefault.indexOf(sessionUi) !== -1) ui = sessionUi;
  } catch (e) { /* storage unavailable */ }

  function applyUi() {
    document.documentElement.setAttribute('data-ui', ui);
    if (window.desktop && window.desktop.setUi) window.desktop.setUi(ui);
  }
  applyUi();

  function readWallpaper() {
    try {
      var data = localStorage.getItem(WALLPAPER_KEY);
      return data && data.length <= MAX_WALLPAPER && WALLPAPER_RE.test(data) ? data : null;
    } catch (e) { return null; }
  }

  function apply(p) {
    var root = document.documentElement;
    var dark = p.theme === 'dark' || (p.theme === 'auto' && media.matches);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    root.setAttribute('data-accent', p.accent);
    // Own colour: the accent, and black or white text on it by its brightness.
    if (p.accent === 'custom' && HEX_RE.test(p.accentColor)) {
      var n = parseInt(p.accentColor.slice(1), 16);
      var lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
      root.style.setProperty('--accent', p.accentColor);
      root.style.setProperty('--on-accent', lum > 0.6 ? 'rgba(0, 0, 0, 0.85)' : '#fff');
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--on-accent');
    }
    // Own picture (validated as a base64 JPEG, so nothing else reaches the CSS).
    var picture = p.wall === 'custom' ? readWallpaper() : null;
    if (picture) root.style.setProperty('--wall-image', 'url("' + picture + '")');
    else root.style.removeProperty('--wall-image');
    root.setAttribute('data-wall', p.wall === 'custom' && !picture ? 'aurora' : p.wall);
    root.setAttribute('data-glass', p.glass);
    root.setAttribute('data-size', p.size);
    root.setAttribute('data-contrast', p.highContrast ? 'high' : 'normal');
    root.setAttribute('data-motion', p.reduceMotion ? 'reduce' : 'normal');
    root.setAttribute('lang', p.lang);
    // Desktop app: make the native window (acrylic, scrollbars, menus) match.
    if (window.desktop && window.desktop.setTheme) window.desktop.setTheme(p.theme);
  }

  apply(prefs);
  media.addEventListener('change', function () { if (prefs.theme === 'auto') apply(prefs); });

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ }
  }

  window.tgPrefs = {
    ALLOWED: ALLOWED,
    get: function () { return prefs; },
    getUi: function () { return ui; },
    setUi: function (value) {
      if (ALLOWED.uiDefault.indexOf(value) === -1) return ui;
      ui = value;
      try { sessionStorage.setItem(UI_KEY, ui); } catch (e) { /* storage unavailable */ }
      applyUi();
      return ui;
    },
    set: function (patch) {
      prefs = sanitize(Object.assign({}, prefs, patch));
      save();
      apply(prefs);
      return prefs;
    },
    /** Saves the picture for the "custom" background; false if it doesn't fit or isn't a JPEG data URL. */
    setWallpaper: function (data) {
      if (typeof data !== 'string' || data.length > MAX_WALLPAPER || !WALLPAPER_RE.test(data)) return false;
      try { localStorage.setItem(WALLPAPER_KEY, data); } catch (e) { return false; }
      return this.set({ wall: 'custom' }) && true;
    },
    getWallpaper: readWallpaper,
    resetAppearance: function () {
      return this.set({ theme: DEFAULTS.theme, accent: DEFAULTS.accent, wall: DEFAULTS.wall, glass: DEFAULTS.glass, size: DEFAULTS.size });
    },
  };
})();
