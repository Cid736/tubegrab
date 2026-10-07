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
    // v3.6: the look, piece by piece.
    font: 'system', density: 'normal', corners: 'normal', bold: false, navIcons: 'auto', sidebarSide: 'left', sidebarWidth: 'normal',
    scrollbar: 'normal', contentWidth: 'normal', showSubtitle: true, showUiSwitch: true, startView: 'last',
    darkFrom: '20:00', darkTo: '07:00', wallDim: 40, wallBlur: 0, wallColors: '#7ab8ff,#c39bff,#7fe0c8',
    navHidden: [], navOrder: [],
  };
  // "#rrggbb" only: it ends up in a CSS variable.
  var HEX_RE = /^#[0-9a-fA-F]{6}$/;
  var COLORS_RE = /^#[0-9a-fA-F]{6},#[0-9a-fA-F]{6},#[0-9a-fA-F]{6}$/;
  var TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  // Pages of the side menu (Ajustes always stays).
  var NAV = ['dl-link', 'dl-search', 'dl-subs', 'cv-format', 'cv-edit', 'cv-subs', 'cv-merge', 'cv-compress', 'cv-image', 'cv-tags', 'queue', 'history', 'library', 'stats', 'rumoria'];
  // Whole numbers within a range.
  var NUMBERS = { wallDim: [0, 90], wallBlur: [0, 30] };
  function navList(v, max) {
    if (!Array.isArray(v) || v.length > max) return null;
    var seen = {};
    for (var i = 0; i < v.length; i++) {
      if (NAV.indexOf(v[i]) === -1 || seen[v[i]]) return null;
      seen[v[i]] = true;
    }
    return v.slice();
  }
  // File-name template (the server checks it again): tags and safe characters only.
  var NAME_RE = /^[\p{L}\p{N} _\-.,()[\]!&'+#@{}]*$/u;
  // Every stored value is checked against a fixed list: prefs end up in
  // attributes and CSS, so nothing arbitrary from storage is ever applied.
  var ALLOWED = {
    uiDefault: ['windows', 'mac'],
    lang: ['es', 'en'],
    rateLimit: ['', '500K', '1M', '2M', '5M', '10M', '20M'],
    theme: ['auto', 'light', 'dark', 'schedule'],
    accent: ['blue', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'graphite', 'custom'],
    wall: ['aurora', 'ocean', 'sunset', 'forest', 'graphite', 'none', 'colors', 'custom'],
    glass: ['clear', 'tinted', 'solid'],
    size: ['xsmall', 'small', 'medium', 'large', 'xlarge'],
    font: ['system', 'humanist', 'serif', 'mono', 'condensed'],
    density: ['compact', 'normal', 'comfy'],
    corners: ['square', 'normal', 'round'],
    navIcons: ['auto', 'accent', 'color', 'mono'],
    sidebarSide: ['left', 'right'],
    sidebarWidth: ['icons', 'normal', 'wide'],
    scrollbar: ['normal', 'thin', 'hidden'],
    contentWidth: ['normal', 'full'],
    startView: ['last'].concat(NAV),
  };

  function sanitize(raw) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = raw ? raw[k] : undefined;
      if (k === 'navHidden' || k === 'navOrder') { out[k] = navList(v, NAV.length) || []; return; }
      var ok = k === 'accentColor' ? typeof v === 'string' && HEX_RE.test(v)
        : k === 'nameTemplate' ? typeof v === 'string' && v.length <= 120 && NAME_RE.test(v) && (v === '' || /\{(title|id)\}/.test(v))
        : k === 'wallColors' ? typeof v === 'string' && COLORS_RE.test(v)
        : k === 'darkFrom' || k === 'darkTo' ? typeof v === 'string' && TIME_RE.test(v)
        : NUMBERS[k] ? typeof v === 'number' && Math.floor(v) === v && v >= NUMBERS[k][0] && v <= NUMBERS[k][1]
        : ALLOWED[k] ? ALLOWED[k].indexOf(v) !== -1 : typeof v === 'boolean';
      out[k] = ok ? v : DEFAULTS[k];
    });
    // Never hide every page of the menu.
    if (out.navHidden.length >= NAV.length) out.navHidden = [];
    out.last = raw && raw.last && typeof raw.last === 'object' && !Array.isArray(raw.last) ? raw.last : {};
    return out;
  }

  function load() {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return sanitize(null); }
  }

  var STYLE_KEYS = ['theme', 'accent', 'accentColor', 'wall', 'glass', 'size', 'highContrast', 'reduceMotion', 'font', 'density', 'corners', 'bold',
    'navIcons', 'sidebarSide', 'sidebarWidth', 'scrollbar', 'contentWidth', 'showSubtitle', 'showUiSwitch', 'darkFrom', 'darkTo',
    'wallDim', 'wallBlur', 'wallColors', 'navHidden', 'navOrder'];
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

  function minutes(hhmm) { return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)); }
  /** Dark between darkFrom and darkTo (which may cross midnight). */
  function scheduledDark(p, now) {
    var m = now.getHours() * 60 + now.getMinutes();
    var from = minutes(p.darkFrom);
    var to = minutes(p.darkTo);
    if (from === to) return false;
    return from < to ? m >= from && m < to : m >= from || m < to;
  }
  function isDark(p) {
    return p.theme === 'dark' || (p.theme === 'auto' && media.matches) || (p.theme === 'schedule' && scheduledDark(p, new Date()));
  }

  function apply(p) {
    var root = document.documentElement;
    var dark = isDark(p);
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
    // How much the picture is veiled and blurred (numbers only).
    root.style.setProperty('--wall-dim', String(p.wallDim / 100));
    root.style.setProperty('--wall-blur', p.wallBlur + 'px');
    root.setAttribute('data-wallblur', picture && p.wallBlur > 0 ? 'on' : 'off');
    // Own three colours for the gradient background (each a checked "#rrggbb").
    var cols = p.wallColors.split(',');
    ['--w1', '--w2', '--w3'].forEach(function (name, i) {
      if (p.wall === 'colors') root.style.setProperty(name, cols[i]);
      else root.style.removeProperty(name);
    });
    root.setAttribute('data-glass', p.glass);
    root.setAttribute('data-size', p.size);
    root.setAttribute('data-contrast', p.highContrast ? 'high' : 'normal');
    root.setAttribute('data-motion', p.reduceMotion ? 'reduce' : 'normal');
    root.setAttribute('data-font', p.font);
    root.setAttribute('data-density', p.density);
    root.setAttribute('data-corners', p.corners);
    root.setAttribute('data-bold', p.bold ? 'on' : 'off');
    root.setAttribute('data-navicons', p.navIcons);
    root.setAttribute('data-side', p.sidebarSide);
    root.setAttribute('data-navwidth', p.sidebarWidth);
    root.setAttribute('data-scrollbar', p.scrollbar);
    root.setAttribute('data-content', p.contentWidth);
    root.setAttribute('data-subtitle', p.showSubtitle ? 'on' : 'off');
    root.setAttribute('data-uiswitch', p.showUiSwitch ? 'on' : 'off');
    root.setAttribute('lang', p.lang);
    // Desktop app: make the native window (acrylic, scrollbars, menus) match.
    // A schedule is resolved here: the window only knows auto / light / dark.
    if (window.desktop && window.desktop.setTheme) window.desktop.setTheme(p.theme === 'schedule' ? (dark ? 'dark' : 'light') : p.theme);
  }

  apply(prefs);
  media.addEventListener('change', function () { if (prefs.theme === 'auto') apply(prefs); });
  // Dark-at-night schedule: look again every minute, repaint only on a change.
  var lastDark = isDark(prefs);
  if (window.setInterval) {
    window.setInterval(function () {
      if (prefs.theme !== 'schedule') return;
      var d = isDark(prefs);
      if (d !== lastDark) { lastDark = d; apply(prefs); }
    }, 60000);
  }

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
    NAV: NAV,
    DEFAULTS: DEFAULTS,
    set: function (patch) {
      prefs = sanitize(Object.assign({}, prefs, patch));
      save();
      apply(prefs);
      lastDark = isDark(prefs);
      return prefs;
    },
    /** Saves the picture for the "custom" background; false if it doesn't fit or isn't a JPEG data URL. */
    setWallpaper: function (data) {
      if (typeof data !== 'string' || data.length > MAX_WALLPAPER || !WALLPAPER_RE.test(data)) return false;
      try { localStorage.setItem(WALLPAPER_KEY, data); } catch (e) { return false; }
      return this.set({ wall: 'custom' }) && true;
    },
    getWallpaper: readWallpaper,
    // Every key of the look (what "Restablecer" resets and a shared style carries).
    STYLE_KEYS: STYLE_KEYS,
    resetAppearance: function () {
      var patch = {};
      STYLE_KEYS.forEach(function (k) { patch[k] = DEFAULTS[k]; });
      return this.set(patch);
    },
    /** Only the look, to copy as a code and paste on another computer (no picture). */
    exportStyle: function () {
      var out = {};
      STYLE_KEYS.forEach(function (k) { out[k] = prefs[k]; });
      if (out.wall === 'custom') out.wall = DEFAULTS.wall;
      return out;
    },
    /** A pasted style: only the look's keys, each checked as always; false if nothing usable. */
    importStyle: function (obj) {
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
      var patch = {};
      var n = 0;
      STYLE_KEYS.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(obj, k)) { patch[k] = obj[k]; n++; } });
      if (patch.wall === 'custom' && !readWallpaper()) delete patch.wall;
      if (!n) return false;
      return this.set(patch);
    },
  };
})();
