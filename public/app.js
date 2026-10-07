// === DOM & i18n ===
const $ = (id) => document.getElementById(id);
// i18n.js: t('Texto {n}', { n }) → the text in the chosen language; ts() also
// translates messages that come from the server (errors, job stages).
const t = window.t || ((s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && k in vars ? vars[k] : `{${k}}`)));
const ts = window.ts || ((s) => s);

const urlInput = $('urlInput');
const btnClear = $('btnClear');
const urlHint = $('urlHint');
const audioFormat = $('audioFormat');
const audioBitrate = $('audioBitrate');
const videoQuality = $('videoQuality');
const videoContainer = $('videoContainer');
const optMetadata = $('optMetadata');
const optPlaylist = $('optPlaylist');
const optSubtitles = $('optSubtitles');
const optSponsorblock = $('optSponsorblock');
const optMusic = $('optMusic');
const optLyrics = $('optLyrics');
const optBoth = $('optBoth');
const optChapters = $('optChapters');
const optNormalize = $('optNormalize');
const optBpm = $('optBpm');
const optNfo = $('optNfo');
const optLive = $('optLive');
const subLangs = $('subLangs');
const subMode = $('subMode');
const dlStart = $('dlStart');
const dlEnd = $('dlEnd');
const btnDownload = $('btnDownload');
const btnText = $('btnText');
const btnLoadingText = $('btnLoadingText');
const statusMessage = $('statusMessage');
const formatToggle = $('formatToggle');
const convertFormat = $('convertFormat');
const convertPreset = $('convertPreset');
const convertBitrate = $('convertBitrate');
const convertSampleRate = $('convertSampleRate');
const convertChannels = $('convertChannels');
const convertNormalize = $('convertNormalize');
const convertResolution = $('convertResolution');
const convertQuality = $('convertQuality');
const convertFps = $('convertFps');
const convertRotate = $('convertRotate');
const convertRemoveAudio = $('convertRemoveAudio');
const convertSpeed = $('convertSpeed');
const convertTrimStart = $('convertTrimStart');
const convertTrimEnd = $('convertTrimEnd');
const convertHint = $('convertHint');
const queueList = $('queueList');
const previewCard = $('previewCard');

let currentMode = 'audio'; // 'audio' | 'video' | 'convert'
let downloadMode = 'audio';
let currentConvertKind = 'audio';
let selectedFiles = [];
let busy = false;

// === Formats & presets ===
// `ext` is the downloaded file's extension (ALAC and HEVC reuse m4a/mp4).
const CONVERT_FORMAT_OPTIONS = {
  audio: [
    { value: 'mp3', short: 'MP3', label: 'MP3 — el más compatible' },
    { value: 'm4a', short: 'M4A', label: 'M4A (AAC) — iPhone, iTunes' },
    { value: 'aac', short: 'AAC', label: 'AAC — archivo AAC puro' },
    { value: 'ogg', short: 'OGG', label: 'OGG (Vorbis)' },
    { value: 'opus', short: 'OPUS', label: 'OPUS — mejor calidad por kbps' },
    { value: 'wma', short: 'WMA', label: 'WMA — Windows Media' },
    { value: 'ac3', short: 'AC3', label: 'AC3 — Dolby Digital' },
    { value: 'flac', short: 'FLAC', label: 'FLAC — sin pérdida', lossless: true },
    { value: 'alac', short: 'ALAC', label: 'ALAC — sin pérdida de Apple', lossless: true },
    { value: 'wav', short: 'WAV', label: 'WAV — sin comprimir', lossless: true },
    { value: 'aiff', short: 'AIFF', label: 'AIFF — sin comprimir (Mac)', lossless: true },
  ],
  video: [
    { value: 'mp4', short: 'MP4', label: 'MP4 (H.264) — el más compatible' },
    { value: 'hevc', short: 'MP4 H.265', label: 'MP4 (H.265/HEVC) — menos peso, más lento' },
    { value: 'webm', short: 'WEBM', label: 'WEBM (VP9) — para web' },
    { value: 'mkv', short: 'MKV', label: 'MKV' },
    { value: 'mov', short: 'MOV', label: 'MOV — QuickTime / Apple' },
    { value: 'avi', short: 'AVI', label: 'AVI' },
    { value: 'wmv', short: 'WMV', label: 'WMV — Windows Media' },
    { value: 'flv', short: 'FLV', label: 'FLV — Flash Video' },
    { value: 'mpg', short: 'MPG', label: 'MPG (MPEG-2) — DVD, reproductores antiguos' },
    { value: '3gp', short: '3GP', label: '3GP — móviles antiguos' },
    { value: 'ogv', short: 'OGV', label: 'OGV (Theora)' },
    { value: 'gif', short: 'GIF', label: 'GIF animado — sin sonido', gif: true },
  ],
};

const PRESETS = {
  audio: [
    { id: 'custom', label: 'Personalizado' },
    { id: 'music', label: 'Música — alta calidad', set: { format: 'mp3', bitrate: '320', sampleRate: '44100', channels: '2', normalize: false } },
    { id: 'apple', label: 'iPhone / Apple Music', set: { format: 'm4a', bitrate: '256', sampleRate: '44100', channels: '2', normalize: false } },
    { id: 'podcast', label: 'Podcast / voz', set: { format: 'mp3', bitrate: '96', sampleRate: '44100', channels: '1', normalize: true } },
    { id: 'audiobook', label: 'Audiolibro — ligero', set: { format: 'm4a', bitrate: '64', sampleRate: '', channels: '1', normalize: true } },
    { id: 'voice', label: 'Nota de voz (OPUS)', set: { format: 'opus', bitrate: '64', sampleRate: '', channels: '1', normalize: true } },
    { id: 'lossless', label: 'Archivo sin pérdida', set: { format: 'flac', bitrate: '', sampleRate: '', channels: '', normalize: false } },
  ],
  video: [
    { id: 'custom', label: 'Personalizado' },
    { id: 'whatsapp', label: 'WhatsApp — ligero', set: { format: 'mp4', resolution: '480', quality: 'baja', fps: '30' } },
    { id: 'social', label: 'Instagram / TikTok', set: { format: 'mp4', resolution: '1080', quality: 'alta', fps: '30' } },
    { id: 'youtube', label: 'YouTube — máxima calidad', set: { format: 'mp4', resolution: '', quality: 'alta', fps: '' } },
    { id: 'email', label: 'Email — lo más ligero', set: { format: 'mp4', resolution: '360', quality: 'baja', fps: '24' } },
    { id: 'iphone', label: 'iPhone / Apple (HEVC)', set: { format: 'hevc', resolution: '1080', quality: 'media', fps: '' } },
    { id: 'web', label: 'Web (WEBM)', set: { format: 'webm', resolution: '720', quality: 'media', fps: '' } },
    { id: 'gif', label: 'GIF para redes', set: { format: 'gif', resolution: '360', quality: 'media', fps: '15' } },
  ],
};

const AUDIO_DL_LABELS = { best: 'Original', mp3: 'MP3', m4a: 'M4A', opus: 'OPUS', ogg: 'OGG', flac: 'FLAC', wav: 'WAV' };
const LOSSLESS_DL = new Set(['best', 'flac', 'wav']);

// === Client identity (jobs are private to it) ===
function randomHex(bytes) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const CLIENT_ID = (() => {
  try {
    let id = localStorage.getItem('tubegrab_client');
    if (!/^[a-f0-9]{32}$/.test(id || '')) {
      id = randomHex(16);
      localStorage.setItem('tubegrab_client', id);
    }
    return id;
  } catch {
    return randomHex(16);
  }
})();

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { ...(options.headers || {}), 'x-client-id': CLIENT_ID } });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new Error(ts((data && data.error) || `Error ${res.status}`));
  return data;
}
const postJson = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

// === Environment ===
const isElectronApp = navigator.userAgent.toLowerCase().includes('electron');
// `desktopApi`, not `desktop`: a top-level const can't shadow the global the
// preload exposes through contextBridge (it throws and stops the whole script).
const desktopApi = window.desktop || null;
if (isElectronApp) {
  $('desktopBanner').remove();
  document.body.classList.add('is-desktop-app');
} else {
  $('btnDesktopDownload').href = 'https://github.com/Cid736/tubegrab/releases/latest';
  // "Descargar": the three kinds to choose from, what each is and how big.
  const modal = $('getAppModal');
  let back = null;
  let sized = false;
  const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;
  const close = () => {
    modal.classList.add('hidden');
    document.removeEventListener('keydown', onKey, true);
    if (back) back.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    // The keyboard stays in the dialog while it's open.
    const els = [...modal.querySelectorAll('a[href], button')];
    const i = els.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); els[els.length - 1].focus(); }
    else if (!e.shiftKey && i === els.length - 1) { e.preventDefault(); els[0].focus(); }
  };
  $('btnDesktopDownload').addEventListener('click', (e) => {
    e.preventDefault();
    back = document.activeElement;
    modal.classList.remove('hidden');
    document.addEventListener('keydown', onKey, true);
    modal.querySelector('.get-app-opt').focus();
    if (sized) return;
    fetch('/api/desktop/latest').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d) return;
      sized = Boolean(d.version);
      for (const a of modal.querySelectorAll('.get-app-opt')) {
        const size = d.sizes && d.sizes[a.dataset.file];
        if (size) a.querySelector('.get-app-size').textContent = mb(size);
      }
      if (d.version) $('getAppVersion').textContent = t('Versión {v}. Elige una: las tres son la misma app.', { v: d.version });
    }).catch(() => {});
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  $('getAppClose').addEventListener('click', close);
  // Chosen: the download starts, and the dialog goes.
  for (const a of modal.querySelectorAll('.get-app-opt')) a.addEventListener('click', () => setTimeout(close, 300));
}

// === Rumoria: the music app that split from TubeGrab — its downloads, with
// the sizes and version of its latest release (once it has one) ===
(() => {
  let asked = false;
  document.addEventListener('tg:view', (e) => {
    if (e.detail !== 'rumoria' || asked) return;
    asked = true;
    fetch('/api/rumoria/latest').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d || !d.version) { asked = false; return; }
      for (const a of document.querySelectorAll('#rumoriaSection .get-app-opt')) {
        const size = d.sizes && d.sizes[a.dataset.file];
        if (size) a.querySelector('.get-app-size').textContent = `${Math.round(size / 1048576)} MB`;
      }
      $('rumVersion').textContent = t('Versión {v}. Elige una: las tres son la misma app.', { v: d.version });
    }).catch(() => { asked = false; });
  });
})();

// === App updater (desktop app only) ===
if (window.updater) {
  const updateBanner = $('updateBanner');
  const updateBannerSubtitle = $('updateBannerSubtitle');
  const btnUpdate = $('btnUpdate');
  const updateProgress = $('updateProgress');
  const versionChip = $('versionChip');
  const STATUS_LABELS = {
    checking: 'Buscando actualizaciones…',
    'up-to-date': 'Última versión',
    error: 'No se pudo comprobar',
    dev: 'Modo desarrollo',
  };

  const renderUpdateState = (state) => {
    if (!state) return;
    const label = state.status === 'available' ? t('Nueva: v{v}', { v: state.latest }) : (STATUS_LABELS[state.status] && t(STATUS_LABELS[state.status]));
    versionChip.textContent = label ? `v${state.current} · ${label}` : `v${state.current}`;
    versionChip.dataset.status = state.status;
    versionChip.title = state.status === 'error' ? `${ts(state.error)} — ${t('pulsa para reintentar')}` : t('Pulsa para buscar actualizaciones');
    versionChip.classList.remove('hidden');
    const appLabel = $('appUpdateLabel');
    appLabel.textContent = {
      checking: t('Versión {v} · buscando actualizaciones…', { v: state.current }),
      'up-to-date': t('Versión {v} · es la última', { v: state.current }),
      available: t('Versión {v} · hay una nueva: {n}', { v: state.current, n: state.latest }),
      error: t('Versión {v} · no se pudo comprobar: {e}. Se reintentará sola en unos minutos.', { v: state.current, e: ts(state.error) }),
      dev: t('Versión {v} · modo desarrollo', { v: state.current }),
    }[state.status] || t('Versión {v}', { v: state.current });
    appLabel.classList.toggle('error', state.status === 'error');
    $('btnCheckApp').disabled = state.status === 'checking';
    if (state.status === 'available') {
      updateBannerSubtitle.textContent = t('Versión {n} lista para descargar (tienes la {v}).', { n: state.latest, v: state.current });
      updateBanner.classList.remove('hidden');
    }
  };

  window.updater.onState(renderUpdateState);
  window.updater.getState().then(renderUpdateState);
  versionChip.addEventListener('click', () => window.updater.check());
  $('btnCheckApp').addEventListener('click', () => window.updater.check());
  window.updater.onProgress(({ percent }) => {
    $('updateProgressFill').style.width = `${percent}%`;
    $('updateProgressLabel').textContent = `${percent}%`;
  });
  window.updater.onDownloaded(() => {
    updateProgress.classList.add('hidden');
    btnUpdate.disabled = false;
    btnUpdate.textContent = t('Reiniciar y actualizar');
    btnUpdate.dataset.stage = 'downloaded';
  });
  window.updater.onError((message) => {
    updateBannerSubtitle.textContent = t('No se pudo actualizar: {e}', { e: ts(message) });
    btnUpdate.disabled = false;
    btnUpdate.textContent = t('Reintentar');
    btnUpdate.dataset.stage = 'available';
    updateProgress.classList.add('hidden');
  });
  btnUpdate.addEventListener('click', () => {
    if (btnUpdate.dataset.stage === 'downloaded') { window.updater.quitAndInstall(); return; }
    btnUpdate.disabled = true;
    btnUpdate.textContent = t('Descargando…');
    updateProgress.classList.remove('hidden');
    window.updater.downloadUpdate();
  });
}

// === Desktop settings (window buttons, folder, cookies, tray, engine) ===
const FLAVORS = {
  portable: 'Portable: un solo .exe con todo incluido, sin instalar.',
  lite: 'Portable ligera: descarga ffmpeg y yt-dlp la primera vez.',
  installed: 'Instalada: con acceso en el menú Inicio; se actualiza con su instalador.',
};

if (desktopApi) {
  // Window buttons (the native caption bar is hidden): Windows caption
  // buttons or macOS traffic lights, depending on the interface in use.
  $('trafficLights').classList.remove('hidden');
  for (const [id, action] of [['winClose', 'close'], ['winMin', 'minimize'], ['winMax', 'maximize'],
    ['capClose', 'close'], ['capMin', 'minimize'], ['capMax', 'maximize']]) {
    $(id).addEventListener('click', () => desktopApi.windowControl(action));
  }
  desktopApi.onWindowState(({ maximized }) => {
    document.body.classList.toggle('window-maximized', maximized);
    $('capMax').title = maximized ? t('Restaurar') : t('Maximizar');
    $('capMax').setAttribute('aria-label', $('capMax').title);
  });
  window.addEventListener('blur', () => document.body.classList.add('window-blurred'));
  window.addEventListener('focus', () => document.body.classList.remove('window-blurred'));

  const dirLabel = $('downloadDirLabel');
  const cookiesLabel = $('cookiesLabel');
  const cookiesHelp = cookiesLabel.textContent;
  const showSettings = (s) => {
    if (!s) return;
    dirLabel.textContent = s.downloadDir;
    dirLabel.title = s.downloadDir;
    cookiesLabel.textContent = s.hasCookies ? t('cookies.txt encontrado: se usa en todas las descargas.') : cookiesHelp;
    cookiesLabel.classList.toggle('ok', Boolean(s.hasCookies));
    $('optCloseToTray').checked = s.closeToTray;
    $('optClipboard').checked = s.clipboardWatch;
    $('optOrganize').value = s.organize || 'none';
    $('flavorLabel').textContent = t(FLAVORS[s.flavor] || '');
  };
  desktopApi.getSettings().then(showSettings);
  // Re-check when coming back to the window (e.g. after adding cookies.txt).
  window.addEventListener('focus', () => desktopApi.getSettings().then(showSettings));
  $('btnChooseFolder').addEventListener('click', async () => showSettings(await desktopApi.chooseFolder().then(() => desktopApi.getSettings())));
  $('btnOpenFolder').addEventListener('click', () => desktopApi.openFolder());
  $('btnOpenDataFolder').addEventListener('click', () => desktopApi.openDataFolder());
  $('optCloseToTray').addEventListener('change', (e) => desktopApi.setOptions({ closeToTray: e.target.checked }));
  $('optClipboard').addEventListener('change', (e) => desktopApi.setOptions({ clipboardWatch: e.target.checked }));
  $('optOrganize').addEventListener('change', (e) => desktopApi.setOptions({ organize: e.target.value }));

  // A link copied elsewhere and accepted from the notification.
  desktopApi.onPasteUrl(({ url }) => {
    setView('dl-link');
    urlInput.value = url;
    autoGrow();
    updateUrlState();
  });

  const engineLabel = $('engineLabel');
  const btnUpdateEngine = $('btnUpdateEngine');
  const showEngine = (s) => {
    if (!s) return;
    engineLabel.textContent = s.updating ? t('Comprobando actualizaciones…') : (s.error ? ts(s.error) : (s.version ? t('Versión {v}', { v: s.version }) : '—'));
    btnUpdateEngine.disabled = Boolean(s.updating);
    const c = s.components;
    const banner = $('componentsBanner');
    if (c && c.status !== 'ready') {
      banner.classList.remove('hidden');
      const failed = c.status === 'error';
      $('componentsTitle').textContent = failed ? t('No se pudieron descargar los componentes') : t('Preparando TubeGrab…');
      $('componentsSubtitle').textContent = failed ? ts(c.error) : t('Descargando los componentes de conversión y descarga (solo la primera vez).');
      $('componentsProgress').classList.toggle('hidden', failed);
      $('btnComponentsRetry').classList.toggle('hidden', !failed);
      $('componentsFill').style.width = `${c.progress || 0}%`;
      $('componentsLabel').textContent = `${c.progress || 0}%`;
    } else {
      banner.classList.add('hidden');
    }
  };
  desktopApi.getEngine().then(showEngine);
  desktopApi.onEngine(showEngine);
  btnUpdateEngine.addEventListener('click', () => desktopApi.updateEngine());
  $('btnComponentsRetry').addEventListener('click', () => desktopApi.retryComponents());
}

// === Personalisation (Ajustes → Apariencia / Descargas / Sistema) ===
// window.tgPrefs comes from theme-init.js, which already applied the saved
// appearance before first paint and validates every value it stores.
const prefsApi = window.tgPrefs;
const PICKERS = { lang: 'langPicker', uiDefault: 'uiDefaultPicker', theme: 'themePicker', accent: 'accentPicker', wall: 'wallPicker', glass: 'glassPicker', size: 'sizePicker' };
const UI_NAMES = { windows: 'Windows', mac: 'Mac' };

function renderPrefs() {
  const p = prefsApi.get();
  for (const [key, id] of Object.entries(PICKERS)) {
    $(id).querySelectorAll('[data-value]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === p[key])));
  }
  // Own colour / own picture (no data-value: they open a picker first).
  renderNameTemplate();
  $('prefContrast').checked = p.highContrast;
  $('prefMotion').checked = p.reduceMotion;
  $('accentCustom').setAttribute('aria-checked', String(p.accent === 'custom'));
  $('accentCustom').style.setProperty('--own', p.accentColor);
  $('accentColorInput').value = p.accentColor;
  const picture = prefsApi.getWallpaper();
  $('wallCustom').setAttribute('aria-checked', String(p.wall === 'custom' && Boolean(picture)));
  $('wallCustom').style.backgroundImage = picture ? `url("${picture}")` : '';
  $('wallCustom').classList.toggle('has-image', Boolean(picture));
  $('wallCustomRow').classList.toggle('hidden', p.wall !== 'custom' || !picture);
  // Toolbar switch + star: the star is lit when the interface in use is the favourite.
  const ui = prefsApi.getUi();
  $('uiSwitch').querySelectorAll('[data-value]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === ui)));
  const isFav = p.uiDefault === ui;
  const fav = $('uiFav');
  fav.setAttribute('aria-pressed', String(isFav));
  fav.title = isFav ? t('{ui} es tu interfaz predeterminada', { ui: UI_NAMES[ui] }) : t('Usar {ui} como interfaz predeterminada', { ui: UI_NAMES[ui] });
  fav.setAttribute('aria-label', fav.title);
  $('prefRemember').checked = p.remember;
  $('prefNotify').checked = p.notify;
  $('prefSound').checked = p.sound;
  $('prefRateLimit').value = p.rateLimit;
  // The v3.6 look controls (and the side menu) render themselves on this.
  document.dispatchEvent(new CustomEvent('tg:prefs'));
}

for (const [key, id] of Object.entries(PICKERS)) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    const before = prefsApi.get()[key];
    prefsApi.set({ [key]: b.dataset.value });
    // The whole page is translated on load, so a new language reloads it.
    if (key === 'lang' && before !== b.dataset.value) { location.reload(); return; }
    renderPrefs();
  });
}
$('uiSwitch').addEventListener('click', (e) => {
  if (e.target.closest('#uiFav')) {
    prefsApi.set({ uiDefault: prefsApi.getUi() });
  } else {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    prefsApi.setUi(b.dataset.value);
  }
  renderPrefs();
});
$('prefRemember').addEventListener('change', (e) => {
  prefsApi.set({ remember: e.target.checked, last: {} });
  if (e.target.checked) saveLastOptions();
});
$('prefNotify').addEventListener('change', (e) => prefsApi.set({ notify: e.target.checked }));
$('prefSound').addEventListener('change', (e) => {
  prefsApi.set({ sound: e.target.checked });
  if (e.target.checked) playDoneSound();
});
$('prefRateLimit').addEventListener('change', (e) => prefsApi.set({ rateLimit: e.target.value }));
$('btnResetPrefs').addEventListener('click', () => { prefsApi.resetAppearance(); renderPrefs(); });

// === File names: presets or a template of your own ===
const NAME_SAMPLE = { title: 'Mi canción', artist: 'Artista', channel: 'Canal', album: 'Álbum', date: '2026-10-01', year: '2026', track: '3', id: 'dQw4w9WgXcQ' };
const NAME_OK = /^[\p{L}\p{N} _\-.,()[\]!&'+#@{}]*$/u;
function nameTemplateValid(tpl) {
  return tpl.length <= 120 && NAME_OK.test(tpl) && /\{(title|id)\}/.test(tpl)
    && [...tpl.matchAll(/\{([a-z]+)\}/g)].every((m) => Object.prototype.hasOwnProperty.call(NAME_SAMPLE, m[1]))
    && !/[{}]/.test(tpl.replace(/\{[a-z]+\}/g, ''));
}
function renderNameTemplate() {
  const tpl = prefsApi.get().nameTemplate;
  const preset = [...$('nameTemplate').options].some((o) => o.value === tpl && o.value !== 'custom') ? tpl : 'custom';
  if (document.activeElement !== $('nameTemplate')) $('nameTemplate').value = preset;
  const custom = $('nameTemplate').value === 'custom';
  $('nameCustomRow').classList.toggle('hidden', !custom);
  if (custom && document.activeElement !== $('nameCustom')) $('nameCustom').value = tpl;
  const shown = custom ? $('nameCustom').value.trim() : $('nameTemplate').value;
  const valid = !shown || nameTemplateValid(shown);
  $('nameCustom').classList.toggle('invalid', custom && !valid);
  $('nameExample').textContent = valid
    ? t('Ejemplo: {name}.mp3', { name: (shown || '{title}').replace(/\{([a-z]+)\}/g, (_, k) => NAME_SAMPLE[k]) })
    : t('Usa {title} o {id}, y solo letras, números, espacios y - _ . , ( ) [ ] ! & \' + # @');
}
$('nameTemplate').addEventListener('change', () => {
  const v = $('nameTemplate').value;
  if (v !== 'custom') prefsApi.set({ nameTemplate: v });
  else if (!$('nameCustom').value.trim()) $('nameCustom').value = prefsApi.get().nameTemplate || '{artist} - {title}';
  renderNameTemplate();
  if (v === 'custom') $('nameCustom').focus();
});
$('nameCustom').addEventListener('input', () => {
  const v = $('nameCustom').value.trim();
  if (nameTemplateValid(v)) prefsApi.set({ nameTemplate: v });
  renderNameTemplate();
});
$('nameTokens').addEventListener('click', (e) => {
  const b = e.target.closest('[data-token]');
  if (!b) return;
  const input = $('nameCustom');
  const at = input.selectionStart ?? input.value.length;
  input.value = `${input.value.slice(0, at)}${b.dataset.token}${input.value.slice(input.selectionEnd ?? at)}`;
  input.dispatchEvent(new Event('input'));
  input.focus();
});

// === Start with Windows (desktop) ===
if (desktopApi && desktopApi.getStartup) {
  desktopApi.getStartup().then((s) => {
    if (!s || !s.available) return;
    $('startupRow').classList.remove('hidden');
    $('optStartup').checked = s.enabled;
  });
  $('optStartup').addEventListener('change', async (e) => {
    const s = await desktopApi.setStartup(e.target.checked);
    if (s) e.target.checked = s.enabled;
  });
}

// === Accessibility: high contrast, fewer animations ===
$('prefContrast').addEventListener('change', (e) => { prefsApi.set({ highContrast: e.target.checked }); renderPrefs(); });
$('prefMotion').addEventListener('change', (e) => { prefsApi.set({ reduceMotion: e.target.checked }); renderPrefs(); });

// === Keyboard shortcuts help ("?") ===
const keysHelp = (() => {
  const open = () => { $('keysModal').classList.remove('hidden'); $('keysClose').focus(); };
  const close = () => $('keysModal').classList.add('hidden');
  $('btnKeys').addEventListener('click', open);
  $('keysClose').addEventListener('click', close);
  $('keysModal').addEventListener('click', (e) => { if (e.target === $('keysModal')) close(); });
  document.addEventListener('keydown', (e) => {
    const typing = /^(input|textarea|select)$/i.test(e.target.tagName || '') || e.target.isContentEditable;
    if (!$('keysModal').classList.contains('hidden')) { if (e.key === 'Escape') close(); return; }
    if (e.key === '?' && !typing && !document.querySelector('.modal:not(.hidden)')) { e.preventDefault(); open(); }
  });
  return { open };
})();

// === Search in Settings: finds an option on any settings page ===
const settingsSearch = (() => {
  const input = $('settingsSearch');
  const list = $('settingsResults');
  const TAB = { 'set-appearance': 'Apariencia', 'set-downloads': 'Descargas', 'set-convert': 'Conversión', 'set-system': 'Sistema', 'set-about': 'Acerca de' };
  const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let index = null;
  function build() {
    index = [];
    document.querySelectorAll('.view[data-views^="set-"]').forEach((section) => {
      const view = section.dataset.views;
      if (!TAB[view]) return;
      section.querySelectorAll('.row').forEach((row) => {
        if (row.closest('.desktop-only') && !desktopApi) return;
        const label = row.querySelector('.row-label');
        if (!label) return;
        const name = label.childNodes[0] ? label.childNodes[0].textContent.trim() : label.textContent.trim();
        if (!name) return;
        index.push({ view, row, name, text: fold(`${label.textContent} ${row.querySelector('.row-sub')?.textContent || ''}`) });
      });
    });
  }
  function go(item) {
    input.value = '';
    list.classList.add('hidden');
    setView(item.view);
    // Inside a closed "more options" box: open it first.
    const box = item.row.closest('details');
    if (box) box.open = true;
    requestAnimationFrame(() => {
      item.row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      item.row.classList.add('flash');
      setTimeout(() => item.row.classList.remove('flash'), 1600);
      const focusable = item.row.querySelector('input, select, button');
      if (focusable) focusable.focus({ preventScroll: true });
    });
  }
  input.addEventListener('input', () => {
    if (!index) build();
    const q = fold(input.value.trim());
    list.innerHTML = '';
    if (q.length < 2) { list.classList.add('hidden'); return; }
    const found = index.filter((i) => q.split(/\s+/).every((w) => i.text.includes(w))).slice(0, 10);
    for (const item of found) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="sr-name"></span><span class="sr-tab"></span>';
      b.querySelector('.sr-name').textContent = item.name;
      b.querySelector('.sr-tab').textContent = t(TAB[item.view]);
      b.addEventListener('click', () => go(item));
      li.appendChild(b);
      list.appendChild(li);
    }
    if (!found.length) {
      const li = document.createElement('li');
      li.className = 'sr-empty';
      li.textContent = t('No hay ningún ajuste con esas palabras.');
      list.appendChild(li);
    }
    list.classList.remove('hidden');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = list.querySelector('button'); if (first) first.click(); }
    if (e.key === 'Escape') { input.value = ''; list.classList.add('hidden'); }
  });
  /** Every setting, for Ctrl+K. */
  const all = () => { if (!index) build(); return index; };
  return { build, all, go, TAB };
})();

// === Own accent colour and own background picture ===
$('accentColorInput').addEventListener('input', (e) => {
  if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { prefsApi.set({ accent: 'custom', accentColor: e.target.value }); renderPrefs(); }
});
/** Scales the chosen picture down (max 1920×1200) into a JPEG data URL small enough to keep. */
async function wallpaperFrom(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 40 * 1024 * 1024) throw new Error(t('Elige una imagen PNG, JPG o WEBP.'));
  const bitmap = await createImageBitmap(file);
  for (const [maxW, maxH, q] of [[1920, 1200, 0.85], [1600, 1000, 0.75], [1280, 800, 0.7]]) {
    const scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', q);
    if (data.length <= 3 * 1024 * 1024) return data;
  }
  throw new Error(t('La imagen es demasiado grande.'));
}
$('wallCustom').addEventListener('click', () => {
  if (prefsApi.getWallpaper() && prefsApi.get().wall !== 'custom') { prefsApi.set({ wall: 'custom' }); renderPrefs(); return; }
  $('wallInput').click();
});
$('wallChange').addEventListener('click', () => $('wallInput').click());
$('wallInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (!prefsApi.setWallpaper(await wallpaperFrom(file))) throw new Error(t('No se pudo guardar la imagen.'));
    renderPrefs();
  } catch (err) {
    showToast(err.message);
  }
});

// Soft two-note chime, synthesised (no audio file to ship or fetch).
let audioCtx = null;
function playDoneSound() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const now = audioCtx.currentTime;
    [[1046.5, 0], [1568, 0.1]].forEach(([freq, delay]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.6);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.65);
    });
  } catch { /* audio unavailable */ }
}

// Remember the last download options (restored on next launch).
const REMEMBERED_SELECTS = { audioFormat, audioBitrate, videoQuality, videoContainer, subLangs, subMode, sponsorMode: $('sponsorMode') };
const REMEMBERED_SWITCHES = { metadata: optMetadata, playlist: optPlaylist, subtitles: optSubtitles, sponsorblock: optSponsorblock, music: optMusic, official: $('optOfficial'), lyrics: optLyrics, both: optBoth, normalize: optNormalize, bpm: optBpm, nfo: optNfo };

function saveLastOptions() {
  if (!prefsApi.get().remember) return;
  const last = { downloadMode };
  for (const [k, el] of Object.entries(REMEMBERED_SELECTS)) last[k] = el.value;
  for (const [k, el] of Object.entries(REMEMBERED_SWITCHES)) last[k] = el.checked;
  prefsApi.set({ last });
}

function restoreLastOptions() {
  const p = prefsApi.get();
  if (!p.remember) return;
  const last = p.last || {};
  for (const [k, el] of Object.entries(REMEMBERED_SELECTS)) {
    if ([...el.options].some((o) => o.value === last[k])) el.value = last[k];
  }
  for (const [k, el] of Object.entries(REMEMBERED_SWITCHES)) {
    if (typeof last[k] === 'boolean') el.checked = last[k];
  }
  if (last.downloadMode === 'audio' || last.downloadMode === 'video') downloadMode = last.downloadMode;
  audioBitrate.disabled = LOSSLESS_DL.has(audioFormat.value);
  $('sponsorModeRow').classList.toggle('hidden', !optSponsorblock.checked);
}

[...Object.values(REMEMBERED_SELECTS), ...Object.values(REMEMBERED_SWITCHES)]
  .forEach((el) => el.addEventListener('change', saveLastOptions));
// "Preferir el audio oficial" only means something in music mode.
optMusic.addEventListener('change', () => $('optOfficialWrap').classList.toggle('hidden', !optMusic.checked || $('optMusicWrap').classList.contains('hidden')));

// === Server settings (concurrency, GPU) ===
const GPU_NAMES = { nvidia: 'NVIDIA (NVENC)', intel: 'Intel (Quick Sync)', amd: 'AMD (AMF)' };
function renderConfig(cfg) {
  if (!cfg) return;
  // Automatic subtitles: available here when the server has the engine.
  if (cfg.whisper) whisperStatus.fromServer(cfg.whisper);
  $('cfgDownloadConcurrency').value = String(cfg.downloadConcurrency);
  $('cfgConvertConcurrency').value = String(cfg.convertConcurrency);
  $('hwPicker').querySelectorAll('[data-value]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === cfg.hwAccel)));
  $('gpuLabel').textContent = cfg.gpu
    ? t('Detectada: {gpu}. Los vídeos H.264/H.265 se convierten con ella.', { gpu: GPU_NAMES[cfg.gpu] || cfg.gpu })
    : t('No se encontró una tarjeta compatible (NVIDIA, Intel o AMD); se usa el procesador.');
  $('hwPicker').classList.toggle('disabled', !cfg.gpu);
}
async function loadConfig() {
  try { renderConfig(await api('/api/config')); } catch { /* offline */ }
}
const saveConfig = async (patch) => {
  try { renderConfig(await postJson('/api/config', patch)); } catch (err) { showStatus(err.message, 'error'); }
};
$('cfgDownloadConcurrency').addEventListener('change', (e) => saveConfig({ downloadConcurrency: Number(e.target.value) }));
$('cfgConvertConcurrency').addEventListener('change', (e) => saveConfig({ convertConcurrency: Number(e.target.value) }));
$('hwPicker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-value]');
  if (b && desktopApi) saveConfig({ hwAccel: b.dataset.value });
});

// === Navigation: sections with submenus ===
const VIEWS = {
  'dl-link': { group: 'download', title: 'Descargar', sub: 'Pega un enlace de YouTube y más de 20 sitios', tab: 'Enlace' },
  'dl-search': { group: 'download', title: 'Buscar', sub: 'Encuentra y descarga sin tener el enlace', tab: 'Buscar' },
  'dl-subs': { group: 'download', title: 'Suscripciones', sub: 'Lo nuevo de tus canales, descargado solo', tab: 'Suscripciones', desktop: true },
  'cv-format': { group: 'convert', title: 'Convertir', sub: '23 formatos de audio y vídeo', tab: 'Formato' },
  'cv-edit': { group: 'convert', title: 'Editor', sub: 'Recorta del segundo que quieras al que quieras, corta y quita partes', tab: 'Editor' },
  'cv-tags': { group: 'convert', title: 'Etiquetas', sub: 'Artista, álbum, carátula y letras de tus canciones', tab: 'Etiquetas' },
  'cv-subs': { group: 'convert', title: 'Subtítulos', sub: 'Lo que se dice, escrito por Whisper en tu equipo', tab: 'Subtítulos' },
  'cv-merge': { group: 'convert', title: 'Unir archivos', sub: 'Varios audios o vídeos en uno solo', tab: 'Unir' },
  'cv-compress': { group: 'convert', title: 'Comprimir', sub: 'Que pese lo que tú digas', tab: 'Comprimir' },
  'cv-image': { group: 'convert', title: 'Imagen', sub: 'Un fotograma o la carátula como imagen', tab: 'Imagen' },
  queue: { group: null, title: 'Cola', sub: 'Descargas y conversiones en curso' },
  history: { group: null, title: 'Historial', sub: 'Lo que has terminado en este equipo' },
  library: { group: null, title: 'Biblioteca', sub: 'Escucha y mira lo que has descargado', desktop: true },
  stats: { group: null, title: 'Estadísticas', sub: 'Lo que has descargado, convertido y escuchado' },
  rumoria: { group: null, title: 'Rumoria', sub: 'Escuchar sin descargar, en su propia app' },
  'set-appearance': { group: 'settings', title: 'Apariencia', sub: 'Idioma, interfaz, colores, letra, menú y estilos', tab: 'Apariencia' },
  'set-downloads': { group: 'settings', title: 'Descargas', sub: 'Carpeta, velocidad y cookies', tab: 'Descargas' },
  'set-convert': { group: 'settings', title: 'Conversión', sub: 'Tarjeta gráfica y conversiones a la vez', tab: 'Conversión' },
  'set-system': { group: 'settings', title: 'Sistema', sub: 'Avisos, bandeja y portapapeles', tab: 'Sistema' },
  'set-about': { group: 'settings', title: 'Acerca de', sub: 'Versión y actualizaciones', tab: 'Acerca de' },
};
const DOWNLOAD_VIEWS = new Set(['dl-link', 'dl-search', 'dl-subs']);
// The page (and settings tab) you were on, reopened next time.
const VIEW_KEY = 'tubegrab_view';
function lastView() {
  try {
    // Ajustes → Apariencia → "Al abrir la app, empezar en": a page of your choice.
    const start = prefsApi.get().startView;
    if (start && start !== 'last' && Object.prototype.hasOwnProperty.call(VIEWS, start)) return start;
    const v = localStorage.getItem(VIEW_KEY);
    return v && Object.prototype.hasOwnProperty.call(VIEWS, v) ? v : 'dl-link';
  } catch { return 'dl-link'; }
}
let currentView = 'dl-link';

function viewsOf(group) {
  return Object.entries(VIEWS).filter(([id, v]) => v.group === group && (!v.desktop || desktopApi)).map(([id]) => id);
}

function setView(view) {
  if (!VIEWS[view] || (VIEWS[view].desktop && !desktopApi && view !== 'dl-subs')) view = 'dl-link';
  currentView = view;
  const info = VIEWS[view];
  // Flat sidebar: every page has its own button, except Ajustes (one button, tabs inside).
  document.querySelectorAll('.nav-item[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.section === 'settings' ? info.group === 'settings' : b.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach((el) => {
    el.classList.toggle('hidden', !(el.dataset.views || '').split(' ').includes(view));
  });
  document.body.dataset.view = view;
  $('viewTitle').textContent = t(info.title);
  $('viewSubtitle').textContent = t(info.sub);
  formatToggle.classList.toggle('hidden', !DOWNLOAD_VIEWS.has(view));
  renderSubnav(info.group);
  placeDownloadOptions(view);
  if (view === 'dl-link' || view === 'dl-search') setMode(downloadMode);
  else if (view === 'cv-format') setMode('convert');
  if (view === 'history') renderHistory();
  if (view === 'dl-search') { refreshSearchFormat(); setTimeout(() => $('searchInput').focus(), 0); }
  if (view === 'dl-subs') { refreshSubFormat(); loadSubscriptions(); }
  if (view.startsWith('set-')) loadConfig();
  if (view === 'stats') stats.render();
  if (view === 'cv-subs') transcribeUi.refresh();
  document.dispatchEvent(new CustomEvent('tg:view', { detail: view }));
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* storage unavailable */ }
  $('scroll').scrollTop = 0;
}

// Tabs at the top of the Ajustes page (its sections).
function renderSubnav(group) {
  const nav = $('subnav');
  const ids = group === 'settings' ? viewsOf(group) : [];
  nav.innerHTML = '';
  nav.classList.toggle('empty', ids.length < 2);
  for (const id of ids) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `subnav-tab${id === currentView ? ' active' : ''}`;
    b.textContent = t(VIEWS[id].tab);
    b.addEventListener('click', () => setView(id));
    nav.appendChild(b);
  }
}

document.querySelector('.sidebar').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  if (!item.dataset.view) return;
  // Ajustes keeps the tab you were on.
  if (item.dataset.section === 'settings' && VIEWS[currentView].group === 'settings') return;
  setView(item.dataset.view);
});

[audioFormat, audioBitrate, videoQuality, videoContainer].forEach((el) => el.addEventListener('change', () => refreshEstimate()));
optPlaylist.addEventListener('change', () => refreshEstimate());
optBoth.addEventListener('change', () => { saveLastOptions(); refreshButton(); refreshEstimate(); });

function setMode(mode) {
  if (mode !== 'convert') {
    if (downloadMode !== mode) { downloadMode = mode; saveLastOptions(); }
    document.querySelectorAll('.format-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('toggleSlider').style.transform = `translateX(${mode === 'video' ? '100%' : '0'})`;
    refreshSearchFormat();
    refreshSubFormat();
    if (currentView !== 'dl-link' && currentView !== 'cv-format' && currentView !== 'dl-search') return;
  }
  currentMode = currentView === 'cv-format' ? 'convert' : downloadMode;
  applyMode();
  clearStatus();
}

formatToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.format-btn');
  if (btn && !btn.classList.contains('active')) setMode(btn.dataset.mode);
});

function applyMode() {
  const isConvert = currentMode === 'convert';
  refreshEstimate();
  $('inputGroup').classList.toggle('hidden', isConvert);
  $('uploadGroup').classList.toggle('hidden', !isConvert);
  if (isConvert) hidePreview(); else updateUrlState();
  $('audioOptions').classList.toggle('hidden', currentMode !== 'audio');
  $('videoOptions').classList.toggle('hidden', currentMode !== 'video');
  $('downloadExtras').classList.toggle('hidden', isConvert);
  $('dlMoreOptions').classList.toggle('hidden', isConvert);
  $('optMusicWrap').classList.toggle('hidden', currentMode !== 'audio');
  $('optOfficialWrap').classList.toggle('hidden', currentMode !== 'audio' || !optMusic.checked);
  $('optLyricsWrap').classList.toggle('hidden', currentMode !== 'audio');
  $('optBpmWrap').classList.toggle('hidden', currentMode !== 'audio');
  $('optNfoWrap').classList.toggle('hidden', currentMode !== 'video');
  $('optSubtitlesWrap').classList.toggle('hidden', currentMode !== 'video');
  refreshSubtitleRows();
  $('convertOptions').classList.toggle('hidden', !isConvert);
  $('moreOptions').classList.toggle('hidden', !isConvert);
  refreshButton();
}

function refreshSubtitleRows() {
  const on = currentMode === 'video' && optSubtitles.checked;
  $('subLangsRow').classList.toggle('hidden', !on);
  $('subModeRow').classList.toggle('hidden', !on);
}
optSubtitles.addEventListener('change', refreshSubtitleRows);

function refreshButton() {
  if (currentMode === 'convert') {
    const opt = currentConvertOption();
    const n = selectedFiles.length;
    btnText.textContent = n > 1 ? t('Convertir {n} archivos a {f}', { n, f: opt.short }) : t('Convertir a {f}', { f: opt.short });
    return;
  }
  const n = parseUrls(urlInput.value).length;
  const what = describeDownloadFormat(true);
  btnText.textContent = n > 1 ? t('Descargar {n} enlaces ({f})', { n, f: what }) : t('Descargar {f}', { f: what });
}

/** "MP3 192 kbps" / "MP4 1080p" for the current download options. */
function describeDownloadFormat(short = false, mode = downloadMode, combined = true) {
  // "Audio and video at once": "MP3 + MP4".
  if (combined && optBoth.checked) return `${describeDownloadFormat(true, 'audio', false)} + ${describeDownloadFormat(true, 'video', false)}`;
  if (mode === 'audio') {
    const label = t(AUDIO_DL_LABELS[audioFormat.value]);
    return short || LOSSLESS_DL.has(audioFormat.value) ? label : `${label} ${audioBitrate.value} kbps`;
  }
  const q = videoQuality.value === 'best' ? t('mejor calidad') : `${videoQuality.value}p`;
  return short ? videoContainer.value.toUpperCase() : `${videoContainer.value.toUpperCase()} ${q}`;
}

audioFormat.addEventListener('change', () => {
  audioBitrate.disabled = LOSSLESS_DL.has(audioFormat.value);
  refreshButton();
});
videoContainer.addEventListener('change', refreshButton);

/** Options sent with every download (links, search results, playlist picks, subscriptions). */
function downloadOptions(mode = downloadMode) {
  const tpl = prefsApi.get().nameTemplate;
  return {
    mode,
    nameTemplate: tpl || undefined,
    audioFormat: audioFormat.value,
    audioBitrate: audioBitrate.value,
    quality: videoQuality.value,
    container: videoContainer.value,
    metadata: optMetadata.checked,
    subtitles: optSubtitles.checked,
    subLangs: subLangs.value,
    subMode: subMode.value,
    sponsorblock: optSponsorblock.checked,
    sponsorMode: $('sponsorMode').value,
    music: optMusic.checked,
    official: $('optOfficial').checked,
    lyrics: optLyrics.checked,
    normalize: optNormalize.checked,
    bpm: optBpm.checked,
    nfo: optNfo.checked,
    rateLimit: prefsApi.get().rateLimit,
    priority: $('dlPriority').value,
  };
}

/** Copies links to the clipboard, one per line. */
async function copyLinks(urls) {
  const list = urls.filter(Boolean);
  if (!list.length) { showToast(t('No hay enlaces que copiar.')); return; }
  try {
    await navigator.clipboard.writeText(list.join('\n'));
    showToast(list.length === 1 ? t('Enlace copiado') : t('{n} enlaces copiados', { n: list.length }));
  } catch { showToast(t('No se pudo copiar al portapapeles.')); }
}

/** Only the thumbnails of these videos, as JPG. */
async function downloadThumbs(items, statusEl) {
  const urls = items.map((i) => i.url).filter(Boolean);
  if (!urls.length) { showToast(t('Elige uno o varios vídeos primero.')); return; }
  try {
    const r = await postJson('/api/jobs/thumbnail', { urls, title: items.length === 1 ? items[0].title : undefined });
    const msg = r.created === 1 ? t('Miniatura añadida a la cola') : t('{n} miniaturas añadidas a la cola', { n: r.created });
    if (statusEl) setStatusEl(statusEl, msg, 'success'); else showToast(msg);
  } catch (err) { if (statusEl) setStatusEl(statusEl, err.message, 'error'); else showToast(err.message); }
}

// The download options are one set of controls: on Descargar → Buscar they
// move into its "Opciones de descarga", and back again on the other pages.
const DL_OPTION_IDS = ['profileGroup', 'audioOptions', 'videoOptions', 'downloadExtras', 'dlMoreOptions'];
function placeDownloadOptions(view) {
  const inSearch = view === 'dl-search';
  const home = $('dlOptionsHome');
  const slot = $('searchOptionsSlot');
  for (const id of DL_OPTION_IDS) {
    const el = $(id);
    if (inSearch && el.parentElement !== slot) slot.appendChild(el);
    else if (!inSearch && el.parentElement === slot) home.parentElement.insertBefore(el, home);
  }
}
function refreshSearchSummary() {
  const el = $('searchOptionsSummary');
  if (el) el.textContent = `· ${describeDownloadFormat()}`;
}
optSponsorblock.addEventListener('change', () => $('sponsorModeRow').classList.toggle('hidden', !optSponsorblock.checked));

// === Download profiles and rules ===
// A profile fills in the download form; a rule picks a profile (and/or a
// folder) for one channel. Kept by the server (on disk in the desktop app).
const profilesUi = (() => {
  let data = { profiles: [], rules: [] };
  const sel = $('dlProfile');
  const SAVE = '__save';
  const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const SWITCHES = { metadata: optMetadata, subtitles: optSubtitles, sponsorblock: optSponsorblock, music: optMusic, lyrics: optLyrics, normalize: optNormalize, bpm: optBpm, nfo: optNfo };
  const SELECTS = { audioFormat, audioBitrate, quality: videoQuality, container: videoContainer, subLangs, subMode, sponsorMode: $('sponsorMode') };

  function describe(p) {
    const o = p.options;
    const audio = `${t(AUDIO_DL_LABELS[o.audioFormat] || 'MP3')}${LOSSLESS_DL.has(o.audioFormat) ? '' : ` ${o.audioBitrate} kbps`}`;
    const video = `${String(o.container || 'mp4').toUpperCase()} ${o.quality === 'best' ? t('mejor calidad') : `${o.quality}p`}`;
    const main = p.both ? `${audio} + ${video}` : o.mode === 'audio' ? audio : video;
    const extras = [o.music && t('modo música'), o.lyrics && t('letras'), o.normalize && t('volumen igualado'), o.bpm && 'BPM', o.subtitles && t('subtítulos'), o.sponsorblock && 'SponsorBlock', o.nfo && 'NFO'].filter(Boolean);
    return [main, ...extras].join(' · ');
  }

  function render() {
    const cur = sel.value;
    sel.innerHTML = '';
    const add = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; sel.appendChild(o); };
    add('', t('Ninguno: las opciones de abajo'));
    for (const p of data.profiles) add(p.id, p.name);
    add(SAVE, t('Guardar estas opciones como perfil…'));
    sel.value = data.profiles.some((p) => p.id === cur) ? cur : '';

    const list = $('profilesList');
    list.innerHTML = '';
    $('profilesEmpty').classList.toggle('hidden', data.profiles.length > 0);
    for (const p of data.profiles) {
      const li = document.createElement('li');
      li.className = 'sub-item';
      li.innerHTML = '<div class="sub-text"><span class="sub-title"></span><span class="sub-meta"></span></div><div class="queue-actions"></div>';
      li.querySelector('.sub-title').textContent = p.name;
      li.querySelector('.sub-meta').textContent = describe(p);
      const actions = li.querySelector('.queue-actions');
      const rename = document.createElement('button');
      rename.type = 'button';
      rename.className = 'link-btn';
      rename.textContent = t('Renombrar');
      rename.addEventListener('click', async () => {
        const r = await ask({ title: t('Nombre del perfil'), input: p.name, buttons: [{ label: t('Cancelar'), value: null }, { label: t('Guardar'), value: 'ok', primary: true }] });
        if (r && r.text) { try { data = await postJson('/api/profiles', { ...p, name: r.text }); render(); } catch (err) { showToast(err.message); } }
      });
      actions.append(rename, iconButton('remove', t('Borrar el perfil'), async () => { data = await api(`/api/profiles/${p.id}`, { method: 'DELETE' }); render(); }));
      list.appendChild(li);
    }

    const rp = $('ruleProfile');
    rp.innerHTML = '';
    const opt = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; rp.appendChild(o); };
    opt('', t('Sin perfil'));
    for (const p of data.profiles) opt(p.id, p.name);
    const rules = $('rulesList');
    rules.innerHTML = '';
    $('rulesEmpty').classList.toggle('hidden', data.rules.length > 0);
    for (const r of data.rules) {
      const li = document.createElement('li');
      li.className = 'sub-item';
      li.innerHTML = '<div class="sub-text"><span class="sub-title"></span><span class="sub-meta"></span></div><div class="queue-actions"></div>';
      li.querySelector('.sub-title').textContent = t('Si contiene «{m}»', { m: r.match });
      const prof = data.profiles.find((p) => p.id === r.profile);
      li.querySelector('.sub-meta').textContent = [prof ? t('perfil {p}', { p: prof.name }) : '', r.folder ? t('carpeta {f}', { f: r.folder }) : ''].filter(Boolean).join(' · ');
      li.querySelector('.queue-actions').appendChild(iconButton('remove', t('Borrar la regla'), async () => { data = await api(`/api/rules/${r.id}`, { method: 'DELETE' }); render(); }));
      rules.appendChild(li);
    }
  }

  async function load() {
    try { data = await api('/api/profiles'); } catch { /* server not ready */ }
    render();
  }

  /** Fills the form with a profile's options. */
  function apply(p) {
    if (!p) return;
    const o = p.options;
    for (const [k, el] of Object.entries(SELECTS)) if (o[k] !== undefined && [...el.options].some((x) => x.value === String(o[k]))) el.value = String(o[k]);
    for (const [k, el] of Object.entries(SWITCHES)) if (typeof o[k] === 'boolean') el.checked = o[k];
    optBoth.checked = p.both === true;
    $('sponsorModeRow').classList.toggle('hidden', !optSponsorblock.checked);
    audioBitrate.disabled = LOSSLESS_DL.has(audioFormat.value);
    if (o.mode === 'audio' || o.mode === 'video') setMode(o.mode);
    refreshSubtitleRows();
    refreshButton();
    refreshEstimate();
    saveLastOptions();
  }

  sel.addEventListener('change', async () => {
    if (sel.value === SAVE) {
      sel.value = '';
      const r = await ask({ title: t('Guardar como perfil'), text: describe({ options: downloadOptions(), both: optBoth.checked }), input: '',
        buttons: [{ label: t('Cancelar'), value: null }, { label: t('Guardar'), value: 'ok', primary: true }] });
      if (!r || !r.text) return;
      try {
        data = await postJson('/api/profiles', { name: r.text, options: downloadOptions(), both: optBoth.checked });
        render();
        const made = data.profiles.find((p) => p.name === r.text.slice(0, 60));
        if (made) sel.value = made.id;
        showStatus(t('Perfil «{n}» guardado', { n: r.text }), 'success');
      } catch (err) { showStatus(err.message, 'error'); }
      return;
    }
    apply(data.profiles.find((p) => p.id === sel.value));
  });

  // Any change by hand: no longer exactly that profile.
  [...Object.values(SELECTS), ...Object.values(SWITCHES), optBoth].forEach((el) => el.addEventListener('change', () => { if (sel.value && sel.value !== SAVE) sel.value = ''; }));

  $('btnAddRule').addEventListener('click', async () => {
    const status = $('rulesStatus');
    try {
      data = await postJson('/api/rules', { match: $('ruleMatch').value, profile: $('ruleProfile').value, folder: $('ruleFolder').value });
      $('ruleMatch').value = '';
      $('ruleFolder').value = '';
      setStatusEl(status, t('Regla añadida'), 'success');
      render();
    } catch (err) { setStatusEl(status, err.message, 'error'); }
  });

  function ruleFor({ channel = '', uploader = '', url = '' } = {}) {
    const hay = [channel, uploader, url].map(fold);
    return data.rules.find((r) => hay.some((h) => h && h.includes(fold(r.match)))) || null;
  }

  return {
    load,
    render,
    describe,
    /** A rule for this link/channel picks its profile in the form. */
    applyRuleFor(info) {
      const r = ruleFor(info);
      const p = r && r.profile ? data.profiles.find((x) => x.id === r.profile) : null;
      if (!p || sel.value === p.id) return;
      sel.value = p.id;
      apply(p);
      showStatus(t('Regla «{m}»: perfil {p}', { m: r.match, p: p.name }), 'success');
    },
    /** The folder a rule saves this finished download into ('' if none). */
    folderFor(job) {
      const m = job.meta || {};
      const r = ruleFor({ channel: m.channel, uploader: m.uploader || m.artist, url: job.source });
      return r ? r.folder : '';
    },
    /** For a subscription: the profile of the rule matching its link, or null. */
    profileForUrl(url) {
      const r = ruleFor({ url });
      return r && r.profile ? data.profiles.find((x) => x.id === r.profile) || null : null;
    },
    byName: (name) => data.profiles.find((p) => fold(p.name) === fold(name)) || null,
    get data() { return data; },
  };
})();
// === URLs ===
function parseUrls(text) {
  return String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/?\S*$/i.test(s));
}
const isPlaylistUrl = (u) => /[?&]list=|\/playlist\b|\/sets\/|\/album\//i.test(u) && !/[?&]v=|youtu\.be\//i.test(u);
// A Spotify / Apple Music list: its songs are looked for on YouTube.
const isImportUrl = (u) => /^(https?:\/\/)?(open\.spotify\.com|(embed\.)?music\.apple\.com)\//i.test(String(u || ''));

function autoGrow() {
  urlInput.style.height = 'auto';
  if (!urlInput.value) return; // keep the single-row height the placeholder fits in
  urlInput.style.height = `${Math.min(urlInput.scrollHeight, 160)}px`;
}

let previewDebounce = null;
let previewRequestId = 0;
let previewDuration = null;
let lastPreview = null;

function updateUrlState() {
  const urls = parseUrls(urlInput.value);
  btnClear.classList.toggle('visible', urlInput.value.length > 0);
  urlHint.textContent = urls.length > 1 ? t('{n} enlaces — se descargarán todos.', { n: urls.length }) : '';
  clearTimeout(previewDebounce);
  if (urls.length !== 1) { hidePreview(); } else { previewDebounce = setTimeout(() => fetchPreview(urls[0]), 700); }
  refreshButton();
}

urlInput.addEventListener('input', () => { autoGrow(); updateUrlState(); });
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
});
btnClear.addEventListener('click', () => {
  urlInput.value = '';
  autoGrow();
  updateUrlState();
  urlInput.focus();
  clearStatus();
});

// Paste from clipboard on focus when empty.
urlInput.addEventListener('focus', async () => {
  if (urlInput.value) return;
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (parseUrls(text).length && text.length < 20000) {
      urlInput.value = text;
      autoGrow();
      updateUrlState();
      showStatus(t('Enlace detectado en el portapapeles ✨'), 'success');
    }
  } catch { /* clipboard permission denied */ }
});

async function fetchPreview(url) {
  const requestId = ++previewRequestId;
  if (isImportUrl(url)) {
    previewCard.classList.add('hidden');
    loadImport(url, requestId);
    return;
  }
  if (isPlaylistUrl(url)) {
    previewCard.classList.add('hidden');
    loadPlaylist(url, requestId);
    return;
  }
  $('playlistCard').classList.add('hidden');
  try {
    const data = await postJson('/api/info', { url });
    if (requestId !== previewRequestId) return;
    $('previewThumb').src = data.thumbnail || '';
    $('previewThumb').style.visibility = data.thumbnail ? 'visible' : 'hidden';
    $('previewTitle').textContent = data.title;
    lastPreview = { url, already: data.already || null };
    const chapters = data.chapters > 1 ? t('{n} capítulos', { n: data.chapters }) : '';
    $('previewMeta').textContent = [data.site, data.uploader, formatDuration(data.duration), chapters].filter(Boolean).join(' · ');
    previewCard.classList.remove('hidden');
    previewDuration = data.duration || null;
    previewSizes = data.sizes || null;
    dlRange.setDuration(previewDuration);
    syncDlRange();
    refreshEstimate();
    // Already downloaded before? (by the video's own id)
    const already = $('previewAlready');
    already.textContent = data.already && prefsApi.get().warnDuplicates ? describeAlready(data.already) : '';
    already.classList.toggle('hidden', !already.textContent);
    // On air: it can be recorded from the start.
    $('optLiveWrap').classList.toggle('hidden', !data.isLive);
    if (!data.isLive) optLive.checked = false;
    // A rule for this channel picks its profile.
    profilesUi.applyRuleFor({ channel: data.channel, uploader: data.uploader, url });
  } catch {
    if (requestId === previewRequestId) hidePreview();
  }
}

/** "You downloaded it on 3 Oct (as audio)". */
function describeAlready(rec) {
  const as = rec.modes && rec.modes.length === 1 ? (rec.modes[0] === 'audio' ? t('como audio') : t('como vídeo')) : rec.modes && rec.modes.length > 1 ? t('como audio y como vídeo') : '';
  return t('Ya lo descargaste el {d} {as}', { d: formatDate(rec.at), as }).trim();
}

function hidePreview() {
  previewSizes = null;
  refreshEstimate();
  previewRequestId += 1;
  previewCard.classList.add('hidden');
  $('playlistCard').classList.add('hidden');
  previewDuration = null;
  dlRange.setDuration(null);
  $('dlRangeRow').classList.add('hidden');
  $('previewAlready').classList.add('hidden');
  $('optLiveWrap').classList.add('hidden');
  optLive.checked = false;
}

// === Playlist picker ===
const playlistPicker = createPickList($('playlistList'), () => {
  const n = playlistPicker.selected().length;
  $('btnPlaylistDownload').textContent = n ? t('Descargar {n} seleccionados', { n }) : t('Descargar seleccionados');
  $('btnPlaylistDownload').disabled = !n;
});

async function loadPlaylist(url, requestId) {
  const card = $('playlistCard');
  card.classList.remove('hidden');
  $('playlistTitle').textContent = t('Leyendo la playlist…');
  $('playlistMeta').textContent = '';
  $('playlistHint').textContent = '';
  playlistPicker.set([]);
  try {
    const data = await postJson('/api/playlist', { url });
    if (requestId !== previewRequestId) return;
    $('playlistTitle').textContent = data.title;
    const total = data.entries.reduce((acc, e) => acc + (e.duration || 0), 0);
    $('playlistMeta').textContent = [t('{n} vídeos', { n: data.entries.length }), formatDuration(total)].filter(Boolean).join(' · ');
    $('playlistHint').textContent = t('Desmarca lo que no quieras.');
    playlistPicker.set(data.entries, true);
  } catch (err) {
    if (requestId !== previewRequestId) return;
    $('playlistTitle').textContent = t('No se pudo leer la playlist');
    $('playlistMeta').textContent = err.message;
  }
}
/** A Spotify / Apple Music list in the picker: its songs, to look for on YouTube. */
async function loadImport(url, requestId) {
  const card = $('playlistCard');
  card.classList.remove('hidden');
  $('playlistTitle').textContent = t('Leyendo la lista…');
  $('playlistMeta').textContent = '';
  $('playlistHint').textContent = '';
  playlistPicker.set([]);
  try {
    const data = await postJson('/api/import', { url: url.startsWith('http') ? url : `https://${url}` });
    if (requestId !== previewRequestId) return;
    $('playlistTitle').textContent = data.title;
    $('playlistMeta').textContent = [data.service === 'spotify' ? 'Spotify' : 'Apple Music', t('{n} canciones', { n: data.tracks.length })].join(' · ');
    $('playlistHint').textContent = t('Cada canción se busca en YouTube y se baja la primera que salga. Desmarca lo que no quieras.');
    playlistPicker.set(data.tracks.map((tr) => ({ title: tr.artist ? `${tr.artist} - ${tr.title}` : tr.title, query: tr.query, duration: tr.duration, channel: '' })), true);
  } catch (err) {
    if (requestId !== previewRequestId) return;
    $('playlistTitle').textContent = t('No se pudo leer la lista');
    $('playlistMeta').textContent = err.message;
  }
}
$('playlistCopy').addEventListener('click', () => {
  const sel = playlistPicker.selected();
  copyLinks((sel.length ? sel : playlistPicker.all()).map((i) => i.url));
});
$('btnThumbOnly').addEventListener('click', () => {
  const urls = parseUrls(urlInput.value);
  if (urls.length === 1) downloadThumbs([{ url: urls[0], title: $('previewTitle').textContent }], statusMessage);
});
$('btnCopyPreview').addEventListener('click', () => copyLinks(parseUrls(urlInput.value)));
$('playlistAll').addEventListener('click', () => playlistPicker.all(true));
$('playlistNone').addEventListener('click', () => playlistPicker.all(false));
$('btnPlaylistDownload').addEventListener('click', async () => {
  const items = playlistPicker.selected();
  if (!items.length) return;
  await queueItems(items, $('playlistHint'));
});

/**
 * Before downloading: links this client already downloaded (by video id).
 * Resolves with the links to go ahead with, or null if the user cancelled.
 */
async function skipAlready(urls, known = {}) {
  if (!prefsApi.get().warnDuplicates || !urls.length) return urls;
  let found = { ...known };
  try { Object.assign(found, (await postJson('/api/seen', { urls })).found || {}); } catch { /* can't check: go ahead */ }
  const have = urls.filter((u) => found[u]);
  if (!have.length) return urls;
  const fresh = urls.filter((u) => !found[u]);
  const one = urls.length === 1;
  const choice = await ask({
    title: one ? t('Ya lo tienes') : t('Ya tienes {n} de estos', { n: have.length }),
    text: one ? `${describeAlready(found[have[0]])}. ${t('¿Descargarlo otra vez?')}` : t('{n} ya los descargaste antes. ¿Qué hago con ellos?', { n: have.length }),
    buttons: [
      { label: t('Cancelar'), value: null },
      ...(fresh.length ? [{ label: t('Solo los nuevos ({n})', { n: fresh.length }), value: 'fresh' }] : []),
      { label: one ? t('Descargarlo otra vez') : t('Todos'), value: 'all', primary: true },
    ],
  });
  return choice === 'all' ? urls : choice === 'fresh' ? fresh : null;
}

/**
 * A small dialog: a question, an optional text box, and buttons. Resolves
 * with the chosen button's value (and the text, when there's a box), or
 * null when closed. (Electron has no window.prompt.)
 */
function ask({ title, text = '', input = null, buttons }) {
  return new Promise((resolve) => {
    const modal = $('askModal');
    $('askTitle').textContent = title;
    $('askText').textContent = text;
    $('askText').classList.toggle('hidden', !text);
    const box = $('askInput');
    box.classList.toggle('hidden', input === null);
    box.value = input === null ? '' : input;
    const actions = $('askActions');
    actions.innerHTML = '';
    const done = (value) => {
      modal.classList.add('hidden');
      document.removeEventListener('keydown', onKey, true);
      resolve(input === null ? value : (value === null ? null : { value, text: box.value.trim() }));
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); done(null); }
      if (e.key === 'Enter' && input !== null && document.activeElement === box) { const p = buttons.find((b) => b.primary); if (p) done(p.value); }
    };
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `btn${b.primary ? ' btn-primary' : ''}`;
      el.textContent = b.label;
      el.addEventListener('click', () => done(b.value));
      actions.appendChild(el);
    }
    document.addEventListener('keydown', onKey, true);
    modal.onclick = (e) => { if (e.target === modal) done(null); };
    modal.classList.remove('hidden');
    (input !== null ? box : actions.lastElementChild).focus();
  });
}

/** Queues picked search/playlist results with the current options. */
async function queueItems(items, statusEl) {
  const known = Object.fromEntries(items.filter((i) => i.already).map((i) => [i.url, i.already]));
  // Imported songs have no link yet (only what to look for).
  const linked = items.filter((i) => i.url);
  const keep = await skipAlready(linked.map((i) => i.url), known);
  if (!keep) return false;
  items = items.filter((i) => !i.url || keep.includes(i.url));
  if (!items.length) { statusEl.textContent = t('Nada nuevo que descargar.'); return false; }
  const opts = { ...downloadOptions(), chapters: optChapters.checked };
  try {
    const payload = { items: items.map((i) => (i.url ? { url: i.url, title: i.title } : { query: i.query, title: i.title })) };
    let created = (await postJson('/api/jobs/download', { ...opts, ...payload })).created;
    if (optBoth.checked) created += (await postJson('/api/jobs/download', { ...downloadOptions(downloadMode === 'audio' ? 'video' : 'audio'), chapters: optChapters.checked, ...payload })).created;
    const data = { created };
    const msg = data.created === 1 ? t('Añadido a la cola') : t('{n} añadidos a la cola', { n: data.created });
    statusEl.textContent = msg;
    statusEl.className = `${statusEl.className.replace(/\s*(success|error)/g, '')} success`;
    return true;
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = `${statusEl.className.replace(/\s*(success|error)/g, '')} error`;
    return false;
  }
}

/**
 * A list of results with checkboxes, thumbnails and durations (playlist
 * picker, search). `onChange` runs whenever the selection changes.
 */
// === YouTube previews in the result lists (search, playlist picker) ===
// The player is YouTube's own, from its privacy-enhanced domain
// (youtube-nocookie.com), sandboxed: hovering a thumbnail plays a silent
// preview; ▶ opens it with sound under the result, ⏸ pauses it.
const ytPreview = (() => {
  const ORIGIN = 'https://www.youtube-nocookie.com';
  const idOf = (url) => {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
      const id = host === 'youtu.be' ? u.pathname.slice(1).split('/')[0]
        : host === 'youtube.com' ? (u.searchParams.get('v') || (/^\/(shorts|live)\/([\w-]{11})/.exec(u.pathname) || [])[2]) : null;
      return /^[\w-]{11}$/.test(id || '') ? id : null;
    } catch { return null; }
  };
  function frame(id, { muted, controls, start = 0 }) {
    const f = document.createElement('iframe');
    const q = new URLSearchParams({ autoplay: '1', mute: muted ? '1' : '0', controls: controls ? '1' : '0', playsinline: '1', rel: '0', modestbranding: '1', enablejsapi: '1', origin: location.origin });
    if (start) q.set('start', String(Math.floor(start)));
    f.src = `${ORIGIN}/embed/${id}?${q}`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    // YouTube's player refuses to load without knowing who embeds it.
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    f.title = t('Vista previa');
    return f;
  }
  const command = (f, func) => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), ORIGIN); } catch { /* not loaded yet */ } };

  // Hover: a floating, silent preview over the thumbnail.
  const pop = document.createElement('div');
  pop.className = 'yt-hover hidden';
  pop.setAttribute('aria-hidden', 'true');
  document.body.appendChild(pop);
  let hoverTimer = null;
  let hoverFor = null;
  function hideHover() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverFor = null;
    pop.classList.add('hidden');
    pop.innerHTML = '';
  }
  function hover(thumb, id, duration) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (inline && inline.id === id) return;
      hoverFor = thumb;
      pop.innerHTML = '';
      pop.appendChild(frame(id, { muted: true, controls: false, start: duration > 90 ? Math.min(30, duration * 0.1) : 0 }));
      const r = thumb.getBoundingClientRect();
      const w = 320;
      const h = 180;
      pop.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
      pop.style.top = `${r.bottom + h + 8 < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
      pop.classList.remove('hidden');
    }, 450);
  }

  // ▶: the video with sound, under its result.
  let inline = null; // { id, row, frame, btn, playing }
  function setBtn(btn, playing) {
    btn.innerHTML = playing ? ICONS.pause : ICONS.play;
    btn.title = playing ? t('Pausar') : t('Reproducir');
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-pressed', String(playing));
  }
  function close() {
    if (!inline) return;
    inline.row.remove();
    setBtn(inline.btn, false);
    inline = null;
  }
  function toggle(li, btn, id) {
    hideHover();
    if (inline && inline.id === id) {
      inline.playing = !inline.playing;
      command(inline.frame, inline.playing ? 'playVideo' : 'pauseVideo');
      setBtn(btn, inline.playing);
      return;
    }
    close();
    const row = document.createElement('li');
    row.className = 'pick-player-row';
    const box = document.createElement('div');
    box.className = 'pick-player';
    const f = frame(id, { muted: false, controls: true });
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'link-btn';
    x.textContent = t('Cerrar');
    x.addEventListener('click', close);
    box.appendChild(f);
    row.append(box, x);
    li.after(row);
    inline = { id, row, frame: f, btn, playing: true };
    setBtn(btn, true);
  }
  // Leaving the page stops whatever is playing.
  document.addEventListener('tg:view', () => { hideHover(); close(); });

  /** The thumbnail of one result, with its preview and play button (or the plain picture). */
  function thumb(item, li) {
    const wrap = document.createElement('span');
    wrap.className = 'pick-thumb-wrap';
    const img = document.createElement('img');
    img.className = 'pick-thumb';
    img.alt = '';
    img.loading = 'lazy';
    if (item.thumbnail) img.src = item.thumbnail; else img.style.visibility = 'hidden';
    wrap.appendChild(img);
    const id = idOf(item.url);
    if (!id) return wrap;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick-play';
    setBtn(btn, inline !== null && inline.id === id && inline.playing);
    // Inside the row's label: the click must not tick the box.
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggle(li, btn, id); });
    wrap.appendChild(btn);
    wrap.addEventListener('pointerenter', () => hover(wrap, id, item.duration || 0));
    wrap.addEventListener('pointerleave', () => { if (hoverFor === wrap || hoverTimer) hideHover(); });
    return wrap;
  }
  return { thumb, close, hideHover, idOf };
})();

function createPickList(ul, onChange, { quick } = {}) {
  let items = [];
  const render = () => {
    ytPreview.hideHover();
    ytPreview.close();
    ul.innerHTML = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'pick-item';
      const label = document.createElement('label');
      label.className = 'pick-main';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = item.checked;
      box.addEventListener('change', () => { item.checked = box.checked; onChange(); });
      const img = ytPreview.thumb(item, li);
      const text = document.createElement('span');
      text.className = 'pick-text';
      const title = document.createElement('span');
      title.className = 'pick-title';
      title.textContent = item.title || item.url;
      const meta = document.createElement('span');
      meta.className = 'pick-meta';
      meta.textContent = [item.channel, formatDuration(item.duration)].filter(Boolean).join(' · ');
      text.append(title, meta);
      if (item.already && prefsApi.get().warnDuplicates) {
        const badge = document.createElement('span');
        badge.className = 'pick-already';
        badge.textContent = t('Ya lo tienes');
        badge.title = describeAlready(item.already);
        text.appendChild(badge);
      }
      label.append(box, img, text);
      li.appendChild(label);
      if (item.url) {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'queue-btn';
        c.innerHTML = ICONS.copy;
        c.title = t('Copiar el enlace');
        c.setAttribute('aria-label', c.title);
        c.addEventListener('click', () => copyLinks([item.url]));
        li.appendChild(c);
      }
      if (quick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'queue-btn primary';
        b.innerHTML = ICONS.save;
        b.title = t('Descargar ahora');
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', () => quick(item, i));
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
    onChange();
  };
  return {
    set(list, checked = false) { items = list.map((e) => ({ ...e, checked })); render(); },
    all(on) {
      if (on === undefined) return items.slice();
      items.forEach((i) => { i.checked = on; });
      render();
      return items;
    },
    selected: () => items.filter((i) => i.checked),
  };
}

// === Download "Más opciones": section range ===
/**
 * Two-handle range over a duration (download section, convert trim). Calls
 * onChange(startSec, endSec) while dragging; setValues() when typed.
 */
function createRange(el, onChange) {
  const sel = el.querySelector('.range-sel');
  const handles = { start: el.querySelector('[data-handle="start"]'), end: el.querySelector('[data-handle="end"]') };
  let duration = null;
  let a = 0; let b = 1;
  const draw = () => {
    handles.start.style.left = `${a * 100}%`;
    handles.end.style.left = `${b * 100}%`;
    sel.style.left = `${a * 100}%`;
    sel.style.width = `${(b - a) * 100}%`;
  };
  const fromEvent = (e) => {
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  for (const [key, h] of Object.entries(handles)) {
    h.addEventListener('pointerdown', (e) => {
      if (!duration) return;
      h.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const v = fromEvent(ev);
        if (key === 'start') a = Math.min(v, b - 0.005); else b = Math.max(v, a + 0.005);
        draw();
        onChange(a * duration, b * duration, key);
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', () => h.removeEventListener('pointermove', move), { once: true });
    });
    h.addEventListener('keydown', (e) => {
      if (!duration || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) / duration * (e.key === 'ArrowLeft' ? -1 : 1);
      if (key === 'start') a = Math.min(Math.max(0, a + step), b - 0.005); else b = Math.max(Math.min(1, b + step), a + 0.005);
      draw();
      onChange(a * duration, b * duration, key);
    });
  }
  draw();
  return {
    setDuration(d) { duration = d && d > 0 ? d : null; a = 0; b = 1; draw(); },
    setValues(start, end) {
      if (!duration) return;
      a = Math.min(Math.max(0, (start || 0) / duration), 0.995);
      b = end === null || end === undefined ? 1 : Math.min(1, Math.max(a + 0.005, end / duration));
      draw();
    },
    get duration() { return duration; },
    get fraction() { return [a, b]; },
  };
}

const dlRange = createRange($('dlRange'), (s, e) => {
  dlStart.value = s < 0.5 ? '' : formatTime(s);
  dlEnd.value = previewDuration && e > previewDuration - 0.5 ? '' : formatTime(e);
  refreshDlHint();
});
function syncDlRange() {
  $('dlRangeRow').classList.toggle('hidden', !previewDuration);
  dlRange.setValues(parseTime(dlStart.value), dlEnd.value.trim() ? parseTime(dlEnd.value) : null);
  refreshDlHint();
}
[dlStart, dlEnd].forEach((el) => el.addEventListener('input', syncDlRange));
optChapters.addEventListener('change', refreshDlHint);
/**
 * "≈ 12 MB" next to the button, from the formats yt-dlp reported for the
 * previewed link: the chosen audio bitrate × length, or the video stream at
 * the chosen height plus the audio. Only a guess, so only for one link.
 */
let previewSizes = null;
function refreshEstimate() {
  const el = $('dlEstimate');
  const secs = previewDuration;
  let bytes = null;
  if (previewSizes && secs && currentMode !== 'convert') {
    const s = parseTime(dlStart.value) || 0;
    const e = dlEnd.value.trim() ? parseTime(dlEnd.value) : secs;
    const part = Number.isFinite(s) && Number.isFinite(e) && e > s ? Math.min(1, (e - s) / secs) : 1;
    const audioBytes = () => {
      const kbps = { flac: 900, wav: 1411 }[audioFormat.value];
      return audioFormat.value === 'best' ? previewSizes.audio : (kbps || Number(audioBitrate.value) || 192) * secs * 125;
    };
    const videoBytes = () => {
      const heights = Object.keys(previewSizes.video || {}).map(Number).sort((a, b) => a - b);
      if (!heights.length) return null;
      const q = videoQuality.value === 'best' ? Infinity : Number(videoQuality.value);
      const h = [...heights].reverse().find((x) => x <= q) || heights[0];
      return previewSizes.video[h] + (previewSizes.audio || 0);
    };
    if (optBoth.checked) {
      const v = videoBytes();
      bytes = v ? v + (audioBytes() || 0) : null;
    } else {
      bytes = downloadMode === 'audio' ? audioBytes() : videoBytes();
    }
    if (bytes) bytes *= part;
  }
  el.classList.toggle('hidden', !bytes || optPlaylist.checked);
  el.textContent = bytes ? `≈ ${formatBytes(bytes)}` : '';
}

function refreshDlHint() {
  refreshEstimate();
  const parts = [];
  if (dlStart.value.trim() || dlEnd.value.trim()) parts.push(t('Solo se descargará el tramo {a}–{b}.', { a: dlStart.value.trim() || '0:00', b: dlEnd.value.trim() || t('final') }));
  if (optChapters.checked) parts.push(t('Se guardará un archivo por capítulo (si el vídeo tiene capítulos), juntos en una carpeta.'));
  $('dlMoreHint').textContent = parts.join(' ');
}

// === Descargar → Buscar ===
const searchPicker = createPickList($('searchList'), () => {
  const n = searchPicker.selected().length;
  $('btnSearchDownload').textContent = n ? t('Descargar {n} seleccionados', { n }) : t('Descargar seleccionados');
  $('btnSearchDownload').disabled = !n;
}, {
  quick: (item) => queueItems([item], $('searchStatus')),
});
function refreshSearchFormat() {
  $('searchFormat').textContent = t('Formato: {f}', { f: describeDownloadFormat() });
  refreshSearchSummary();
}
[audioFormat, audioBitrate, videoQuality, videoContainer, optBoth].forEach((el) => el.addEventListener('change', refreshSearchFormat));
$('searchCopy').addEventListener('click', () => {
  const sel = searchPicker.selected();
  copyLinks((sel.length ? sel : searchPicker.all()).map((i) => i.url));
});
$('searchThumbs').addEventListener('click', () => {
  const sel = searchPicker.selected();
  downloadThumbs(sel, $('searchStatus'));
});
$('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = $('searchInput').value.trim();
  if (!query) return;
  const btn = $('btnSearch');
  btn.disabled = true;
  $('searchHint').textContent = t('Buscando…');
  try {
    const { results } = await postJson('/api/search', { query });
    searchPicker.set(results);
    $('searchResults').classList.toggle('hidden', !results.length);
    $('searchCount').textContent = t('{n} resultados', { n: results.length });
    $('searchHint').textContent = results.length ? '' : t('No se encontró nada. Prueba con otras palabras.');
    refreshSearchFormat();
    $('searchStatus').textContent = '';
  } catch (err) {
    $('searchHint').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$('searchAll').addEventListener('click', () => searchPicker.all(true));
$('searchNone').addEventListener('click', () => searchPicker.all(false));
$('btnSearchDownload').addEventListener('click', async () => {
  const items = searchPicker.selected();
  if (items.length && await queueItems(items, $('searchStatus'))) searchPicker.all(false);
});

// === Descargar → Suscripciones ===
const INTERVAL_LABELS = { 1: 'cada hora', 3: 'cada 3 horas', 6: 'cada 6 horas', 12: 'cada 12 horas', 24: 'cada día' };
function refreshSubFormat() {
  $('subFormatNote').textContent = t('Lo nuevo se descargará como {f} (cámbialo con Audio/Vídeo arriba y en Descargar → Enlace).', { f: describeDownloadFormat() });
}
async function loadSubscriptions() {
  if (!desktopApi) return;
  try {
    const { subscriptions } = await api('/api/subscriptions');
    renderSubscriptions(subscriptions);
  } catch { /* server not ready */ }
}
function renderSubscriptions(list) {
  const ul = $('subsList');
  ul.innerHTML = '';
  $('subsEmpty').classList.toggle('hidden', list.length > 0);
  for (const sub of list) {
    const li = document.createElement('li');
    li.className = 'sub-item';
    const text = document.createElement('div');
    text.className = 'sub-text';
    const title = document.createElement('span');
    title.className = 'sub-title';
    title.textContent = sub.title;
    title.title = sub.url;
    const meta = document.createElement('span');
    meta.className = 'sub-meta';
    const last = sub.lastCheck ? t('revisado {when}', { when: timeAgo(sub.lastCheck) }) : '';
    meta.textContent = [ts(sub.detail), t(INTERVAL_LABELS[sub.interval] || ''), sub.checking ? t('comprobando…') : last, sub.lastError ? ts(sub.lastError) : ''].filter(Boolean).join(' · ');
    meta.classList.toggle('error', Boolean(sub.lastError));
    text.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'queue-actions';
    const toggle = document.createElement('label');
    toggle.className = 'switch mini';
    toggle.title = sub.enabled ? t('Activa') : t('En pausa');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = sub.enabled;
    box.addEventListener('change', () => api(`/api/subscriptions/${sub.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: box.checked }) }).then(loadSubscriptions));
    const ui = document.createElement('span');
    ui.className = 'switch-ui';
    toggle.append(box, ui);
    actions.appendChild(toggle);
    actions.appendChild(iconButton('retry', t('Comprobar ahora'), async () => {
      meta.textContent = t('comprobando…');
      try {
        const r = await api(`/api/subscriptions/${sub.id}/check`, { method: 'POST' });
        showToast(r.found ? t('{n} vídeos nuevos en la cola', { n: r.found }) : t('No hay nada nuevo'));
      } catch (err) { showToast(err.message); }
      loadSubscriptions();
    }));
    actions.appendChild(iconButton('remove', t('Dejar de seguir'), () => api(`/api/subscriptions/${sub.id}`, { method: 'DELETE' }).then(loadSubscriptions)));
    li.append(text, actions);
    ul.appendChild(li);
  }
}
$('btnSubscribe').addEventListener('click', async () => {
  const url = $('subUrl').value.trim();
  const status = $('subStatus');
  if (!url) { status.textContent = t('Pega el enlace de un canal o playlist.'); status.className = 'status-message error'; return; }
  const btn = $('btnSubscribe');
  btn.disabled = true;
  status.textContent = t('Leyendo el canal…');
  status.className = 'status-message';
  try {
    // A rule for this channel gives its profile's options.
    const ruled = profilesUi.profileForUrl(url);
    const sub = await postJson('/api/subscriptions', {
      url, options: ruled ? ruled.options : downloadOptions(), interval: Number($('subInterval').value), backfill: Number($('subBackfill').value),
      mirror: $('subMirror').checked,
    });
    status.textContent = t('Suscrito a {t}', { t: sub.title });
    status.className = 'status-message success';
    $('subUrl').value = '';
    loadSubscriptions();
  } catch (err) {
    status.textContent = err.message;
    status.className = 'status-message error';
  } finally {
    btn.disabled = false;
  }
});

// === Convertir → Formato: settings ===
function currentConvertOption() {
  return CONVERT_FORMAT_OPTIONS[currentConvertKind].find((opt) => opt.value === convertFormat.value)
    || CONVERT_FORMAT_OPTIONS[currentConvertKind][0];
}

function optionsHtml(list, labelKey = 'label', valueKey = 'value') {
  return list.map((o) => `<option value="${escapeHtml(o[valueKey])}">${escapeHtml(t(o[labelKey]))}</option>`).join('');
}

function renderConvertFormats() {
  convertFormat.innerHTML = optionsHtml(CONVERT_FORMAT_OPTIONS[currentConvertKind]);
  convertPreset.innerHTML = optionsHtml(PRESETS[currentConvertKind], 'label', 'id');
}

function refreshConvertUI() {
  const opt = currentConvertOption();
  const isAudio = currentConvertKind === 'audio';
  $('audioConvertSettings').classList.toggle('hidden', !isAudio);
  $('videoConvertSettings').classList.toggle('hidden', isAudio);
  convertBitrate.disabled = Boolean(opt.lossless);
  if (opt.lossless) convertBitrate.value = '';
  $('convertQualitySetting').classList.toggle('hidden', Boolean(opt.gif));
  $('convertRemoveAudioOption').classList.toggle('hidden', Boolean(opt.gif));

  if (opt.lossless) convertHint.textContent = t('Formato sin pérdida: la calidad en kbps no aplica.');
  else if (opt.gif) convertHint.textContent = t('El GIF no lleva sonido. Sin resolución elegida se limita a 480 px de ancho y 12 fps; recórtalo para que no pese demasiado.');
  else if (isAudio) convertHint.textContent = t('Si eliges un vídeo, se extrae solo su audio.');
  else convertHint.textContent = '';
  refreshButton();
}

function applyPreset(id) {
  const preset = PRESETS[currentConvertKind].find((p) => p.id === id);
  if (!preset || !preset.set) return;
  const s = preset.set;
  convertFormat.value = s.format;
  if (currentConvertKind === 'audio') {
    convertBitrate.value = s.bitrate;
    convertSampleRate.value = s.sampleRate;
    convertChannels.value = s.channels;
    convertNormalize.checked = s.normalize;
  } else {
    convertResolution.value = s.resolution;
    convertQuality.value = s.quality;
    convertFps.value = s.fps;
    convertRotate.value = '';
    convertRemoveAudio.checked = false;
  }
  refreshConvertUI();
}

convertPreset.addEventListener('change', () => applyPreset(convertPreset.value));
// Touching any individual setting means it's no longer the preset as-is.
[convertFormat, convertBitrate, convertSampleRate, convertChannels, convertNormalize, convertResolution, convertQuality, convertFps, convertRotate, convertRemoveAudio]
  .forEach((el) => el.addEventListener('change', () => { convertPreset.value = 'custom'; refreshConvertUI(); }));

$('convertKindToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.kind-btn');
  if (!btn || btn.classList.contains('active')) return;
  currentConvertKind = btn.dataset.kind;
  $('convertKindToggle').querySelectorAll('.kind-btn').forEach((b) => b.classList.toggle('active', b === btn));
  renderConvertFormats();
  refreshConvertUI();
});

// === File pickers (Formato, Unir, Comprimir, Imagen) ===
/** Wires a drop zone + hidden <input type=file>; onFiles(list) gets the chosen files. */
function fileZone(dropEl, inputEl, onFiles) {
  dropEl.addEventListener('dragover', (e) => { e.preventDefault(); dropEl.classList.add('dragover'); });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('dragover'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropEl.classList.remove('dragover');
    if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
  });
  inputEl.addEventListener('change', () => { if (inputEl.files.length) onFiles([...inputEl.files]); inputEl.value = ''; });
}

function renderFileList(listEl, textEl, files, emptyText, { single } = {}) {
  const total = files.reduce((acc, f) => acc + f.size, 0);
  textEl.textContent = !files.length ? t(emptyText)
    : files.length === 1 ? `${files[0].name} (${formatBytes(total)})`
      : t('{n} archivos ({size}) — haz clic para cambiar', { n: files.length, size: formatBytes(total) });
  listEl.innerHTML = files.length > 1 && !single
    ? files.map((f) => `<li><span>${escapeHtml(f.name)}</span><span>${formatBytes(f.size)}</span></li>`).join('')
    : '';
  listEl.classList.toggle('hidden', files.length < 2 || single);
}

fileZone($('fileDrop'), $('fileInput'), (files) => setFiles(files));
function setFiles(files) {
  selectedFiles = files.slice(0, 50);
  renderFileList($('fileList'), $('fileDropText'), selectedFiles, 'Arrastra archivos aquí');
  clearStatus();
  refreshButton();
  setupTrimPanel(selectedFiles.length === 1 ? selectedFiles[0] : null);
}

// Drop anywhere in the window: files go to the current converter (or
// Convertir → Formato), links to Descargar. Also stops a stray drop from
// navigating the window to the file.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = [...(e.dataTransfer.files || [])];
  if (files.length) {
    if (currentView === 'cv-merge') return addMergeFiles(files);
    if (currentView === 'cv-compress') return setCompressFiles(files);
    if (currentView === 'cv-image') return setImageFiles(files);
    if (currentView === 'cv-edit') return editor.load(files[0]);
    if (currentView === 'cv-tags') return tagEditor.load(files);
    setView('cv-format');
    setFiles(files);
    return;
  }
  const urls = parseUrls(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'));
  if (urls.length) {
    setView('dl-link');
    urlInput.value = urls.join('\n');
    autoGrow();
    updateUrlState();
  }
});

// Ctrl+1 Descargar · Ctrl+2 Convertir · Ctrl+3 Cola · Ctrl+4 Historial · Ctrl+, Ajustes.
const SHORTCUT_VIEWS = { 1: 'dl-link', 2: 'cv-format', 3: 'queue', 4: 'history', 5: 'library', ',': 'set-appearance' };
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
  const view = SHORTCUT_VIEWS[e.key];
  if (!view) return;
  e.preventDefault();
  setView(view);
});

// === Trim preview with waveform (single file in Convertir → Formato) ===
const trimRange = createRange($('trimRange'), (s, e, which) => {
  convertTrimStart.value = s < 0.05 ? '' : formatTime(s, true);
  convertTrimEnd.value = trimRange.duration && e > trimRange.duration - 0.05 ? '' : formatTime(e, true);
  convertPreset.value = 'custom';
  updateTrimLabel();
  if (trimMedia && which) trimMedia.currentTime = which === 'start' ? s : Math.max(0, e - 2);
});
let trimMedia = null;
let trimUrl = null;
let trimStopAt = null;
const MAX_WAVE_BYTES = 200 * 1024 * 1024;

function setupTrimPanel(file) {
  const panel = $('trimPanel');
  if (trimUrl) URL.revokeObjectURL(trimUrl);
  trimUrl = null;
  trimMedia = null;
  $('trimMediaWrap').innerHTML = '';
  trimRange.setDuration(null);
  panel.classList.add('hidden');
  if (!file) return;
  trimUrl = URL.createObjectURL(file);
  const isVideo = /^video\//.test(file.type) || /\.(mp4|m4v|webm|mov|mkv|ogv)$/i.test(file.name);
  const media = document.createElement(isVideo ? 'video' : 'audio');
  media.preload = 'metadata';
  media.src = trimUrl;
  media.className = 'trim-player';
  media.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(media.duration) || media.duration <= 0) return;
    trimMedia = media;
    trimRange.setDuration(media.duration);
    trimRange.setValues(parseTime(convertTrimStart.value), convertTrimEnd.value.trim() ? parseTime(convertTrimEnd.value) : null);
    panel.classList.remove('hidden');
    updateTrimLabel();
    if (!isVideo) media.classList.add('hidden');
  });
  media.addEventListener('timeupdate', () => {
    const d = trimRange.duration;
    if (d) $('trimRange').style.setProperty('--play', `${(media.currentTime / d) * 100}%`);
    if (trimStopAt !== null && media.currentTime >= trimStopAt) { media.pause(); trimStopAt = null; }
  });
  // Unsupported by the browser (e.g. WMV/AVI): no preview, conversion still works.
  media.addEventListener('error', () => panel.classList.add('hidden'));
  $('trimMediaWrap').appendChild(media);
  drawWaveform(file);
}

async function drawWaveform(file) {
  const canvas = $('trimWave');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (file.size > MAX_WAVE_BYTES) return;
  try {
    const buffer = await file.arrayBuffer();
    audioCtx = audioCtx || new AudioContext();
    const audio = await audioCtx.decodeAudioData(buffer);
    if (selectedFiles[0] !== file) return;
    const width = canvas.clientWidth * devicePixelRatio;
    const height = canvas.clientHeight * devicePixelRatio;
    canvas.width = width;
    canvas.height = height;
    const data = audio.getChannelData(0);
    const bars = Math.floor(width / (3 * devicePixelRatio));
    const step = Math.floor(data.length / bars) || 1;
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#0a84ff';
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      for (let j = i * step, end = Math.min(data.length, (i + 1) * step); j < end; j += 16) peak = Math.max(peak, Math.abs(data[j]));
      const h = Math.max(1, peak * height * 0.9);
      ctx.fillRect(i * 3 * devicePixelRatio, (height - h) / 2, 2 * devicePixelRatio, h);
    }
  } catch { /* can't decode here (e.g. MKV): the handles still work */ }
}

function updateTrimLabel() {
  const d = trimRange.duration;
  if (!d) return;
  const [a, b] = trimRange.fraction;
  $('trimLabel').textContent = t('{a} → {b} · {len}', { a: formatTime(a * d, true), b: formatTime(b * d, true), len: formatDuration(Math.round((b - a) * d)) || '0:00' });
}
[convertTrimStart, convertTrimEnd].forEach((el) => el.addEventListener('input', () => {
  trimRange.setValues(parseTime(convertTrimStart.value), convertTrimEnd.value.trim() ? parseTime(convertTrimEnd.value) : null);
  updateTrimLabel();
}));
$('btnTrimPlay').addEventListener('click', () => {
  if (!trimMedia) return;
  const d = trimRange.duration;
  const [a, b] = trimRange.fraction;
  if (!trimMedia.paused) { trimMedia.pause(); trimStopAt = null; return; }
  trimMedia.currentTime = a * d;
  trimStopAt = b * d;
  trimMedia.play().catch(() => {});
});
$('btnTrimReset').addEventListener('click', () => {
  convertTrimStart.value = '';
  convertTrimEnd.value = '';
  trimRange.setValues(0, null);
  updateTrimLabel();
});

// === Submit (Enlace / Formato) ===
btnDownload.addEventListener('click', handleSubmit);

async function handleSubmit() {
  if (busy) return;
  if (currentMode === 'convert') return submitConvert();
  return submitDownload();
}

async function submitDownload() {
  const urls = parseUrls(urlInput.value);
  if (!urls.length) {
    showStatus(t('Pega al menos un enlace'), 'error');
    shakeInput();
    return;
  }
  // A Spotify / Apple Music list: the picked songs, looked for on YouTube.
  if (urls.length === 1 && isImportUrl(urls[0])) {
    const picked = playlistPicker.selected();
    if (!picked.length) { showStatus(t('Espera a que se lea la lista y elige alguna canción.'), 'error'); return; }
    return queueItems(picked, statusMessage);
  }
  // A playlist link with its picker open downloads the picked videos.
  if (urls.length === 1 && isPlaylistUrl(urls[0]) && playlistPicker.selected().length && !optPlaylist.checked) {
    return queueItems(playlistPicker.selected(), statusMessage);
  }
  let wanted = urls;
  if (!optPlaylist.checked) {
    const known = urls.length === 1 && lastPreview && lastPreview.url === urls[0] && lastPreview.already ? { [urls[0]]: lastPreview.already } : {};
    wanted = await skipAlready(urls, known);
    if (!wanted) return;
    if (!wanted.length) { showStatus(t('Nada nuevo que descargar.'), 'success'); return; }
  }
  const live = optLive.checked && !$('optLiveWrap').classList.contains('hidden');
  setBusy(true, optPlaylist.checked ? t('Leyendo playlist…') : t('Añadiendo…'));
  try {
    const extra = {
      urls: wanted,
      live,
      playlist: optPlaylist.checked,
      chapters: optChapters.checked,
      priority: $('dlPriority').value,
      sectionStart: dlStart.value.trim(),
      sectionEnd: dlEnd.value.trim(),
    };
    const data = await postJson('/api/jobs/download', { ...downloadOptions(), ...extra });
    // "Audio and video at once": the other kind too, with its own format.
    if (optBoth.checked) {
      const second = await postJson('/api/jobs/download', { ...downloadOptions(downloadMode === 'audio' ? 'video' : 'audio'), ...extra });
      data.created += second.created;
    }
    const skipped = data.rejected && data.rejected.length ? ` · ${t('{n} enlace(s) no soportado(s)', { n: data.rejected.length })}` : '';
    showStatus(`${data.created === 1 ? t('Añadido a la cola') : t('{n} añadidos a la cola', { n: data.created })}${skipped}`, 'success');
    urlInput.value = '';
    dlStart.value = '';
    dlEnd.value = '';
    autoGrow();
    updateUrlState();
    refreshDlHint();
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

function uploadTo(path, fileField, files, fields, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    files.forEach((f) => form.append(fileField, f));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.setRequestHeader('x-client-id', CLIENT_ID);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(ts((data && data.error) || `Error ${xhr.status}`)));
    };
    xhr.onerror = () => reject(new Error(t('No se pudo subir el archivo.')));
    xhr.send(form);
  });
}

/** Uploads files one by one to `path` (one job each), reporting on `button`/`status`. */
async function uploadEach(path, files, fields, { button, labelEl, statusEl }) {
  const original = labelEl.textContent;
  button.disabled = true;
  let ok = 0;
  const failures = [];
  for (let i = 0; i < files.length; i++) {
    const prefix = files.length > 1 ? `${i + 1}/${files.length} · ` : '';
    try {
      await uploadTo(path, 'file', [files[i]], fields, (pct) => { labelEl.textContent = `${t('Subiendo')} ${prefix}${pct}%`; });
      ok += 1;
    } catch (err) {
      failures.push(`${files[i].name}: ${err.message}`);
    }
  }
  button.disabled = false;
  labelEl.textContent = original;
  if (failures.length) setStatusEl(statusEl, t('{ok} en cola · {n} con error — {first}', { ok, n: failures.length, first: failures[0] }), 'error');
  else setStatusEl(statusEl, ok === 1 ? t('Añadido a la cola') : t('{n} añadidos a la cola', { n: ok }), 'success');
  return ok;
}

async function submitConvert() {
  if (!selectedFiles.length) {
    showStatus(t('Elige uno o varios archivos primero'), 'error');
    return;
  }
  const opt = currentConvertOption();
  const fields = {
    targetFormat: opt.value,
    trimStart: convertTrimStart.value.trim(),
    trimEnd: convertTrimEnd.value.trim(),
    speed: convertSpeed.value,
    voice: $('convertVoice').value,
  };
  if (currentConvertKind === 'audio') {
    Object.assign(fields, {
      audioBitrate: convertBitrate.value, sampleRate: convertSampleRate.value,
      channels: convertChannels.value, normalize: String(convertNormalize.checked),
    });
  } else {
    Object.assign(fields, {
      resolution: convertResolution.value, quality: convertQuality.value, fps: convertFps.value,
      rotate: convertRotate.value, removeAudio: String(convertRemoveAudio.checked),
    });
  }
  setBusy(true, t('Subiendo…'));
  await uploadEach('/api/jobs/convert', selectedFiles.slice(), fields, { button: btnDownload, labelEl: btnLoadingText, statusEl: statusMessage });
  setBusy(false);
}

// === Convertir → Unir ===
let mergeFiles = [];
let mergeKind = 'audio';
fileZone($('mergeDrop'), $('mergeInput'), (files) => addMergeFiles(files));
function addMergeFiles(files) {
  mergeFiles = [...mergeFiles, ...files].slice(0, 50);
  // Guess the result type from what was added.
  if (files.some((f) => /^video\//.test(f.type))) setMergeKind('video');
  renderMerge();
}
function renderMerge() {
  const ul = $('mergeList');
  ul.innerHTML = '';
  ul.classList.toggle('hidden', !mergeFiles.length);
  $('mergeDropText').textContent = mergeFiles.length ? t('{n} archivos · añade más aquí', { n: mergeFiles.length }) : t('Arrastra los archivos que quieres unir');
  mergeFiles.forEach((f, i) => {
    const li = document.createElement('li');
    li.className = 'order-item';
    const num = document.createElement('span');
    num.className = 'order-num';
    num.textContent = String(i + 1);
    const name = document.createElement('span');
    name.className = 'order-name';
    name.textContent = f.name;
    const size = document.createElement('span');
    size.className = 'order-size';
    size.textContent = formatBytes(f.size);
    const actions = document.createElement('div');
    actions.className = 'queue-actions';
    const swap = (j) => { [mergeFiles[i], mergeFiles[j]] = [mergeFiles[j], mergeFiles[i]]; renderMerge(); };
    if (i > 0) actions.appendChild(iconButton('up', t('Subir'), () => swap(i - 1)));
    if (i < mergeFiles.length - 1) actions.appendChild(iconButton('down', t('Bajar'), () => swap(i + 1)));
    actions.appendChild(iconButton('remove', t('Quitar'), () => { mergeFiles.splice(i, 1); renderMerge(); }));
    li.append(num, name, size, actions);
    ul.appendChild(li);
  });
  $('btnMerge').textContent = mergeFiles.length > 1 ? t('Unir {n} archivos', { n: mergeFiles.length }) : t('Unir');
}
function setMergeKind(kind) {
  mergeKind = kind;
  $('mergeKind').querySelectorAll('.kind-btn').forEach((b) => b.classList.toggle('active', b.dataset.kind === kind));
  $('mergeFormat').innerHTML = optionsHtml(CONVERT_FORMAT_OPTIONS[kind].filter((o) => !o.gif));
  $('mergeBitrateRow').classList.toggle('hidden', kind !== 'audio');
  $('mergeResolutionRow').classList.toggle('hidden', kind !== 'video');
}
$('mergeKind').addEventListener('click', (e) => {
  const b = e.target.closest('.kind-btn');
  if (b) setMergeKind(b.dataset.kind);
});
$('btnMerge').addEventListener('click', async () => {
  const status = $('mergeStatus');
  if (mergeFiles.length < 2) { setStatusEl(status, t('Elige al menos dos archivos para unir.'), 'error'); return; }
  const btn = $('btnMerge');
  const label = btn.textContent;
  btn.disabled = true;
  try {
    await uploadTo('/api/jobs/merge', 'files', mergeFiles, {
      targetFormat: $('mergeFormat').value, audioBitrate: $('mergeBitrate').value, resolution: $('mergeResolution').value,
    }, (pct) => { btn.textContent = `${t('Subiendo')} ${pct}%`; });
    setStatusEl(status, t('Añadido a la cola'), 'success');
    mergeFiles = [];
    renderMerge();
  } catch (err) {
    setStatusEl(status, err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = mergeFiles.length > 1 ? label : t('Unir');
  }
});

// === Convertir → Comprimir ===
let compressFiles = [];
let compressMb = 25;
fileZone($('compressDrop'), $('compressInput'), (files) => setCompressFiles(files));
function setCompressFiles(files) {
  compressFiles = files.slice(0, 50);
  renderFileList($('compressList'), $('compressDropText'), compressFiles, 'Arrastra los vídeos o audios que quieres que pesen menos');
  refreshCompressButton();
}
function refreshCompressButton() {
  const mb = String(compressTarget() || '—').replace('.', ',');
  $('btnCompress').textContent = compressFiles.length > 1
    ? t('Comprimir {n} archivos a {mb} MB', { n: compressFiles.length, mb })
    : t('Comprimir a {mb} MB', { mb });
}
function compressTarget() {
  const custom = Number($('compressCustom').value.replace(',', '.'));
  return $('compressCustom').value.trim() ? (Number.isFinite(custom) && custom >= 1 ? custom : null) : compressMb;
}
$('compressChips').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  compressMb = Number(chip.dataset.mb);
  $('compressCustom').value = '';
  $('compressChips').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
  refreshCompressButton();
});
$('compressCustom').addEventListener('input', () => {
  $('compressChips').querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', !$('compressCustom').value.trim() && Number(c.dataset.mb) === compressMb));
  refreshCompressButton();
});
$('btnCompress').addEventListener('click', async () => {
  const status = $('compressStatus');
  const target = compressTarget();
  if (!compressFiles.length) { setStatusEl(status, t('Elige uno o varios archivos primero'), 'error'); return; }
  if (!target) { setStatusEl(status, t('Indica un tamaño entre 1 y 4000 MB.'), 'error'); return; }
  const ok = await uploadEach('/api/jobs/compress', compressFiles, { targetMb: String(target) }, { button: $('btnCompress'), labelEl: $('btnCompress'), statusEl: status });
  if (ok) setCompressFiles([]);
});

// === Convertir → Imagen ===
let imageFiles = [];
let imageMode = 'frame';
let frameUrl = null;
fileZone($('imageDrop'), $('imageInput'), (files) => setImageFiles(files));
function setImageFiles(files) {
  imageFiles = files.slice(0, 50);
  renderFileList($('imageList'), $('imageDropText'), imageFiles, 'Arrastra un vídeo o una canción');
  // One video: pick the exact frame with a slider.
  if (frameUrl) URL.revokeObjectURL(frameUrl);
  frameUrl = null;
  const video = $('frameVideo');
  const single = imageFiles.length === 1 && (/^video\//.test(imageFiles[0].type) || /\.(mp4|m4v|webm|mov|mkv)$/i.test(imageFiles[0].name));
  $('framePreview').classList.add('hidden');
  if (single) {
    frameUrl = URL.createObjectURL(imageFiles[0]);
    video.src = frameUrl;
  } else {
    video.removeAttribute('src');
  }
  refreshImageUI();
}
$('frameVideo').addEventListener('loadedmetadata', () => {
  const video = $('frameVideo');
  if (!Number.isFinite(video.duration)) return;
  $('frameSlider').max = String(video.duration);
  $('frameSlider').value = String(Math.min(video.duration, parseTime($('imageTime').value) || 0));
  video.currentTime = Number($('frameSlider').value);
  $('framePreview').classList.toggle('hidden', imageMode !== 'frame');
});
$('frameVideo').addEventListener('error', () => $('framePreview').classList.add('hidden'));
$('frameSlider').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  $('frameVideo').currentTime = v;
  $('imageTime').value = formatTime(v, true);
});
$('imageTime').addEventListener('input', () => {
  const v = parseTime($('imageTime').value);
  if (v !== null && Number.isFinite(v)) { $('frameSlider').value = String(v); $('frameVideo').currentTime = v; }
});
function refreshImageUI() {
  $('imageMode').querySelectorAll('.kind-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === imageMode));
  $('imageTimeRow').classList.toggle('hidden', imageMode !== 'frame');
  $('framePreview').classList.toggle('hidden', imageMode !== 'frame' || !frameUrl || !$('frameVideo').duration);
  $('btnImage').textContent = imageFiles.length > 1 ? t('Extraer {n} imágenes', { n: imageFiles.length }) : t('Extraer imagen');
}
$('imageMode').addEventListener('click', (e) => {
  const b = e.target.closest('.kind-btn');
  if (!b) return;
  imageMode = b.dataset.mode;
  refreshImageUI();
});
$('btnImage').addEventListener('click', async () => {
  const status = $('imageStatus');
  if (!imageFiles.length) { setStatusEl(status, t('Elige uno o varios archivos primero'), 'error'); return; }
  await uploadEach('/api/jobs/image', imageFiles, { targetFormat: $('imageFormat').value, imageMode, time: $('imageTime').value.trim() },
    { button: $('btnImage'), labelEl: $('btnImage'), statusEl: status });
  refreshImageUI();
});

// === Convertir → Editor (timeline: cuts, in/out, remove parts) ===
// The file is edited as a list of consecutive parts covering it; each one is
// kept or removed. Export sends only the kept [start, end] pairs.
const editor = (() => {
  const video = $('edVideo');
  const canvas = $('edCanvas');
  const timeline = $('edTimeline');
  const spacer = $('edSpacer');
  const thumbVideo = document.createElement('video');
  thumbVideo.muted = true;
  thumbVideo.preload = 'auto';

  // Same heights as the track labels next to the timeline (style.css).
  const RULER = 26;
  const VTRACK = 70;
  const ATRACK = 52;
  const FRAME = 1 / 30;
  const MAX_PPS = 400;           // most zoomed in: pixels per second
  const EDGE_PX = 6;             // how close to a cut line grabs it

  let file = null;
  let url = null;
  let duration = 0;
  let hasVideo = false;
  let segs = [];                 // [{ s, e, off }]
  let sel = 0;
  let zoom = 1;
  let peaks = null;              // Float32Array of per-bucket peaks
  let peaksPerSec = 0;
  let undoStack = [];
  let redoStack = [];
  let mode = 'exact';
  let drag = null;               // { kind: 'scrub' } | { kind: 'cut', i }
  let raf = 0;
  let colors = null;
  let snap = true;
  const SNAP_PX = 8;

  const thumbs = new Map();      // time key → canvas
  let thumbQueue = [];
  let thumbBusy = false;
  let thumbAspect = 16 / 9;

  // ---- time helpers ----
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function tc(sec) {
    const s = Math.max(0, sec || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${r.toFixed(2).padStart(5, '0')}`;
  }
  const fitPps = () => (duration ? Math.max(1e-6, timeline.clientWidth / duration) : 1);
  const pps = () => fitPps() * zoom;
  const maxZoom = () => Math.max(1, MAX_PPS / fitPps());
  const xOf = (sec) => sec * pps() - timeline.scrollLeft;
  const timeAt = (clientX) => {
    const r = timeline.getBoundingClientRect();
    return clamp((clientX - r.left + timeline.scrollLeft) / pps(), 0, duration);
  };
  const segAt = (sec) => {
    const i = segs.findIndex((g) => sec >= g.s && sec < g.e);
    return i === -1 ? Math.max(0, segs.length - 1) : i;
  };
  const kept = () => segs.filter((g) => !g.off);
  const keptLength = () => kept().reduce((acc, g) => acc + (g.e - g.s) / (g.speed || 1), 0);
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
  const now = () => video.currentTime || 0;
  const cutTimes = () => segs.slice(0, -1).map((g) => g.e);
  /** With the magnet on, `sec` sticks to a cut, the start or the end when close on screen. */
  function snapTime(sec, targets = [0, duration, ...cutTimes()]) {
    if (!snap) return sec;
    let best = sec;
    let bestPx = SNAP_PX;
    for (const target of targets) {
      const px = Math.abs(target - sec) * pps();
      if (px < bestPx) { best = target; bestPx = px; }
    }
    return best;
  }

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
    colors = {
      accent: v('--accent', '#0a84ff'), text: v('--text', '#fff'), text2: v('--text-2', '#999'),
      hair: v('--hairline', 'rgba(128,128,128,.3)'), red: v('--red', '#ff453a'), inset: v('--inset', 'rgba(128,128,128,.12)'),
      font: getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif',
    };
  }

  // ---- history ----
  const snapshot = () => JSON.stringify(segs);
  function commit() {
    undoStack.push(snapshot());
    if (undoStack.length > 200) undoStack.shift();
    redoStack = [];
  }
  function restore(json) { segs = JSON.parse(json); sel = clamp(sel, 0, segs.length - 1); changed(); }
  function undo() { if (undoStack.length) { redoStack.push(snapshot()); restore(undoStack.pop()); } }
  function redo() { if (redoStack.length) { undoStack.push(snapshot()); restore(redoStack.pop()); } }

  // ---- edits ----
  /** Splits the part under `sec` in two; returns false if too close to a cut. */
  function splitAt(sec) {
    const i = segs.findIndex((g) => sec > g.s + 0.02 && sec < g.e - 0.02);
    if (i === -1) return false;
    const g = segs[i];
    segs.splice(i, 1, { s: g.s, e: sec, off: g.off, speed: g.speed || 1 }, { s: sec, e: g.e, off: g.off, speed: g.speed || 1 });
    return true;
  }
  function cut() {
    commit();
    if (!splitAt(now())) { undoStack.pop(); return; }
    sel = segAt(now());
    changed();
  }
  function markIn() {
    const at = now();
    commit();
    splitAt(at);
    segs.forEach((g) => { if (g.e <= at + 1e-6) g.off = true; });
    sel = segAt(at);
    changed();
  }
  function markOut() {
    const at = now();
    commit();
    splitAt(at);
    segs.forEach((g) => { if (g.s >= at - 1e-6) g.off = true; });
    sel = segAt(Math.max(0, at - 0.01));
    changed();
  }
  function toggleSel() {
    if (!segs[sel]) return;
    commit();
    segs[sel].off = !segs[sel].off;
    changed();
  }
  /** keep = true: only [a, b] stays; false: [a, b] goes. */
  function applyRange(a, b, keep) {
    commit();
    splitAt(a);
    splitAt(b);
    segs.forEach((g) => {
      const inside = g.s >= a - 1e-6 && g.e <= b + 1e-6;
      if (keep) g.off = !inside; else if (inside) g.off = true;
    });
    sel = segAt(a);
    seek(keep ? a : b);
    changed();
  }
  function reset() {
    commit();
    segs = [{ s: 0, e: duration, off: false, speed: 1 }];
    sel = 0;
    changed();
  }

  // ---- playback ----
  function seek(sec) {
    video.currentTime = clamp(sec, 0, duration);
    draw();
    updateTime();
  }
  function togglePlay() {
    if (!duration) return;
    if (!video.paused) { video.pause(); return; }
    // "Ver resultado": start from a kept part, and from the top when at the end.
    if ($('edSkip').checked) {
      const k = kept();
      if (!k.length) return;
      const at = now();
      if (at >= k[k.length - 1].e - 0.05) video.currentTime = k[0].s;
    } else if (now() >= duration - 0.05) {
      video.currentTime = 0;
    }
    video.play().catch(() => {});
  }
  function tick() {
    raf = 0;
    const cur = segs[segAt(now())];
    const rate = cur && cur.speed ? cur.speed : 1;
    if (video.playbackRate !== rate) video.playbackRate = rate;
    if (!video.paused && $('edSkip').checked) {
      const at = now();
      const g = segs[segAt(at)];
      if (g && g.off) {
        const next = segs.find((x) => !x.off && x.s >= g.e - 1e-6);
        if (next) video.currentTime = next.s; else { video.pause(); video.currentTime = g.s; }
      }
    }
    // Keep the playhead in sight while playing (page by page, like an NLE).
    if (!video.paused && !drag) {
      const x = xOf(now());
      if (x > timeline.clientWidth - 20 || x < 0) timeline.scrollLeft = Math.max(0, now() * pps() - 40);
    }
    updateTime();
    draw();
    if (reframeMode && reframePts.length > 1) updatePreview();
    if (!video.paused) raf = requestAnimationFrame(tick);
  }
  video.addEventListener('play', () => { $('edPlay').classList.add('playing'); if (!raf) raf = requestAnimationFrame(tick); });
  video.addEventListener('pause', () => { $('edPlay').classList.remove('playing'); draw(); updateTime(); });
  video.addEventListener('seeked', () => { draw(); updateTime(); if (reframeMode) updatePreview(); });

  function updateTime() {
    $('edTime').textContent = tc(now());
    if (texts.length) updateOverlay();
    const g = segs[sel];
    $('edToggleLabel').textContent = g && g.off ? t('Recuperar tramo') : t('Quitar tramo');
  }

  // ---- drawing ----
  function sizeCanvas() {
    const h = RULER + (hasVideo ? VTRACK : 0) + ATRACK;
    const w = timeline.clientWidth;
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * devicePixelRatio);
    canvas.height = Math.round(h * devicePixelRatio);
    spacer.style.width = `${Math.max(w, duration * pps())}px`;
  }

  function niceStep(minSec) {
    const steps = [FRAME * 5, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
    return steps.find((s) => s >= minSec) || 7200;
  }

  function draw() {
    if (!duration) return;
    if (!colors) readColors();
    const dpr = devicePixelRatio;
    const ctx = canvas.getContext('2d');
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const p = pps();
    const t0 = timeline.scrollLeft / p;
    const t1 = t0 + W / p;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `500 11px ${colors.font}`;
    ctx.textBaseline = 'middle';

    // Ruler
    const step = niceStep(70 / p);
    ctx.fillStyle = colors.text2;
    ctx.strokeStyle = colors.hair;
    ctx.beginPath();
    for (let s = Math.floor(t0 / step) * step; s <= t1; s += step) {
      const x = Math.round(s * p - timeline.scrollLeft) + 0.5;
      ctx.moveTo(x, RULER - 9); ctx.lineTo(x, RULER);
      const label = step < 1 ? tc(s).replace(/^0:/, '') : formatDuration(Math.round(s)) || '0:00';
      ctx.fillText(label, x + 4, 9);
      const minor = step / 5;
      for (let k = 1; k < 5; k++) { const mx = Math.round((s + k * minor) * p - timeline.scrollLeft) + 0.5; ctx.moveTo(mx, RULER - 3); ctx.lineTo(mx, RULER); }
    }
    ctx.stroke();

    const vy = RULER;
    const ay = RULER + (hasVideo ? VTRACK : 0);

    // Video track: thumbnails
    if (hasVideo) {
      const tileW = Math.max(40, Math.round(VTRACK * thumbAspect));
      const tileSec = tileW / p;
      const first = Math.floor(t0 / tileSec);
      const last = Math.ceil(t1 / tileSec);
      const wanted = [];
      for (let k = first; k <= last; k++) {
        const x = k * tileW - timeline.scrollLeft;
        const at = clamp((k + 0.5) * tileSec, 0, duration - 0.01);
        const key = at.toFixed(1);
        const img = thumbs.get(key);
        ctx.fillStyle = colors.inset;
        ctx.fillRect(x, vy + 2, tileW - 1, VTRACK - 4);
        if (img) ctx.drawImage(img, x, vy + 2, tileW - 1, VTRACK - 4);
        else wanted.push(at);
      }
      if (wanted.length) requestThumbs(wanted);
    }

    // Audio track: waveform
    ctx.fillStyle = colors.inset;
    ctx.fillRect(0, ay + 2, W, ATRACK - 4);
    if (peaks) {
      ctx.fillStyle = colors.accent;
      const mid = ay + ATRACK / 2;
      for (let x = 0; x < W; x++) {
        const a = Math.floor((t0 + x / p) * peaksPerSec);
        const b = Math.max(a + 1, Math.floor((t0 + (x + 1) / p) * peaksPerSec));
        let peak = 0;
        for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > peak) peak = peaks[i];
        const h = Math.max(1, peak * (ATRACK - 8));
        ctx.fillRect(x, mid - h / 2, 1, h);
      }
    }

    // Parts: removed ones dimmed and striped, the selected one outlined.
    segs.forEach((g, i) => {
      const x0 = g.s * p - timeline.scrollLeft;
      const x1 = g.e * p - timeline.scrollLeft;
      if (x1 < 0 || x0 > W) return;
      if (g.off) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(x0, RULER, x1 - x0, H - RULER);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, RULER, x1 - x0, H - RULER);
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let sx = x0 - H; sx < x1; sx += 16) { ctx.moveTo(sx, H); ctx.lineTo(sx + H, RULER); }
        ctx.stroke();
        ctx.restore();
      }
      if ((g.speed || 1) !== 1 && x1 - x0 > 26) {
        const label = `${String(g.speed).replace('.', ',')}×`;
        ctx.font = `600 11px ${colors.font}`;
        const tw = ctx.measureText(label).width + 10;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(Math.max(x0, 0) + 4, RULER + 4, tw, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, Math.max(x0, 0) + 9, RULER + 12);
        ctx.font = `500 11px ${colors.font}`;
      }
      if (i === sel) {
        ctx.strokeStyle = g.off ? colors.text2 : colors.accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(Math.max(x0, -2) + 1, RULER + 1, Math.min(x1, W + 2) - Math.max(x0, -2) - 2, H - RULER - 2);
      }
      // Cut line (between this part and the next)
      if (i < segs.length - 1) {
        ctx.fillStyle = colors.text;
        ctx.fillRect(Math.round(x1) - 1, RULER, 2, H - RULER);
        ctx.beginPath();
        ctx.moveTo(x1 - 5, RULER); ctx.lineTo(x1 + 5, RULER); ctx.lineTo(x1, RULER + 6); ctx.closePath();
        ctx.fill();
      }
    });

    // Playhead (red, like most editors)
    const px = Math.round(xOf(now())) + 0.5;
    ctx.strokeStyle = colors.red;
    ctx.fillStyle = colors.red;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 6, 0); ctx.lineTo(px + 6, 0); ctx.lineTo(px + 6, 6); ctx.lineTo(px, 12); ctx.lineTo(px - 6, 6); ctx.closePath(); ctx.fill();
  }

  // ---- thumbnails (a second, hidden <video> seeks and paints each one) ----
  function requestThumbs(times) {
    thumbQueue = times;
    if (!thumbBusy) nextThumb();
  }
  function nextThumb() {
    const at = thumbQueue.shift();
    if (at === undefined || !thumbVideo.src || !thumbVideo.videoWidth) { thumbBusy = false; return; }
    const key = at.toFixed(1);
    if (thumbs.has(key)) { nextThumb(); return; }
    thumbBusy = true;
    const done = () => {
      thumbVideo.removeEventListener('seeked', done);
      const c = document.createElement('canvas');
      c.height = 72;
      c.width = Math.round(72 * thumbAspect);
      try { c.getContext('2d').drawImage(thumbVideo, 0, 0, c.width, c.height); } catch { /* ignore */ }
      thumbs.set(key, c);
      if (thumbs.size > 600) thumbs.delete(thumbs.keys().next().value);
      draw();
      nextThumb();
    };
    thumbVideo.addEventListener('seeked', done);
    // Seeking to where it already is fires no 'seeked'.
    thumbVideo.currentTime = Math.abs(thumbVideo.currentTime - at) < 0.001 ? at + 0.001 : at;
  }

  // ---- waveform ----
  async function loadPeaks(f) {
    peaks = null;
    if (f.size > MAX_WAVE_BYTES) return;
    try {
      const buffer = await f.arrayBuffer();
      audioCtx = audioCtx || new AudioContext();
      const audio = await audioCtx.decodeAudioData(buffer);
      if (file !== f) return;
      const data = audio.getChannelData(0);
      peaksPerSec = Math.min(200, 400000 / Math.max(1, audio.duration));
      const bucket = Math.max(1, Math.floor(audio.sampleRate / peaksPerSec));
      peaksPerSec = audio.sampleRate / bucket;
      const out = new Float32Array(Math.ceil(data.length / bucket));
      let max = 0;
      for (let i = 0; i < out.length; i++) {
        let pk = 0;
        for (let j = i * bucket, end = Math.min(data.length, (i + 1) * bucket); j < end; j += 4) { const v = Math.abs(data[j]); if (v > pk) pk = v; }
        out[i] = pk;
        if (pk > max) max = pk;
      }
      if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max;
      peaks = out;
      draw();
    } catch { /* can't decode here (e.g. some MKV): the editor still works */ }
  }

  // ---- load a file ----
  function load(f) {
    stop();
    file = f || null;
    $('editDropText').textContent = file
      ? `${file.name} (${formatBytes(file.size)}) · ${t('Cambiar archivo')}`
      : t('Arrastra un vídeo o un audio para editarlo');
    $('editDrop').classList.toggle('loaded', Boolean(file));
    $('editor').classList.add('hidden');
    setStatusEl($('editStatus'), '', '');
    setStatusEl($('editLoadStatus'), '', '');
    if (!file) return;
    url = URL.createObjectURL(file);
    video.src = url;
    thumbVideo.src = url;
    reframePts = [];
    reframeMode = '';
    $('edReframe').value = '';
    $('edAudioName').textContent = file.name;
    loadPeaks(file);
  }
  function stop() {
    video.pause();
    if (url) URL.revokeObjectURL(url);
    url = null;
    video.removeAttribute('src');
    thumbVideo.removeAttribute('src');
    thumbs.clear();
    thumbQueue = [];
    thumbBusy = false;
    peaks = null;
    duration = 0;
    segs = [];
    undoStack = [];
    redoStack = [];
  }
  video.addEventListener('loadedmetadata', () => {
    // A screen recording (MediaRecorder) has no length written in it: jumping
    // far ahead makes the browser find it, then we come back to the start.
    if (video.duration === Infinity) {
      const found = () => {
        if (!Number.isFinite(video.duration)) return;
        video.removeEventListener('durationchange', found);
        video.currentTime = 0;
        video.dispatchEvent(new Event('loadedmetadata'));
      };
      video.addEventListener('durationchange', found);
      video.currentTime = 1e9;
      return;
    }
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    duration = video.duration;
    hasVideo = video.videoWidth > 0;
    if (hasVideo) thumbAspect = clamp(video.videoWidth / video.videoHeight, 0.5, 2.5);
    video.classList.toggle('hidden', !hasVideo);
    $('edAudioOnly').classList.toggle('hidden', hasVideo);
    $('edLblV').classList.toggle('hidden', !hasVideo);
    segs = [{ s: 0, e: duration, off: false, speed: 1 }];
    sel = 0;
    zoom = 1;
    $('edZoom').value = '0';
    $('edDur').textContent = tc(duration);
    $('edFrom').value = '';
    $('edTo').value = '';
    $('editor').classList.remove('hidden');
    readColors();
    sizeCanvas();
    timeline.scrollLeft = 0;
    changed();
    refreshReframeUI();
    requestAnimationFrame(updatePreview);
  });
  video.addEventListener('error', () => {
    if (!file) return;
    $('editor').classList.add('hidden');
    setStatusEl($('editLoadStatus'), t('Este formato no se puede previsualizar aquí. Conviértelo antes a MP4 en Convertir → Formato.'), 'error');
  });

  function changed() {
    const k = kept();
    const n = k.length;
    $('edSummary').textContent = !n
      ? t('Has quitado todo: recupera algún tramo para exportar.')
      : t('Resultado: {len} · {n} de {total} tramos · {cuts} cortes', {
        len: formatTime(keptLength(), true), n, total: segs.length, cuts: segs.length - 1,
      });
    $('edUndo').disabled = !undoStack.length;
    $('edRedo').disabled = !redoStack.length;
    renderClips();
    updateTime();
    draw();
  }

  // ---- zoom & scroll ----
  function setZoom(z, anchorClientX) {
    const r = timeline.getBoundingClientRect();
    const ax = anchorClientX === undefined ? xOf(now()) : anchorClientX - r.left;
    const at = (timeline.scrollLeft + ax) / pps();
    zoom = clamp(z, 1, maxZoom());
    sizeCanvas();
    timeline.scrollLeft = Math.max(0, at * pps() - ax);
    $('edZoom').value = String(Math.round((Math.log(zoom) / Math.log(maxZoom() || 1.0001)) * 100) || 0);
    draw();
  }
  $('edZoom').addEventListener('input', (e) => setZoom(Math.exp((Number(e.target.value) / 100) * Math.log(maxZoom()))));
  timeline.addEventListener('wheel', (e) => {
    if (!duration) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX);
    } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && zoom > 1) {
      e.preventDefault();
      timeline.scrollLeft += e.deltaY;
    }
  }, { passive: false });
  timeline.addEventListener('scroll', () => draw());
  new ResizeObserver(() => { if (duration) { sizeCanvas(); draw(); } }).observe(timeline);

  // ---- pointer ----
  function cutNear(clientX) {
    const r = timeline.getBoundingClientRect();
    const x = clientX - r.left;
    for (let i = 0; i < segs.length - 1; i++) if (Math.abs(xOf(segs[i].e) - x) <= EDGE_PX) return i;
    return -1;
  }
  canvas.addEventListener('pointermove', (e) => {
    if (drag) return;
    canvas.style.cursor = e.offsetY > RULER && cutNear(e.clientX) !== -1 ? 'ew-resize' : 'default';
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (!duration || e.button !== 0) return;
    timeline.focus({ preventScroll: true });
    canvas.setPointerCapture(e.pointerId);
    const ci = e.offsetY > RULER ? cutNear(e.clientX) : -1;
    if (ci !== -1) {
      commit();
      drag = { kind: 'cut', i: ci, anchor: now() };
    } else {
      drag = { kind: 'scrub' };
      const at = snapTime(timeAt(e.clientX));
      if (e.offsetY > RULER) sel = segAt(at);
      seek(at);
      updateTime();
    }
    const move = (ev) => {
      const at = timeAt(ev.clientX);
      if (drag.kind === 'cut') {
        const a = segs[drag.i];
        const b = segs[drag.i + 1];
        const v = clamp(snapTime(at, [drag.anchor]), a.s + 0.05, b.e - 0.05);
        a.e = v; b.s = v;
        seek(v);
        changed();
      } else {
        seek(snapTime(at));
      }
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      drag = null;
      changed();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  });
  canvas.addEventListener('dblclick', (e) => {
    if (!duration || e.offsetY <= RULER) return;
    sel = segAt(timeAt(e.clientX));
    toggleSel();
  });

  // ---- jump between cuts ----
  function jumpCut(dir) {
    const edges = [0, ...cutTimes(), duration];
    const at = now();
    const target = dir < 0 ? [...edges].reverse().find((x) => x < at - 0.01) : edges.find((x) => x > at + 0.01);
    if (target !== undefined) { seek(target); sel = segAt(Math.min(target, duration - 0.001)); changed(); }
  }

  // ---- remove silences (from the waveform already computed here) ----
  function removeSilences() {
    const status = $('editStatus');
    if (!peaks) { setStatusEl(status, t('No se puede analizar el sonido de este archivo.'), 'error'); return; }
    const THRESHOLD = 0.04;   // of the loudest moment (~ -28 dB)
    const MIN_LEN = 1;        // seconds of silence to count
    const PAD = 0.15;         // keep a little breath on each side
    const runs = [];
    let start = null;
    for (let i = 0; i <= peaks.length; i++) {
      const quiet = i < peaks.length && peaks[i] < THRESHOLD;
      if (quiet && start === null) start = i;
      if (!quiet && start !== null) {
        const a = start / peaksPerSec;
        const b = Math.min(duration, i / peaksPerSec);
        if (b - a >= MIN_LEN) runs.push([a === 0 ? 0 : a + PAD, b >= duration - 0.01 ? duration : b - PAD]);
        start = null;
      }
    }
    const fresh = runs.filter(([a, b]) => segs.some((g) => !g.off && g.s < b && g.e > a));
    if (!fresh.length) { setStatusEl(status, t('No hay silencios de más de un segundo.'), 'success'); return; }
    commit();
    for (const [a, b] of fresh) {
      splitAt(a);
      splitAt(b);
      segs.forEach((g) => { if (g.s >= a - 1e-6 && g.e <= b + 1e-6) g.off = true; });
    }
    const secs = fresh.reduce((acc, [a, b]) => acc + (b - a), 0);
    setStatusEl(status, t('Quitados {n} silencios ({s}). Ctrl+Z para deshacer.', { n: fresh.length, s: formatTime(secs, true) }), 'success');
    changed();
  }

  // ---- cut at every change of shot (ffmpeg's scene detector, on the server) ----
  async function cutAtScenes() {
    const status = $('editStatus');
    if (!file || !duration) return;
    if (!hasVideo) { setStatusEl(status, t('Este archivo no tiene imagen: no hay escenas que buscar.'), 'error'); return; }
    const btn = $('edScenes');
    btn.disabled = true;
    try {
      setStatusEl(status, t('Buscando los cambios de plano…'), '');
      const res = await uploadTo('/api/analyze/scenes', 'file', [file], {}, (pct) => setStatusEl(status, `${t('Subiendo')} ${pct}%`, ''));
      setStatusEl(status, t('Buscando los cambios de plano…'), '');
      const times = (res.times || []).filter((x) => x > 0.3 && x < duration - 0.3);
      if (!times.length) { setStatusEl(status, t('No se han encontrado cambios de plano.'), 'success'); return; }
      commit();
      let n = 0;
      for (const at of times) if (splitAt(at)) n += 1;
      if (!n) undoStack.pop();
      setStatusEl(status, t('{n} cortes en los cambios de plano. Quita los tramos que no quieras (Supr); Ctrl+Z para deshacer.', { n }), 'success');
      changed();
    } catch (err) {
      setStatusEl(status, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ---- best moments: keep only the liveliest stretches (summary / short) ----
  async function bestMoments() {
    const status = $('editStatus');
    if (!file || !duration) return;
    const choice = await ask({
      title: t('Mejores momentos'),
      text: t('TubeGrab busca los tramos más movidos (más volumen y más cambios de plano) y deja solo esos. Puedes deshacerlo con Ctrl+Z.'),
      buttons: [
        { label: t('Cancelar'), value: null },
        { label: t('3 de 10 s (30 s)'), value: '10x3' },
        { label: t('6 de 10 s (1 min)'), value: '10x6' },
        { label: t('5 de 20 s'), value: '20x5', primary: true },
      ],
    });
    if (!choice) return;
    const [clip, count] = choice.split('x').map(Number);
    const btn = $('edMoments');
    btn.disabled = true;
    try {
      setStatusEl(status, t('Buscando los mejores momentos…'), '');
      const res = await uploadTo('/api/analyze/highlights', 'file', [file], { clip: String(clip), count: String(count) }, (pct) => setStatusEl(status, `${t('Subiendo')} ${pct}%`, ''));
      const moments = (res.moments || []).filter((m) => m.end > m.start);
      if (!moments.length) { setStatusEl(status, t('No se han encontrado momentos destacados.'), 'success'); return; }
      commit();
      for (const m of moments) { splitAt(m.start); splitAt(m.end); }
      const inside = (g) => moments.some((m) => g.s >= m.start - 0.05 && g.e <= m.end + 0.05);
      segs.forEach((g) => { g.off = !inside(g); });
      const secs = moments.reduce((a, m) => a + (m.end - m.start), 0);
      setStatusEl(status, t('{n} momentos ({s}) seleccionados; el resto queda fuera. Ctrl+Z para deshacer.', { n: moments.length, s: formatTime(secs) }), 'success');
      changed();
    } catch (err) {
      setStatusEl(status, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  // ---- reframe: the crop follows the subject (automatic) or your hand (manual) ----
  let reframeMode = '';
  let reframePts = [];           // [[source seconds, centre 0–1]]
  let analyzing = false;
  const multiAspects = () => [...$('edMulti').querySelectorAll('.chip.active')].map((c) => c.dataset.aspect);
  const activeAspect = () => multiAspects()[0] || $('edAspect').value;
  /** The crop's centre (0–1 of the picture's width) at `sec`, or null when centred. */
  function reframeAt(sec) {
    if (!reframeMode || !reframePts.length) return null;
    if (sec <= reframePts[0][0]) return reframePts[0][1];
    for (let i = 0; i < reframePts.length - 1; i++) {
      const [a, xa] = reframePts[i];
      const [b, xb] = reframePts[i + 1];
      if (sec < b) return xa + ((xb - xa) * (sec - a)) / (b - a);
    }
    return reframePts[reframePts.length - 1][1];
  }
  /**
   * Where the subject is: frames sampled every so often from the kept parts,
   * each scored by what moved since the last one and by skin-coloured
   * pixels, column by column; the centre of the strongest columns, smoothed.
   */
  async function analyzeMotion() {
    if (analyzing || !url || !hasVideo) return;
    analyzing = true;
    const status = $('editStatus');
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = url;
    try {
      await new Promise((resolve, reject) => { v.onloadeddata = resolve; v.onerror = () => reject(new Error(t('No se pudo leer el vídeo.'))); });
      const W = 64;
      const H = Math.max(8, Math.round((W * v.videoHeight) / v.videoWidth));
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      const parts = kept().length ? kept() : [{ s: 0, e: duration }];
      const total = parts.reduce((a, p) => a + (p.e - p.s), 0);
      const step = Math.max(0.5, total / 240);
      const times = [];
      for (const p of parts) for (let x = p.s; x < p.e; x += step) times.push(x);
      let prev = null;
      let centre = 0.5;
      const raw = [];
      for (let i = 0; i < times.length; i++) {
        await new Promise((resolve) => { v.onseeked = resolve; v.currentTime = Math.min(duration - 0.05, times[i]); });
        g.drawImage(v, 0, 0, W, H);
        const px = g.getImageData(0, 0, W, H).data;
        const cols = new Float32Array(W);
        const luma = new Float32Array(W * H);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const k = (y * W + x) * 4;
            const r = px[k]; const gg = px[k + 1]; const b = px[k + 2];
            const l = 0.299 * r + 0.587 * gg + 0.114 * b;
            luma[y * W + x] = l;
            const skin = r > 95 && gg > 40 && b > 20 && r > gg && r > b && r - Math.min(gg, b) > 15 && Math.abs(r - gg) > 15;
            cols[x] += (prev ? Math.abs(l - prev[y * W + x]) / 255 : 0) + (skin ? 0.6 : 0);
          }
        }
        prev = luma;
        let sum = 0; let wsum = 0;
        const peak = Math.max(...cols);
        for (let x = 0; x < W; x++) { const w = cols[x] >= peak * 0.5 ? cols[x] ** 2 : 0; sum += w * (x + 0.5) / W; wsum += w; }
        if (wsum > 0.5) centre = sum / wsum;
        raw.push([times[i], centre]);
        if (i % 10 === 0) setStatusEl(status, t('Siguiendo el movimiento… {p}%', { p: Math.round((i / times.length) * 100) }), '');
      }
      // Smooth (a camera that glides, not one that jumps).
      const smooth = raw.map(([tt], i) => {
        let s = 0; let n = 0;
        for (let j = Math.max(0, i - 3); j <= Math.min(raw.length - 1, i + 3); j++) { s += raw[j][1]; n += 1; }
        return [tt, Math.min(1, Math.max(0, s / n))];
      });
      const every = Math.max(1, Math.ceil(smooth.length / 200));
      reframePts = smooth.filter((_, i) => i % every === 0).map(([tt, x]) => [Number(tt.toFixed(2)), Number(x.toFixed(3))]);
      setStatusEl(status, t('Listo: el encuadre sigue el movimiento. Arrástralo en el visor para corregirlo.'), 'success');
    } catch (err) {
      setStatusEl(status, err.message, 'error');
    } finally {
      v.removeAttribute('src');
      v.load();
      analyzing = false;
      updatePreview();
    }
  }
  function refreshReframeUI() {
    const shape = activeAspect();
    const quarter = ['90', '270'].includes($('edRotate').value);
    $('edReframeRow').classList.toggle('hidden', !shape || !hasVideo);
    $('edReframe').disabled = quarter;
    $('edReframeHint').textContent = quarter ? t('no con el vídeo girado 90°') : reframeMode ? t('arrastra el marco en el visor para moverlo') : t('el marco queda en el centro');
    $('edCrop').classList.toggle('draggable', Boolean(reframeMode) && !quarter);
  }
  $('edReframe').addEventListener('change', () => {
    reframeMode = $('edReframe').value;
    if (reframeMode === 'manual' && !reframePts.length) reframePts = [[0, 0.5]];
    if (reframeMode === 'auto') analyzeMotion();
    refreshReframeUI();
    updatePreview();
    refreshExportUI();
  });
  $('edMulti').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    chip.classList.toggle('active');
    chip.setAttribute('aria-pressed', String(chip.classList.contains('active')));
    $('edAspect').disabled = multiAspects().length > 0;
    refreshReframeUI();
    updatePreview();
    refreshExportUI();
  });
  // Manual reframe: drag the frame sideways; a point is set at the playhead.
  $('edCrop').addEventListener('pointerdown', (e) => {
    if (!reframeMode || !frameRect) return;
    e.preventDefault();
    const crop = $('edCrop');
    crop.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startCentre = reframeAt(now()) ?? 0.5;
    const box = pictureBox();
    const move = (ev) => {
      if (!box) return;
      const x = Math.min(1, Math.max(0, startCentre + (ev.clientX - startX) / box.w));
      const at = now();
      reframePts = reframePts.filter(([tt]) => Math.abs(tt - at) > 0.3);
      reframePts.push([Number(at.toFixed(2)), Number(x.toFixed(3))]);
      reframePts.sort((a, b) => a[0] - b[0]);
      if (reframePts.length > 300) reframePts.splice(1, 1);
      updatePreview();
    };
    const up = () => { crop.removeEventListener('pointermove', move); crop.removeEventListener('pointerup', up); };
    crop.addEventListener('pointermove', move);
    crop.addEventListener('pointerup', up);
  });

  // ---- background music and automatic subtitles ----
  let musicFile = null;
  function setMusic(f) {
    musicFile = null;
    if (f) {
      if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|ogg|opus|flac|wav)$/i.test(f.name)) setStatusEl($('editStatus'), t('La música tiene que ser un archivo de audio.'), 'error');
      else musicFile = f;
    }
    $('edMusicName').textContent = musicFile ? musicFile.name : t('MP3, M4A, WAV…');
    $('edMusicRemove').classList.toggle('hidden', !musicFile);
    document.querySelectorAll('.ed-music-opt').forEach((el) => el.classList.toggle('hidden', !musicFile));
    refreshExportUI();
  }
  $('edMusicPick').addEventListener('click', () => $('edMusicInput').click());
  $('edMusicInput').addEventListener('change', (e) => { setMusic(e.target.files[0] || null); e.target.value = ''; });
  $('edMusicRemove').addEventListener('click', () => setMusic(null));
  $('edCaptions').addEventListener('change', () => {
    $('edCaptionsLangRow').classList.toggle('hidden', !$('edCaptions').value);
    refreshExportUI();
  });
  let captionsAvailable = false;
  function setCaptionsAvailable(on) {
    captionsAvailable = Boolean(on);
    $('edCaptions').disabled = !captionsAvailable;
    if (!captionsAvailable) $('edCaptions').value = '';
    $('edCaptionsLangRow').classList.toggle('hidden', !$('edCaptions').value);
    $('edCaptionsHint').classList.toggle('hidden', captionsAvailable);
  }
  setCaptionsAvailable(false);

  // ---- clip list ----
  function renderClips() {
    const list = $('edClips');
    list.innerHTML = '';
    list.classList.toggle('hidden', !segs.length);
    segs.forEach((g, i) => {
      const li = document.createElement('li');
      li.className = `ed-clip${g.off ? ' off' : ''}${i === sel ? ' selected' : ''}`;
      li.innerHTML = `<button type="button" class="ed-clip-main"><span class="ed-clip-n">${i + 1}</span>`
        + `<span class="ed-clip-t">${escapeHtml(tc(g.s))} → ${escapeHtml(tc(g.e))}</span>`
        + `<span class="ed-clip-d">${escapeHtml(formatTime((g.e - g.s) / (g.speed || 1), true))}</span></button>`
        + `<select class="ed-clip-speed" aria-label="${escapeHtml(t('Velocidad'))}" title="${escapeHtml(t('Velocidad'))}">`
        + SPEEDS.map((v) => `<option value="${v}"${v === (g.speed || 1) ? ' selected' : ''}>${String(v).replace('.', ',')}×</option>`).join('')
        + '</select>'
        + `<button type="button" class="link-btn ed-clip-toggle">${escapeHtml(g.off ? t('Recuperar') : t('Quitar'))}</button>`;
      li.querySelector('.ed-clip-main').addEventListener('click', () => { sel = i; seek(g.s); changed(); });
      li.querySelector('.ed-clip-speed').addEventListener('change', (ev) => {
        commit();
        g.speed = Number(ev.target.value);
        sel = i;
        changed();
        refreshExportUI();
      });
      li.querySelector('.ed-clip-toggle').addEventListener('click', () => { sel = i; toggleSel(); });
      list.appendChild(li);
    });
  }

  // ---- live preview of the shape, rotation and volume ----
  /** The picture as shown in the viewer (after rotation): its centre and size. */
  function pictureBox() {
    if (!hasVideo || !video.videoWidth) return null;
    const box = video.getBoundingClientRect();
    const fit = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    let w = video.videoWidth * fit;
    let h = video.videoHeight * fit;
    if (['90', '270'].includes($('edRotate').value)) { const k = Math.min(box.width / h, box.height / w); [w, h] = [h * k, w * k]; }
    return { w, h };
  }
  function updatePreview() {
    const frame = $('edCrop');
    const aspect = activeAspect();
    const rotate = $('edRotate').value;
    const vol = $('edVolume').value;
    video.muted = vol === 'mute';
    video.volume = vol && vol !== 'mute' ? Math.min(1, Number(vol)) : 1;
    if (!hasVideo || !video.videoWidth) { frame.classList.add('hidden'); video.style.transform = ''; frameRect = null; updateOverlay(); return; }
    const box = video.getBoundingClientRect();
    const fit = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    let cw = video.videoWidth * fit;
    let ch = video.videoHeight * fit;
    const quarter = rotate === '90' || rotate === '270';
    let k = 1;
    if (quarter) { k = Math.min(box.width / ch, box.height / cw); [cw, ch] = [ch * k, cw * k]; }
    const transforms = { 90: `rotate(90deg) scale(${k})`, 270: `rotate(-90deg) scale(${k})`, 180: 'rotate(180deg)', hflip: 'scaleX(-1)' };
    video.style.transform = transforms[rotate] || '';
    const cx = video.offsetLeft + video.offsetWidth / 2;
    const cy = video.offsetTop + video.offsetHeight / 2;
    if (!aspect) {
      frame.classList.add('hidden');
      frameRect = { left: cx - cw / 2, top: cy - ch / 2, w: cw, h: ch };
      updateOverlay();
      return;
    }
    const [rw, rh] = aspect.split(':').map(Number);
    const r = rw / rh;
    const w = cw / ch > r ? ch * r : cw;
    const h = cw / ch > r ? ch : cw / r;
    // Reframed: the frame slides sideways inside the picture.
    const centre = reframeAt(now());
    const shift = centre === null ? 0 : Math.min(cw - w, Math.max(0, centre * cw - w / 2)) - (cw - w) / 2;
    frameRect = { left: cx - w / 2 + shift, top: cy - h / 2, w, h };
    updateOverlay();
    // Centred in the viewer (the video element is centred and not moved by the transform).
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.left = `${video.offsetLeft + (video.offsetWidth - w) / 2 + shift}px`;
    frame.style.top = `${video.offsetTop + (video.offsetHeight - h) / 2}px`;
    $('edCropLabel').textContent = aspect;
    frame.classList.remove('hidden');
  }
  new ResizeObserver(() => updatePreview()).observe($('edViewer'));
  ['edAspect', 'edRotate', 'edVolume', 'edFade', 'edSeparate', 'edDenoise'].forEach((id) => $(id).addEventListener('change', () => { refreshReframeUI(); updatePreview(); refreshExportUI(); }));

  // ---- titles and logo: edited in the inspector, previewed on the viewer ----
  // Same proportions as the server: text height = picture height / n.
  const TEXT_SIZES = { s: 24, m: 15, l: 10 };
  const LOGO_SIZES = { s: 0.1, m: 0.16, l: 0.24 };
  let frameRect = null;          // the picture as it will be exported, in viewer pixels
  let texts = [];                // [{ text, pos, size, from, to }] (source seconds or null)
  let logoFile = null;
  let logoUrl = null;

  function updateOverlay() {
    const layer = $('edOverlay');
    if (!frameRect || !hasVideo) { layer.classList.add('hidden'); return; }
    layer.classList.remove('hidden');
    Object.assign(layer.style, { left: `${frameRect.left}px`, top: `${frameRect.top}px`, width: `${frameRect.w}px`, height: `${frameRect.h}px` });
    const at = now();
    layer.querySelectorAll('.ed-title').forEach((el) => el.remove());
    texts.forEach((tx) => {
      if (!tx.text.trim()) return;
      if ((tx.from !== null && at < tx.from) || (tx.to !== null && at > tx.to)) return;
      const el = document.createElement('div');
      el.className = `ed-title ed-title-${tx.pos}`;
      el.textContent = tx.text;
      el.style.fontSize = `${Math.max(6, frameRect.h / TEXT_SIZES[tx.size])}px`;
      layer.appendChild(el);
    });
    const img = $('edLogoPreview');
    img.classList.toggle('hidden', !logoUrl);
    if (logoUrl) {
      const m = frameRect.w * 0.03;
      const pos = $('edLogoPos').value;
      Object.assign(img.style, {
        width: `${frameRect.w * LOGO_SIZES[$('edLogoSize').value]}px`,
        opacity: $('edLogoOpacity').value,
        left: pos.endsWith('l') ? `${m}px` : 'auto', right: pos.endsWith('r') ? `${m}px` : 'auto',
        top: pos.startsWith('t') ? `${m}px` : 'auto', bottom: pos.startsWith('b') ? `${m}px` : 'auto',
      });
    }
  }

  function renderTexts() {
    const box = $('edTexts');
    box.innerHTML = '';
    texts.forEach((tx, i) => {
      const item = document.createElement('div');
      item.className = 'ed-text-item';
      item.innerHTML = `
        <textarea rows="2" maxlength="200" placeholder="${escapeHtml(t('Escribe el texto'))}" aria-label="${escapeHtml(t('Texto'))} ${i + 1}"></textarea>
        <div class="ed-text-row">
          <select data-k="pos" aria-label="${escapeHtml(t('Posición'))}">
            <option value="top">${escapeHtml(t('Arriba'))}</option><option value="center">${escapeHtml(t('Centro'))}</option><option value="bottom">${escapeHtml(t('Abajo'))}</option>
          </select>
          <select data-k="size" aria-label="${escapeHtml(t('Tamaño'))}">
            <option value="s">${escapeHtml(t('Pequeño'))}</option><option value="m">${escapeHtml(t('Mediano'))}</option><option value="l">${escapeHtml(t('Grande'))}</option>
          </select>
          <select data-k="anim" aria-label="${escapeHtml(t('Animación'))}">
            <option value="none">${escapeHtml(t('Sin animación'))}</option><option value="fade">${escapeHtml(t('Aparecer'))}</option><option value="slide">${escapeHtml(t('Deslizar'))}</option>
            <option value="rise">${escapeHtml(t('Subir'))}</option><option value="type">${escapeHtml(t('Máquina de escribir'))}</option>
          </select>
          <button type="button" class="link-btn ed-text-del">${escapeHtml(t('Quitar'))}</button>
        </div>
        <div class="ed-text-row">
          <input class="text-input small" data-k="from" placeholder="${escapeHtml(t('desde el inicio'))}" aria-label="${escapeHtml(t('Desde'))}">
          <button type="button" class="ed-mini" data-set="from" title="${escapeHtml(t('Poner el momento del cabezal'))}">⤓</button>
          <input class="text-input small" data-k="to" placeholder="${escapeHtml(t('hasta el final'))}" aria-label="${escapeHtml(t('Hasta'))}">
          <button type="button" class="ed-mini" data-set="to" title="${escapeHtml(t('Poner el momento del cabezal'))}">⤓</button>
        </div>`;
      const area = item.querySelector('textarea');
      area.value = tx.text;
      item.querySelector('[data-k="pos"]').value = tx.pos;
      item.querySelector('[data-k="size"]').value = tx.size;
      item.querySelector('[data-k="anim"]').value = tx.anim || 'none';
      const fromEl = item.querySelector('[data-k="from"]');
      const toEl = item.querySelector('[data-k="to"]');
      fromEl.value = tx.from === null ? '' : formatTime(tx.from, true);
      toEl.value = tx.to === null ? '' : formatTime(tx.to, true);
      area.addEventListener('input', () => { tx.text = area.value.split('\n').slice(0, 3).join('\n'); updateOverlay(); refreshExportUI(); });
      item.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => { tx[sel.dataset.k] = sel.value; updateOverlay(); }));
      const readTime = (el, key) => {
        const v = el.value.trim() ? parseTime(el.value) : null;
        el.classList.toggle('invalid', v !== null && !Number.isFinite(v));
        tx[key] = v !== null && Number.isFinite(v) ? Math.min(v, duration) : null;
        updateOverlay();
      };
      fromEl.addEventListener('input', () => readTime(fromEl, 'from'));
      toEl.addEventListener('input', () => readTime(toEl, 'to'));
      item.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
        const el = b.dataset.set === 'from' ? fromEl : toEl;
        el.value = formatTime(now(), true);
        readTime(el, b.dataset.set);
      }));
      item.querySelector('.ed-text-del').addEventListener('click', () => { texts.splice(i, 1); renderTexts(); updateOverlay(); refreshExportUI(); });
      box.appendChild(item);
    });
    $('edAddText').disabled = texts.length >= 5;
  }
  $('edAddText').addEventListener('click', () => {
    if (texts.length >= 5) return;
    texts.push({ text: '', pos: 'bottom', size: 'm', from: null, to: null, anim: 'none' });
    renderTexts();
    $('edTexts').lastElementChild.querySelector('textarea').focus();
  });

  function setLogo(f) {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    logoFile = null;
    logoUrl = null;
    if (f) {
      if (!/\.(png|jpe?g|webp)$/i.test(f.name) || !/^image\/(png|jpeg|webp)$/.test(f.type)) {
        setStatusEl($('editStatus'), t('El logo tiene que ser una imagen PNG, JPG o WEBP.'), 'error');
      } else if (f.size > 5 * 1024 * 1024) {
        setStatusEl($('editStatus'), t('El logo es demasiado grande (máx. 5 MB).'), 'error');
      } else {
        logoFile = f;
        logoUrl = URL.createObjectURL(f);
        $('edLogoPreview').src = logoUrl;
      }
    }
    $('edLogoName').textContent = logoFile ? logoFile.name : t('PNG, JPG o WEBP (máx. 5 MB)');
    $('edLogoRemove').classList.toggle('hidden', !logoFile);
    document.querySelectorAll('.ed-logo-opt').forEach((el) => el.classList.toggle('hidden', !logoFile));
    updateOverlay();
    refreshExportUI();
  }
  $('edLogoPick').addEventListener('click', () => $('edLogoInput').click());
  $('edLogoInput').addEventListener('change', (e) => { setLogo(e.target.files[0] || null); e.target.value = ''; });
  $('edLogoRemove').addEventListener('click', () => setLogo(null));
  ['edLogoPos', 'edLogoSize', 'edLogoOpacity'].forEach((id) => $(id).addEventListener('change', updateOverlay));

  // ---- buttons ----
  $('edPrevCut').addEventListener('click', () => jumpCut(-1));
  $('edNextCut').addEventListener('click', () => jumpCut(1));
  $('edSilence').addEventListener('click', removeSilences);
  $('edScenes').addEventListener('click', cutAtScenes);
  $('edMoments').addEventListener('click', bestMoments);
  $('edSnap').addEventListener('click', () => {
    snap = !snap;
    $('edSnap').classList.toggle('active', snap);
    $('edSnap').setAttribute('aria-pressed', String(snap));
  });
  $('edPlay').addEventListener('click', togglePlay);
  $('edHome').addEventListener('click', () => seek(0));
  $('edEnd').addEventListener('click', () => seek(duration));
  $('edPrev').addEventListener('click', () => seek(now() - FRAME));
  $('edNext').addEventListener('click', () => seek(now() + FRAME));
  $('edIn').addEventListener('click', markIn);
  $('edOut').addEventListener('click', markOut);
  $('edCut').addEventListener('click', cut);
  $('edToggle').addEventListener('click', toggleSel);
  $('edUndo').addEventListener('click', undo);
  $('edRedo').addEventListener('click', redo);
  $('edReset').addEventListener('click', reset);
  $('edSkip').addEventListener('change', () => draw());

  function rangeFields() {
    const a = parseTime($('edFrom').value);
    const b = $('edTo').value.trim() ? parseTime($('edTo').value) : duration;
    if (a === null && !$('edTo').value.trim()) return { error: t('Escribe desde qué segundo y hasta cuál (p. ej. 12 y 1:30).') };
    const from = a || 0;
    if (!Number.isFinite(from) || !Number.isFinite(b)) return { error: t('Tiempo no válido. Usa segundos o mm:ss (p. ej. 75 o 1:15).') };
    const to = Math.min(b, duration);
    if (to - from < 0.05) return { error: t('"Al" tiene que ser mayor que "Del" y estar dentro del archivo ({d}).', { d: formatTime(duration, true) }) };
    return { from, to };
  }
  for (const [id, keep] of [['edKeep', true], ['edRemove', false]]) {
    $(id).addEventListener('click', () => {
      const r = rangeFields();
      if (r.error) { setStatusEl($('editStatus'), r.error, 'error'); return; }
      setStatusEl($('editStatus'), '', '');
      applyRange(r.from, r.to, keep);
    });
  }
  [$('edFrom'), $('edTo')].forEach((el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('edKeep').click(); }));

  // ---- keyboard (only on this page, never while typing) ----
  document.addEventListener('keydown', (e) => {
    if (currentView !== 'cv-edit' || !duration) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag) && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    let handled = true;
    if (ctrl && (k === 'z' || k === 'Z')) { if (e.shiftKey) redo(); else undo(); }
    else if (ctrl && (k === 'y' || k === 'Y')) redo();
    else if (ctrl && (k === 'b' || k === 'B')) cut();
    else if (ctrl) handled = false;
    else if (k === ' ' || k === 'k' || k === 'K') togglePlay();
    else if (k === 'ArrowLeft') seek(now() - (e.shiftKey ? 1 : FRAME));
    else if (k === 'ArrowRight') seek(now() + (e.shiftKey ? 1 : FRAME));
    else if (k === 'j' || k === 'J') seek(now() - 5);
    else if (k === 'l' || k === 'L') seek(now() + 5);
    else if (k === 'ArrowUp') jumpCut(-1);
    else if (k === 'ArrowDown') jumpCut(1);
    else if (k === 'Home') seek(0);
    else if (k === 'End') seek(duration);
    else if (k === 'i' || k === 'I') markIn();
    else if (k === 'o' || k === 'O') markOut();
    else if (k === 'b' || k === 'B') cut();
    else if (k === 'Delete' || k === 'Backspace') toggleSel();
    else if (k === '+' || k === '=') setZoom(zoom * 1.5);
    else if (k === '-') setZoom(zoom / 1.5);
    else handled = false;
    if (handled) e.preventDefault();
  });

  // ---- export ----
  const ANIMATED = ['gif', 'sticker', 'tgsticker'];
  const hasEffects = () => Boolean($('edAspect').value || $('edFade').value || $('edVolume').value || $('edRotate').value
    || $('edDenoise').value || logoFile || texts.some((tx) => tx.text.trim()) || segs.some((g) => !g.off && (g.speed || 1) !== 1)
    || musicFile || $('edCaptions').value || multiAspects().length);
  function refreshExportUI() {
    const format = $('edFormat').value;
    const fastOk = format === 'original' && !hasEffects();
    if (!fastOk && mode === 'fast') mode = 'exact';
    $('edMode').querySelectorAll('.kind-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === mode);
      if (b.dataset.mode === 'fast') {
        b.disabled = !fastOk;
        b.title = fastOk ? '' : t('Los rápidos solo sirven con el formato original y sin ajustes del resultado.');
      }
    });
    const audioOnly = ['mp3', 'm4a', 'wav', 'flac'].includes(format) || (file && duration && !hasVideo);
    const animated = ANIMATED.includes(format);
    $('edQualityRow').classList.toggle('hidden', mode === 'fast' || audioOnly || animated);
    const hints = {
      gif: t('GIF: sin sonido, 15 imágenes por segundo y hasta 480 px de ancho.'),
      sticker: t('Sticker de WhatsApp: 512 × 512, sin sonido. WhatsApp pide que pese menos de 500 KB: mejor tramos cortos (2–5 s).'),
      tgsticker: t('Sticker de Telegram: vídeo WebM de 512 px, sin sonido y como máximo 3 segundos (se corta ahí).'),
    };
    $('edModeHint').textContent = hints[format] || (mode === 'fast'
      ? t('Rápidos: sin volver a codificar, al instante y sin perder calidad, pero cada tramo empieza en el fotograma clave anterior (puede adelantarse un poco).')
      : t('Exactos: corta en el fotograma justo (vuelve a codificar el vídeo).'));
  }
  $('edFormat').addEventListener('change', refreshExportUI);
  $('edMode').addEventListener('click', (e) => {
    const b = e.target.closest('.kind-btn');
    if (!b || b.disabled) return;
    mode = b.dataset.mode;
    refreshExportUI();
  });
  $('btnEdit').addEventListener('click', async () => {
    const status = $('editStatus');
    if (!file) { setStatusEl(status, t('Elige un archivo primero'), 'error'); return; }
    if (!duration) { setStatusEl(status, t('Espera a que se cargue el archivo.'), 'error'); return; }
    const k = kept();
    if (!k.length) { setStatusEl(status, t('Has quitado todo: recupera algún tramo para exportar.'), 'error'); return; }
    const badText = texts.find((tx) => tx.text.trim() && tx.from !== null && tx.to !== null && tx.to - tx.from < 0.1);
    if (badText) { setStatusEl(status, t('En un texto, "hasta" tiene que ser después de "desde".'), 'error'); return; }
    video.pause();
    const btn = $('btnEdit');
    btn.disabled = true;
    try {
      await uploadTo('/api/jobs/edit', 'file', [file], {
        segments: JSON.stringify(k.map((g) => [Number(g.s.toFixed(3)), Number(g.e.toFixed(3)), g.speed || 1])),
        targetFormat: $('edFormat').value, mode, quality: $('edQuality').value,
        aspect: $('edAspect').value, fade: $('edFade').value, volume: $('edVolume').value, rotate: $('edRotate').value,
        separate: String($('edSeparate').checked),
        denoise: $('edDenoise').value,
        texts: JSON.stringify(texts.filter((tx) => tx.text.trim()).map((tx) => ({
          text: tx.text.trim(), pos: tx.pos, size: tx.size, anim: tx.anim || 'none',
          from: tx.from === null ? null : Number(tx.from.toFixed(3)), to: tx.to === null ? null : Number(tx.to.toFixed(3)),
        }))),
        ...(logoFile ? { logo: logoFile, logoPos: $('edLogoPos').value, logoSize: $('edLogoSize').value, logoOpacity: $('edLogoOpacity').value } : {}),
        aspects: multiAspects().join(','),
        ...(reframeMode && reframePts.length && activeAspect() ? { reframe: JSON.stringify(reframePts) } : {}),
        ...($('edCaptions').value ? { captions: $('edCaptions').value, captionsLang: $('edCaptionsLang').value } : {}),
        ...(musicFile ? { music: musicFile, musicVolume: $('edMusicVolume').value, musicDuck: String($('edMusicDuck').checked) } : {}),
      }, (pct) => { btn.textContent = `${t('Subiendo')} ${pct}%`; });
      setStatusEl(status, t('Añadido a la cola'), 'success');
    } catch (err) {
      setStatusEl(status, err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('Exportar');
    }
  });

  thumbVideo.addEventListener('loadeddata', () => draw());
  // Leaving the page pauses; coming back re-measures the (then visible) timeline.
  document.addEventListener('tg:view', (e) => {
    if (e.detail !== 'cv-edit') video.pause();
    else if (duration) requestAnimationFrame(() => { sizeCanvas(); draw(); });
  });
  fileZone($('editDrop'), $('editInput'), (files) => load(files[0]));
  refreshExportUI();
  // Theme / accent changes: re-read the colours on the next draw.
  new MutationObserver(() => { colors = null; draw(); }).observe(document.documentElement, { attributes: true });

  return { load, setCaptionsAvailable };
})();

// === Editor → record the screen (desktop): a screen or a window, or a part of it ===
// The app lists what can be recorded; the pick goes back to it, and only then
// the page asks for the picture. A part of the screen is cut out on a canvas.
const screenRec = (() => {
  if (!desktopApi || !desktopApi.screenSources || !navigator.mediaDevices || !window.MediaRecorder) {
    $('btnRecord').classList.add('hidden');
    return {};
  }
  let picked = null;
  let stream = null;
  let rec = null;
  let chunks = [];
  let started = 0;
  let tick = null;
  let region = null;             // { x, y, w, h } as 0–1 of the picture
  let drawLoop = null;

  function stopAll() {
    clearInterval(tick);
    cancelAnimationFrame(drawLoop);
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    stream = null;
    $('recBar').classList.add('hidden');
  }
  async function open() {
    picked = null;
    region = null;
    $('recModal').classList.remove('hidden');
    $('recStage').classList.add('hidden');
    $('recStart').disabled = true;
    $('recHint').textContent = t('Buscando pantallas y ventanas…');
    const ul = $('recSources');
    ul.innerHTML = '';
    let list = [];
    try { list = (await desktopApi.screenSources()) || []; } catch { /* none */ }
    $('recHint').textContent = list.length ? t('Elige qué grabar:') : t('No se encuentra nada que grabar.');
    for (const s of list) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rec-source';
      b.innerHTML = '<img alt=""><span></span>';
      if (s.thumb) b.querySelector('img').src = s.thumb; else b.querySelector('img').style.visibility = 'hidden';
      b.querySelector('span').textContent = s.screen ? `🖥 ${s.name}` : s.name;
      b.addEventListener('click', () => {
        picked = s;
        ul.querySelectorAll('.rec-source').forEach((x) => x.classList.toggle('active', x === b));
        $('recAudio').disabled = !s.screen;
        if (!s.screen) $('recAudio').checked = false;
        $('recStart').disabled = false;
        showStage();
      });
      li.appendChild(b);
      ul.appendChild(li);
    }
  }
  /** The pick's picture, to draw the part to record on (when "only a part"). */
  async function showStage() {
    if (!$('recRegion').checked || !picked) { $('recStage').classList.add('hidden'); return; }
    stopAll();
    stream = await grab();
    if (!stream) return;
    const v = $('recPreview');
    v.srcObject = stream;
    v.play().catch(() => {});
    $('recStage').classList.remove('hidden');
    region = region || { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    drawBox();
  }
  async function grab() {
    try {
      await desktopApi.pickScreenSource({ id: picked.id, audio: $('recAudio').checked });
      return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: $('recAudio').checked });
    } catch (err) {
      $('recHint').textContent = t('No se pudo empezar a grabar: {e}', { e: err.message });
      return null;
    }
  }
  function drawBox() {
    const box = $('recBox');
    Object.assign(box.style, { left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.w * 100}%`, height: `${region.h * 100}%` });
  }
  // Draw the part with the mouse on the preview.
  (() => {
    const stage = $('recStageInner');
    let from = null;
    stage.addEventListener('pointerdown', (e) => {
      const r = stage.getBoundingClientRect();
      from = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!from) return;
      const r = stage.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      region = { x: Math.min(from.x, x), y: Math.min(from.y, y), w: Math.max(0.05, Math.abs(x - from.x)), h: Math.max(0.05, Math.abs(y - from.y)) };
      region.w = Math.min(region.w, 1 - region.x);
      region.h = Math.min(region.h, 1 - region.y);
      drawBox();
    });
    stage.addEventListener('pointerup', () => { from = null; });
  })();

  async function start() {
    if (!picked) return;
    if (!stream) stream = await grab();
    if (!stream) return;
    let recStream = stream;
    if ($('recRegion').checked && region) {
      // Only the part: the picture is copied, cropped, onto a canvas that is recorded.
      const v = $('recPreview');
      if (!v.srcObject) { v.srcObject = stream; await v.play().catch(() => {}); }
      const vw = v.videoWidth || 1280;
      const vh = v.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round((region.w * vw) / 2) * 2);
      canvas.height = Math.max(2, Math.round((region.h * vh) / 2) * 2);
      const g = canvas.getContext('2d');
      const loop = () => { g.drawImage(v, region.x * vw, region.y * vh, region.w * vw, region.h * vh, 0, 0, canvas.width, canvas.height); drawLoop = requestAnimationFrame(loop); };
      loop();
      recStream = canvas.captureStream(30);
      stream.getAudioTracks().forEach((tr) => recStream.addTrack(tr));
    }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    chunks = [];
    rec = new MediaRecorder(recStream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 8_000_000 });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = finish;
    // Sharing stopped from outside (the window closed…): the recording ends too.
    stream.getVideoTracks().forEach((tr) => tr.addEventListener('ended', () => { if (rec && rec.state === 'recording') rec.stop(); }));
    rec.start(1000);
    started = Date.now();
    $('recModal').classList.add('hidden');
    $('recBar').classList.remove('hidden');
    tick = setInterval(() => { $('recTime').textContent = formatDuration(Math.floor((Date.now() - started) / 1000)) || '0:00'; }, 500);
    $('recTime').textContent = '0:00';
    // Out of the way while you record; the bar stops it when you come back.
    setTimeout(() => desktopApi.windowControl('minimize'), 600);
  }
  function finish() {
    const blob = new Blob(chunks, { type: 'video/webm' });
    chunks = [];
    rec = null;
    stopAll();
    if (!blob.size) { showToast(t('No se grabó nada.')); return; }
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
    const f = new File([blob], `${t('Grabación')} ${stamp}.webm`, { type: 'video/webm' });
    setView('cv-edit');
    editor.load(f);
    showToast(t('Grabación lista en el Editor'));
  }
  $('btnRecord').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
  $('recCancel').addEventListener('click', () => { stopAll(); $('recModal').classList.add('hidden'); });
  $('recStart').addEventListener('click', start);
  $('recRegion').addEventListener('change', showStage);
  $('recAudio').addEventListener('change', () => { if ($('recRegion').checked) { stopAll(); showStage(); } });
  $('recStop').addEventListener('click', () => { if (rec && rec.state === 'recording') rec.stop(); else stopAll(); });
  return { active: () => Boolean(rec) };
})();

// === Scheduled downloads (desktop): the queue waits until a time ===
const scheduleBar = (() => {
  const bar = $('scheduleBar');
  let until = null;
  let editing = false;
  const clock = (ms) => new Date(ms).toLocaleTimeString(prefsApi.get().lang === 'en' ? 'en-GB' : 'es-ES', { hour: '2-digit', minute: '2-digit' });
  function render() {
    bar.classList.toggle('hidden', !until && !editing);
    bar.classList.toggle('active', Boolean(until) && !editing);
    if (until && !editing) {
      const tomorrow = new Date(until).toDateString() !== new Date().toDateString();
      $('scheduleText').textContent = t(tomorrow ? 'Las descargas empezarán mañana a las {h}' : 'Las descargas empezarán hoy a las {h}', { h: clock(until) });
    } else {
      $('scheduleText').textContent = t('Empezar las descargas a las');
    }
    $('scheduleTime').classList.toggle('hidden', Boolean(until) && !editing);
    $('btnScheduleSet').textContent = until && !editing ? t('Cambiar') : t('Programar');
    $('btnScheduleNow').classList.toggle('hidden', !until);
    $('btnScheduleClose').classList.toggle('hidden', Boolean(until) && !editing);
  }
  async function send(at) {
    try {
      const res = await postJson('/api/schedule', { at });
      editing = false;
      show(res.until);
    } catch (err) { showToast(err.message); }
  }
  function show(value) {
    until = Number.isFinite(value) ? value : null;
    render();
  }
  if (desktopApi) {
    $('btnSchedule').addEventListener('click', () => { editing = true; render(); $('scheduleTime').focus(); });
    $('btnScheduleSet').addEventListener('click', () => {
      if (until && !editing) { editing = true; render(); return; }
      if (!$('scheduleTime').value) return;
      send($('scheduleTime').value);
    });
    $('btnScheduleNow').addEventListener('click', () => send(null));
    $('btnScheduleClose').addEventListener('click', () => { editing = false; render(); });
    $('scheduleTime').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnScheduleSet').click(); });
  }
  return { show };
})();

// === Convertir → Etiquetas (tag editor for many songs) ===
const tagEditor = (() => {
  const TAG_EXT = /\.(mp3|m4a|flac|ogg|opus)$/i;
  let files = [];
  let rows = [];           // [{ name, tags: {…}, hasCover, coverOk }]
  let cover = null;
  let coverUrl = null;
  const COLS = ['track', 'title', 'artist', 'album', 'bpm', 'key'];
  const COL_NAMES = { track: 'Nº', title: 'Título', artist: 'Artista', album: 'Álbum', bpm: 'BPM', key: 'Tono' };

  function render() {
    $('tagsEditor').classList.toggle('hidden', !rows.length);
    $('tagsCount').textContent = rows.length ? `(${rows.length})` : '';
    const body = $('tagsTable').querySelector('tbody');
    body.innerHTML = '';
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      for (const key of COLS) {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.className = `text-input tags-cell tags-${key}`;
        input.value = row.tags[key] || '';
        input.maxLength = key === 'track' ? 7 : key === 'bpm' || key === 'key' ? 3 : 300;
        input.setAttribute('aria-label', `${t(COL_NAMES[key])} · ${row.name}`);
        input.addEventListener('input', () => { row.tags[key] = input.value; });
        td.appendChild(input);
        tr.appendChild(td);
      }
      const name = document.createElement('td');
      name.className = 'tags-file';
      name.textContent = row.name;
      name.title = row.name;
      tr.appendChild(name);
      body.appendChild(tr);
    });
  }

  async function load(list) {
    const picked = [...list].filter((f) => TAG_EXT.test(f.name)).slice(0, 50);
    setStatusEl($('tagsStatus'), '', '');
    if (!picked.length) {
      setStatusEl($('tagsLoadStatus'), t('Elige canciones MP3, M4A, FLAC, OGG u OPUS.'), 'error');
      return;
    }
    files = picked;
    rows = [];
    render();
    $('tagsDropText').textContent = t('Leyendo etiquetas…');
    setStatusEl($('tagsLoadStatus'), '', '');
    try {
      const data = await uploadTo('/api/tags/read', 'files', files, {}, (pct) => { $('tagsDropText').textContent = `${t('Leyendo etiquetas…')} ${pct}%`; });
      rows = data.files.map((f) => ({ name: f.name, tags: { ...f.tags }, hasCover: f.hasCover, coverOk: f.coverOk }));
    } catch (err) {
      files = [];
      setStatusEl($('tagsLoadStatus'), err.message, 'error');
    }
    $('tagsDropText').textContent = files.length
      ? t('{n} canciones · haz clic para cambiar', { n: files.length })
      : t('Arrastra tus canciones (MP3, M4A, FLAC, OGG, OPUS)');
    render();
  }

  function setCover(f) {
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    cover = null;
    coverUrl = null;
    if (f) {
      if (!/\.(png|jpe?g|webp)$/i.test(f.name) || !/^image\/(png|jpeg|webp)$/.test(f.type)) setStatusEl($('tagsStatus'), t('La carátula tiene que ser PNG, JPG o WEBP.'), 'error');
      else if (f.size > 5 * 1024 * 1024) setStatusEl($('tagsStatus'), t('La carátula es demasiado grande (máx. 5 MB).'), 'error');
      else { cover = f; coverUrl = URL.createObjectURL(f); }
    }
    $('tgCoverPreview').classList.toggle('hidden', !coverUrl);
    if (coverUrl) $('tgCoverPreview').src = coverUrl;
    $('tgCoverName').textContent = cover ? cover.name : t('MP3, M4A y FLAC · PNG, JPG o WEBP');
    $('tgCoverRemove').classList.toggle('hidden', !cover);
  }

  fileZone($('tagsDrop'), $('tagsInput'), load);
  $('tgCoverPick').addEventListener('click', () => $('tgCoverInput').click());
  $('tgCoverInput').addEventListener('change', (e) => { setCover(e.target.files[0] || null); e.target.value = ''; });
  $('tgCoverRemove').addEventListener('click', () => setCover(null));
  $('tgApplyAll').addEventListener('click', () => {
    const all = { artist: 'tgAllArtist', album: 'tgAllAlbum', album_artist: 'tgAllAlbumArtist', date: 'tgAllDate', genre: 'tgAllGenre' };
    let changed = 0;
    for (const [key, id] of Object.entries(all)) {
      const v = $(id).value.trim();
      if (!v) continue;
      rows.forEach((r) => { r.tags[key] = v; });
      changed += 1;
    }
    render();
    setStatusEl($('tagsStatus'), changed ? t('Aplicado a las {n} canciones.', { n: rows.length }) : t('Escribe arriba lo que quieras poner a todas.'), changed ? 'success' : 'error');
  });
  $('tgNumber').addEventListener('click', () => {
    rows.forEach((r, i) => { r.tags.track = `${i + 1}/${rows.length}`; });
    render();
  });
  $('tgFromName').addEventListener('click', () => {
    rows.forEach((r) => {
      const base = r.name.replace(/\.[^.]+$/, '').replace(/^\d{1,3}[\s.\-_]+/, '').trim();
      const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
      if (m) { r.tags.artist = m[1].trim(); r.tags.title = m[2].trim(); } else { r.tags.title = base; }
    });
    render();
  });
  // Tempo and key, worked out from the sound (on the server, nothing is kept).
  $('tgDetect').addEventListener('click', async () => {
    const status = $('tagsStatus');
    if (!files.length) { setStatusEl(status, t('Elige uno o varios archivos primero'), 'error'); return; }
    const btn = $('tgDetect');
    btn.disabled = true;
    try {
      const res = await uploadTo('/api/tags/analyze', 'files', files, {}, (pct) => setStatusEl(status, `${t('Subiendo')} ${pct}%`, ''));
      setStatusEl(status, '', '');
      let found = 0;
      (res.results || []).forEach((r, i) => {
        if (!rows[i]) return;
        if (r.bpm) { rows[i].tags.bpm = String(r.bpm); found += 1; }
        if (r.key) rows[i].tags.key = r.key;
      });
      render();
      setStatusEl(status, found ? t('BPM y tonalidad de {n} canciones. Revisa y pulsa «Guardar etiquetas».', { n: found }) : t('No se ha encontrado un ritmo claro.'), found ? 'success' : 'error');
    } catch (err) {
      setStatusEl(status, err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  $('btnTags').addEventListener('click', async () => {
    const status = $('tagsStatus');
    if (!files.length || !rows.length) { setStatusEl(status, t('Elige uno o varios archivos primero'), 'error'); return; }
    const bad = rows.find((r) => (r.tags.track && !/^\d{1,3}(\/\d{1,3})?$/.test(r.tags.track.trim())) || (r.tags.date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(r.tags.date.trim())));
    if (bad) { setStatusEl(status, t('Revisa «{name}»: el número va como 3 o 3/12 y el año como 2024.', { name: bad.name }), 'error'); return; }
    const badBpm = rows.find((r) => (r.tags.bpm && !/^\d{2,3}$/.test(r.tags.bpm.trim())) || (r.tags.key && !/^[A-G][b#]?m?$/.test(r.tags.key.trim())));
    if (badBpm) { setStatusEl(status, t('Revisa «{name}»: el BPM va como 128 y el tono como Am, C o F#m.', { name: badBpm.name }), 'error'); return; }
    const btn = $('btnTags');
    btn.disabled = true;
    try {
      await uploadTo('/api/jobs/tags', 'files', files, {
        tags: JSON.stringify(rows.map((r) => Object.fromEntries(Object.entries(r.tags).map(([k, v]) => [k, String(v || '').trim()])))),
        rename: String($('tgRename').checked),
        lyrics: String($('tgLyrics').checked),
        ...(cover ? { cover } : {}),
      }, (pct) => { btn.textContent = `${t('Subiendo')} ${pct}%`; });
      setStatusEl(status, t('Añadido a la cola'), 'success');
    } catch (err) {
      setStatusEl(status, err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = t('Guardar etiquetas');
    }
  });
  return { load, rows: () => rows, files: () => files, render, hasCover: () => Boolean(cover), setCover };
})();

// === Queue ===
const jobs = new Map();          // id -> job (from the server)
const liveJobs = new Set();      // ids we saw while still active (eligible for auto-save)
const saved = new Map();         // id -> 'saving' | 'saved' | 'failed'
const rows = new Map();          // id -> <li>
const ACTIVE = new Set(['queued', 'running', 'processing']);

function connectEvents() {
  const es = new EventSource(`/api/jobs/events?client=${CLIENT_ID}`);
  es.addEventListener('snapshot', (e) => {
    const list = JSON.parse(e.data);
    const ids = new Set(list.map((j) => j.id));
    for (const id of [...jobs.keys()]) if (!ids.has(id)) removeRow(id);
    list.forEach((job) => onJob(job, false));
    renderQueueMeta();
  });
  es.addEventListener('job', (e) => { onJob(JSON.parse(e.data), true); renderQueueMeta(); });
  es.addEventListener('removed', (e) => { removeRow(JSON.parse(e.data).id); renderQueueMeta(); });
  es.addEventListener('subscriptions', () => { if (currentView === 'dl-subs') loadSubscriptions(); });
  es.addEventListener('schedule', (e) => scheduleBar.show(JSON.parse(e.data).until));
  es.addEventListener('mirror', (e) => mirrorSync.update(JSON.parse(e.data)));
}

function onJob(job, live) {
  const prev = jobs.get(job.id);
  jobs.set(job.id, job);
  if (ACTIVE.has(job.status)) liveJobs.add(job.id);
  const justFinished = live && prev && ACTIVE.has(prev.status) && job.status === 'done';
  if (justFinished && liveJobs.has(job.id)) {
    autoSave(job);
    addToHistory(job);
    notify(job);
    notifyPhone(job);
    if (prefsApi.get().sound) playDoneSound();
  }
  if (live && prev && ACTIVE.has(prev.status) && job.status === 'error') { notify(job); notifyPhone(job); }
  renderRow(job);
  if (prev && (prev.order !== job.order || prev.priority !== job.priority)) sortRows();
}

function fileUrl(job, n = 0) {
  return `/api/jobs/${job.id}/file?client=${CLIENT_ID}&n=${n}`;
}

function autoSave(job) {
  const count = (job.files || []).length || 1;
  if (desktopApi) {
    saved.set(job.id, 'saving');
    // Lyrics (.lrc), the media-server sheet (.nfo) and its poster belong next
    // to their song or video, not in a subfolder of their own.
    const media = (job.files || []).filter((f) => !/\.(lrc|nfo)$/i.test(f.name) && !/-poster\.jpg$/i.test(f.name)).length;
    const meta = job.type === 'download' && job.meta ? job.meta : {};
    // A folder of its own: a mirrored playlist's, or a channel rule's.
    const into = job.saveFolder || (job.type === 'download' ? profilesUi.folderFor(job) : '');
    desktopApi.saveJob(job.id, CLIENT_ID, count, media > 1 ? job.title : '', meta.artist || meta.uploader || '', meta.album || '', into);
  } else {
    for (let n = 0; n < count; n++) {
      const a = document.createElement('a');
      a.href = fileUrl(job, n);
      a.download = (job.files && job.files[n] && job.files[n].name) || '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    saved.set(job.id, 'saved');
  }
}

if (desktopApi) {
  desktopApi.onSaved(({ jobId, ok, error }) => {
    saved.set(jobId, ok ? 'saved' : 'failed');
    if (ok) {
      // The files now live in the user's folder; free the temp copies.
      api(`/api/jobs/${jobId}/file`, { method: 'DELETE' }).catch(() => {});
      const j = jobs.get(jobId);
      if (j && j.saveFolder) mirrorSync.saved(j.saveFolder);
    } else if (error) {
      showStatus(ts(error), 'error');
    }
    const job = jobs.get(jobId);
    if (job) renderRow(job);
    renderHistory();
    // "Done" with "Abrir" / "Mostrar en la carpeta", once the file is in its folder.
    if (ok && job && prefsApi.get().notify && !document.hasFocus() && desktopApi.notifyDone) {
      desktopApi.notifyDone({ jobId, title: job.type === 'convert' ? t('Conversión terminada') : t('Descarga terminada'), body: job.fileName || job.title });
    }
  });
}

// Mirrored playlists: after each check (and as their files arrive) the app
// brings the folder in line with the playlist and rewrites its .m3u8.
const mirrorSync = (() => {
  const last = new Map(); // folder -> { folder, title, ids }
  const timers = new Map();
  function run(info) {
    if (!desktopApi || !desktopApi.syncMirror) return;
    desktopApi.syncMirror(info).then((r) => {
      if (r && r.removed) showToast(t('{n} archivos que ya no están en «{p}» se han movido a la papelera', { n: r.removed, p: info.title }));
    }).catch(() => {});
  }
  return {
    update(info) { last.set(info.folder, info); run(info); },
    saved(folder) {
      const info = last.get(folder);
      if (!info) return;
      clearTimeout(timers.get(folder));
      timers.set(folder, setTimeout(() => run(info), 3000));
    },
  };
})();

function notify(job) {
  if (!isElectronApp || !prefsApi.get().notify || document.hasFocus() || typeof Notification === 'undefined') return;
  // A finished one is announced once saved, with buttons (see onSaved).
  if (job.status === 'done' && desktopApi && desktopApi.notifyDone) return;
  const title = job.status === 'done' ? (job.type === 'convert' ? t('Conversión terminada') : t('Descarga terminada')) : t('Algo falló');
  try { new Notification(title, { body: job.status === 'done' ? (job.fileName || job.title) : `${job.title}: ${ts(job.error)}`, silent: false }); } catch { /* ignore */ }
}

/** Tells the desktop app a task ended; it decides whether to send it to the phone (ntfy). */
function notifyPhone(job) {
  if (!desktopApi || !desktopApi.jobFinished) return;
  const ok = job.status === 'done';
  desktopApi.jobFinished({
    ok,
    seconds: job.finishedAt && job.createdAt ? Math.round((job.finishedAt - job.createdAt) / 1000) : 0,
    title: ok ? (job.type === 'convert' ? t('Conversión terminada') : t('Descarga terminada')) : t('Algo falló'),
    message: ok ? (job.fileName || job.title) : `${job.title}: ${ts(job.error)}`,
  });
}

function statusLine(job) {
  switch (job.status) {
    case 'queued': return t('En cola');
    case 'paused': return t('En pausa');
    case 'running':
    case 'processing': {
      const parts = [ts(job.stage)];
      if (job.progress !== null && job.progress !== undefined) parts.push(`${job.progress}%`);
      if (job.speed) parts.push(`${formatBytes(job.speed)}/s`);
      if (job.eta) parts.push(t('quedan {t}', { t: formatEta(job.eta) }));
      return parts.join(' · ');
    }
    case 'done': {
      // After a reload the page forgets what it saved; the app released the
      // temp copy only once it was in the user's folder.
      const s = saved.get(job.id) || (desktopApi && job.released ? 'saved' : undefined);
      const size = job.fileSize ? formatBytes(job.fileSize) : '';
      if (s === 'saving') return `${t('Guardando…')} ${size}`;
      if (s === 'saved') return desktopApi ? `${t('Guardado')} · ${size}` : `${t('Completado')} · ${size}`;
      if (s === 'failed') return t('No se pudo guardar');
      return `${t('Completado')} · ${size}`;
    }
    case 'canceled': return t('Cancelado');
    case 'error': return ts(job.error) || t('Error');
    default: return ts(job.stage) || '';
  }
}

// Static, trusted SVG markup (never built from job data).
const svg = (d, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  download: svg('<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  convert: svg('<path d="M17 3l4 4-4 4"/><path d="M3 11V9a2 2 0 0 1 2-2h16"/><path d="M7 21l-4-4 4-4"/><path d="M21 13v2a2 2 0 0 1-2 2H3"/>'),
  done: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.2),
  error: svg('<path d="M12 8v5"/><path d="M12 16.5v.01"/><circle cx="12" cy="12" r="9"/>'),
  canceled: svg('<circle cx="12" cy="12" r="9"/><path d="M8 16L16 8"/>'),
  paused: svg('<path d="M9 6v12M15 6v12"/>', 2.2),
  stop: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'),
  reveal: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>'),
  open: svg('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>'),
  save: svg('<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  remove: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
  retry: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>'),
  pause: svg('<path d="M9 6v12M15 6v12"/>', 2),
  play: svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
  up: svg('<path d="M12 19V5m0 0l-6 6m6-6l6 6"/>'),
  down: svg('<path d="M12 5v14m0 0l-6-6m6 6l6-6"/>'),
  top: svg('<path d="M5 4h14"/><path d="M12 20V8m0 0l-5 5m5-5l5 5"/>'),
  now: svg('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
  stopSave: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 13l2 2 4-4"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  star: svg('<path d="M12 3.6l2.55 5.2 5.75.84-4.16 4.05.98 5.72L12 16.7l-5.12 2.71.98-5.72L3.7 9.64l5.75-.84z"/>'),
  addList: svg('<path d="M4 6h11M4 11h11M4 16h6"/><path d="M18 13v8M14 17h8"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
};
const PRIORITY_NEXT = { normal: 'high', high: 'low', low: 'normal' };
const PRIORITY_LABEL = { high: 'Urgente', normal: 'Normal', low: 'Cuando haya tiempo' };

function iconButton(icon, label, onClick, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `queue-btn ${cls}`;
  b.innerHTML = ICONS[icon];
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

const jobAction = (job, action, body) => api(`/api/jobs/${job.id}/${action}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
}).catch((e) => showToast(e.message));

function renderRow(job) {
  let li = rows.get(job.id);
  if (!li) {
    li = document.createElement('li');
    li.className = 'queue-item';
    li.innerHTML = `
      <div class="queue-icon"></div>
      <div class="queue-main">
        <span class="queue-title"></span>
        <div class="queue-bar"><div class="queue-fill"></div></div>
        <span class="queue-status"></span>
      </div>
      <div class="queue-actions"></div>`;
    rows.set(job.id, li);
    queueList.appendChild(li);
    sortRows();
  }
  li.dataset.status = job.status;
  const iconKey = ['done', 'error', 'canceled', 'paused'].includes(job.status) ? job.status : (job.type === 'convert' ? 'convert' : 'download');
  const icon = li.querySelector('.queue-icon');
  if (icon.dataset.icon !== iconKey) { icon.innerHTML = ICONS[iconKey]; icon.dataset.icon = iconKey; }

  const title = li.querySelector('.queue-title');
  title.textContent = job.fileName && job.status === 'done' && (job.files || []).length === 1 ? job.fileName : job.title;
  title.title = job.source || job.title;
  li.querySelector('.queue-fill').style.width = `${job.progress ?? 0}%`;
  li.classList.toggle('indeterminate', ACTIVE.has(job.status) && job.status !== 'queued' && (job.progress === null || job.progress === undefined));
  const files = (job.files || []).length > 1 ? ` · ${t('{n} archivos', { n: job.files.length })}` : '';
  li.querySelector('.queue-status').textContent = job.status === 'error'
    ? statusLine(job)
    : `${job.detail ? `${ts(job.detail)} — ` : ''}${statusLine(job)}${job.status === 'done' ? files : ''}`;

  const actions = li.querySelector('.queue-actions');
  actions.innerHTML = '';
  const add = (...args) => actions.appendChild(iconButton(...args));
  li.dataset.priority = job.priority || 'normal';
  if (job.status === 'queued' || job.status === 'paused') {
    const p = job.priority || 'normal';
    add('flag', t('Prioridad: {p} (pulsa para cambiarla)', { p: t(PRIORITY_LABEL[p]) }), () => jobAction(job, 'priority', { priority: PRIORITY_NEXT[p] }), `prio-${p}`);
    if (desktopApi) add('now', t('Empezar ya, sin esperar turno'), () => jobAction(job, 'now'));
    add('top', t('Que sea lo siguiente'), () => jobAction(job, 'move', { where: 'top' }), 'queue-only-btn');
    add('up', t('Subir en la cola'), () => jobAction(job, 'move', { where: 'up' }), 'queue-only-btn');
    add('down', t('Bajar en la cola'), () => jobAction(job, 'move', { where: 'down' }), 'queue-only-btn');
  }
  // A live recording: stop it now and keep what was recorded.
  if (job.stoppable) add('stopSave', t('Parar y guardar la grabación'), () => jobAction(job, 'stop'), 'primary');
  if (job.status === 'paused') add('play', t('Reanudar'), () => jobAction(job, 'resume'), 'primary');
  else if (job.pausable && job.status !== 'queued') add('pause', t('Pausar'), () => jobAction(job, 'pause'));
  if (ACTIVE.has(job.status) || job.status === 'paused') {
    add('stop', t('Cancelar'), () => jobAction(job, 'cancel'));
  } else {
    if (job.retryable) add('retry', t('Reintentar'), () => jobAction(job, 'retry'), 'primary');
    if (job.status === 'done') {
      if (desktopApi && (saved.get(job.id) === 'saved' || job.released)) {
        add('open', (job.files || []).length > 1 ? t('Abrir la carpeta') : t('Abrir'), () => desktopApi.openSaved(job.id), 'primary');
        add('reveal', t('Mostrar en la carpeta'), () => desktopApi.showInFolder(job.id));
      } else if (!job.released) {
        add('save', t('Guardar'), () => autoSave(job), 'primary');
      }
    }
    add('remove', t('Quitar de la lista'), () => api(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {}));
  }
}

// Newest first for finished jobs; waiting ones in queue order at the top.
function sortRows() {
  const list = [...jobs.values()].sort((a, b) => {
    const wa = ACTIVE.has(a.status) || a.status === 'paused';
    const wb = ACTIVE.has(b.status) || b.status === 'paused';
    if (wa !== wb) return wa ? -1 : 1;
    const rank = (j) => ({ high: 0, normal: 1, low: 2 }[j.priority] ?? 1);
    return wa ? rank(a) - rank(b) || a.order - b.order : b.createdAt - a.createdAt;
  });
  for (const job of list) {
    const li = rows.get(job.id);
    if (li) queueList.appendChild(li);
  }
}

function removeRow(id) {
  const li = rows.get(id);
  if (li) li.remove();
  rows.delete(id);
  jobs.delete(id);
  saved.delete(id);
  liveJobs.delete(id);
}

let lastActiveCount = 0;
function renderQueueMeta() {
  const all = [...jobs.values()];
  const active = all.filter((j) => ACTIVE.has(j.status));
  const paused = all.filter((j) => j.status === 'paused');
  $('queueEmpty').classList.toggle('hidden', all.length > 0);
  $('btnClearFinished').classList.toggle('hidden', all.length === active.length + paused.length);
  $('btnPauseAll').classList.toggle('hidden', !active.some((j) => j.pausable));
  $('btnResumeAll').classList.toggle('hidden', !paused.length);
  $('btnRetryFailed').classList.toggle('hidden', !all.some((j) => j.status === 'error' && j.retryable));
  $('queueCount').textContent = active.length ? t('{n} en curso', { n: active.length }) : (paused.length ? t('{n} en pausa', { n: paused.length }) : '');
  const badge = $('navBadge');
  badge.textContent = String(active.length);
  badge.classList.toggle('hidden', active.length === 0);
  if (active.length !== lastActiveCount) sortRows();
  lastActiveCount = active.length;

  if (desktopApi) {
    const running = active.filter((j) => j.status !== 'queued');
    if (!active.length) desktopApi.setProgress(-1);
    else if (!running.some((j) => typeof j.progress === 'number')) desktopApi.setProgress(2); // indeterminate
    else desktopApi.setProgress(running.reduce((acc, j) => acc + (j.progress || 0), 0) / running.length / 100);
  }
}

$('btnClearFinished').addEventListener('click', () => {
  for (const job of jobs.values()) {
    if (!ACTIVE.has(job.status) && job.status !== 'paused') api(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {});
  }
});
$('btnPauseAll').addEventListener('click', () => postJson('/api/jobs/pause-all', {}).catch((e) => showToast(e.message)));
$('btnRetryFailed').addEventListener('click', async () => {
  const failed = [...jobs.values()].filter((j) => j.status === 'error' && j.retryable);
  let ok = 0;
  for (const job of failed) {
    try { await postJson(`/api/jobs/${job.id}/retry`, {}); ok += 1; } catch { /* stays failed */ }
  }
  showToast(t('{n} reintentando', { n: ok }));
});
$('btnResumeAll').addEventListener('click', () => postJson('/api/jobs/pause-all', { resume: true }).catch((e) => showToast(e.message)));

// === Biblioteca (desktop): what's in the download folder, a player and "send to phone" ===
ICONS.phone = svg('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>');
ICONS.music = svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>');
ICONS.video = svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>');
ICONS.addList = svg('<path d="M4 6h11M4 12h11M4 18h7M18 15v6M15 18h6"/>');

const library = (() => {
  const MAX_ROWS = 400;
  const NEW_LIST = '__new';
  let files = [];
  let kind = '';
  let loaded = false;
  let playlists = [];
  let current = '';              // the playlist shown ('' = everything; '§…' = a smart list)
  let viewMode = 'list';         // 'list' | 'grid' (covers)
  let lyricHits = null;          // Map id -> matching line, while searching the lyrics
  let lyricInfo = null;
  const SMART = {
    '§unplayed': { name: 'Sin escuchar', pick: (fs) => fs.filter((f) => f.kind === 'audio' && !f.plays).sort((a, b) => b.mtime - a.mtime) },
    '§month': { name: 'Añadidas este mes', pick: (fs) => fs.filter((f) => Date.now() - f.mtime < 31 * 24 * 3600 * 1000).sort((a, b) => b.mtime - a.mtime) },
    '§top': { name: 'Las más escuchadas', pick: (fs) => fs.filter((f) => f.plays > 0).sort((a, b) => b.plays - a.plays || b.lastPlayed - a.lastPlayed).slice(0, 100) },
    '§recent': { name: 'Escuchadas hace poco', pick: (fs) => fs.filter((f) => f.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 100) },
    '§stars': { name: 'Con 4 o 5 estrellas', pick: (fs) => fs.filter((f) => f.rating >= 4).sort((a, b) => b.rating - a.rating || b.mtime - a.mtime) },
  };
  const libUrl = (f) => `/api/library/file?client=${CLIENT_ID}&id=${f.id}`;
  const coverUrl = (f) => `/api/library/cover?client=${CLIENT_ID}&id=${f.id}`;
  const relOf = (f) => (f.folder ? `${f.folder}/${f.name}` : f.name);

  function visible() {
    const q = $('libSearch').value.trim().toLowerCase();
    // "Search in the lyrics": the songs whose words contain it (or whose name does).
    const match = (f) => !q || `${f.folder} ${f.name}`.toLowerCase().includes(q) || Boolean(lyricHits && lyricHits.has(f.id));
    if (SMART[current]) return SMART[current].pick(files).filter(match);
    if (current) {
      const pl = playlists.find((p) => p.id === current);
      if (!pl) return [];
      const byId = new Map(files.map((f) => [f.id, f]));
      // In the list's own order; files that are gone are skipped.
      return pl.items.map((id, i) => (id && byId.has(id) ? { ...byId.get(id), _index: i } : null)).filter((f) => f && match(f));
    }
    const list = files.filter((f) => (!kind || (kind === 'fav' ? f.fav : f.kind === kind)) && match(f));
    const sort = $('libSort').value;
    const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    if (sort === 'name') list.sort(byName);
    else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating || Number(b.fav) - Number(a.fav) || b.mtime - a.mtime);
    else if (sort === 'size') list.sort((a, b) => b.size - a.size);
    else if (sort === 'plays') list.sort((a, b) => (b.plays || 0) - (a.plays || 0) || (b.lastPlayed || 0) - (a.lastPlayed || 0));
    else list.sort((a, b) => b.mtime - a.mtime);
    // Grouped: folders together (keeping the order inside each).
    if ($('libGroup').checked) list.sort((a, b) => a.folder.localeCompare(b.folder, undefined, { sensitivity: 'base' }));
    return list;
  }
  async function setMeta(f, patch) {
    try {
      const m = await postJson('/api/library/meta', { id: f.id, ...patch });
      const real = files.find((x) => x.id === f.id) || f;
      Object.assign(real, { fav: m.fav, rating: m.rating, plays: m.plays, lastPlayed: m.lastPlayed });
      render();
    } catch (err) { showToast(err.message); }
  }
  function metaControls(f) {
    const box = document.createElement('div');
    box.className = 'lib-meta';
    const heart = document.createElement('button');
    heart.type = 'button';
    heart.className = `lib-fav${f.fav ? ' on' : ''}`;
    heart.textContent = f.fav ? '♥' : '♡';
    heart.title = f.fav ? t('Quitar de favoritos') : t('Añadir a favoritos');
    heart.setAttribute('aria-label', heart.title);
    heart.setAttribute('aria-pressed', String(f.fav));
    heart.addEventListener('click', () => setMeta(f, { fav: !f.fav }));
    const stars = document.createElement('span');
    stars.className = 'lib-stars';
    stars.setAttribute('role', 'radiogroup');
    stars.setAttribute('aria-label', t('Valoración'));
    for (let n = 1; n <= 5; n++) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = n <= f.rating ? 'on' : '';
      s.textContent = '★';
      s.title = t('{n} de 5', { n });
      s.setAttribute('aria-label', s.title);
      s.setAttribute('role', 'radio');
      s.setAttribute('aria-checked', String(n === f.rating));
      s.addEventListener('click', () => setMeta(f, { rating: f.rating === n ? 0 : n }));
      stars.appendChild(s);
    }
    box.append(heart, stars);
    return box;
  }

  // ---- own playlists ----
  function renderLists() {
    const sel = $('libPlaylist');
    sel.innerHTML = '';
    const add = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; sel.appendChild(o); };
    add('', t('Todo'));
    for (const [id, s] of Object.entries(SMART)) add(id, `✦ ${t(s.name)}`);
    for (const p of playlists) add(p.id, `♫ ${p.name} (${p.items.filter(Boolean).length})`);
    add(NEW_LIST, t('+ Lista nueva…'));
    if (!playlists.some((p) => p.id === current) && !SMART[current]) current = '';
    sel.value = current;
    const pl = playlists.find((p) => p.id === current);
    const smart = SMART[current];
    $('libPlBar').classList.toggle('hidden', !pl && !smart);
    if (pl || smart) $('libPlName').textContent = pl ? pl.name : t(smart.name);
    ['libPlExport', 'libPlRename', 'libPlDelete'].forEach((id) => $(id).classList.toggle('hidden', Boolean(smart)));
    $('libFilter').classList.toggle('hidden', Boolean(pl || smart));
    $('libSort').classList.toggle('hidden', Boolean(pl || smart));
  }
  async function loadLists() {
    try { playlists = (await api('/api/library/playlists')).playlists || []; } catch { playlists = []; }
    renderLists();
  }
  async function newList(add = []) {
    const r = await ask({ title: t('Lista nueva'), input: '', buttons: [{ label: t('Cancelar'), value: null }, { label: t('Crear'), value: 'ok', primary: true }] });
    if (!r || !r.text) return null;
    try {
      const res = await postJson('/api/library/playlists', { name: r.text, add });
      playlists = res.playlists;
      return res.id;
    } catch (err) { showToast(err.message); return null; }
  }
  const patchList = async (id, patch) => {
    try {
      playlists = (await api(`/api/library/playlists/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })).playlists;
    } catch (err) { showToast(err.message); }
    renderLists();
    render();
  };
  async function addToList(f) {
    const choice = await ask({
      title: t('Añadir a una lista'), text: f.name.replace(/\.[^.]+$/, ''),
      buttons: [{ label: t('Cancelar'), value: null }, ...playlists.slice(0, 8).map((p) => ({ label: p.name, value: p.id })), { label: t('Lista nueva…'), value: NEW_LIST, primary: true }],
    });
    if (!choice) return;
    if (choice === NEW_LIST) { if (await newList([f.id])) { renderLists(); showToast(t('Añadido a la lista')); } return; }
    await patchList(choice, { add: [f.id] });
    showToast(t('Añadido a la lista'));
  }
  $('libPlaylist').addEventListener('change', async () => {
    const v = $('libPlaylist').value;
    if (v === NEW_LIST) {
      const id = await newList();
      current = id || current;
    } else current = v;
    renderLists();
    render();
  });
  $('libPlPlay').addEventListener('click', () => { const shown = visible(); if (shown.length) player.play(shown, 0); });
  $('libPlExport').addEventListener('click', async () => {
    try { const r = await postJson(`/api/library/playlists/${current}/export`, {}); showToast(t('Guardada como «{f}» en tu carpeta de descargas', { f: r.file })); } catch (err) { showToast(err.message); }
  });
  $('libPlRename').addEventListener('click', async () => {
    const pl = playlists.find((p) => p.id === current);
    const r = pl && await ask({ title: t('Nombre de la lista'), input: pl.name, buttons: [{ label: t('Cancelar'), value: null }, { label: t('Guardar'), value: 'ok', primary: true }] });
    if (r && r.text) patchList(current, { name: r.text });
  });
  $('libPlDelete').addEventListener('click', async () => {
    const pl = playlists.find((p) => p.id === current);
    const ok = pl && await ask({ title: t('¿Borrar la lista «{n}»?', { n: pl.name }), text: t('Las canciones no se borran, solo la lista.'), buttons: [{ label: t('Cancelar'), value: null }, { label: t('Borrar'), value: true, primary: true }] });
    if (!ok) return;
    try { playlists = (await api(`/api/library/playlists/${current}`, { method: 'DELETE' })).playlists; } catch { /* ignore */ }
    current = '';
    renderLists();
    render();
  });

  // Covers for the grid: a couple at a time (the server makes them one by one).
  const coverQueue = [];
  let coverBusy = 0;
  function loadCover(img, f, tries = 0) {
    coverQueue.push({ img, f, tries });
    pumpCovers();
  }
  function pumpCovers() {
    while (coverBusy < 2 && coverQueue.length) {
      const { img, f, tries } = coverQueue.shift();
      if (!img.isConnected) continue;
      coverBusy += 1;
      fetch(coverUrl(f), { headers: { 'x-client-id': CLIENT_ID } }).then(async (r) => {
        if (r.status === 429 && tries < 5) { setTimeout(() => loadCover(img, f, tries + 1), 400 * (tries + 1)); return; }
        if (!r.ok) return;
        const url = URL.createObjectURL(await r.blob());
        img.onload = () => { img.classList.add('loaded'); URL.revokeObjectURL(url); };
        img.src = url;
      }).catch(() => {}).finally(() => { coverBusy -= 1; pumpCovers(); });
    }
  }

  function renderGrid(list, shown) {
    for (const f of shown.slice(0, MAX_ROWS)) {
      const li = document.createElement('li');
      li.className = `lib-card${player.current() && player.current().id === f.id ? ' playing' : ''}`;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lib-card-main';
      b.innerHTML = `<span class="lib-card-art">${ICONS[f.kind === 'video' ? 'video' : 'music']}<img alt=""></span><span class="lib-card-name"></span><span class="lib-card-sub"></span>`;
      b.querySelector('.lib-card-name').textContent = f.name.replace(/\.[^.]+$/, '');
      b.querySelector('.lib-card-sub').textContent = lyricHits && lyricHits.get(f.id) ? `«${lyricHits.get(f.id)}»` : (f.folder || formatDate(f.mtime));
      b.title = relOf(f);
      b.addEventListener('click', () => player.play(shown, shown.indexOf(f)));
      li.appendChild(b);
      list.appendChild(li);
      if (f.kind === 'audio') loadCover(b.querySelector('img'), f);
    }
  }

  function render() {
    const list = $('libList');
    const shown = visible();
    list.innerHTML = '';
    coverQueue.length = 0;
    list.classList.toggle('lib-grid', viewMode === 'grid');
    $('libEmpty').classList.toggle('hidden', shown.length > 0 || !loaded);
    $('libEmptyText').textContent = current ? t('Esta lista está vacía: añade canciones con el botón ＋ de cada una.')
      : files.length ? t('Nada coincide con la búsqueda.') : t('Aún no hay nada en tu carpeta de descargas.');
    list.parentElement.classList.toggle('hidden', !shown.length);
    $('libCount').textContent = !loaded ? t('Cargando…')
      : shown.length > MAX_ROWS ? t('{n} archivos · se muestran {m}; busca para encontrar el resto', { n: shown.length, m: MAX_ROWS })
        : t('{n} archivos', { n: shown.length });
    if (lyricInfo && lyricInfo.indexing) $('libCount').textContent += ` · ${t('leyendo letras {a}/{b}…', { a: lyricInfo.done, b: lyricInfo.total })}`;
    if (viewMode === 'grid') { renderGrid(list, shown); return; }
    let lastFolder = null;
    for (const f of shown.slice(0, MAX_ROWS)) {
      if (!current && $('libGroup').checked && f.folder !== lastFolder) {
        lastFolder = f.folder;
        const h = document.createElement('li');
        h.className = 'lib-group-head';
        h.textContent = f.folder || t('Carpeta principal');
        list.appendChild(h);
      }
      const li = document.createElement('li');
      li.className = `lib-item${player.current() && player.current().id === f.id ? ' playing' : ''}`;
      const main = document.createElement('button');
      main.type = 'button';
      main.className = 'lib-main';
      main.innerHTML = `<span class="lib-icon">${ICONS[f.kind === 'video' ? 'video' : 'music']}</span><span class="lib-text"><span class="lib-name"></span><span class="lib-sub"></span></span>`;
      main.querySelector('.lib-name').textContent = f.name.replace(/\.[^.]+$/, '');
      main.querySelector('.lib-sub').textContent = lyricHits && lyricHits.get(f.id) ? `«${lyricHits.get(f.id)}»`
        : [f.folder, formatBytes(f.size), formatDate(f.mtime), f.plays ? (f.plays === 1 ? t('1 vez') : t('{n} veces', { n: f.plays })) : '', f.lrc ? t('con letra') : ''].filter(Boolean).join(' · ');
      main.title = relOf(f);
      main.addEventListener('click', () => player.play(shown, shown.indexOf(f)));
      const actions = document.createElement('div');
      actions.className = 'queue-actions';
      if (current && !SMART[current]) {
        const i = f._index;
        const pl = playlists.find((p) => p.id === current);
        if (i > 0) actions.appendChild(iconButton('up', t('Subir'), () => patchList(current, { move: [i, i - 1] })));
        if (pl && i < pl.items.length - 1) actions.appendChild(iconButton('down', t('Bajar'), () => patchList(current, { move: [i, i + 1] })));
        actions.appendChild(iconButton('remove', t('Quitar de la lista'), () => patchList(current, { remove: i })));
      } else {
        actions.append(
          iconButton('addList', t('Añadir a una lista'), () => addToList(f)),
          iconButton('phone', t('Enviar al móvil'), () => shareToPhone(f)),
          iconButton('reveal', t('Mostrar en la carpeta'), () => desktopApi.showLibraryFile(relOf(f))),
        );
      }
      li.append(main, metaControls(f), actions);
      list.appendChild(li);
    }
  }

  async function load() {
    loaded = false;
    render();
    try {
      const res = await api('/api/library');
      files = res.files || [];
    } catch (err) {
      files = [];
      showToast(err.message);
    }
    loaded = true;
    await loadLists();
    render();
  }

  // ---- duplicates ----
  async function findDuplicates() {
    const modal = $('dupesModal');
    const box = $('dupesList');
    box.innerHTML = '';
    $('dupesHint').textContent = t('Buscando…');
    modal.classList.remove('hidden');
    $('dupesClose').focus();
    let groups = [];
    try {
      groups = (await api('/api/library/duplicates')).groups || [];
      files = (await api('/api/library')).files || files;
    } catch (err) { $('dupesHint').textContent = err.message; return; }
    const byId = new Map(files.map((f) => [f.id, f]));
    $('dupesHint').textContent = groups.length
      ? t('{n} grupos. «Idénticos» son copias exactas; «Mismo nombre», el mismo título en otro sitio o formato. Lo que mandes a la papelera se puede recuperar.', { n: groups.length })
      : t('No hay duplicados en tu biblioteca.');
    for (const g of groups) {
      const group = document.createElement('div');
      group.className = 'dupes-group';
      const head = document.createElement('div');
      head.className = 'dupes-kind';
      head.textContent = g.kind === 'same' ? t('Idénticos') : t('Mismo nombre');
      group.appendChild(head);
      for (const id of g.ids) {
        const f = byId.get(id);
        if (!f) continue;
        const row = document.createElement('div');
        row.className = 'dupes-row';
        const name = document.createElement('span');
        name.className = 'dupes-name';
        name.textContent = relOf(f);
        name.title = relOf(f);
        const meta = document.createElement('span');
        meta.className = 'dupes-meta';
        meta.textContent = [formatBytes(f.size), formatDate(f.mtime), f.fav ? '♥' : ''].filter(Boolean).join(' · ');
        const trash = document.createElement('button');
        trash.type = 'button';
        trash.className = 'link-btn';
        trash.textContent = t('A la papelera');
        trash.addEventListener('click', async () => {
          const r = await desktopApi.trashLibraryFile(relOf(f));
          if (r && r.ok) { row.classList.add('gone'); trash.disabled = true; trash.textContent = t('En la papelera'); files = files.filter((x) => x.id !== f.id); }
          else showToast(t('No se pudo mover a la papelera.'));
        });
        row.append(name, meta, trash);
        group.appendChild(row);
      }
      box.appendChild(group);
    }
  }
  const closeDupes = () => { $('dupesModal').classList.add('hidden'); render(); };
  $('libDupes').addEventListener('click', findDuplicates);
  $('dupesClose').addEventListener('click', closeDupes);
  $('dupesModal').addEventListener('click', (e) => { if (e.target === $('dupesModal')) closeDupes(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('dupesModal').classList.contains('hidden')) closeDupes(); });

  // ---- search inside the lyrics (indexed by the server the first time) ----
  let lyricTimer = null;
  async function searchLyrics() {
    const q = $('libSearch').value.trim();
    if (!$('libInLyrics').checked || q.length < 3) { lyricHits = null; lyricInfo = null; render(); return; }
    try {
      const r = await api(`/api/library/lyrics-search?q=${encodeURIComponent(q)}`);
      if ($('libSearch').value.trim() !== q) return;
      lyricHits = new Map(r.results.map((x) => [x.id, x.line]));
      lyricInfo = r;
      render();
      // Still reading the words of some songs: ask again in a moment.
      if (r.indexing) { clearTimeout(lyricTimer); lyricTimer = setTimeout(searchLyrics, 2500); }
    } catch (err) { showToast(err.message); }
  }
  $('libSearch').addEventListener('input', () => { render(); clearTimeout(lyricTimer); lyricTimer = setTimeout(searchLyrics, 450); });
  $('libInLyrics').addEventListener('change', searchLyrics);
  $('libView').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    viewMode = b.dataset.view;
    $('libView').querySelectorAll('[data-view]').forEach((x) => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
    try { localStorage.setItem('tubegrab_libview', viewMode); } catch { /* ignore */ }
    render();
  });
  try {
    if (localStorage.getItem('tubegrab_libview') === 'grid') { viewMode = 'grid'; $('libView').querySelectorAll('[data-view]').forEach((x) => { x.classList.toggle('active', x.dataset.view === 'grid'); x.setAttribute('aria-checked', String(x.dataset.view === 'grid')); }); }
  } catch { /* storage unavailable */ }
  // Many songs to the phone at once: one QR for all of them.
  $('libSendAll').addEventListener('click', () => { const shown = visible(); shareManyToPhone(shown, t('{n} archivos de TubeGrab', { n: shown.length })); });
  $('libPlPhone').addEventListener('click', () => shareManyToPhone(visible(), $('libPlName').textContent));
  $('libSort').addEventListener('change', () => { try { localStorage.setItem('tubegrab_libsort', $('libSort').value); } catch { /* ignore */ } render(); });
  $('libGroup').addEventListener('change', () => { try { localStorage.setItem('tubegrab_libgroup', $('libGroup').checked ? '1' : ''); } catch { /* ignore */ } render(); });
  try {
    const sort = localStorage.getItem('tubegrab_libsort');
    if ([...$('libSort').options].some((o) => o.value === sort)) $('libSort').value = sort;
    $('libGroup').checked = localStorage.getItem('tubegrab_libgroup') === '1';
  } catch { /* storage unavailable */ }
  $('libRefresh').addEventListener('click', load);
  $('libFilter').addEventListener('click', (e) => {
    const b = e.target.closest('.kind-btn');
    if (!b) return;
    kind = b.dataset.kind;
    $('libFilter').querySelectorAll('.kind-btn').forEach((x) => x.classList.toggle('active', x === b));
    render();
  });
  document.addEventListener('tg:view', (e) => { if (e.detail === 'library') load(); });
  // The files without showing anything (for the player and Ctrl+K): read
  // again if the last time was a while ago (new downloads).
  let pending = null;
  let fetchedAt = 0;
  function ensure() {
    if (loaded && Date.now() - fetchedAt < 2 * 60 * 1000) return Promise.resolve(files);
    if (!pending) {
      pending = api('/api/library').then((r) => { files = r.files || []; loaded = true; fetchedAt = Date.now(); return files; }, () => files).finally(() => { pending = null; });
    }
    return loaded ? Promise.resolve(files) : pending;
  }
  if (desktopApi) setTimeout(() => { ensure(); }, 4000);
  return {
    render,
    url: libUrl,
    cover: coverUrl,
    files: () => files,
    ensure,
    relOf,
    load,
    /** One more play (counted once the song has really been listened to). */
    played: (f) => setMeta(f, { played: true }),
  };
})();

// A player bar at the bottom: plays a list, keeps going across pages, with
// an equalizer, fades between songs, synced lyrics, the TV and a mini window.
const player = (() => {
  const A = $('plMedia');        // shows video too
  const B = $('plMediaB');       // a second deck, for fading into the next song
  let deck = A;
  let list = [];
  let index = -1;
  let shuffle = false;
  let repeat = false;
  let seeking = false;
  let fading = null;             // { from, to, nextIndex, timer }
  let countedFor = null;         // the play already counted
  let radio = false;             // at the end of the list, keep going with similar songs
  const recent = [];             // ids played lately (radio doesn't repeat them)
  const cur = () => list[index] || null;
  const nameOf = (f) => f.name.replace(/\.[^.]+$/, '');
  const srcOf = (f) => library.url(f);
  const coverOf = (f) => library.cover(f);
  /** "Artist - Title" from the file name, else the folder as the artist. */
  const tagsOf = (f) => {
    const base = f.name.replace(/\.[^.]+$/, '').replace(/\s*\[[\w-]{6,}\]$/, '').replace(/^\d{1,3}[\s.\-_]+/, '');
    const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
    if (m) return { artist: m[1].trim(), track: m[2].trim() };
    return { artist: (f.folder || '').split('/').pop(), track: base };
  };

  // A song's key that survives a restart (library ids change every run).
  const songKey = (f) => (f ? `f:${library.relOf(f)}` : null);

  // ---- sound (Web Audio): equalizer, same loudness, speed, sleep timer,
  // visualizer. Saved per viewer (not the speed: every run starts at normal).
  const BANDS = [60, 230, 910, 3600, 14000];
  const PRESETS = {
    flat: [0, 0, 0, 0, 0], bass: [6, 4, 0, -1, -1], vocal: [-2, -1, 3, 4, 1], rock: [4, 2, -1, 2, 4], pop: [-1, 2, 4, 2, -1], classical: [3, 1, -1, 1, 3],
    electronic: [5, 3, 0, 2, 4], night: [-4, -1, 1, 1, -2],
  };
  const SPEEDS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  const EQ_KEY = 'tubegrab_eq';
  const okGains = (g) => Array.isArray(g) && g.length === BANDS.length && g.every((x) => Number.isFinite(x) && x >= -12 && x <= 12);
  const eq = { preset: 'flat', gains: [0, 0, 0, 0, 0], crossfade: 0, level: false, speed: 1, pitch: true, viz: 'bars', vizMini: false, mine: [], unplug: true };
  try {
    const raw = JSON.parse(localStorage.getItem(EQ_KEY));
    if (raw && Array.isArray(raw.mine)) {
      eq.mine = raw.mine.filter((p) => p && typeof p.name === 'string' && p.name.trim() && okGains(p.gains)).slice(0, 20).map((p) => ({ name: p.name.trim().slice(0, 40), gains: p.gains.slice() }));
    }
    if (raw && (raw.preset in PRESETS || raw.preset === 'custom' || (typeof raw.preset === 'string' && eq.mine.some((p) => `mine:${p.name}` === raw.preset)))) eq.preset = raw.preset;
    if (raw && okGains(raw.gains)) eq.gains = raw.gains;
    if (raw && [0, 2, 4, 6, 10, 12].includes(raw.crossfade)) eq.crossfade = raw.crossfade;
    if (raw && ['bars', 'wave', 'off'].includes(raw.viz)) eq.viz = raw.viz;
    if (raw) { eq.level = raw.level === true; eq.pitch = raw.pitch !== false; eq.vizMini = raw.vizMini === true; eq.unplug = raw.unplug !== false; }
  } catch { /* defaults */ }
  const saveEq = () => {
    const { speed, ...keep } = eq;
    try { localStorage.setItem(EQ_KEY, JSON.stringify(keep)); } catch { /* ignore */ }
  };
  let actx = null;
  let voice = null;              // karaoke: { dry, wet }
  let karaoke = false;
  let filters = [];
  let limiter = null;
  let master = null;             // the sleep timer fades this one out
  let scope = null;              // what the visualizer draws
  const gains = new Map();       // deck -> its fade (crossfades)
  const levels = new Map();      // deck -> its loudness correction ("same volume")
  const meters = new Map();      // deck -> what measures how loud it is
  function graph() {
    if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; }
    try {
      actx = new AudioContext();
      filters = BANDS.map((f, i) => {
        const b = actx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f;
        b.Q.value = 1;
        b.gain.value = eq.gains[i];
        return b;
      });
      limiter = actx.createDynamicsCompressor();
      master = actx.createGain();
      scope = actx.createAnalyser();
      scope.fftSize = 2048;
      scope.smoothingTimeConstant = 0.78;
      filters.reduce((a, b) => { a.connect(b); return b; }).connect(limiter).connect(master).connect(actx.destination);
      master.connect(scope);
      // Karaoke: left minus right takes out what's in the middle (the voice);
      // the bass, also in the middle, comes back through a low-pass.
      const vin = actx.createGain();
      const dry = actx.createGain();
      const wet = actx.createGain();
      dry.gain.value = karaoke ? 0 : 1;
      wet.gain.value = karaoke ? 1 : 0;
      const split = actx.createChannelSplitter(2);
      const left = actx.createGain();
      const right = actx.createGain();
      right.gain.value = -1;
      const side = actx.createGain();
      side.channelCount = 1;
      side.channelCountMode = 'explicit';
      side.gain.value = 1.3;
      const bass = actx.createBiquadFilter();
      bass.type = 'lowpass';
      bass.frequency.value = 150;
      vin.connect(dry).connect(filters[0]);
      vin.connect(split);
      split.connect(left, 0);
      split.connect(right, 1);
      left.connect(side);
      right.connect(side);
      side.connect(wet);
      vin.connect(bass).connect(wet);
      wet.connect(filters[0]);
      voice = { dry, wet };
      for (const m of [A, B]) {
        const src = actx.createMediaElementSource(m);
        const g = actx.createGain();
        const lv = actx.createGain();
        const meter = actx.createAnalyser();
        meter.fftSize = 2048;
        src.connect(g).connect(lv).connect(vin);
        src.connect(meter);
        gains.set(m, g);
        levels.set(m, lv);
        meters.set(m, meter);
      }
      setLimiter();
      // Where it sounds (after this, so a choice saved can never stop the sound).
      setTimeout(() => applySink(), 0);
    } catch { actx = null; }
  }
  // Only on when something can push the sound over the top (louder songs, boosted bands).
  function setLimiter() {
    if (!limiter) return;
    const on = eq.level || eq.gains.some((g) => g > 0);
    limiter.threshold.value = on ? -1.5 : 0;
    limiter.knee.value = 0;
    limiter.ratio.value = on ? 20 : 1;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
  }

  // Same volume for every song: how loud it really is, measured while it
  // plays (the average power of what isn't silence), pulled gently towards
  // one level; remembered per song, so next time it starts right.
  const LEVEL_KEY = 'tubegrab_levels';
  const TARGET_DB = -16;
  const levelMemo = (() => { try { const o = JSON.parse(localStorage.getItem(LEVEL_KEY)); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } })();
  const meter = { key: null, power: 0, n: 0, want: null };
  const meterBuf = new Float32Array(2048);
  const levelOf = (f) => { const v = levelMemo[songKey(f)]; return Number.isFinite(v) && Math.abs(v) <= 12 ? v : 0; };
  function rememberLevel() {
    if (!meter.key || meter.want === null || meter.n < 40) return;
    delete levelMemo[meter.key];
    levelMemo[meter.key] = Math.round(meter.want * 10) / 10;
    const keys = Object.keys(levelMemo);
    if (keys.length > 800) delete levelMemo[keys[0]];
    try { localStorage.setItem(LEVEL_KEY, JSON.stringify(levelMemo)); } catch { /* ignore */ }
  }
  /** The loudness correction a deck starts a song with. */
  function setLevel(m, f) {
    const lv = levels.get(m);
    if (!lv) return;
    lv.gain.cancelScheduledValues(0);
    lv.gain.value = eq.level && f && f.kind !== 'video' ? 10 ** (levelOf(f) / 20) : 1;
  }
  function measure() {
    const f = cur();
    if (!eq.level || !actx || !f || deck.paused || cast.active() || f.kind === 'video') return;
    const an = meters.get(deck);
    const lv = levels.get(deck);
    const key = songKey(f);
    if (!an || !lv || !key) return;
    if (meter.key !== key) { rememberLevel(); meter.key = key; meter.power = 0; meter.n = 0; meter.want = null; $('sndLevelNow').textContent = ''; }
    const vol = deck.muted ? 0 : deck.volume;
    if (vol < 0.05) return;
    an.getFloatTimeDomainData(meterBuf);
    let sum = 0;
    for (let i = 0; i < meterBuf.length; i++) sum += meterBuf[i] * meterBuf[i];
    // The page's volume is applied before this point: measured without it.
    const p = sum / meterBuf.length / (vol * vol);
    if (p < 3e-5) return; // quieter than about -45 dB: a pause, a fade
    meter.n = Math.min(meter.n + 1, 240);
    meter.power += (p - meter.power) / meter.n;
    if (meter.n < 8) return;
    meter.want = Math.max(-12, Math.min(8, TARGET_DB - 10 * Math.log10(meter.power)));
    lv.gain.setTargetAtTime(10 ** (meter.want / 20), actx.currentTime, 1.5);
    $('sndLevelNow').textContent = t('Esta canción: {d} dB', { d: `${meter.want > 0 ? '+' : ''}${meter.want.toFixed(1).replace('.', ',')}` });
  }
  setInterval(measure, 250);

  // Speed (and whether the voice keeps its pitch).
  function applySpeed(m) {
    m.defaultPlaybackRate = eq.speed;
    m.playbackRate = eq.speed;
    m.preservesPitch = eq.pitch;
  }

  function applyEq() {
    filters.forEach((f, i) => { f.gain.value = eq.gains[i]; });
    $('eqBands').querySelectorAll('input').forEach((el, i) => { el.value = String(eq.gains[i]); el.title = `${eq.gains[i] > 0 ? '+' : ''}${eq.gains[i]} dB`; });
    const mine = $('eqMine');
    mine.innerHTML = '';
    mine.label = t('Tuyos');
    $('eqStyles').label = t('Estilos');
    for (const p of eq.mine) { const o = document.createElement('option'); o.value = `mine:${p.name}`; o.textContent = p.name; mine.appendChild(o); }
    mine.hidden = !eq.mine.length;
    $('eqPreset').value = eq.preset;
    $('eqDelete').classList.toggle('hidden', !eq.preset.startsWith('mine:'));
    $('eqCrossfade').value = String(eq.crossfade);
    $('sndLevel').checked = eq.level;
    $('sndSpeed').value = String(eq.speed);
    $('sndPitch').checked = eq.pitch;
    $('sndViz').value = eq.viz;
    $('sndVizMini').checked = eq.vizMini;
    $('sndUnplug').checked = eq.unplug;
    $('plEqBtn').classList.toggle('on', eq.speed !== 1 || Boolean(sleep));
    setLimiter();
    saveEq();
  }
  (() => {
    const box = $('eqBands');
    const labels = ['60 Hz', '230 Hz', '910 Hz', '3,6 kHz', '14 kHz'];
    BANDS.forEach((_, i) => {
      const wrap = document.createElement('label');
      wrap.className = 'eq-band';
      wrap.innerHTML = '<input type="range" min="-12" max="12" step="1"><span></span>';
      wrap.querySelector('span').textContent = labels[i];
      const input = wrap.querySelector('input');
      input.setAttribute('aria-label', labels[i]);
      input.addEventListener('input', () => { eq.gains[i] = Number(input.value); eq.preset = 'custom'; applyEq(); });
      box.appendChild(wrap);
    });
  })();
  $('eqPreset').addEventListener('change', () => {
    eq.preset = $('eqPreset').value;
    const mine = eq.mine.find((p) => `mine:${p.name}` === eq.preset);
    if (PRESETS[eq.preset]) eq.gains = PRESETS[eq.preset].slice();
    else if (mine) eq.gains = mine.gains.slice();
    applyEq();
  });
  $('eqSave').addEventListener('click', async () => {
    const r = await ask({ title: t('Nombre para estas bandas:'), input: eq.preset.startsWith('mine:') ? eq.preset.slice(5) : t('Mi sonido'), buttons: [{ label: t('Cancelar'), value: null }, { label: t('Guardar'), value: 'ok', primary: true }] });
    const name = r ? r.text.slice(0, 40) : '';
    if (!name) return;
    const old = eq.mine.findIndex((p) => p.name === name);
    if (old >= 0) eq.mine.splice(old, 1);
    else if (eq.mine.length >= 20) { showToast(t('Como mucho 20 estilos tuyos: borra alguno antes.')); return; }
    eq.mine.push({ name, gains: eq.gains.slice() });
    eq.preset = `mine:${name}`;
    applyEq();
    showToast(t('Guardado como «{name}»', { name }));
  });
  $('eqDelete').addEventListener('click', () => {
    const name = eq.preset.slice(5);
    eq.mine = eq.mine.filter((p) => p.name !== name);
    eq.preset = 'custom';
    applyEq();
  });
  $('eqCrossfade').addEventListener('change', () => { eq.crossfade = Number($('eqCrossfade').value); applyEq(); });
  $('sndLevel').addEventListener('change', () => {
    eq.level = $('sndLevel').checked;
    graph();
    if (!eq.level) { rememberLevel(); $('sndLevelNow').textContent = ''; }
    for (const m of [A, B]) setLevel(m, m === deck ? cur() : null);
    meter.key = null;
    applyEq();
  });
  $('sndSpeed').addEventListener('change', () => {
    const v = Number($('sndSpeed').value);
    eq.speed = SPEEDS.includes(v) ? v : 1;
    for (const m of [A, B]) applySpeed(m);
    // A long one (a book): this speed is its own from now on.
    const f = cur();
    const k = f && isLong(deck) ? posKey(f) : null;
    if (k) { positions[k] = { ...(positions[k] || {}), s: eq.speed, at: Date.now() }; savePositions(); bookSpeed = true; }
    applyEq();
  });
  $('sndPitch').addEventListener('change', () => { eq.pitch = $('sndPitch').checked; for (const m of [A, B]) applySpeed(m); applyEq(); });
  $('sndViz').addEventListener('change', () => { eq.viz = $('sndViz').value; applyEq(); });
  $('sndVizMini').addEventListener('change', () => { eq.vizMini = $('sndVizMini').checked; applyEq(); levelsToMini(); });

  // ---- sleep timer: the music fades out over the last 30 s and stops ----
  let sleep = null;              // { at: ms } or { song: true }
  let sleepTimer = null;
  function sleepLeft() {
    if (!sleep) return null;
    if (sleep.at) return (sleep.at - Date.now()) / 1000;
    const left = deck.duration - deck.currentTime;
    return Number.isFinite(left) ? left / (deck.playbackRate || 1) : null;
  }
  function unfade() {
    if (!master || !actx) return;
    master.gain.cancelScheduledValues(actx.currentTime);
    master.gain.setValueAtTime(1, actx.currentTime);
  }
  function renderSleep() {
    const left = sleepLeft();
    const el = $('sndSleepLeft');
    el.classList.toggle('hidden', !sleep);
    if (sleep) el.textContent = sleep.song ? t('La música se parará al acabar esta canción.') : t('La música se parará dentro de {t}.', { t: formatDuration(Math.max(0, Math.ceil(left || 0))) || '0:00' });
    $('plEqBtn').title = sleep && !sleep.song ? t('Sonido · temporizador: {t}', { t: formatDuration(Math.max(0, Math.ceil(left || 0))) }) : t('Sonido: ecualizador, velocidad y temporizador');
  }
  function endSleep(paused) {
    clearInterval(sleepTimer);
    sleepTimer = null;
    const was = sleep;
    sleep = null;
    $('sndSleep').value = '0';
    if (paused) {
      if (!deck.paused) deck.pause();
      // Back to full volume once paused (so the next play isn't silent).
      setTimeout(unfade, 300);
      showToast(t('Temporizador: música en pausa. ¡Buenas noches!'));
    } else unfade();
    renderSleep();
    applyEq();
    return was;
  }
  function sleepTick() {
    if (!sleep) return;
    const left = sleepLeft();
    renderSleep();
    if (left === null || deck.paused) return;
    if (left <= 30 && master && actx && !sleep.fading) {
      sleep.fading = true;
      master.gain.cancelScheduledValues(actx.currentTime);
      master.gain.setValueAtTime(master.gain.value, actx.currentTime);
      master.gain.linearRampToValueAtTime(0.0001, actx.currentTime + Math.max(1, left));
    }
    // "At the end of this song" stops on 'ended'; a time, here.
    if (sleep.at && left <= 0) endSleep(true);
  }
  function setSleep(v) {
    clearInterval(sleepTimer);
    sleepTimer = null;
    unfade();
    sleep = v === 'song' ? { song: true } : Number(v) > 0 ? { at: Date.now() + Number(v) * 60000 } : null;
    if (sleep) { graph(); sleepTimer = setInterval(sleepTick, 1000); }
    renderSleep();
    applyEq();
    if (sleep) showToast(sleep.song ? t('La música se parará al acabar esta canción') : t('La música se parará dentro de {n} min', { n: Number(v) }));
  }
  $('sndSleep').addEventListener('change', () => setSleep($('sndSleep').value));

  // ---- visualizer: the "Ahora suena" view, and the mini player's bars ----
  const freq = new Uint8Array(1024);
  const wave = new Uint8Array(2048);
  /** n bars (0–255) from low to high, spread like the ear hears them. */
  function bars(n) {
    if (!scope) return null;
    scope.getByteFrequencyData(freq);
    const out = new Array(n);
    const lo = 2;
    const hi = 600; // ~13 kHz at 44.1 kHz
    for (let i = 0; i < n; i++) {
      const a = Math.floor(lo * (hi / lo) ** (i / n));
      const b = Math.max(a + 1, Math.floor(lo * (hi / lo) ** ((i + 1) / n)));
      let m = 0;
      for (let k = a; k < b; k++) m = Math.max(m, freq[k]);
      out[i] = m;
    }
    return out;
  }
  function drawViz(canvas, color) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.clearRect(0, 0, w, h);
    if (eq.viz === 'off' || !scope || deck.paused) return;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (eq.viz === 'wave') {
      scope.getByteTimeDomainData(wave);
      ctx.lineWidth = 3 * dpr;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const step = wave.length / w;
      for (let x = 0; x < w; x += 2) {
        const v = wave[Math.floor(x * step)] / 128 - 1;
        const y = h * 0.6 - v * h * 0.35;
        if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      return;
    }
    const n = Math.max(24, Math.min(96, Math.floor(w / (14 * dpr))));
    const v = bars(n);
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const bh = Math.max(2 * dpr, (v[i] / 255) ** 1.6 * h * 0.9);
      const x = i * bw + bw * 0.18;
      ctx.beginPath();
      ctx.roundRect(x, h - bh, bw * 0.64, bh, [3 * dpr, 3 * dpr, 0, 0]);
      ctx.fill();
    }
  }
  // The mini player can't hear the music itself: a few bars, a few times a second.
  let miniOpen = false;
  let miniViz = null;
  function levelsToMini() {
    const want = eq.vizMini && miniOpen && desktopApi && desktopApi.playerLevels && !deck.paused && eq.viz !== 'off';
    if (want && !miniViz) miniViz = setInterval(() => { const v = bars(20); if (v) desktopApi.playerLevels(v); }, 70);
    if (!want && miniViz) { clearInterval(miniViz); miniViz = null; if (desktopApi && desktopApi.playerLevels) desktopApi.playerLevels([]); }
  }

  applyEq();

  // ---- what's playing ----
  function show(f) {
    $('player').classList.remove('hidden');
    document.body.classList.add('has-player');
    $('plTitle').textContent = nameOf(f);
    $('plSub').textContent = f.folder || '';
    const icon = $('plIcon');
    icon.innerHTML = ICONS[f.kind === 'video' ? 'video' : 'music'];
    if (f.kind !== 'video') {
      // The song's own cover, when it has one.
      const img = new Image();
      img.alt = '';
      img.className = 'player-cover';
      img.onload = () => { if (cur() === f) { icon.innerHTML = ''; icon.appendChild(img); } };
      img.src = coverOf(f);
    }
    const isVideo = f.kind === 'video';
    $('plExpand').classList.toggle('hidden', !isVideo);
    $('plFull').classList.toggle('hidden', !isVideo);
    $('playerVideoWrap').classList.toggle('hidden', !isVideo);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: $('plTitle').textContent, artist: f.folder || 'TubeGrab', ...(isVideo ? {} : { artwork: [{ src: coverOf(f), sizes: '400x400', type: 'image/jpeg' }] }),
      });
    }
    countedFor = null;
    recent.unshift(f.id);
    recent.length = Math.min(recent.length, 30);
    lyrics.load(f);
    subs.load(f);
    library.render();
    renderQueue();
    pushState();
    nowView.song(f);
  }

  // ---- "Up next": the list from here on, to jump to, remove or reorder ----
  function renderQueue() {
    const ol = $('plQueueList');
    if ($('plQueue').classList.contains('hidden')) return;
    ol.innerHTML = '';
    list.forEach((f, i) => {
      if (i < index) return;
      const li = document.createElement('li');
      li.className = i === index ? 'now' : '';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'plq-main';
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      if (f.kind !== 'video') img.src = coverOf(f); else img.style.visibility = 'hidden';
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const text = document.createElement('span');
      text.className = 'plq-text';
      const name = document.createElement('span');
      name.className = 'plq-title';
      name.textContent = nameOf(f);
      const sub = document.createElement('span');
      sub.className = 'plq-sub';
      sub.textContent = f.folder || '';
      text.append(name, sub);
      b.append(img, text);
      b.addEventListener('click', () => { if (i !== index) { index = i; start(); } });
      li.appendChild(b);
      if (i !== index) {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'queue-btn';
        x.innerHTML = ICONS.remove;
        x.title = t('Quitar de la lista');
        x.setAttribute('aria-label', x.title);
        x.addEventListener('click', () => { list.splice(i, 1); renderQueue(); pushState(); });
        li.appendChild(x);
      }
      ol.appendChild(li);
    });
    if (ol.children.length <= 1) {
      const li = document.createElement('li');
      li.className = 'plq-empty';
      li.textContent = radio ? t('Al acabar seguirán canciones parecidas (modo radio).') : t('No hay nada más en la lista. Añade canciones desde la Biblioteca o activa el modo radio.');
      ol.appendChild(li);
    }
  }
  /** Adds songs after the one playing ("next") or at the end. */
  function enqueue(items, { next = false } = {}) {
    if (!items.length) return;
    if (!cur()) { play(items, 0); return; }
    list.splice(next ? index + 1 : list.length, 0, ...items);
    renderQueue();
    pushState();
    showToast(items.length === 1 ? t('«{t}» añadida a la lista', { t: nameOf(items[0]) }) : t('{n} canciones añadidas a la lista', { n: items.length }));
  }
  $('plQueueClear').addEventListener('click', () => { list.splice(index + 1); renderQueue(); pushState(); });

  // ---- radio: similar songs from your library, once the list runs out ----
  function radioNext() {
    const f = cur();
    const all = library.files().filter((x) => x.kind === 'audio' && !recent.includes(x.id));
    if (!f || !all.length) return null;
    const me = tagsOf(f);
    const fold = (s) => String(s || '').toLowerCase();
    const score = (x) => {
      const t2 = tagsOf(x);
      let s = Math.random() * 1.5;
      if (me.artist && fold(t2.artist) === fold(me.artist)) s += 3;
      if (x.folder && x.folder === f.folder) s += 2;
      if (x.fav) s += 1;
      s += Math.min(2, (x.rating || 0) / 2);
      if (x.plays) s += Math.min(1, x.plays / 10);
      return s;
    };
    return all.map((x) => [x, score(x)]).sort((a, b) => b[1] - a[1])[0][0];
  }
  // ---- the subtitles next to a video (.srt / .vtt) ----
  const subs = (() => {
    let tracks = [];
    let on = -1;
    async function load(f) {
      A.querySelectorAll('track').forEach((tr) => tr.remove());
      tracks = [];
      on = -1;
      $('plSubs').classList.add('hidden');
      if (f.kind !== 'video') return;
      try { tracks = (await api(`/api/library/subs?id=${f.id}`)).tracks || []; } catch { tracks = []; }
      if (cur() !== f || !tracks.length) return;
      tracks.forEach((s, i) => {
        const el = document.createElement('track');
        el.kind = 'subtitles';
        el.label = s.lang ? s.lang.toUpperCase() : `${t('Subtítulos')} ${i + 1}`;
        if (s.lang) el.srclang = s.lang.slice(0, 2);
        el.src = `/api/library/subs?client=${CLIENT_ID}&id=${f.id}&n=${s.n}`;
        A.appendChild(el);
      });
      $('plSubs').classList.remove('hidden');
      set(0);
    }
    function set(i) {
      on = i;
      [...A.textTracks].forEach((tt, k) => { tt.mode = k === on ? 'showing' : 'disabled'; });
      $('plSubs').classList.toggle('on', on >= 0);
      $('plSubs').setAttribute('aria-pressed', String(on >= 0));
      $('plSubs').title = on >= 0 ? `${t('Subtítulos')}: ${A.textTracks[on] ? A.textTracks[on].label : ''}` : t('Subtítulos: no');
    }
    // Each click: the next language, then off.
    $('plSubs').addEventListener('click', () => set(on + 1 < tracks.length ? on + 1 : -1));
    return { load };
  })();
  function play(items, i) {
    list = items.slice();
    index = i;
    start();
  }
  function start() {
    const f = cur();
    if (!f) return;
    cancelFade();
    if (cast.active()) { cast.playFile(f); show(f); return; }
    // Videos always on the deck that can show them.
    const target = f.kind === 'video' ? A : deck;
    const other = target === A ? B : A;
    other.pause();
    deck = target;
    graph();
    if (gains.get(deck)) gains.get(deck).gain.value = 1;
    deck.src = srcOf(f);
    applySpeed(deck);
    setLevel(deck, f);
    // Coming back to it: where it was (paused, when the app opens), or a long one's own place.
    const hold = resumeHold;
    resumeHold = null;
    const place = hold ? null : posOf(f);
    if (hold && hold.time) seekWhenReady(deck, hold.time);
    else if (place) { seekWhenReady(deck, place.t); showToast(t('Sigues donde lo dejaste: {t}', { t: formatDuration(place.t) })); }
    if (!hold) deck.play().catch(() => {});
    show(f);
  }
  function nextIndex(dir) {
    if (!list.length) return -1;
    if (dir > 0 && shuffle && list.length > 1) {
      let n = index;
      while (n === index) n = Math.floor(Math.random() * list.length);
      return n;
    }
    return (index + dir + list.length) % list.length;
  }
  function step(dir) {
    if (!list.length) return;
    if (dir < 0 && deck.currentTime > 3 && !cast.active()) { deck.currentTime = 0; return; }
    index = nextIndex(dir);
    start();
  }
  function close() {
    cancelFade();
    if (sleep) endSleep(false);
    nowView.hide();
    for (const m of [A, B]) { m.pause(); m.removeAttribute('src'); m.load(); }
    list = [];
    index = -1;
    // Closed on purpose: nothing to come back to.
    try { localStorage.removeItem(RESUME_KEY); } catch { /* ignore */ }
    $('player').classList.add('hidden');
    document.body.classList.remove('has-player');
    $('plLyrics').classList.add('hidden');
    $('plEq').classList.add('hidden');
    library.render();
    pushState();
  }

  // ---- fade into the next song (audio only) ----
  function cancelFade() {
    if (!fading) return;
    clearTimeout(fading.timer);
    if (gains.get(fading.to)) gains.get(fading.to).gain.cancelScheduledValues(0);
    fading.to.pause();
    if (gains.get(fading.from)) { gains.get(fading.from).gain.cancelScheduledValues(0); gains.get(fading.from).gain.value = 1; }
    fading = null;
  }
  function maybeFade() {
    const f = cur();
    if (!eq.crossfade || fading || repeat || !actx || cast.active() || !f || f.kind === 'video' || (sleep && sleep.song)) return;
    // In real seconds (a faster song ends sooner).
    const left = (deck.duration - deck.currentTime) / (deck.playbackRate || 1);
    if (!Number.isFinite(left) || left > eq.crossfade || left <= 0.3) return;
    const n = index < list.length - 1 || shuffle ? nextIndex(1) : -1;
    const next = list[n];
    if (!next || next.kind === 'video') return;
    const from = deck;
    const to = deck === A ? B : A;
    const now = actx.currentTime;
    const gFrom = gains.get(from);
    const gTo = gains.get(to);
    to.src = srcOf(next);
    to.volume = from.volume;
    to.muted = from.muted;
    applySpeed(to);
    setLevel(to, next);
    gTo.gain.setValueAtTime(0, now);
    gTo.gain.linearRampToValueAtTime(1, now + left);
    gFrom.gain.setValueAtTime(1, now);
    gFrom.gain.linearRampToValueAtTime(0, now + left);
    to.play().catch(() => {});
    fading = {
      from, to,
      timer: setTimeout(() => {
        from.pause();
        gFrom.gain.cancelScheduledValues(0);
        gFrom.gain.value = 1;
        fading = null;
        deck = to;
        index = n;
        show(next);
      }, left * 1000),
    };
  }

  // ---- events (only the deck in use drives the bar) ----
  for (const m of [A, B]) {
    m.addEventListener('play', () => { if (m === deck) { $('plPlay').classList.add('playing'); pushState(); levelsToMini(); nowView.sync(); } });
    m.addEventListener('pause', () => { if (m === deck && !fading) { $('plPlay').classList.remove('playing'); pushState(); levelsToMini(); nowView.sync(); saveResume(true); if (cur()) keepPlace(m, cur()); } });
    m.addEventListener('loadedmetadata', () => {
      if (m !== deck) return;
      // A long one: ±30 s, its chapters and its own speed.
      $('player').classList.toggle('long', isLong(m));
      if (cur()) speedFor(cur(), m);
      if (isLong(m) && cur()) loadChapters(cur()); else { chapters = []; $('plChapters').classList.add('hidden'); }
      $('plSeek').max = String(m.duration || 1);
      $('plDur').textContent = formatDuration(Math.round(m.duration)) || '0:00';
    });
    m.addEventListener('timeupdate', () => {
      if (m !== deck) return;
      if (!seeking) $('plSeek').value = String(m.currentTime);
      $('plTime').textContent = formatDuration(Math.floor(m.currentTime)) || '0:00';
      lyrics.at(m.currentTime);
      // Counted as a play after 30 s (or half of a short song).
      const f = cur();
      if (f && countedFor !== f && m.currentTime > Math.min(30, (m.duration || 60) / 2)) { countedFor = f; library.played(f); }
      maybeFade();
      pushStateSoon();
      saveResume();
      if (f && isLong(m) && Date.now() - placeSaved > 10000) { placeSaved = Date.now(); keepPlace(m, f); }
    });
    m.addEventListener('ended', async () => {
      if (m !== deck || fading) return;
      keepPlace(m, cur(), true);
      if (sleep && sleep.song) { endSleep(true); return; }
      if (repeat) { m.currentTime = 0; m.play().catch(() => {}); return; }
      if (index < list.length - 1 || shuffle) step(1);
      else if (radio) {
        const next = radioNext();
        if (next) { list.push(next); index = list.length - 1; start(); }
      }
    });
    m.addEventListener('error', () => {
      if (m !== deck || !cur() || !m.getAttribute('src')) return;
      showToast(t('No se puede reproducir este archivo aquí.'));
    });
  }
  const toggle = () => {
    if (cast.active()) { cast.toggle(); return; }
    if (deck.paused) { graph(); deck.play().catch(() => {}); } else deck.pause();
  };
  $('plPlay').addEventListener('click', toggle);
  $('plNext').addEventListener('click', () => step(1));
  $('plPrev').addEventListener('click', () => step(-1));
  $('plClose').addEventListener('click', close);
  $('plSeek').addEventListener('input', () => { seeking = true; $('plTime').textContent = formatDuration(Math.floor(Number($('plSeek').value))) || '0:00'; });
  $('plSeek').addEventListener('change', () => {
    const v = Number($('plSeek').value);
    if (cast.active()) cast.seek(v); else { cancelFade(); deck.currentTime = v; }
    seeking = false;
  });
  $('plVolume').addEventListener('input', () => { A.volume = Number($('plVolume').value); B.volume = A.volume; });
  $('plShuffle').addEventListener('click', () => { shuffle = !shuffle; $('plShuffle').classList.toggle('on', shuffle); $('plShuffle').setAttribute('aria-pressed', String(shuffle)); });
  $('plRepeat').addEventListener('click', () => { repeat = !repeat; $('plRepeat').classList.toggle('on', repeat); $('plRepeat').setAttribute('aria-pressed', String(repeat)); });
  $('plRadio').addEventListener('click', () => {
    radio = !radio;
    $('plRadio').classList.toggle('on', radio);
    $('plRadio').setAttribute('aria-pressed', String(radio));
    showToast(radio ? t('Modo radio: al acabar la lista seguirán canciones parecidas') : t('Modo radio desactivado'));
    renderQueue();
  });
  // Volume and mute from the keyboard, the mini player and the taskbar.
  const setVolume = (v) => {
    const vol = Math.min(1, Math.max(0, Math.round(v * 20) / 20));
    A.volume = vol;
    B.volume = vol;
    $('plVolume').value = String(vol);
    if (vol > 0 && A.muted) { A.muted = false; B.muted = false; }
    pushState();
  };
  const toggleMute = () => { A.muted = !A.muted; B.muted = A.muted; $('player').classList.toggle('muted', A.muted); pushState(); showToast(A.muted ? t('Silenciado') : t('Con sonido')); };
  const stopPlayback = () => { if (cast.active()) { cast.toggle(); return; } cancelFade(); deck.pause(); deck.currentTime = 0; pushState(); };
  const seekBy = (s) => { if (!cur() || cast.active()) return; cancelFade(); deck.currentTime = Math.min(Math.max(0, deck.currentTime + s), (deck.duration || 0) - 0.1); };
  $('plExpand').addEventListener('click', () => $('playerVideoWrap').classList.toggle('hidden'));
  $('plFull').addEventListener('click', () => { if (A.requestFullscreen) A.requestFullscreen().catch(() => {}); });
  const panel = (id, btn) => {
    const open = $(id).classList.contains('hidden');
    ['plLyrics', 'plEq', 'plQueue'].forEach((p) => $(p).classList.add('hidden'));
    ['plLyricsBtn', 'plEqBtn', 'plQueueBtn'].forEach((b) => $(b).setAttribute('aria-pressed', 'false'));
    $(id).classList.toggle('hidden', !open);
    $(btn).setAttribute('aria-pressed', String(open));
    if (open && id === 'plLyrics') lyrics.at(deck.currentTime, true);
    if (open && id === 'plQueue') renderQueue();
  };
  $('plQueueBtn').addEventListener('click', () => panel('plQueue', 'plQueueBtn'));
  $('plQueueClose').addEventListener('click', () => panel('plQueue', 'plQueueBtn'));
  $('plLyricsBtn').addEventListener('click', () => panel('plLyrics', 'plLyricsBtn'));
  $('plEqBtn').addEventListener('click', () => { graph(); panel('plEq', 'plEqBtn'); });
  $('plLyricsClose').addEventListener('click', () => panel('plLyrics', 'plLyricsBtn'));
  $('plEqClose').addEventListener('click', () => panel('plEq', 'plEqBtn'));
  if ('mediaSession' in navigator) {
    // The keyboard's media keys and Windows' media overlay.
    navigator.mediaSession.setActionHandler('play', () => toggle());
    navigator.mediaSession.setActionHandler('pause', () => toggle());
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  }

  // ---- synced lyrics ----
  // Follows the song frame by frame (not the media element's few updates a
  // second): the line being sung fills in like karaoke, the next ones come up
  // smoothly. If a version starts earlier or later than the lyrics, ± moves
  // them (remembered per song). Shown in the bar's panel and in "Ahora suena",
  // with the translation under each line when asked.
  const lyrics = (() => {
    let lines = [];              // synced: [{ t, text }]
    let plain = [];              // without times: just the lines
    let loaded = false;
    let at = -1;
    let forSong = null;
    let raf = 0;
    let offset = 0;
    let tr = null;               // the translation, one per shown line
    let trFor = null;
    const TR_KEY = 'tubegrab_lyrics_tr';
    let trOn = (() => { try { return localStorage.getItem(TR_KEY) === '1'; } catch { return false; } })();
    const OFFSET_KEY = 'tubegrab_lyric_offsets';
    const offsets = (() => { try { const o = JSON.parse(localStorage.getItem(OFFSET_KEY)); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } })();
    const boxes = () => [$('plLyricsLines'), $('nowLyricsLines')];
    const visible = (box) => (box.id === 'plLyricsLines' ? !$('plLyrics').classList.contains('hidden') : nowView.lyricsShown());
    const anyVisible = () => boxes().some(visible);
    const shown = () => (lines.length ? lines.map((l) => l.text) : plain);
    const seekTo = (sec) => { const to = Math.max(0, sec - offset); if (cast.active()) cast.seek(to); else deck.currentTime = to; };
    function saveOffset() {
      const k = songKey(forSong);
      if (!k) return;
      if (offset) offsets[k] = offset; else delete offsets[k];
      const keys = Object.keys(offsets);
      if (keys.length > 300) delete offsets[keys[0]];
      try { localStorage.setItem(OFFSET_KEY, JSON.stringify(offsets)); } catch { /* ignore */ }
    }
    function showOffset() {
      $('plLyricsOffset').textContent = offset ? t('Desfase {s} s', { s: `${offset > 0 ? '+' : ''}${offset.toFixed(1).replace('.', ',')}` }) : t('Sin desfase');
      $('plLyricsSync').classList.toggle('hidden', !lines.length);
    }
    function render() {
      const texts = shown();
      for (const box of boxes()) {
        box.innerHTML = '';
        texts.forEach((text, i) => {
          const li = document.createElement('li');
          if (!lines.length) li.className = 'plain';
          const words = document.createElement('span');
          words.className = 'ly-text';
          words.textContent = text || (lines.length ? '♪' : ' ');
          li.appendChild(words);
          if (tr && tr[i] && tr[i].toLowerCase() !== String(text).toLowerCase()) {
            const under = document.createElement('span');
            under.className = 'ly-tr';
            under.textContent = tr[i];
            li.appendChild(under);
          }
          if (lines.length) li.addEventListener('click', () => seekTo(lines[i].t));
          box.appendChild(li);
        });
      }
      at = -1;
      const none = loaded && !texts.length;
      $('plLyricsEmpty').classList.toggle('hidden', !none);
      $('nowLyricsEmpty').classList.toggle('hidden', !none);
      for (const b of ['plLyricsTr', 'nowTr']) {
        $(b).classList.toggle('hidden', !texts.length);
        $(b).setAttribute('aria-pressed', String(trOn));
        $(b).classList.toggle('on', trOn);
      }
      showOffset();
      if (lines.length) paint(deck.currentTime, true);
    }
    async function load(f) {
      lines = [];
      plain = [];
      tr = null;
      trFor = null;
      loaded = false;
      forSong = f;
      const k = songKey(f);
      offset = k && Number.isFinite(offsets[k]) && Math.abs(offsets[k]) <= 30 ? offsets[k] : 0;
      $('plLyricsHint').classList.add('hidden');
      render();
      if (f.kind === 'video') { loaded = true; render(); return; }
      let res = null;
      // A downloaded song without words of its own: looked up on LRCLIB too.
      try { res = await api(`/api/library/lyrics?id=${f.id}&online=1`); } catch { /* none */ }
      if (forSong !== f) return;
      if (res && res.synced && res.synced.length) {
        lines = res.synced;
        // A video version that's much longer than the song: its intro may push the words late.
        const dur = Number.isFinite(deck.duration) ? deck.duration : f.duration;
        if (res.duration && Number.isFinite(dur) && Math.abs(dur - res.duration) > 4) $('plLyricsHint').classList.remove('hidden');
      } else if (res && res.plain) {
        plain = res.plain.split('\n');
      }
      loaded = true;
      render();
      loop();
      if (trOn) translate(false);
    }
    /** The lyrics in the app's language, under each line. */
    async function translate(asked) {
      const f = forSong;
      const texts = shown();
      if (!f || !texts.length) return;
      if (trFor === f) { render(); return; }
      const to = prefsApi.get().lang === 'en' ? 'en' : 'es';
      try {
        const r = await postJson('/api/lyrics/translate', { lines: texts.slice(0, 250).map((x) => String(x).slice(0, 300)), to });
        if (forSong !== f) return;
        trFor = f;
        tr = Array.isArray(r.lines) ? r.lines : null;
        if (r.from && r.from.split('-')[0] === to) { tr = null; if (asked) showToast(t('La letra ya está en tu idioma.')); }
        render();
      } catch (err) { if (asked) showToast(err.message); }
    }
    function setTranslate(on) {
      trOn = on;
      try { localStorage.setItem(TR_KEY, on ? '1' : '0'); } catch { /* ignore */ }
      if (on) translate(true); else { tr = null; trFor = null; render(); }
    }
    function lineAt(sec) {
      let lo = 0; let hi = lines.length - 1; let found = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= sec) { found = mid; lo = mid + 1; } else hi = mid - 1; }
      return found;
    }
    function paint(sec, force = false) {
      if (!lines.length) return;
      const s = sec + offset + 0.05;
      const i = lineAt(s);
      const changed = i !== at || force;
      // How far into the line: the karaoke fill.
      let p = 0;
      if (i >= 0) {
        const start = lines[i].t;
        const end = i + 1 < lines.length ? lines[i + 1].t : start + 5;
        p = Math.min(1, Math.max(0, (s - start) / Math.max(0.3, Math.min(end - start, 12))));
      }
      for (const box of boxes()) {
        const el = i >= 0 ? box.children[i] : null;
        if (changed) {
          box.querySelectorAll('.on, .past').forEach((x) => { x.classList.remove('on', 'past'); x.style.removeProperty('--p'); });
          for (let k = Math.max(0, i - 3); k < i; k++) if (box.children[k]) box.children[k].classList.add('past');
          if (el) {
            el.classList.add('on');
            if (visible(box)) el.scrollIntoView({ block: 'center', behavior: prefsApi.get().reduceMotion ? 'auto' : 'smooth' });
          }
        }
        if (el) el.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
      }
      at = i;
    }
    // Frame by frame while the words are on screen and the song plays.
    function loop() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!lines.length || !anyVisible()) return;
      const tick = () => {
        if (!lines.length || !anyVisible() || cast.active()) { raf = 0; return; }
        paint(deck.currentTime);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    const nudge = (d) => { offset = Math.max(-30, Math.min(30, Math.round((offset + d) * 10) / 10)); saveOffset(); showOffset(); paint(deck.currentTime, true); };
    $('plLyricsEarlier').addEventListener('click', () => nudge(-0.5));
    $('plLyricsLater').addEventListener('click', () => nudge(0.5));
    $('plLyricsReset').addEventListener('click', () => { offset = 0; saveOffset(); showOffset(); paint(deck.currentTime, true); });
    $('plLyricsTr').addEventListener('click', () => setTranslate(!trOn));
    $('nowTr').addEventListener('click', () => setTranslate(!trOn));
    return {
      load,
      at(sec, force = false) { if (force) { paint(sec, true); loop(); } else if (!raf || !anyVisible()) paint(sec); },
    };
  })();

  // ---- "Ahora suena": the song in big, its words karaoke-style, the visualizer ----
  const nowView = (() => {
    const view = $('nowView');
    const NOW_KEY = 'tubegrab_now_lyrics';
    let open = false;
    let showLyrics = (() => { try { return localStorage.getItem(NOW_KEY) !== '0'; } catch { return true; } })();
    let lastFocus = null;
    let raf = 0;
    let dragging = false;
    let tint = 'rgba(255, 255, 255, 0.45)';
    /** The cover's colours: its average (the background) and its most vivid one. */
    function colours(img) {
      try {
        const c = document.createElement('canvas');
        c.width = 24;
        c.height = 24;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0; let g = 0; let b = 0; let best = null; let bestScore = -1;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]; g += d[i + 1]; b += d[i + 2];
          const mx = Math.max(d[i], d[i + 1], d[i + 2]);
          const mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const score = mx ? ((mx - mn) / mx) * (mx / 255) : 0;
          if (mx > 70 && score > bestScore) { bestScore = score; best = [d[i], d[i + 1], d[i + 2]]; }
        }
        const n = d.length / 4;
        const avg = [r / n, g / n, b / n].map(Math.round);
        return { avg, vivid: best || avg };
      } catch { return null; } // a picture from elsewhere without permission to read it
    }
    function paintColours(img) {
      const c = img ? colours(img) : null;
      if (c) {
        view.style.setProperty('--now-a', `rgb(${c.vivid.join(', ')})`);
        view.style.setProperty('--now-b', `rgb(${c.avg.map((v) => Math.round(v * 0.4)).join(', ')})`);
        tint = `rgba(${c.vivid.join(', ')}, 0.5)`;
      } else {
        view.style.removeProperty('--now-a');
        view.style.removeProperty('--now-b');
        tint = 'rgba(255, 255, 255, 0.4)';
      }
    }
    function song(f) {
      if (!f) return;
      const tg = tagsOf(f);
      $('nowTitle').textContent = f.kind === 'video' ? nameOf(f) : tg.track || nameOf(f);
      $('nowArtist').textContent = tg.artist || f.folder || '';
      $('nowFrom').textContent = t('De tu biblioteca');
      const box = $('nowCover');
      box.innerHTML = f.kind === 'video' ? ICONS.video : ICONS.music;
      $('nowBgImg').removeAttribute('src');
      paintColours(null);
      if (f.kind === 'video') return;
      const img = new Image();
      img.alt = '';
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cur() !== f) return;
        box.innerHTML = '';
        box.appendChild(img);
        $('nowBgImg').src = img.src;
        paintColours(img);
      };
      img.src = coverOf(f);
    }
    function sync() {
      if (!open) return;
      $('nowPlay').classList.toggle('playing', $('plPlay').classList.contains('playing'));
      for (const [mine, bar] of [['nowShuffle', 'plShuffle'], ['nowRepeat', 'plRepeat']]) {
        const on = $(bar).getAttribute('aria-pressed') === 'true';
        $(mine).classList.toggle('on', on);
        $(mine).setAttribute('aria-pressed', String(on));
      }
      $('nowVolume').value = $('plVolume').value;
      view.classList.toggle('no-lyrics', !showLyrics);
      $('nowLyricsToggle').setAttribute('aria-pressed', String(showLyrics));
      $('nowLyricsToggle').classList.toggle('on', showLyrics);
    }
    function tick() {
      if (!open) { raf = 0; return; }
      const d = Number.isFinite(deck.duration) ? deck.duration : 0;
      if (!dragging) { $('nowSeek').max = String(d || 1); $('nowSeek').value = String(deck.currentTime || 0); $('nowTime').textContent = formatDuration(Math.floor(deck.currentTime || 0)) || '0:00'; }
      $('nowDur').textContent = formatDuration(Math.round(d)) || '0:00';
      drawViz($('nowViz'), tint);
      raf = requestAnimationFrame(tick);
    }
    function show() {
      const f = cur();
      if (!f || open) return;
      open = true;
      lastFocus = document.activeElement;
      view.classList.remove('hidden');
      document.body.classList.add('now-open');
      graph();
      song(f);
      sync();
      $('nowClose').focus();
      lyrics.at(deck.currentTime, true);
      raf = requestAnimationFrame(tick);
    }
    function hide() {
      if (!open) return;
      open = false;
      cancelAnimationFrame(raf);
      raf = 0;
      if (document.fullscreenElement === view) document.exitFullscreen().catch(() => {});
      view.classList.add('hidden');
      document.body.classList.remove('now-open');
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    }
    $('plNow').addEventListener('click', show);
    $('plLyricsBig').addEventListener('click', show);
    $('nowClose').addEventListener('click', hide);
    $('nowFull').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else view.requestFullscreen().catch(() => {});
    });
    $('nowPlay').addEventListener('click', () => toggle());
    $('nowPrev').addEventListener('click', () => step(-1));
    $('nowNext').addEventListener('click', () => step(1));
    $('nowShuffle').addEventListener('click', () => { $('plShuffle').click(); sync(); });
    $('nowRepeat').addEventListener('click', () => { $('plRepeat').click(); sync(); });
    $('nowVolume').addEventListener('input', () => setVolume(Number($('nowVolume').value)));
    $('nowSeek').addEventListener('input', () => { dragging = true; $('nowTime').textContent = formatDuration(Math.floor(Number($('nowSeek').value))) || '0:00'; });
    $('nowSeek').addEventListener('change', () => {
      const v = Number($('nowSeek').value);
      if (cast.active()) cast.seek(v); else { cancelFade(); deck.currentTime = v; }
      dragging = false;
    });
    $('nowLyricsToggle').addEventListener('click', () => {
      showLyrics = !showLyrics;
      try { localStorage.setItem(NOW_KEY, showLyrics ? '1' : '0'); } catch { /* ignore */ }
      sync();
      lyrics.at(deck.currentTime, true);
    });
    // Esc closes it; Tab stays inside while it's open.
    view.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) { e.preventDefault(); hide(); return; }
      if (e.key !== 'Tab') return;
      const items = [...view.querySelectorAll('button:not(.hidden), input')].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return {
      show, hide, sync,
      song: (f) => { if (open) song(f); },
      lyricsShown: () => open && showLyrics,
      isOpen: () => open,
    };
  })();

  // ---- on the TV (Chromecast / DLNA) ----
  const cast = (() => {
    let state = { casting: false };
    let device = null;
    let paused = false;
    function render() {
      $('plCastBar').classList.toggle('hidden', !state.casting);
      if (state.casting) $('plCastText').textContent = t('En «{d}»: {t}', { d: state.device, t: state.title });
      $('plCastBtn').classList.toggle('on', state.casting);
      $('plPlay').classList.toggle('playing', state.casting ? !paused : !deck.paused);
    }
    async function playFile(f) {
      deck.pause();
      try {
        state = await postJson('/api/cast/play', { device, id: f.id });
        paused = false;
      } catch (err) { showToast(err.message); }
      render();
    }
    async function control(action, value) {
      try { state = await postJson('/api/cast/control', { action, value }); } catch (err) { showToast(err.message); }
      render();
    }
    async function search() {
      const ul = $('castList');
      ul.innerHTML = '';
      $('castHint').textContent = t('Buscando teles, Chromecast y altavoces DLNA en tu WiFi…');
      try {
        const { devices } = await postJson('/api/cast/devices', {});
        $('castHint').textContent = devices.length ? t('Elige dónde verlo o escucharlo:') : t('No se ha encontrado ninguna. Comprueba que la tele esté encendida y en la misma WiFi.');
        for (const d of devices) {
          const li = document.createElement('li');
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'cast-device';
          b.innerHTML = '<strong></strong><small></small>';
          b.querySelector('strong').textContent = d.name;
          b.querySelector('small').textContent = d.kind === 'cast' ? 'Chromecast' : 'DLNA';
          b.addEventListener('click', async () => {
            device = d.id;
            $('castModal').classList.add('hidden');
            const f = cur();
            if (f) await playFile(f);
          });
          li.appendChild(b);
          ul.appendChild(li);
        }
      } catch (err) { $('castHint').textContent = err.message; }
    }
    $('plCastBtn').addEventListener('click', () => {
      if (!cur()) return;
      $('castModal').classList.remove('hidden');
      $('castClose').focus();
      search();
    });
    $('castRefresh').addEventListener('click', search);
    $('castClose').addEventListener('click', () => $('castModal').classList.add('hidden'));
    $('castModal').addEventListener('click', (e) => { if (e.target === $('castModal')) $('castModal').classList.add('hidden'); });
    $('plCastStop').addEventListener('click', async () => { await control('stop'); device = null; });
    return {
      active: () => state.casting && Boolean(device),
      playFile,
      toggle: () => { paused = !paused; control(paused ? 'pause' : 'resume'); },
      seek: (v) => control('seek', v),
    };
  })();

  // ---- "Seguir donde lo dejaste": what was playing comes back (paused) when
  // the app opens again; long ones (books, courses, podcasts) keep their place
  // and their speed each, and get ±30 s and their chapters ----
  const RESUME_KEY = 'tubegrab_resume';
  const POS_KEY = 'tubegrab_positions';
  const LONG = 15 * 60;
  let resumeHold = null; // { time }: the next song loads, goes there and waits
  let resumeSaved = 0;
  let placeSaved = 0;
  let positions = {};
  try { const p = JSON.parse(localStorage.getItem(POS_KEY)); if (p && typeof p === 'object' && !Array.isArray(p)) positions = p; } catch { /* none */ }
  const isLong = (m) => Number.isFinite(m.duration) && m.duration >= LONG;
  const posKey = (f) => songKey(f);
  function posOf(f) {
    const p = positions[posKey(f)];
    return p && Number.isFinite(p.t) && p.t > 20 ? p : null;
  }
  function savePositions() {
    const keys = Object.keys(positions);
    if (keys.length > 200) for (const k of keys.sort((a, b) => (positions[a].at || 0) - (positions[b].at || 0)).slice(0, keys.length - 200)) delete positions[k];
    try { localStorage.setItem(POS_KEY, JSON.stringify(positions)); } catch { /* only for now */ }
  }
  /** Where a long one is (or: it finished, so next time it starts again). */
  function keepPlace(m, f, done = false) {
    const k = f && posKey(f);
    if (!k || !isLong(m)) return;
    if (done) { if (positions[k]) { delete positions[k].t; positions[k].at = Date.now(); } } else positions[k] = { ...(positions[k] || {}), t: Math.floor(m.currentTime), at: Date.now() };
    savePositions();
  }
  const serial = (f) => ({ f: library.relOf(f) });
  function saveResume(now = false) {
    if (!desktopApi || !cur() || cast.active()) return;
    if (!now && Date.now() - resumeSaved < 5000) return;
    resumeSaved = Date.now();
    const base = Math.max(0, index - 50);
    try { localStorage.setItem(RESUME_KEY, JSON.stringify({ at: Date.now(), idx: index - base, time: Math.floor(deck.currentTime || 0), items: list.slice(base, index + 250).map(serial) })); } catch { /* only for now */ }
  }
  /** At start: the list as it was, on the song it was on, at that second, paused. */
  async function resume() {
    if (!desktopApi || cur()) return;
    let r = null;
    try { r = JSON.parse(localStorage.getItem(RESUME_KEY)); } catch { return; }
    if (!r || !Array.isArray(r.items) || !r.items.length || !Number.isInteger(r.idx) || !(Date.now() - r.at < 30 * 86400e3)) return;
    await library.ensure();
    if (cur()) return;
    const byRel = new Map(library.files().map((f) => [library.relOf(f), f]));
    const items = [];
    let at = 0;
    r.items.slice(0, 300).forEach((x, i) => {
      // (Songs from YouTube saved by older versions are skipped: they play in Escuchar now.)
      const it = x && typeof x.f === 'string' ? byRel.get(x.f) : null;
      if (!it) return;
      if (i <= r.idx) at = items.length;
      items.push(it);
    });
    if (!items.length) return;
    list = items;
    index = Math.min(at, items.length - 1);
    resumeHold = { time: Number.isFinite(r.time) && r.time > 0 ? r.time : 0 };
    start();
    showToast(t('Seguías con «{t}»: pulsa ▶ para continuar', { t: nameOf(cur()) }));
  }
  /** Goes to `t` once the song's length is known (not into its very end). */
  function seekWhenReady(m, at) {
    m.addEventListener('loadedmetadata', () => { if (Number.isFinite(m.duration) && at < m.duration - 5) m.currentTime = at; }, { once: true });
  }
  window.addEventListener('pagehide', () => { saveResume(true); if (cur()) keepPlace(deck, cur()); });
  // Each book its own speed: the one chosen while it played comes back with it.
  let bookSpeed = false;
  function speedFor(f, m) {
    const p = positions[posKey(f)];
    if (isLong(m) && p && SPEEDS.includes(p.s) && p.s !== eq.speed) { eq.speed = p.s; bookSpeed = true; for (const d of [A, B]) applySpeed(d); applyEq(); } else if (!isLong(m) && bookSpeed) { bookSpeed = false; eq.speed = 1; for (const d of [A, B]) applySpeed(d); applyEq(); }
  }
  // ±30 s, and the chapters of your file.
  let chapters = [];
  async function loadChapters(f) {
    chapters = [];
    $('plChapters').classList.add('hidden');
    try {
      const r = await api(`/api/library/chapters?id=${encodeURIComponent(f.id)}`);
      if (cur() !== f || !r || !Array.isArray(r.chapters)) return;
      chapters = r.chapters.filter((c) => c && Number.isFinite(c.start)).slice(0, 300);
      $('plChapters').classList.toggle('hidden', chapters.length < 2);
    } catch { /* none */ }
  }
  $('plBack30').addEventListener('click', () => seekBy(-30));
  $('plFwd30').addEventListener('click', () => seekBy(30));
  $('plChapters').addEventListener('click', () => {
    if (!chapters.length) return;
    const now = deck.currentTime || 0;
    let on = 0;
    chapters.forEach((c, i) => { if (c.start <= now + 0.5) on = i; });
    ctxMenu.open($('plChapters'), chapters.map((c, i) => ({
      label: `${i === on ? '▶ ' : ''}${formatDuration(Math.floor(c.start)) || '0:00'} · ${c.title || String(i + 1)}`,
      onClick: () => { if (!cast.active()) { cancelFade(); deck.currentTime = c.start; } },
    })), $('plChapters'));
  });

  // ---- where it sounds: speakers, headphones, the TV (HDMI), without changing Windows' own ----
  const SINK_KEY = 'tubegrab_sink';
  let sink = null; // { id, label } or null: Windows' default
  try { const s = JSON.parse(localStorage.getItem(SINK_KEY)); if (s && typeof s.id === 'string' && s.id.length <= 200 && typeof s.label === 'string') sink = { id: s.id, label: s.label.slice(0, 200) }; } catch { /* default */ }
  async function outputs() {
    try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId); } catch { return []; }
  }
  /** Sends the sound to the chosen output (Windows' default if it isn't there). */
  async function applySink() {
    const there = sink ? (await outputs()).some((d) => d.deviceId === sink.id) : true;
    const id = sink && there ? sink.id : '';
    try {
      if (actx && typeof actx.setSinkId === 'function') await actx.setSinkId(id);
      else for (const m of [A, B]) if (typeof m.setSinkId === 'function') await m.setSinkId(id);
    } catch { /* stays where it was */ }
    $('plOutput').classList.toggle('on', Boolean(sink && there));
    $('plOutput').title = sink && there ? t('Suena por: {d}', { d: sink.label }) : t('Elegir por dónde suena');
    $('plOutput').setAttribute('aria-label', $('plOutput').title);
  }
  $('plOutput').addEventListener('click', async () => {
    const all = await outputs();
    const def = all.find((d) => d.deviceId === 'default');
    const devices = all.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications');
    if (!devices.length) { showToast(t('No se ven otras salidas de sonido.')); return; }
    const pick = (s) => { sink = s; try { if (s) localStorage.setItem(SINK_KEY, JSON.stringify(s)); else localStorage.removeItem(SINK_KEY); } catch { /* only for now */ } graph(); applySink(); showToast(s ? t('Suena por: {d}', { d: s.label }) : t('Suena por la salida de Windows')); };
    ctxMenu.open($('plOutput'), [
      { label: `${!sink ? '✓ ' : ''}${t('La de Windows')}${def && def.label ? ` (${def.label.replace(/^[^-]*-\s*/, '')})` : ''}`, onClick: () => pick(null) },
      '-',
      ...devices.map((d) => ({ label: `${sink && sink.id === d.deviceId ? '✓ ' : ''}${d.label || t('Salida de sonido')}`, onClick: () => pick({ id: d.deviceId, label: d.label || t('Salida de sonido') }) })),
    ], $('plOutput'));
  });
  // Headphones unplugged (or Bluetooth gone) while it plays: pause, instead of
  // carrying on through the speakers.
  let devNow = null; // { ids, groups, def }
  async function devSnapshot() {
    const d = await outputs();
    const def = d.find((x) => x.deviceId === 'default');
    return { ids: new Set(d.map((x) => x.deviceId)), groups: new Set(d.map((x) => x.groupId)), def: def ? def.groupId : null };
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    devSnapshot().then((s) => { devNow = s; });
    navigator.mediaDevices.addEventListener('devicechange', async () => {
      const now = await devSnapshot();
      const was = devNow;
      devNow = now;
      if (!was) return;
      const gone = sink ? was.ids.has(sink.id) && !now.ids.has(sink.id) : Boolean(was.def && !now.groups.has(was.def));
      const back = sink && !was.ids.has(sink.id) && now.ids.has(sink.id);
      if (gone || back) applySink();
      if (gone && eq.unplug && cur() && !deck.paused && !cast.active()) {
        deck.pause();
        showToast(t('Se ha desconectado la salida de sonido: la música está en pausa.'));
      }
    });
  }
  $('sndUnplug').addEventListener('change', () => { eq.unplug = $('sndUnplug').checked; applyEq(); });

  // ---- karaoke: the voice (what's in the middle of a stereo song) down ----
  function setKaraoke(on) {
    karaoke = on;
    graph();
    if (voice) {
      const at = actx.currentTime;
      voice.dry.gain.setTargetAtTime(on ? 0 : 1, at, 0.05);
      voice.wet.gain.setTargetAtTime(on ? 1 : 0, at, 0.05);
    }
    $('sndKaraoke').checked = on;
    $('nowKaraoke').classList.toggle('on', on);
    $('nowKaraoke').setAttribute('aria-pressed', String(on));
    // Lyrics in big, to sing along.
    if (on && cur()) {
      if ($('nowView').classList.contains('hidden')) $('plNow').click();
      if (nowView.lyricsShown && !nowView.lyricsShown()) $('nowLyricsToggle').click();
    }
  }
  $('sndKaraoke').addEventListener('change', () => { setKaraoke($('sndKaraoke').checked); showToast($('sndKaraoke').checked ? t('Karaoke: la voz baja (en canciones en estéreo)') : t('Karaoke desactivado')); });
  $('nowKaraoke').addEventListener('click', () => setKaraoke(!karaoke));

  // ---- mini player window (desktop) ----
  let pushTimer = null;
  function pushState() {
    nowView.sync();
    if (!desktopApi || !desktopApi.playerState) return;
    const f = cur();
    const tg = f ? tagsOf(f) : { artist: '', track: '' };
    desktopApi.playerState({
      title: f ? nameOf(f) : '', sub: f ? f.folder || '' : '',
      artist: f && f.kind === 'audio' ? tg.artist : '', track: f && f.kind === 'audio' ? tg.track : '',
      playing: f ? !deck.paused : false, time: deck.currentTime || 0, duration: Number.isFinite(deck.duration) ? deck.duration : 0,
      cover: f && f.kind !== 'video' ? coverOf(f) : null,
      volume: A.volume, muted: A.muted,
      shuffle, repeat, radio,
      upNext: list.map((x, n) => ({ title: nameOf(x), sub: x.folder || '', n })).slice(index + 1, index + 31),
    });
  }
  function pushStateSoon() { if (!pushTimer) pushTimer = setTimeout(() => { pushTimer = null; pushState(); }, 700); }
  if (desktopApi && desktopApi.openMini) {
    $('plMiniBtn').addEventListener('click', () => { desktopApi.openMini(); setTimeout(pushState, 800); });
    desktopApi.onPlayerCommand(({ cmd, value }) => command(cmd, value));
  } else {
    $('plMiniBtn').classList.add('hidden');
    $('plCastBtn').classList.add('hidden');
  }
  setTimeout(resume, 1500);
  /** One player command (keyboard shortcuts, mini window, taskbar, tray). */
  function command(cmd, value) {
    // The mini window opened / closed: its visualizer bars start / stop.
    if (cmd === 'hello' || cmd === 'miniClosed') { miniOpen = cmd === 'hello'; levelsToMini(); }
    if (cmd === 'miniClosed') return;
    if (!cur() && cmd !== 'hello') return;
    if (cmd === 'jump' && Number.isInteger(value) && list[value]) { index = value; start(); return; }
    if (cmd === 'pause') { if (!deck.paused) deck.pause(); pushState(); return; }
    // The mini player's toggles are the bar's own buttons.
    const BUTTONS = { shuffle: 'plShuffle', repeat: 'plRepeat', radio: 'plRadio' };
    if (BUTTONS[cmd]) { $(BUTTONS[cmd]).click(); pushState(); return; }
    if (cmd === 'toggle') toggle();
    else if (cmd === 'next') step(1);
    else if (cmd === 'prev') step(-1);
    else if (cmd === 'stop') stopPlayback();
    else if (cmd === 'volup') setVolume(A.volume + 0.1);
    else if (cmd === 'voldown') setVolume(A.volume - 0.1);
    else if (cmd === 'volume' && Number.isFinite(value)) setVolume(value);
    else if (cmd === 'mute') toggleMute();
    else if (cmd === 'seekf') seekBy(10);
    else if (cmd === 'seekb') seekBy(-10);
    else if (cmd === 'seek' && Number.isFinite(value) && !cast.active()) deck.currentTime = value;
    pushState();
  }
  return { play, enqueue, current: cur, command };
})();

// === The player's keyboard shortcuts, inside the window ===
// (With "also in the background" on, the app registers them system-wide
// instead and they arrive as player commands.)
const playerKeys = (() => {
  let cfg = { global: true, keys: {} };
  const KEY_NAMES = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space', '+': 'Plus', Escape: 'Esc',
    MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack', MediaPlayPause: 'MediaPlayPause', MediaStop: 'MediaStop',
    AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute' };
  const NUMPAD = { NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult', NumpadDivide: 'numdiv', NumpadDecimal: 'numdec' };
  const PUNCT = { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backquote: '`', Backslash: '\\', Comma: ',', Period: '.', Slash: '/' };
  /** A key press → "Control+Alt+P" (Electron's way of writing it), or null. */
  function accelerator(e) {
    if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(e.key)) return null;
    let key = KEY_NAMES[e.key] || null;
    if (!key && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    if (!key && /^Digit\d$/.test(e.code)) key = e.code.slice(5);
    if (!key && /^Numpad\d$/.test(e.code)) key = `num${e.code.slice(6)}`;
    if (!key && NUMPAD[e.code]) key = NUMPAD[e.code];
    // Punctuation by where the key is, so a Spanish keyboard (ñ, ´, º…) works too.
    if (!key && PUNCT[e.code]) key = PUNCT[e.code];
    if (!key && /^F([1-9]|1\d|2[0-4])$/.test(e.key)) key = e.key;
    if (!key && ['Enter', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) key = e.key;
    if (!key && e.key.length === 1 && /[,.\-=;'/\\`[\]]/.test(e.key)) key = e.key;
    if (!key) return null;
    const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    return [...mods, key].join('+');
  }
  const norm = (a) => String(a || '').replace(/\bCtrl\b|\bCommandOrControl\b|\bCmdOrCtrl\b/g, 'Control').replace(/\bMeta\b/g, 'Super');
  async function load() {
    if (!desktopApi || !desktopApi.getShortcuts) return;
    try { cfg = (await desktopApi.getShortcuts()) || cfg; } catch { /* defaults */ }
  }
  document.addEventListener('keydown', (e) => {
    if (!desktopApi || e.defaultPrevented || e.repeat) return;
    if (document.querySelector('.keys-box.recording')) return;
    const acc = accelerator(e);
    if (!acc) return;
    // While typing, only combinations with Ctrl or Alt count.
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
    if (typing && !e.ctrlKey && !e.altKey) return;
    // A plain key on a focused button or the seek bar is that control's own.
    if (!e.ctrlKey && !e.altKey && !e.metaKey && /^(BUTTON|A)$/.test(document.activeElement && document.activeElement.tagName) && (acc === 'Space' || acc === 'Enter')) return;
    const action = Object.keys(cfg.keys || {}).find((a) => cfg.keys[a] && norm(cfg.keys[a]) === acc);
    if (!action) return;
    // Background shortcuts are Windows' to deliver; plain keys only work here.
    if (cfg.global && !(cfg.localOnly || []).includes(action)) return;
    e.preventDefault();
    if (action === 'mini') desktopApi.openMini();
    else if (action !== 'show') player.command(action);
  });
  load();
  return { load, accelerator, get: () => cfg, set: (c) => { cfg = c; } };
})();

/** Several library files to a phone with one QR (a page that lists them, and a .zip). */
async function shareManyToPhone(list, title) {
  const ids = list.slice(0, 500).map((f) => f.id);
  if (!ids.length) { showToast(t('No hay nada que enviar.')); return; }
  try {
    const res = await postJson('/api/library/share-many', { ids, title });
    currentShare = res;
    $('shareName').textContent = `${title} · ${t('{n} archivos', { n: res.count })} · ${formatBytes(res.size)}`;
    $('shareQr').src = res.qr;
    $('shareUrl').textContent = res.url;
    $('shareExpires').textContent = t('El enlace caduca a las {h}.', {
      h: new Date(res.expires).toLocaleTimeString(prefsApi.get().lang === 'en' ? 'en-GB' : 'es-ES', { hour: '2-digit', minute: '2-digit' }),
    });
    $('shareModal').classList.remove('hidden');
    $('shareClose').focus();
  } catch (err) { showToast(err.message); }
}

// "Send to phone": a QR with a link on the local network that expires.
let currentShare = null;
async function shareToPhone(f) {
  try {
    const res = await postJson('/api/library/share', { id: f.id });
    currentShare = res;
    $('shareName').textContent = f.name;
    $('shareQr').src = res.qr;
    $('shareUrl').textContent = res.url;
    $('shareExpires').textContent = t('El enlace caduca a las {h}.', {
      h: new Date(res.expires).toLocaleTimeString(prefsApi.get().lang === 'en' ? 'en-GB' : 'es-ES', { hour: '2-digit', minute: '2-digit' }),
    });
    $('shareModal').classList.remove('hidden');
    $('shareClose').focus();
  } catch (err) {
    showToast(err.message);
  }
}
function closeShare() { $('shareModal').classList.add('hidden'); }
$('shareClose').addEventListener('click', closeShare);
$('shareStop').addEventListener('click', async () => {
  if (currentShare) {
    try { await api(`/api/library/share/${currentShare.token}`, { method: 'DELETE' }); } catch { /* it expires anyway */ }
    currentShare = null;
  }
  closeShare();
  showToast(t('Ya no se comparte.'));
});
$('shareModal').addEventListener('click', (e) => { if (e.target === $('shareModal')) closeShare(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('shareModal').classList.contains('hidden')) closeShare(); });

// === History (stored locally in this browser/app only) ===
const HISTORY_KEY = 'tubegrab_history';
const HISTORY_MAX = 300;

function getHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(list) ? list.filter((i) => i && typeof i === 'object') : [];
  } catch { return []; }
}

function addToHistory(job) {
  try {
    const history = getHistory().filter((h) => h.id !== job.id);
    const meta = job.meta || {};
    history.unshift({
      id: job.id,
      name: (job.files || []).length === 1 ? job.fileName : job.title,
      badge: job.detail || '',
      date: Date.now(),
      type: job.type,
      files: (job.files || []).length,
      source: job.source || null,
      request: job.request || null,
      // For the statistics.
      size: Number(job.fileSize) || 0,
      who: String(meta.artist || meta.channel || meta.uploader || '').slice(0, 120),
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
  } catch { /* localStorage unavailable */ }
  renderHistory();
}

let savedExists = {};
async function renderHistory() {
  const query = $('historySearch').value.trim().toLowerCase();
  const all = getHistory();
  const history = query
    ? all.filter((h) => `${h.name} ${h.badge} ${h.source || ''}`.toLowerCase().includes(query))
    : all;
  $('historySection').classList.toggle('hidden', history.length === 0);
  $('historyEmpty').classList.toggle('hidden', history.length > 0);
  $('historyEmptyText').textContent = query && all.length ? t('Nada coincide con "{q}".', { q: $('historySearch').value.trim() }) : t('Aún no hay nada aquí.');
  $('btnClearHistory').classList.toggle('hidden', all.length === 0);
  if (desktopApi && currentView === 'history') {
    const ids = history.slice(0, 200).map((h) => h.id).filter((id) => /^[a-f0-9]{32}$/.test(id || ''));
    try { savedExists = await desktopApi.savedExists(ids); } catch { savedExists = {}; }
  }
  const ul = $('historyList');
  ul.innerHTML = '';
  for (const item of history.slice(0, 200)) {
    const li = document.createElement('li');
    li.className = 'history-item';
    const text = document.createElement('div');
    text.className = 'history-text';
    const name = document.createElement('span');
    name.className = 'history-name';
    name.textContent = item.name;
    name.title = item.source || item.name;
    const meta = document.createElement('span');
    meta.className = 'history-badge';
    meta.textContent = [ts(item.badge), item.files > 1 ? t('{n} archivos', { n: item.files }) : '', item.date ? formatDate(item.date) : ''].filter(Boolean).join(' · ');
    text.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'queue-actions';
    if (desktopApi && savedExists[item.id]) {
      actions.appendChild(iconButton('open', item.files > 1 ? t('Abrir la carpeta') : t('Abrir'), () => desktopApi.openSaved(item.id), 'primary'));
      actions.appendChild(iconButton('reveal', t('Mostrar en la carpeta'), () => desktopApi.showInFolder(item.id)));
    }
    if (item.source && item.request) {
      actions.appendChild(iconButton('retry', t('Volver a descargar'), async () => {
        try {
          await postJson('/api/jobs/download', { ...item.request, urls: [item.source], playlist: false, sectionStart: item.request.sectionStart ?? '', sectionEnd: item.request.sectionEnd ?? '' });
          showToast(t('Añadido a la cola'));
        } catch (err) { showToast(err.message); }
      }));
    }
    li.append(text, actions);
    ul.appendChild(li);
  }
}
$('historySearch').addEventListener('input', renderHistory);
$('btnClearHistory').addEventListener('click', () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
  renderHistory();
});

// === Helpers ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Seconds → "1:05" (or "1:05.3" with tenths), as the server's time fields accept. */
function formatTime(seconds, tenths = false) {
  const whole = Math.floor(seconds);
  const base = formatDuration(whole) || '0:00';
  if (!tenths) return base;
  const tenth = Math.floor((seconds - whole) * 10);
  return tenth ? `${base}.${tenth}` : base;
}

/** "90", "1:30", "0:01:30.5" → seconds; '' → null; nonsense → NaN. */
function parseTime(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (!/^\d{1,5}(:[0-5]?\d){0,2}(\.\d{1,3})?$/.test(value)) return NaN;
  return value.split(':').reduce((acc, part) => acc * 60 + parseFloat(part), 0);
}

function formatEta(seconds) {
  if (seconds < 60) return `${seconds} s`;
  return formatDuration(seconds);
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1).replace('.', ',')} ${units[i]}`;
}

function formatDate(ms) {
  try {
    return new Date(ms).toLocaleString(prefsApi.get().lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function timeAgo(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return t('ahora mismo');
  if (min < 60) return t('hace {n} min', { n: min });
  const h = Math.round(min / 60);
  if (h < 48) return t('hace {n} h', { n: h });
  return t('hace {n} días', { n: Math.round(h / 24) });
}

function setStatusEl(el, msg, type) {
  el.textContent = msg;
  el.className = `status-message${type ? ` ${type}` : ''}`;
}
const showStatus = (msg, type) => setStatusEl(statusMessage, msg, type);
const clearStatus = () => setStatusEl(statusMessage, '', '');

let toastTimer = null;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

/**
 * "Deshacer" instead of "¿Seguro?": a notice with a button (and Ctrl+Z) for a
 * few seconds after something was removed; `onUndo` puts it back.
 */
let undoLast = null;
function undoToast(msg, onUndo, ms = 8000) {
  let box = document.querySelector('.toast-undo');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toast-undo';
    box.setAttribute('role', 'status');
    box.innerHTML = '<span></span><button type="button" class="link-btn"></button>';
    document.body.appendChild(box);
    box.querySelector('button').addEventListener('click', () => { const u = undoLast; hide(); if (u) u(); });
  }
  function hide() { box.classList.remove('visible'); undoLast = null; clearTimeout(box.timer); }
  box.querySelector('span').textContent = msg;
  box.querySelector('button').textContent = t('Deshacer');
  undoLast = onUndo;
  box.classList.add('visible');
  clearTimeout(box.timer);
  box.timer = setTimeout(hide, ms);
}
document.addEventListener('keydown', (e) => {
  if (!undoLast || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.code !== 'KeyZ' || currentView === 'cv-edit') return;
  const el = document.activeElement;
  if (el && (/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable)) return;
  e.preventDefault();
  document.querySelector('.toast-undo button').click();
});

function setBusy(on, label) {
  busy = on;
  btnDownload.classList.toggle('loading', on);
  if (label) btnLoadingText.textContent = label;
}

function shakeInput() {
  const wrapper = document.querySelector('.input-wrapper');
  wrapper.style.animation = 'shake 0.4s ease';
  setTimeout(() => { wrapper.style.animation = ''; }, 400);
}

// === Whisper status (engine + models), from the server and the desktop app ===
const whisperStatus = (() => {
  let st = { available: false, engine: false, models: [] };
  const listeners = [];
  return {
    get: () => st,
    fromServer(s) { st = { ...st, ...s }; listeners.forEach((fn) => fn(st)); },
    on(fn) { listeners.push(fn); fn(st); },
  };
})();
whisperStatus.on((s) => editor.setCaptionsAvailable(s.available));

// === Convertir → Subtítulos ===
const transcribeUi = (() => {
  let files = [];
  const MODEL_LABELS = { tiny: 'Rápida (menos precisa)', base: 'Normal', small: 'Precisa (más lenta)' };
  function refresh() {
    const s = whisperStatus.get();
    $('whisperMissing').classList.toggle('hidden', s.available);
    $('btnWhisperGo').classList.toggle('hidden', !desktopApi);
    $('whisperMissingText').textContent = desktopApi
      ? t('Se instala una vez (unos 150 MB) y luego todo se hace en tu equipo, sin Internet.')
      : t('Los subtítulos automáticos están en la app de escritorio.');
    const sel = $('transModel');
    const cur = sel.value;
    sel.innerHTML = '';
    for (const m of (s.models.length ? s.models : ['base'])) {
      const o = document.createElement('option');
      o.value = m;
      o.textContent = t(MODEL_LABELS[m] || m);
      sel.appendChild(o);
    }
    if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
    else if (s.models.includes('base')) sel.value = 'base';
    $('btnTranscribe').disabled = !s.available;
  }
  function setFiles(list) {
    files = list.slice(0, 20);
    renderFileList($('transList'), $('transDropText'), files, 'Arrastra un vídeo o un audio');
    $('btnTranscribe').textContent = files.length > 1 ? t('Hacer subtítulos de {n} archivos', { n: files.length }) : t('Hacer subtítulos');
  }
  fileZone($('transDrop'), $('transInput'), setFiles);
  $('transOutput').addEventListener('change', () => $('transStyleRow').classList.toggle('hidden', !['burn', 'both'].includes($('transOutput').value)));
  $('btnWhisperGo').addEventListener('click', () => setView('set-convert'));
  $('btnTranscribe').addEventListener('click', async () => {
    const status = $('transStatus');
    if (!files.length) { setStatusEl(status, t('Elige uno o varios archivos primero'), 'error'); return; }
    const ok = await uploadEach('/api/jobs/transcribe', files, {
      lang: $('transLang').value, output: $('transOutput').value, style: $('transStyle').value, model: $('transModel').value, translate: String($('transTranslate').checked),
    }, { button: $('btnTranscribe'), labelEl: $('btnTranscribe'), statusEl: status });
    if (ok) setFiles([]);
  });
  whisperStatus.on(refresh);
  return { refresh, setFiles };
})();

// === Ajustes → Conversión: the Whisper engine (desktop) ===
if (desktopApi && desktopApi.getWhisper) {
  const SIZES = { tiny: '78 MB', base: '148 MB', small: '488 MB' };
  const NAMES = { tiny: 'Rápido', base: 'Normal (recomendado)', small: 'Preciso' };
  const show = (s) => {
    if (!s) return;
    whisperStatus.fromServer({ available: s.available, engine: s.engine, models: s.models });
    $('whisperLabel').textContent = s.busy ? t('Descargando…')
      : s.error ? t('No se pudo instalar: {e}', { e: ts(s.error) })
        : s.available ? t('Instalado. Puedes usarlo en Convertir → Subtítulos y en el Editor.') : t('No instalado. Elige un modelo para descargarlo.');
    $('whisperLabel').classList.toggle('error', Boolean(s.error));
    $('whisperProgress').classList.toggle('hidden', !s.busy);
    $('whisperFill').style.width = `${s.progress || 0}%`;
    $('whisperPct').textContent = `${s.progress || 0}%`;
    const box = $('whisperModels');
    box.innerHTML = '';
    for (const m of ['tiny', 'base', 'small']) {
      const have = s.models.includes(m);
      const item = document.createElement('div');
      item.className = 'whisper-model';
      item.innerHTML = '<span class="row-label"></span><small></small>';
      item.querySelector('.row-label').textContent = t(NAMES[m]);
      item.querySelector('small').textContent = have ? t('instalado') : SIZES[m];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = have ? 'link-btn' : 'btn';
      b.textContent = have ? t('Quitar') : t('Descargar');
      b.disabled = Boolean(s.busy);
      b.addEventListener('click', async () => {
        if (have) show(await desktopApi.removeWhisper(m));
        else desktopApi.installWhisper(m);
      });
      item.appendChild(b);
      box.appendChild(item);
    }
  };
  desktopApi.getWhisper().then(show);
  desktopApi.onWhisper(show);
}

// === Ajustes → Conversión: watch folder (desktop) ===
if (desktopApi && desktopApi.chooseWatchFolder) {
  const status = (msg, type) => setStatusEl($('watchStatus'), msg, type);
  const sel = $('watchPreset');
  // The converter's own presets (audio and video), each a set of fields.
  const choices = [];
  for (const kind of ['audio', 'video']) {
    for (const p of PRESETS[kind]) {
      if (!p.set) continue;
      const f = p.set;
      const fields = kind === 'audio'
        ? { targetFormat: f.format, audioBitrate: f.bitrate, sampleRate: f.sampleRate, channels: f.channels, normalize: String(f.normalize) }
        : { targetFormat: f.format, resolution: f.resolution, quality: f.quality, fps: f.fps };
      choices.push({ id: `${kind}:${p.id}`, label: `${kind === 'audio' ? t('Audio') : t('Vídeo')} · ${t(p.label)}`, fields });
    }
  }
  sel.innerHTML = choices.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.label)}</option>`).join('');
  const fieldsOf = () => (choices.find((c) => c.id === sel.value) || choices[0]).fields;
  const showWatch = (w) => {
    if (!w) return;
    $('watchEnabled').checked = w.enabled;
    $('watchDirLabel').textContent = w.dir || t('Ninguna');
    $('watchMove').checked = w.moveOriginals;
    const match = w.fields && choices.find((c) => JSON.stringify(c.fields) === JSON.stringify(w.fields));
    if (match) sel.value = match.id;
    if (w.error) status(t(w.error), 'error');
  };
  const send = async (patch) => {
    try { showWatch(await postJson('/api/watch', { fields: fieldsOf(), ...patch })); status('', ''); } catch (err) { status(err.message, 'error'); }
  };
  document.addEventListener('tg:view', (e) => { if (e.detail === 'set-convert') api('/api/watch').then(showWatch, () => {}); });
  $('btnWatchDir').addEventListener('click', async () => {
    const r = await desktopApi.chooseWatchFolder();
    if (r && r.dir) { await new Promise((ok) => setTimeout(ok, 300)); api('/api/watch').then(showWatch, () => {}); }
  });
  $('watchEnabled').addEventListener('change', (e) => {
    if (e.target.checked && $('watchDirLabel').textContent === t('Ninguna')) { e.target.checked = false; status(t('Elige primero la carpeta.'), 'error'); return; }
    send({ enabled: e.target.checked });
  });
  sel.addEventListener('change', () => send({}));
  $('watchMove').addEventListener('change', (e) => send({ moveOriginals: e.target.checked }));
}

// === Ajustes → Descargas: repeats, disk space ===
$('prefWarnDupes').checked = prefsApi.get().warnDuplicates;
$('prefWarnDupes').addEventListener('change', (e) => prefsApi.set({ warnDuplicates: e.target.checked }));
$('btnForgetSeen').addEventListener('click', async () => {
  const ok = await ask({ title: t('¿Olvidar lo que ya has descargado?'), text: t('TubeGrab dejará de avisarte de lo que ya tienes. Tus archivos y el historial no se tocan.'),
    buttons: [{ label: t('Cancelar'), value: null }, { label: t('Olvidarlo'), value: true, primary: true }] });
  if (ok) { try { await api('/api/seen', { method: 'DELETE' }); showToast(t('Hecho')); } catch (err) { showToast(err.message); } }
});
if (desktopApi && desktopApi.getSpace) {
  const showSpace = (s) => {
    if (!s) return;
    $('spaceLabel').textContent = [s.freeGb !== null ? t('{n} GB libres en el disco', { n: String(s.freeGb).replace('.', ',') }) : '', t('la carpeta ocupa {n} GB', { n: String(s.folderGb).replace('.', ',') })].filter(Boolean).join(' · ');
    $('spaceLabel').classList.toggle('error', Boolean(s.lowFree || s.overFolder));
    $('spaceMinFree').value = String(s.minFreeGb);
    $('spaceMaxFolder').value = String(s.maxFolderGb);
    $('spacePolicy').value = s.policy;
  };
  document.addEventListener('tg:view', (e) => { if (e.detail === 'set-downloads') desktopApi.getSpace().then(showSpace); });
  for (const id of ['spaceMinFree', 'spaceMaxFolder', 'spacePolicy']) {
    $(id).addEventListener('change', async () => showSpace(await desktopApi.setSpace({ minFreeGb: Number($('spaceMinFree').value), maxFolderGb: Number($('spaceMaxFolder').value), policy: $('spacePolicy').value })));
  }
  desktopApi.onSpace((s) => {
    showSpace(s);
    showToast(s.removed ? t('Se han movido {n} archivos antiguos a la papelera para no pasar de {g} GB.', { n: s.removed, g: s.maxFolderGb })
      : s.lowFree ? t('Queda poco espacio: {n} GB libres.', { n: String(s.freeGb).replace('.', ',') }) : t('Tu carpeta de descargas ya ocupa {n} GB.', { n: String(s.folderGb).replace('.', ',') }));
  });
}

// === Ajustes → Sistema: the "tubegrab" command (desktop) ===
if (desktopApi && desktopApi.getCli) {
  const showCli = (c) => {
    if (!c) return;
    $('cliRow').classList.toggle('hidden', !c.available);
    $('optCli').checked = c.installed;
    $('cliNote').textContent = c.portable
      ? t('Con la versión portable, el comando manda el enlace a la app abierta (que lo descarga con tus ajustes). Con la instalada, verás el progreso en la terminal.')
      : t('Escribe «tubegrab --help» para ver todas las opciones.');
    if (c.error) setStatusEl($('cliStatus'), t('No se pudo instalar el comando: {e}', { e: c.error }), 'error');
  };
  desktopApi.getCli().then(showCli);
  $('optCli').addEventListener('change', async (e) => {
    const c = await desktopApi.installCli(e.target.checked);
    showCli(c);
    if (c && !c.error) setStatusEl($('cliStatus'), e.target.checked ? t('Listo: abre una terminal nueva y escribe «tubegrab --help».') : t('Comando quitado.'), 'success');
  });
}

// === Estadísticas ===
const stats = (() => {
  const MONTHS = 12;
  const tip = document.createElement('div');
  tip.className = 'stat-tip hidden';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);

  function tiles(list) {
    const box = $('statTiles');
    box.innerHTML = '';
    for (const [label, value, sub] of list) {
      const el = document.createElement('div');
      el.className = 'stat-tile';
      el.innerHTML = '<span class="stat-label"></span><span class="stat-value"></span><span class="stat-sub"></span>';
      el.querySelector('.stat-label').textContent = label;
      el.querySelector('.stat-value').textContent = value;
      el.querySelector('.stat-sub').textContent = sub || '';
      box.appendChild(el);
    }
  }
  function rank(ol, rows, empty) {
    ol.innerHTML = '';
    if (!rows.length) { const li = document.createElement('li'); li.className = 'stat-empty'; li.textContent = empty; ol.appendChild(li); return; }
    const max = rows[0][1];
    for (const [name, n, sub] of rows) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="stat-name"></span><span class="stat-bar"><span></span></span><span class="stat-n"></span>';
      li.querySelector('.stat-name').textContent = name;
      li.querySelector('.stat-name').title = name;
      li.querySelector('.stat-bar span').style.width = `${Math.max(3, (n / max) * 100)}%`;
      li.querySelector('.stat-n').textContent = sub || String(n);
      ol.appendChild(li);
    }
  }
  function chart(history) {
    const box = $('statMonths');
    box.innerHTML = '';
    const now = new Date();
    const months = [];
    for (let i = MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(prefsApi.get().lang === 'en' ? 'en-GB' : 'es-ES', { month: 'short' }), year: d.getFullYear(), dl: 0, cv: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const h of history) {
      const d = new Date(h.date);
      const m = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (m) m[h.type === 'convert' ? 'cv' : 'dl'] += 1;
    }
    const max = Math.max(1, ...months.map((m) => Math.max(m.dl, m.cv)));
    for (const m of months) {
      const col = document.createElement('div');
      col.className = 'stat-col';
      const bars = document.createElement('div');
      bars.className = 'stat-bars';
      for (const [k, cls, name] of [['dl', 'b-dl', t('Descargas')], ['cv', 'b-cv', t('Conversiones')]]) {
        const b = document.createElement('span');
        b.className = `stat-b ${cls}`;
        b.style.height = `${(m[k] / max) * 100}%`;
        b.setAttribute('aria-label', `${m.label} ${m.year}: ${m[k]} ${name}`);
        b.tabIndex = 0;
        const showTip = () => {
          tip.textContent = `${m.label} ${m.year} · ${name}: ${m[k]}`;
          tip.classList.remove('hidden');
          const r = b.getBoundingClientRect();
          tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2))}px`;
          tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
        };
        b.addEventListener('pointerenter', showTip);
        b.addEventListener('focus', showTip);
        b.addEventListener('pointerleave', () => tip.classList.add('hidden'));
        b.addEventListener('blur', () => tip.classList.add('hidden'));
        bars.appendChild(b);
      }
      const label = document.createElement('span');
      label.className = 'stat-month';
      label.textContent = m.label;
      col.append(bars, label);
      box.appendChild(col);
    }
    $('statMonthsNote').textContent = t('máximo: {n} en un mes', { n: max });
  }
  async function render() {
    const history = getHistory();
    const dls = history.filter((h) => h.type !== 'convert');
    const cvs = history.filter((h) => h.type === 'convert');
    const bytes = history.reduce((a, h) => a + (Number(h.size) || 0), 0);
    const list = [
      [t('Descargas'), String(dls.length), t('en tu historial')],
      [t('Conversiones'), String(cvs.length), ''],
      [t('Guardado'), bytes ? formatBytes(bytes) : '—', t('desde esta versión')],
    ];
    let lib = [];
    if (desktopApi) {
      try { lib = (await api('/api/library')).files || []; } catch { lib = []; }
      const size = lib.reduce((a, f) => a + f.size, 0);
      list.push([t('Biblioteca'), t('{n} archivos', { n: lib.length }), formatBytes(size)]);
    }
    tiles(list);
    chart(history);
    const who = new Map();
    for (const h of dls) {
      const k = (h.who || '').trim();
      if (k) who.set(k, (who.get(k) || 0) + 1);
    }
    rank($('statTop'), [...who].sort((a, b) => b[1] - a[1]).slice(0, 10), t('Aún no hay datos: aparecerán con tus próximas descargas.'));
    if (desktopApi) {
      const played = lib.filter((f) => f.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 10);
      rank($('statPlayed'), played.map((f) => [f.name.replace(/\.[^.]+$/, ''), f.plays, f.plays === 1 ? t('1 vez') : t('{n} veces', { n: f.plays })]), t('Escucha algo en la Biblioteca y aparecerá aquí.'));
    }
  }
  return { render };
})();

// === Init ===
renderConvertFormats();
refreshConvertUI();
setMergeKind('audio');
renderMerge();
refreshCompressButton();
refreshImageUI();
renderPrefs();
// === Tray quick actions (desktop) ===
if (desktopApi && desktopApi.onQuickDownload) {
  desktopApi.onQuickDownload(async ({ url }) => {
    try {
      await postJson('/api/jobs/download', { ...downloadOptions(), urls: [url] });
      if (!document.hasFocus() && typeof Notification !== 'undefined') {
        try { new Notification(t('Añadido a la cola'), { body: url, silent: true }); } catch { /* ignore */ }
      }
    } catch (err) {
      showToast(err.message);
    }
  });
  // From the command line ("tubegrab <link> --mp3"): queued with those choices.
  if (desktopApi.onCliDownload) {
    desktopApi.onCliDownload(async (req) => {
      const p = req.profile ? profilesUi.byName(req.profile) : null;
      const mode = req.mode || (p ? p.options.mode : downloadMode);
      const opts = p ? { ...p.options } : downloadOptions(mode);
      if (!p) {
        opts.mode = mode;
        if (req.format) opts.audioFormat = req.format;
        if (req.quality) opts.quality = req.quality;
        if (req.container) opts.container = req.container;
      }
      try {
        await postJson('/api/jobs/download', { ...opts, urls: [req.url] });
        if (p && p.both) await postJson('/api/jobs/download', { ...opts, mode: opts.mode === 'audio' ? 'video' : 'audio', urls: [req.url] });
        if (typeof Notification !== 'undefined') {
          try { new Notification(t('Añadido a la cola'), { body: req.url, silent: true }); } catch { /* ignore */ }
        }
      } catch (err) {
        showToast(err.message);
      }
    });
  }
  desktopApi.onTrayAction(({ action }) => {
    if (action === 'pause') postJson('/api/jobs/pause-all', {}).catch(() => {});
    if (action === 'resume') postJson('/api/jobs/pause-all', { resume: true }).catch(() => {});
  });
}

// === Phone notifications (desktop, ntfy) ===
if (desktopApi && desktopApi.getNtfy) {
  const status = (msg, type) => setStatusEl($('ntfyStatus'), msg, type);
  const showNtfy = (n) => {
    if (!n) return;
    if (n.error) { status(t(n.error), 'error'); return; }
    $('ntfyEnabled').checked = n.enabled;
    $('ntfyBody').classList.toggle('hidden', !n.enabled);
    $('ntfyWhen').value = n.when;
    $('ntfyErrors').checked = n.errors;
    $('ntfyTopic').textContent = n.topic;
    $('ntfyQr').src = n.qr;
    if (document.activeElement !== $('ntfyServer')) $('ntfyServer').value = n.server;
  };
  desktopApi.getNtfy().then(showNtfy);
  const set = async (patch) => { status('', ''); showNtfy(await desktopApi.setNtfy(patch)); };
  $('ntfyEnabled').addEventListener('change', (e) => set({ enabled: e.target.checked }));
  $('ntfyWhen').addEventListener('change', (e) => set({ when: e.target.value }));
  $('ntfyErrors').addEventListener('change', (e) => set({ errors: e.target.checked }));
  $('ntfyServer').addEventListener('change', (e) => set({ server: e.target.value.trim() || 'https://ntfy.sh' }));
  $('ntfyNewTopic').addEventListener('click', () => {
    if (window.confirm(t('¿Cambiar de canal? El móvil tendrá que suscribirse al nuevo.'))) set({ newTopic: true });
  });
  $('ntfyTest').addEventListener('click', async () => {
    const res = await desktopApi.testNtfy();
    status(res && res.ok ? t('Aviso enviado: mira el móvil.') : t((res && res.error) || 'No se pudo enviar.'), res && res.ok ? 'success' : 'error');
  });
}

// === Control from the phone (desktop): pair with a QR, send links over WiFi ===
if (desktopApi) {
  const status = (msg, type) => setStatusEl($('remoteStatus'), msg, type);
  const showRemote = (r) => {
    if (!r) return;
    $('remoteEnabled').checked = Boolean(r.enabled);
    $('remoteBody').classList.toggle('hidden', !r.enabled || !r.qr);
    status(r.error ? t(r.error) : '', r.error ? 'error' : '');
    if (r.qr) { $('remoteQr').src = r.qr; $('remoteUrl').textContent = r.url; }
  };
  const loadRemote = () => api('/api/remote').then(showRemote, () => {});
  document.addEventListener('tg:view', (e) => { if (e.detail === 'set-system') loadRemote(); });
  $('remoteEnabled').addEventListener('change', async (e) => {
    try { showRemote(await postJson('/api/remote', { enabled: e.target.checked })); } catch (err) { status(err.message, 'error'); }
  });
  $('remoteReset').addEventListener('click', async () => {
    if (!window.confirm(t('¿Crear un código nuevo? Los móviles emparejados tendrán que volver a escanearlo.'))) return;
    try { showRemote(await postJson('/api/remote/reset', {})); status(t('Código nuevo: vuelve a escanearlo en tus móviles.'), 'success'); } catch (err) { status(err.message, 'error'); }
  });
}

// === First-run tour ===
const tour = (() => {
  const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const steps = [
    { icon: icon('<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M5 19h14"/>'), title: 'Bienvenido a TubeGrab',
      text: 'Descarga y convierte vídeos y música de YouTube y más de 20 sitios. Todo se hace en tu equipo. Elige cómo quieres verlo:', extra: 'look' },
    { icon: icon('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'), title: 'Descargar',
      text: 'Pega un enlace (o varios, o una playlist) en «Descargar», elige Audio o Vídeo y listo. También puedes buscar sin enlace y suscribirte a canales.' },
    { icon: icon('<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.2 7.6L20 17M8.2 16.4L20 7"/>'), title: 'Convertir y editar',
      text: 'Cambia de formato, une o comprime archivos. En el Editor recortas, quitas partes, pones textos o un logo y exportas hasta GIF o stickers. En Etiquetas arreglas artista, álbum y carátula de tus canciones.' },
    { icon: icon('<path d="M4 4v16M9 4v16M14 4l6 16"/>'), title: 'Tu biblioteca y el móvil', desktop: true,
      text: 'En Biblioteca escuchas y ves lo descargado. Desde ahí puedes mandarlo al móvil con un QR, y en Ajustes → Sistema puedes mandar descargas desde el móvil o recibir avisos cuando terminen.' },
    { icon: icon('<path d="M3 7h6l2 2h10v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'), title: 'Todo listo', extra: 'folder',
      text: 'Lo que descargues se guarda aquí. Puedes cambiarlo cuando quieras en Ajustes → Descargas.' },
  ].filter((s) => !s.desktop || desktopApi);
  let i = 0;

  function extra(kind) {
    const box = $('tourExtra');
    box.innerHTML = '';
    if (kind === 'look') {
      const row = document.createElement('div');
      row.className = 'tour-choices';
      const p = prefsApi.get();
      const choose = (label, key, value) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn${(key === 'ui' ? prefsApi.getUi() : p[key]) === value ? ' btn-primary' : ''}`;
        b.textContent = t(label);
        b.addEventListener('click', () => {
          if (key === 'ui') { prefsApi.setUi(value); prefsApi.set({ uiDefault: value }); } else prefsApi.set({ [key]: value });
          renderPrefs();
          extra('look');
        });
        return b;
      };
      row.append(choose('Windows', 'ui', 'windows'), choose('Mac', 'ui', 'mac'), choose('Claro', 'theme', 'light'), choose('Oscuro', 'theme', 'dark'), choose('Automático', 'theme', 'auto'));
      box.appendChild(row);
    } else if (kind === 'folder' && desktopApi) {
      const path = document.createElement('code');
      path.className = 'share-url';
      desktopApi.getSettings().then((s) => { path.textContent = s.downloadDir; });
      const change = document.createElement('button');
      change.type = 'button';
      change.className = 'btn';
      change.textContent = t('Cambiar…');
      change.addEventListener('click', async () => { await desktopApi.chooseFolder(); const s = await desktopApi.getSettings(); path.textContent = s.downloadDir; window.dispatchEvent(new Event('focus')); });
      box.append(path, change);
    }
  }

  function render() {
    const s = steps[i];
    $('tourIcon').innerHTML = s.icon;
    $('tourTitle').textContent = t(s.title);
    $('tourText').textContent = t(s.text);
    extra(s.extra);
    $('tourDots').innerHTML = steps.map((_, n) => `<span class="${n === i ? 'on' : ''}"></span>`).join('');
    $('tourBack').classList.toggle('hidden', i === 0);
    $('tourSkip').classList.toggle('hidden', i === steps.length - 1);
    $('tourNext').textContent = i === steps.length - 1 ? t('Empezar') : t('Siguiente');
  }
  function open() {
    i = 0;
    render();
    $('tourModal').classList.remove('hidden');
    $('tourNext').focus();
  }
  function close() {
    $('tourModal').classList.add('hidden');
    prefsApi.set({ onboarded: true });
  }
  $('tourNext').addEventListener('click', () => { if (i < steps.length - 1) { i += 1; render(); } else close(); });
  $('tourBack').addEventListener('click', () => { if (i > 0) { i -= 1; render(); } });
  $('tourSkip').addEventListener('click', close);
  $('btnTour').addEventListener('click', open);
  document.addEventListener('keydown', (e) => {
    if ($('tourModal').classList.contains('hidden')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') $('tourNext').click();
    else if (e.key === 'ArrowLeft') $('tourBack').click();
  });
  return { open, firstRun: () => { if (!prefsApi.get().onboarded) open(); } };
})();

// === Browser extension (desktop): copy it somewhere stable and show the steps ===
if (desktopApi) {
  $('btnExtension').addEventListener('click', async () => {
    const res = await desktopApi.installExtension();
    if (res && res.path) $('extSteps').classList.remove('hidden');
    else showToast(t('No se pudo preparar la extensión.'));
  });
}

// === Backup: settings, history and subscriptions to a file and back ===
const backup = (() => {
  const FORMAT = 'tubegrab-backup';
  const MAX_BYTES = 5 * 1024 * 1024;
  const status = (msg, type) => setStatusEl($('backupStatus'), msg, type);
  const str = (v, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');

  async function build() {
    const data = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), prefs: prefsApi.get(), history: getHistory() };
    try {
      const p = await api('/api/profiles');
      data.profiles = p.profiles.map(({ name, options, both }) => ({ name, options, both }));
      data.rules = p.rules.map((r) => ({ match: r.match, folder: r.folder, profile: (p.profiles.find((x) => x.id === r.profile) || {}).name || '' }));
    } catch { /* none */ }
    if (desktopApi) {
      try {
        const res = await api('/api/subscriptions');
        data.subscriptions = (res.subscriptions || []).map((s) => ({ url: s.url, title: s.title, options: s.options, interval: s.interval }));
      } catch { data.subscriptions = []; }
      const s = await desktopApi.getSettings();
      data.settings = { downloadDir: s.downloadDir, organize: s.organize, closeToTray: s.closeToTray, clipboardWatch: s.clipboardWatch };
    }
    return data;
  }

  async function exportIt() {
    const text = JSON.stringify(await build(), null, 2);
    if (desktopApi) {
      const res = await desktopApi.exportBackup(text);
      if (res && res.ok) status(t('Copia guardada.'), 'success');
      else if (!res || !res.canceled) status(t('No se pudo guardar la copia.'), 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `TubeGrab-copia-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status(t('Copia guardada.'), 'success');
  }

  // Only what we recognise, checked field by field; the rest is ignored.
  function cleanHistoryItem(h) {
    if (!h || typeof h !== 'object' || !/^[a-f0-9]{32}$/.test(String(h.id))) return null;
    const date = Number(h.date);
    return {
      id: h.id,
      name: str(h.name),
      badge: str(h.badge),
      date: Number.isFinite(date) && date > 0 ? date : Date.now(),
      type: h.type === 'convert' ? 'convert' : 'download',
      files: Math.max(0, Math.min(300, Math.floor(Number(h.files) || 0))),
      source: typeof h.source === 'string' && /^https?:\/\//i.test(h.source) ? h.source.slice(0, 2048) : null,
      request: h.request && typeof h.request === 'object' && !Array.isArray(h.request) ? h.request : null,
    };
  }
  function cleanLast(last) {
    const out = {};
    if (!last || typeof last !== 'object' || Array.isArray(last)) return out;
    for (const [k, v] of Object.entries(last).slice(0, 40)) {
      if (/^[a-zA-Z]{1,30}$/.test(k) && (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40))) out[k] = v;
    }
    return out;
  }

  async function apply(text) {
    let data;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!data || data.format !== FORMAT || typeof data !== 'object') { status(t('Ese archivo no es una copia de TubeGrab.'), 'error'); return; }
    if (!window.confirm(t('¿Importar esta copia? Se mezclará con lo que ya tienes: el historial se une, las suscripciones que falten se añaden y los ajustes se sustituyen.'))) return;
    let historyAdded = 0;
    let subsAdded = 0;
    // Preferences go through the same checks as always (theme-init.js).
    if (data.prefs && typeof data.prefs === 'object' && !Array.isArray(data.prefs)) {
      prefsApi.set({ ...data.prefs, last: cleanLast(data.prefs.last) });
    }
    if (Array.isArray(data.history)) {
      const mine = getHistory();
      const known = new Set(mine.map((h) => h.id));
      const incoming = data.history.slice(0, HISTORY_MAX).map(cleanHistoryItem).filter((h) => h && !known.has(h.id));
      historyAdded = incoming.length;
      const merged = [...mine, ...incoming].sort((a, b) => b.date - a.date).slice(0, HISTORY_MAX);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(merged)); } catch { /* storage unavailable */ }
      renderHistory();
    }
    if (desktopApi && Array.isArray(data.subscriptions)) {
      // Each one is re-validated by the server like a new subscription.
      for (const s of data.subscriptions.slice(0, 100)) {
        if (!s || typeof s.url !== 'string') continue;
        try {
          await postJson('/api/subscriptions', { url: s.url, options: s.options && typeof s.options === 'object' ? s.options : {}, interval: s.interval, backfill: 0 });
          subsAdded += 1;
        } catch { /* already subscribed, or no longer valid */ }
      }
    }
    // Profiles (by name: the ones you already have are kept) and their rules.
    if (Array.isArray(data.profiles)) {
      const mine = profilesUi.data.profiles.map((p) => p.name.toLowerCase());
      for (const p of data.profiles.slice(0, 50)) {
        if (!p || typeof p.name !== 'string' || mine.includes(p.name.toLowerCase())) continue;
        try { await postJson('/api/profiles', { name: p.name, options: p.options && typeof p.options === 'object' ? p.options : {}, both: p.both === true }); } catch { /* not valid */ }
      }
      await profilesUi.load();
    }
    if (Array.isArray(data.rules)) {
      for (const r of data.rules.slice(0, 100)) {
        if (!r || typeof r.match !== 'string') continue;
        const prof = typeof r.profile === 'string' ? profilesUi.byName(r.profile) : null;
        try { await postJson('/api/rules', { match: r.match, folder: typeof r.folder === 'string' ? r.folder : '', profile: prof ? prof.id : '' }); } catch { /* not valid */ }
      }
      await profilesUi.load();
    }
    if (desktopApi && data.settings && typeof data.settings === 'object') {
      const s = data.settings;
      desktopApi.setOptions({ closeToTray: s.closeToTray, clipboardWatch: s.clipboardWatch, organize: s.organize });
      if (typeof s.downloadDir === 'string') await desktopApi.setDownloadDir(s.downloadDir);
      desktopApi.getSettings().then(() => window.dispatchEvent(new Event('focus')));
    }
    status(t('Copia importada: {h} del historial y {s} suscripciones nuevas.', { h: historyAdded, s: subsAdded }), 'success');
  }

  $('btnBackupExport').addEventListener('click', () => exportIt().catch((err) => status(err.message, 'error')));
  $('btnBackupImport').addEventListener('click', async () => {
    if (!desktopApi) { $('backupInput').click(); return; }
    const res = await desktopApi.importBackup();
    if (res && res.text) apply(res.text);
    else if (res && res.error) status(t(res.error), 'error');
  });
  $('backupInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_BYTES) { status(t('Ese archivo no es una copia de TubeGrab.'), 'error'); return; }
    apply(await f.text());
  });
  return { build, apply, cleanHistoryItem };
})();

// === Ajustes → Apariencia (v3.6): the look piece by piece, quick styles,
// a shareable style code and the side menu's pages ===
const lookUi = (() => {
  const nav = $('nav');
  const DEFAULT_ORDER = [...nav.querySelectorAll('.nav-item[data-view]')].map((b) => b.dataset.view);
  const navButton = (id) => nav.querySelector(`.nav-item[data-view="${id}"]`);
  const usable = (id) => { const b = navButton(id); return b && (!b.classList.contains('desktop-only') || desktopApi); };
  const HEX = /^#[0-9a-f]{6}$/i;
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

  function order(p) {
    const saved = p.navOrder.filter((id) => DEFAULT_ORDER.includes(id));
    return [...saved, ...DEFAULT_ORDER.filter((id) => !saved.includes(id))];
  }
  /** Puts the side menu's buttons in your order and hides the ones you hid. */
  function applyNav() {
    const p = prefsApi.get();
    for (const id of order(p)) {
      const b = navButton(id);
      if (!b) continue;
      nav.appendChild(b);
      b.classList.toggle('nav-off', p.navHidden.includes(id));
    }
  }

  // --- The menu editor: a tick to show each page, arrows to move it ---
  const ARROW = { up: '<svg viewBox="0 0 12 12"><path d="M3 7.5L6 4.5l3 3"/></svg>', down: '<svg viewBox="0 0 12 12"><path d="M3 4.5L6 7.5l3-3"/></svg>' };
  function renderNavEdit() {
    const list = $('navEdit');
    const p = prefsApi.get();
    const ids = order(p).filter(usable);
    list.innerHTML = '';
    ids.forEach((id, i) => {
      const b = navButton(id);
      const li = document.createElement('li');
      const off = p.navHidden.includes(id);
      li.classList.toggle('off', off);
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !off;
      const name = b.querySelector('span').textContent;
      check.setAttribute('aria-label', t('Mostrar «{name}» en el menú', { name }));
      check.addEventListener('change', () => {
        const hidden = new Set(prefsApi.get().navHidden);
        if (check.checked) hidden.delete(id); else hidden.add(id);
        if (ids.every((x) => hidden.has(x))) { check.checked = true; showToast(t('Deja al menos una página en el menú.')); return; }
        prefsApi.set({ navHidden: [...hidden] });
        renderPrefs();
      });
      const icon = b.querySelector('svg').cloneNode(true);
      const label = document.createElement('span');
      label.className = 'ne-name';
      label.textContent = name;
      const move = (dir) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ne-move';
        btn.innerHTML = ARROW[dir];
        btn.title = t(dir === 'up' ? 'Subir' : 'Bajar');
        btn.setAttribute('aria-label', `${btn.title}: ${name}`);
        btn.disabled = dir === 'up' ? i === 0 : i === ids.length - 1;
        btn.addEventListener('click', () => {
          const full = order(prefsApi.get());
          const other = ids[dir === 'up' ? i - 1 : i + 1];
          const a = full.indexOf(id);
          const c = full.indexOf(other);
          [full[a], full[c]] = [full[c], full[a]];
          prefsApi.set({ navOrder: full });
          renderPrefs();
          // Keep the keyboard on the same page's arrow after the list is rebuilt.
          const again = [...$('navEdit').querySelectorAll('.ne-move')].find((x) => x.getAttribute('aria-label') === btn.getAttribute('aria-label'));
          if (again && !again.disabled) again.focus();
        });
        return btn;
      };
      li.append(check, icon, label, move('up'), move('down'));
      list.appendChild(li);
    });
  }
  $('btnResetNav').addEventListener('click', () => {
    prefsApi.set({ navHidden: [], navOrder: [], sidebarSide: 'left', sidebarWidth: 'normal', navIcons: 'auto' });
    renderPrefs();
  });

  // --- Every [data-pref] control: selects, switches and button groups ---
  const prefControls = [...document.querySelectorAll('[data-pref]')];
  for (const el of prefControls) {
    const key = el.dataset.pref;
    if (el.tagName === 'SELECT') el.addEventListener('change', () => { prefsApi.set({ [key]: el.value }); renderPrefs(); });
    else if (el.type === 'checkbox') el.addEventListener('change', () => { prefsApi.set({ [key]: el.checked }); renderPrefs(); });
    else el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-value]');
      if (!b) return;
      prefsApi.set({ [key]: b.dataset.value });
      renderPrefs();
    });
  }
  // Start page: every page you can open here.
  const startSelect = $('startViewSelect');
  for (const [id, v] of Object.entries(VIEWS)) {
    if (v.group === 'settings' || (v.desktop && !desktopApi)) continue;
    const o = document.createElement('option');
    o.value = id;
    o.textContent = t(v.title);
    startSelect.appendChild(o);
  }

  // --- Background: veil and blur of your picture, your three colours ---
  $('wallDim').addEventListener('input', (e) => { prefsApi.set({ wallDim: Number(e.target.value) }); renderLook(); });
  $('wallBlur').addEventListener('input', (e) => { prefsApi.set({ wallBlur: Number(e.target.value) }); renderLook(); });
  ['wallC1', 'wallC2', 'wallC3'].forEach((id, i) => $(id).addEventListener('input', (e) => {
    if (!HEX.test(e.target.value)) return;
    const cols = prefsApi.get().wallColors.split(',');
    cols[i] = e.target.value.toLowerCase();
    prefsApi.set({ wall: 'colors', wallColors: cols.join(',') });
    renderPrefs();
  }));
  // --- Dark mode by the clock ---
  ['darkFrom', 'darkTo'].forEach((key) => $(key).addEventListener('change', (e) => {
    if (TIME.test(e.target.value)) prefsApi.set({ [key]: e.target.value });
    renderPrefs();
  }));

  // --- Quick styles: one click, many options (your menu stays as it is) ---
  const KEEP = new Set(['navHidden', 'navOrder', 'sidebarSide', 'darkFrom', 'darkTo']);
  const PRESETS = [
    { name: 'Predeterminado', look: ['linear-gradient(135deg, #b9dcff, #e3d2ff 55%, #c8f2e8)', 'rgba(255,255,255,.75)', '#0a84ff', 'rgba(0,0,0,.12)'], patch: {} },
    { name: 'Medianoche', look: ['linear-gradient(135deg, #1b1c24, #2a2440)', 'rgba(255,255,255,.12)', '#bf5af2', 'rgba(255,255,255,.18)'], patch: { theme: 'dark', accent: 'purple', wall: 'graphite', corners: 'round', navIcons: 'accent' } },
    { name: 'Papel', look: ['#f4f1ea', '#e4dfd3', '#6b6b70', 'rgba(0,0,0,.13)'], patch: { theme: 'light', accent: 'graphite', wall: 'none', glass: 'solid', font: 'serif', corners: 'square', density: 'comfy' } },
    { name: 'Neón', look: ['linear-gradient(135deg, #5a0b3c, #2a0a5e 55%, #003a5c)', 'rgba(255,255,255,.14)', '#ff375f', 'rgba(255,255,255,.22)'], patch: { theme: 'dark', accent: 'pink', wall: 'colors', wallColors: '#ff2d95,#7a00ff,#00c2ff', glass: 'clear', corners: 'round', navIcons: 'color', bold: true } },
    { name: 'Terminal', look: ['#0d0f0d', '#1a1d1a', '#30d158', 'rgba(48,209,88,.28)'], patch: { theme: 'dark', accent: 'green', wall: 'none', glass: 'solid', font: 'mono', corners: 'square', density: 'compact', navIcons: 'mono' } },
    { name: 'Bosque', look: ['linear-gradient(135deg, #a6e3a8, #c9ea96 55%, #8ad8c8)', 'rgba(255,255,255,.7)', '#34c759', 'rgba(0,0,0,.12)'], patch: { theme: 'light', accent: 'green', wall: 'forest', navIcons: 'color' } },
    { name: 'Atardecer', look: ['linear-gradient(135deg, #ffbd88, #ff9db8 55%, #d9aaff)', 'rgba(255,255,255,.7)', '#ff9500', 'rgba(0,0,0,.12)'], patch: { theme: 'light', accent: 'orange', wall: 'sunset', corners: 'round', font: 'humanist' } },
    { name: 'Compacto', look: ['#e9ebf0', '#d5d8df', '#007aff', 'rgba(0,0,0,.14)'], patch: { density: 'compact', size: 'small', sidebarWidth: 'icons', showSubtitle: false, scrollbar: 'thin' } },
  ];
  const box = $('stylePresets');
  for (const preset of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.innerHTML = '<span class="preset-look"></span><span class="preset-name"></span>';
    const look = b.querySelector('.preset-look');
    ['--pw', '--ps', '--pa', '--pl'].forEach((name, i) => look.style.setProperty(name, preset.look[i]));
    b.querySelector('.preset-name').textContent = t(preset.name);
    b.title = t('Usar el estilo «{name}»', { name: t(preset.name) });
    b.addEventListener('click', () => {
      const patch = {};
      for (const k of prefsApi.STYLE_KEYS) if (!KEEP.has(k)) patch[k] = prefsApi.DEFAULTS[k];
      prefsApi.set({ ...patch, ...preset.patch });
      renderPrefs();
      showToast(t('Estilo «{name}» aplicado. Puedes cambiar cualquier detalle abajo.', { name: t(preset.name) }));
    });
    box.appendChild(b);
  }

  // --- Share your style: a code with only the look (never your picture) ---
  const PREFIX = 'tg-style:';
  $('styleCopy').addEventListener('click', async () => {
    const code = PREFIX + btoa(JSON.stringify(prefsApi.exportStyle()));
    $('styleCode').value = code;
    try { await navigator.clipboard.writeText(code); showToast(t('Estilo copiado: pégalo en Ajustes → Apariencia de otro equipo.')); } catch { $('styleCode').select(); }
  });
  function pasteStyle() {
    const raw = $('styleCode').value.trim();
    let obj = null;
    if (raw.length <= 6000) {
      try { obj = JSON.parse(atob(raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw)); } catch { obj = null; }
    }
    if (!obj || !prefsApi.importStyle(obj)) { showToast(t('Ese código de estilo no es válido.')); return; }
    $('styleCode').value = '';
    renderPrefs();
    showToast(t('Estilo aplicado.'));
  }
  $('stylePaste').addEventListener('click', pasteStyle);
  $('styleCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') pasteStyle(); });

  /** Shows each control's current value. */
  function renderLook() {
    const p = prefsApi.get();
    for (const el of prefControls) {
      const v = p[el.dataset.pref];
      if (el.tagName === 'SELECT') { if (document.activeElement !== el) el.value = v; }
      else if (el.type === 'checkbox') el.checked = Boolean(v);
      else el.querySelectorAll('[data-value]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === v)));
    }
    $('scheduleRow').classList.toggle('hidden', p.theme !== 'schedule');
    $('darkFrom').value = p.darkFrom;
    $('darkTo').value = p.darkTo;
    const picture = p.wall === 'custom' && Boolean(prefsApi.getWallpaper());
    $('wallDimRow').classList.toggle('hidden', !picture);
    $('wallBlurRow').classList.toggle('hidden', !picture);
    $('wallDim').value = p.wallDim;
    $('wallDimOut').textContent = `${p.wallDim}%`;
    $('wallBlur').value = p.wallBlur;
    $('wallBlurOut').textContent = p.wallBlur ? `${p.wallBlur} px` : t('No');
    const cols = p.wallColors.split(',');
    $('wallColorsRow').classList.toggle('hidden', p.wall !== 'colors');
    ['wallC1', 'wallC2', 'wallC3'].forEach((id, i) => { if (document.activeElement !== $(id)) $(id).value = cols[i]; });
    ['--c1', '--c2', '--c3'].forEach((name, i) => $('wallColorsChip').style.setProperty(name, cols[i]));
  }

  function render() { applyNav(); renderLook(); renderNavEdit(); }
  document.addEventListener('tg:prefs', render);
  render();
  return { applyNav, render };
})();

// === A menu at the pointer or under a button (a song's right click, "…") ===
// Items: { label, icon, onClick, danger, sub: async () => items } or '-'.
const ctxMenu = (() => {
  let box = null;
  let back = null;
  function close(refocus = true) {
    if (!box) return;
    box.remove();
    box = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onBlur);
    document.removeEventListener('scroll', onScroll, true);
    if (refocus && back && back.isConnected) back.focus();
    back = null;
  }
  const outside = (e) => { if (box && !box.contains(e.target)) close(false); };
  const onBlur = () => close(false);
  const onScroll = (e) => { if (box && !box.contains(e.target)) close(false); };
  function onKey(e) {
    if (!box) return;
    const items = [...box.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    const to = (n) => { e.preventDefault(); e.stopPropagation(); if (items.length) items[(n + items.length) % items.length].focus(); };
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (e.key === 'ArrowDown') to(i + 1);
    else if (e.key === 'ArrowUp') to(i - 1);
    else if (e.key === 'Home') to(0);
    else if (e.key === 'End') to(items.length - 1);
    else if (e.key === 'Tab') { e.preventDefault(); close(); } else if (e.key === 'ArrowRight' && document.activeElement && document.activeElement.getAttribute('aria-haspopup')) { e.preventDefault(); document.activeElement.click(); } else if (e.key === 'ArrowLeft' && box.querySelector('.ctx-back')) { e.preventDefault(); box.querySelector('.ctx-back').click(); }
  }
  function place(at) {
    const r = at instanceof Element ? at.getBoundingClientRect() : { left: at.x, right: at.x, top: at.y, bottom: at.y };
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    let x = at instanceof Element ? r.right - w : r.left;
    let y = r.bottom + 4;
    if (y + h > innerHeight - 8) y = Math.max(8, (at instanceof Element ? r.top - 4 : r.top) - h);
    x = Math.min(Math.max(8, x), innerWidth - w - 8);
    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(Math.max(8, y))}px`;
  }
  function render(items, at, parent) {
    box.innerHTML = '';
    if (parent) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ctx-item ctx-back';
      b.setAttribute('role', 'menuitem');
      b.textContent = t('← Atrás');
      b.addEventListener('click', () => render(parent, at, null));
      box.append(b, Object.assign(document.createElement('div'), { className: 'ctx-sep' }));
    }
    for (const it of items) {
      if (it === '-') {
        if (box.lastElementChild && !box.lastElementChild.classList.contains('ctx-sep')) box.appendChild(Object.assign(document.createElement('div'), { className: 'ctx-sep' }));
        continue;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `ctx-item${it.danger ? ' danger' : ''}`;
      b.setAttribute('role', 'menuitem');
      if (it.icon && ICONS[it.icon]) b.innerHTML = ICONS[it.icon];
      const s = document.createElement('span');
      s.textContent = it.label;
      b.appendChild(s);
      if (it.sub) {
        b.setAttribute('aria-haspopup', 'menu');
        const more = document.createElement('span');
        more.className = 'ctx-more';
        more.textContent = '›';
        b.appendChild(more);
      }
      b.addEventListener('click', async () => {
        if (it.sub) {
          const subs = await it.sub();
          if (box) render(subs, at, items);
          return;
        }
        close();
        it.onClick();
      });
      box.appendChild(b);
    }
    if (box.lastElementChild && box.lastElementChild.classList.contains('ctx-sep')) box.lastElementChild.remove();
    place(at);
    const first = box.querySelector('[role="menuitem"]');
    if (first) first.focus();
  }
  function open(at, items, opener) {
    close(false);
    back = opener || document.activeElement;
    box = document.createElement('div');
    box.className = 'ctx-menu';
    box.setAttribute('role', 'menu');
    document.body.appendChild(box);
    render(items, at, null);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    document.addEventListener('scroll', onScroll, true);
  }
  document.addEventListener('tg:view', () => close(false));
  return { open, close, isOpen: () => Boolean(box) };
})();

// === Keyboard shortcuts for the player (desktop). The ones you set in
// Ajustes → Sistema come first. ===

(() => {
  if (!desktopApi) return;
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    if (document.querySelector('.keys-box.recording') || ctxMenu.isOpen()) return;
    const el = document.activeElement;
    const typing = Boolean(el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'range' && el.type !== 'checkbox' || el.isContentEditable));
    const ctrl = e.ctrlKey || e.metaKey;
    const { altKey: alt, shiftKey: shift, key: k, code } = e;
    // Ctrl+/ (Ctrl+? too, and Ctrl+Shift+7 on a Spanish keyboard): the shortcuts.
    if (ctrl && !alt && (k === '/' || k === '?' || code === 'Slash' || (shift && code === 'Digit7'))) {
      if (!document.querySelector('.modal:not(.hidden)')) { e.preventDefault(); keysHelp.open(); }
      return;
    }
    // The editor has keys of its own; a dialog keeps its keyboard.
    if (currentView === 'cv-edit' || document.querySelector('.modal:not(.hidden)')) return;
    const nowOpen = !$('nowView').classList.contains('hidden');
    const has = Boolean(player.current());
    const run = (fn) => { e.preventDefault(); fn(); };
    // Ctrl+R would reload the window: here it's repeat.
    if (ctrl && !alt && !shift && code === 'KeyR') { run(() => { if (has) player.command('repeat'); }); return; }
    if (ctrl && !alt && !shift && code === 'KeyL') { run(() => setView('dl-search')); return; }
    if (alt && shift && !ctrl) {
      const ALT = {
        KeyQ: () => $('plQueueBtn').click(),
        KeyJ: () => $('plLyricsBtn').click(),
        KeyR: () => (nowOpen ? $('nowClose') : $('plNow')).click(),
      };
      if (ALT[code]) { if (has) run(ALT[code]); else e.preventDefault(); }
      return;
    }
    if (typing || !has) return;
    if (ctrl && !alt && !shift && code === 'KeyS') run(() => player.command('shuffle'));
    else if (ctrl && !alt && !shift && k === 'ArrowRight') run(() => player.command('next'));
    else if (ctrl && !alt && !shift && k === 'ArrowLeft') run(() => player.command('prev'));
    else if (ctrl && !alt && !shift && k === 'ArrowUp') run(() => player.command('volup'));
    else if (ctrl && !alt && !shift && k === 'ArrowDown') run(() => player.command('voldown'));
    else if (ctrl && !alt && shift && k === 'ArrowDown') run(() => player.command('mute'));
    else if (shift && !ctrl && !alt && k === 'ArrowRight' && !(el && el.type === 'range')) run(() => player.command('seekf'));
    else if (shift && !ctrl && !alt && k === 'ArrowLeft' && !(el && el.type === 'range')) run(() => player.command('seekb'));
    // Space: play / pause where music is (Biblioteca, the big "Ahora suena"),
    // not on a button or a list row (those are theirs).
    else if (k === ' ' && !ctrl && !alt && !shift && (currentView === 'library' || nowOpen) && !(el && /^(BUTTON|A|INPUT|SUMMARY)$/.test(el.tagName))) run(() => player.command('toggle'));
  });
})();

// === Position and volume bars: filled up to where they are (drawn by the style) ===
(() => {
  const ranges = ['plSeek', 'plVolume', 'nowSeek', 'nowVolume'].map((id) => $(id)).filter(Boolean);
  const paint = () => {
    for (const r of ranges) {
      const min = Number(r.min) || 0;
      const max = Number(r.max) || 1;
      const p = max > min ? Math.max(0, Math.min(100, ((Number(r.value) - min) / (max - min)) * 100)) : 0;
      r.style.setProperty('--pct', `${p.toFixed(2)}%`);
    }
  };
  for (const r of ranges) r.addEventListener('input', paint);
  for (const m of [$('plMedia'), $('plMediaB')]) for (const ev of ['timeupdate', 'volumechange', 'loadedmetadata', 'seeked', 'emptied']) m.addEventListener(ev, paint);
  paint();
})();
// === Biblioteca → Revisar: low quality, missing data or lyrics, albums with
// songs missing, and what takes up the most space (desktop) ===
const libReview = (() => {
  if (!desktopApi) return {};
  let data = { files: [], indexing: false, done: 0, total: 0 };
  let tab = 'quality';
  let poll = null;
  const picked = new Set();
  const modal = $('reviewModal');
  const TABS = {
    quality: { label: 'Calidad', hint: 'Canciones con poca calidad (por debajo de 128 kb/s). Se vuelven a bajar con lo mejor que tenga YouTube (unos 160 kb/s como mucho); la versión antigua puedes quitarla luego en Duplicados.' },
    tags: { label: 'Datos', hint: 'Sin artista, sin título o sin carátula: se completan con MusicBrainz, sin tocar lo que ya tienen.' },
    lyrics: { label: 'Letras', hint: 'Canciones sin letra: se buscan en LRCLIB y se guardan en el archivo (y sincronizadas, cuando las hay).' },
    albums: { label: 'Álbumes', hint: 'Tus álbumes según sus etiquetas: comprueba en MusicBrainz qué canciones te faltan y bájalas.' },
    space: { label: 'Espacio', hint: 'Lo que más ocupa y lo que no abres desde hace meses. Lo que quites va a la papelera de Windows.' },
  };
  const issue = (f, i) => f.issues.includes(i);
  const of = { quality: (f) => issue(f, 'quality'), tags: (f) => issue(f, 'tags') || issue(f, 'cover'), lyrics: (f) => issue(f, 'lyrics') };
  const what = (f) => [issue(f, 'tags') && (!f.artist ? t('sin artista') : t('sin título')), issue(f, 'cover') && t('sin carátula')].filter(Boolean).join(' · ');
  async function fetchData() {
    try { data = await api('/api/library/review'); } catch (err) { $('reviewHint').textContent = err.message; return; }
    $('reviewHint').textContent = data.indexing ? t('Leyendo tus canciones… {d} de {n}', { d: data.done, n: data.total }) : t('{n} canciones revisadas', { n: data.files.length });
    clearTimeout(poll);
    if (data.indexing && !modal.classList.contains('hidden')) poll = setTimeout(fetchData, 2500);
    render();
  }
  function row(id, title, sub, checked = false) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    label.className = 'review-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => { if (box.checked) picked.add(id); else picked.delete(id); paintActions(); });
    const text = document.createElement('span');
    text.className = 'review-text';
    const a = document.createElement('span');
    a.className = 'review-title';
    a.textContent = title;
    const b = document.createElement('span');
    b.className = 'review-sub';
    b.textContent = sub;
    text.append(a, b);
    label.append(box, text);
    li.appendChild(label);
    return li;
  }
  const actionsBox = () => $('reviewActions');
  function button(label, fn, primary = false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn${primary ? ' btn-primary' : ''}`;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }
  function paintActions() {
    const box = actionsBox();
    box.innerHTML = '';
    const n = picked.size;
    const all = () => { for (const el of $('reviewList').querySelectorAll('input[type=checkbox]')) { el.checked = true; } listIds().forEach((id) => picked.add(id)); paintActions(); };
    if (tab === 'albums') return;
    box.appendChild(button(t('Todas'), all));
    if (tab === 'quality') box.appendChild(button(t('Volver a bajarlas mejor ({n})', { n }), upgrade, true));
    if (tab === 'tags') box.appendChild(button(t('Arreglar con MusicBrainz ({n})', { n }), () => fixing('/api/library/review/fix'), true));
    if (tab === 'lyrics') box.appendChild(button(t('Buscar sus letras ({n})', { n }), () => fixing('/api/library/review/lyrics'), true));
    if (tab === 'space') {
      const size = [...picked].reduce((s, id) => s + ((library.files().find((f) => f.id === id) || {}).size || 0), 0);
      box.appendChild(button(t('A la papelera ({n} · {s})', { n, s: formatBytes(size) }), trash, true));
      box.appendChild(button(t('Buscar duplicados'), () => { close(); $('libDupes').click(); }));
    }
    for (const b of box.querySelectorAll('.btn-primary')) b.disabled = !n;
  }
  const listIds = () => [...$('reviewList').querySelectorAll('li[data-id]')].map((li) => li.dataset.id);
  function render() {
    for (const b of $('reviewTabs').querySelectorAll('[data-tab]')) {
      const k = b.dataset.tab;
      const count = of[k] ? data.files.filter(of[k]).length : null;
      b.querySelector('.review-count').textContent = count === null ? '' : String(count);
      b.classList.toggle('active', k === tab);
      b.setAttribute('aria-selected', String(k === tab));
    }
    $('reviewTabHint').textContent = t(TABS[tab].hint);
    const ul = $('reviewList');
    ul.innerHTML = '';
    if (of[tab]) {
      const list = data.files.filter(of[tab]).slice(0, 500);
      for (const f of list) {
        const sub = tab === 'quality' ? `${f.bitrate || '?'} kb/s · ${f.codec || ''}` : tab === 'tags' ? what(f) : [f.artist, f.album].filter(Boolean).join(' · ');
        const li = row(f.id, f.label || f.name, sub, picked.has(f.id));
        li.dataset.id = f.id;
        ul.appendChild(li);
      }
      if (!list.length) ul.innerHTML = `<li class="review-empty">${escapeHtml(data.indexing ? t('Aún leyendo tus canciones…') : t('Nada que arreglar aquí.'))}</li>`;
    } else if (tab === 'albums') renderAlbums(ul);
    else renderSpace(ul);
    paintActions();
  }
  // ---- albums ----
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function renderAlbums(ul) {
    const groups = new Map();
    for (const f of data.files) {
      if (!f.album || !(f.albumArtist || f.artist)) continue;
      const artist = f.albumArtist || f.artist;
      const k = `${fold(artist)}|${fold(f.album)}`;
      if (!groups.has(k)) groups.set(k, { artist, album: f.album, n: 0 });
      groups.get(k).n++;
    }
    const list = [...groups.values()].filter((g) => g.n >= 2).sort((a, b) => b.n - a.n).slice(0, 200);
    if (!list.length) { ul.innerHTML = `<li class="review-empty">${escapeHtml(t('No hay álbumes con dos o más canciones (según sus etiquetas).'))}</li>`; return; }
    for (const g of list) {
      const li = document.createElement('li');
      li.className = 'review-album';
      const head = document.createElement('div');
      head.className = 'review-row';
      const text = document.createElement('span');
      text.className = 'review-text';
      text.innerHTML = '<span class="review-title"></span><span class="review-sub"></span>';
      text.querySelector('.review-title').textContent = g.album;
      text.querySelector('.review-sub').textContent = `${g.artist} · ${t('{n} canciones', { n: g.n })}`;
      const check = button(t('Comprobar'), async () => {
        check.disabled = true;
        check.textContent = t('Comprobando…');
        try {
          const r = await postJson('/api/library/review/album', { artist: g.artist, album: g.album });
          const missing = r.tracks.filter((x) => !x.have);
          const box = document.createElement('div');
          box.className = 'review-missing';
          if (!missing.length) box.textContent = t('Lo tienes completo ({n} canciones).', { n: r.tracks.length });
          else {
            const p = document.createElement('p');
            p.textContent = t('Te faltan {n} de {m}:', { n: missing.length, m: r.tracks.length });
            const ol = document.createElement('ol');
            for (const x of missing.slice(0, 60)) { const it = document.createElement('li'); it.textContent = x.title; ol.appendChild(it); }
            const status = document.createElement('span');
            status.className = 'status-message';
            const get = button(t('Bajar las que faltan ({n})', { n: missing.length }), () => {
              queueItems(missing.map((x) => ({ query: `${r.release.artist || g.artist} - ${x.title}`, title: `${r.release.artist || g.artist} - ${x.title}` })), status);
              get.disabled = true;
            }, true);
            box.append(p, ol, get, status);
          }
          li.querySelector('.review-missing') && li.querySelector('.review-missing').remove();
          li.appendChild(box);
          check.textContent = t('Comprobado');
        } catch (err) { check.disabled = false; check.textContent = t('Comprobar'); showToast(err.message); }
      });
      head.append(text, check);
      li.appendChild(head);
      ul.appendChild(li);
    }
  }
  // ---- space: the biggest, and the forgotten ----
  let spaceMode = 'big';
  function renderSpace(ul) {
    const bar = document.createElement('li');
    bar.className = 'review-filter';
    for (const [k, label] of [['big', t('Lo que más ocupa')], ['video', t('Vídeos')], ['old', t('Sin abrir en 6 meses')]]) {
      const b = button(label, () => { spaceMode = k; picked.clear(); render(); });
      b.setAttribute('aria-pressed', String(spaceMode === k));
      if (spaceMode === k) b.classList.add('btn-primary');
      bar.appendChild(b);
    }
    ul.appendChild(bar);
    const half = Date.now() - 182 * 86400e3;
    let list = library.files().slice();
    if (spaceMode === 'video') list = list.filter((f) => f.kind === 'video');
    if (spaceMode === 'old') list = list.filter((f) => (f.lastPlayed || 0) < half && f.mtime < half && !f.fav);
    list.sort((a, b) => b.size - a.size);
    const total = list.reduce((s, f) => s + f.size, 0);
    const sum = document.createElement('li');
    sum.className = 'review-empty';
    sum.textContent = t('{n} archivos · {s}', { n: list.length, s: formatBytes(total) });
    ul.appendChild(sum);
    for (const f of list.slice(0, 200)) {
      const sub = [formatBytes(f.size), f.kind === 'video' ? t('vídeo') : t('audio'), f.lastPlayed ? t('abierto el {d}', { d: new Date(f.lastPlayed).toLocaleDateString() }) : t('nunca abierto aquí')].join(' · ');
      const li = row(f.id, library.relOf(f), sub, picked.has(f.id));
      li.dataset.id = f.id;
      ul.appendChild(li);
    }
  }
  // ---- actions ----
  async function upgrade() {
    const ids = [...picked];
    try {
      const r = await postJson('/api/library/review/upgrade', { ids, opts: downloadOptions('audio') });
      showToast(t('{n} canciones a la cola, con la mejor calidad', { n: r.queued }));
      picked.clear();
      render();
    } catch (err) { showToast(err.message); }
  }
  async function fixing(path) {
    const ids = [...picked];
    const btns = actionsBox().querySelectorAll('button');
    btns.forEach((b) => { b.disabled = true; });
    let done = 0;
    let missing = 0;
    for (let i = 0; i < ids.length; i += 5) {
      $('reviewHint').textContent = t('Arreglando… {d} de {n}', { d: i, n: ids.length });
      try { const r = await postJson(path, { ids: ids.slice(i, i + 5) }); done += r.done; missing += r.missing; } catch (err) { showToast(err.message); break; }
    }
    showToast(t('{d} arregladas · {m} sin encontrar', { d: done, m: missing }));
    picked.clear();
    library.load && library.load();
    fetchData();
  }
  async function trash() {
    const ids = [...picked];
    let n = 0;
    for (const id of ids) {
      const f = library.files().find((x) => x.id === id);
      if (!f) continue;
      const r = await desktopApi.trashLibraryFile(library.relOf(f));
      if (r && r.ok) n++;
    }
    showToast(t('{n} archivos a la papelera de Windows', { n }));
    picked.clear();
    if (library.load) await library.load();
    render();
  }
  function open() {
    modal.classList.remove('hidden');
    picked.clear();
    $('reviewClose').focus();
    library.ensure().then(fetchData);
  }
  function close() { modal.classList.add('hidden'); clearTimeout(poll); }
  $('libReview').addEventListener('click', open);
  $('reviewClose').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden') && !ctxMenu.isOpen()) close(); });
  $('reviewTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    picked.clear();
    render();
  });
  return { open };
})();

// === Ctrl+K: one box to go anywhere — a section, a setting, a song of your
// library, or something to do ===
const palette = (() => {
  const modal = $('cmdModal');
  const input = $('cmdInput');
  const list = $('cmdList');
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let items = [];
  let shown = [];
  let at = 0;
  let back = null;
  const KIND = { view: 'Sección', setting: 'Ajuste', song: 'Canción', action: 'Hacer' };
  function sources() {
    const out = [];
    for (const [view, info] of Object.entries(VIEWS)) {
      if (info.desktop && !desktopApi) continue;
      if (view.startsWith('set-') && view !== 'set-appearance') continue;
      out.push({ kind: 'view', label: t(info.title), sub: t(info.sub || ''), run: () => setView(view) });
    }
    for (const s of settingsSearch.all()) out.push({ kind: 'setting', label: s.name, sub: t(settingsSearch.TAB[s.view]), run: () => settingsSearch.go(s) });
    const action = (label, run, desk = false) => { if (!desk || desktopApi) out.push({ kind: 'action', label, sub: '', run }); };
    action(t('Atajos de teclado'), () => keysHelp.open());
    action(t('Mini reproductor'), () => desktopApi.openMini(), true);
    action(t('Revisar la biblioteca'), () => { setView('library'); libReview.open && libReview.open(); }, true);
    action(t('Buscar duplicados'), () => { setView('library'); $('libDupes').click(); }, true);
    action(t('Ahora suena'), () => { if (player.current()) $('plNow').click(); });
    if (desktopApi) {
      for (const f of library.files().slice(0, 5000)) {
        out.push({ kind: 'song', label: f.name.replace(/\.[^.]+$/, ''), sub: f.folder || t('Biblioteca'), run: () => player.play([f], 0) });
      }
    }
    for (const it of out) it.key = fold(`${it.label} ${it.sub}`);
    return out;
  }
  function filter() {
    const q = fold(input.value.trim());
    const words = q.split(/\s+/).filter(Boolean);
    if (!words.length) {
      shown = items.filter((i) => i.kind === 'view' || i.kind === 'action').slice(0, 30);
    } else {
      const score = (i) => (fold(i.label).startsWith(q) ? 0 : fold(i.label).includes(q) ? 1 : 2) + { action: 0, view: 0.1, setting: 0.3, song: 0.4 }[i.kind];
      shown = items.filter((i) => words.every((w) => i.key.includes(w))).sort((a, b) => score(a) - score(b)).slice(0, 40);
    }
    at = 0;
    paint();
  }
  function paint() {
    list.innerHTML = '';
    shown.forEach((it, i) => {
      const li = document.createElement('li');
      li.id = `cmd-${i}`;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === at));
      li.className = i === at ? 'on' : '';
      li.innerHTML = '<span class="cmd-label"></span><span class="cmd-sub"></span><span class="cmd-kind"></span>';
      li.querySelector('.cmd-label').textContent = it.label;
      li.querySelector('.cmd-sub').textContent = it.sub;
      li.querySelector('.cmd-kind').textContent = t(KIND[it.kind]);
      li.addEventListener('mousemove', () => { if (at !== i) { at = i; mark(); } });
      li.addEventListener('click', () => pick(i));
      list.appendChild(li);
    });
    if (!shown.length) {
      const li = document.createElement('li');
      li.className = 'cmd-empty';
      li.textContent = t('Nada con esas palabras.');
      list.appendChild(li);
    }
    input.setAttribute('aria-activedescendant', shown.length ? `cmd-${at}` : '');
  }
  function mark() {
    [...list.children].forEach((li, i) => { li.classList.toggle('on', i === at); li.setAttribute('aria-selected', String(i === at)); });
    input.setAttribute('aria-activedescendant', shown.length ? `cmd-${at}` : '');
    const li = list.children[at];
    if (li) li.scrollIntoView({ block: 'nearest' });
  }
  function pick(i) {
    const it = shown[i];
    if (!it) return;
    close(false);
    it.run();
  }
  async function open() {
    if (!modal.classList.contains('hidden')) { input.select(); return; }
    back = document.activeElement;
    modal.classList.remove('hidden');
    input.value = '';
    items = sources();
    filter();
    input.focus();
    // The songs, if the library wasn't read yet.
    if (desktopApi) {
      await library.ensure();
      if (!modal.classList.contains('hidden')) { items = sources(); filter(); }
    }
  }
  function close(refocus = true) {
    modal.classList.add('hidden');
    if (refocus && back && back.isConnected) back.focus();
  }
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (shown.length) { at = (at + 1) % shown.length; mark(); } } else if (e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { at = (at - 1 + shown.length) % shown.length; mark(); } } else if (e.key === 'Enter') { e.preventDefault(); pick(at); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK' && currentView !== 'cv-edit') {
      if (document.querySelector('.modal:not(.hidden)') && modal.classList.contains('hidden')) return;
      e.preventDefault();
      open();
    }
  });
  return { open, close };
})();

// === A file from the Explorer's right-click menu (desktop) ===
if (desktopApi && desktopApi.onFileAction) {
  desktopApi.onFileAction(async ({ action, token, name, size }) => {
    if (!/^[a-f0-9]{32}$/.test(String(token)) || !['mp3', 'compress', 'edit'].includes(action)) return;
    if (action === 'mp3') {
      try { await postJson('/api/local/convert', { token }); setView('queue'); showToast(t('«{n}» se está convirtiendo a MP3', { n: name })); } catch (err) { showToast(err.message); }
      return;
    }
    if (size > 4 * 1024 ** 3) { showToast(t('Ese archivo es demasiado grande para abrirlo aquí.')); return; }
    showToast(t('Abriendo «{n}»…', { n: name }));
    try {
      const res = await fetch(`/api/local/file?token=${token}`, { headers: { 'x-client-id': CLIENT_ID } });
      if (!res.ok) throw new Error(ts((await res.json().catch(() => ({}))).error) || t('No se pudo abrir ese archivo.'));
      const blob = await res.blob();
      const file = new File([blob], String(name).slice(0, 255), { type: blob.type });
      if (action === 'compress') { setView('cv-compress'); setCompressFiles([file]); } else { setView('cv-edit'); editor.load(file); }
    } catch (err) { showToast(err.message); }
  });
}
// Ajustes → Sistema: the Explorer's menu.
(async () => {
  if (!desktopApi || !desktopApi.getExplorerMenu) return;
  const s = await desktopApi.getExplorerMenu().catch(() => null);
  if (!s || !s.available) return;
  $('explorerRow').classList.remove('hidden');
  $('optExplorer').checked = s.on;
  $('optExplorer').addEventListener('change', async () => {
    const on = $('optExplorer').checked;
    $('explorerStatus').textContent = t('Cambiando el menú…');
    const r = await desktopApi.setExplorerMenu(on).catch(() => null);
    $('optExplorer').checked = Boolean(r && r.on);
    $('explorerStatus').textContent = r && r.error ? ts(r.error) : r && r.on ? t('Listo: botón derecho sobre un audio o un vídeo (en Windows 11, «Mostrar más opciones»).') : t('Quitado del menú del Explorador.');
  });
})();

restoreLastOptions();
profilesUi.load();
setView(lastView());
tour.firstRun();
renderHistory();
connectEvents();
loadConfig();

// === Ajustes → Descargas: proxy; Conversión: AcoustID key and fpcalc ===
(() => {
  const proxy = $('cfgProxy');
  const key = $('cfgAcoustid');
  const fill = (cfg) => {
    if (!cfg) return;
    if (document.activeElement !== proxy) proxy.value = cfg.proxy || '';
    if (document.activeElement !== key) key.value = cfg.acoustidKey || '';
  };
  const load = async () => { try { fill(await api('/api/config')); } catch { /* offline */ } };
  const save = async (patch, statusId) => {
    try { fill(await postJson('/api/config', patch)); setStatusEl($(statusId), t('Guardado'), 'success'); } catch (err) { setStatusEl($(statusId), err.message, 'error'); }
  };
  proxy.addEventListener('change', () => save({ proxy: proxy.value.trim() }, 'rulesStatus'));
  key.addEventListener('change', () => save({ acoustidKey: key.value.trim() }, 'mbStatus'));
  async function fpcalc() {
    if (!desktopApi || !desktopApi.getFpcalc) return;
    const s = await desktopApi.getFpcalc();
    $('fpcalcLabel').textContent = s.installed ? t('Instalada: TubeGrab puede reconocer las canciones por cómo suenan (con tu clave).') : t('Sin instalar (4 MB, de GitHub, comprobada con su huella SHA-256).');
    $('btnFpcalc').textContent = s.installed ? t('Instalada') : t('Instalar');
    $('btnFpcalc').disabled = s.installed || s.busy;
  }
  $('btnFpcalc').addEventListener('click', async () => {
    $('btnFpcalc').disabled = true;
    $('btnFpcalc').textContent = t('Descargando…');
    const r = await desktopApi.installFpcalc();
    if (r && r.error) setStatusEl($('mbStatus'), r.error, 'error');
    fpcalc();
  });
  document.addEventListener('tg:view', (e) => { if (e.detail === 'set-downloads' || e.detail === 'set-convert') { load(); fpcalc(); } });
})();

// === Convertir → Etiquetas: fill in from MusicBrainz ===
$('tgMusicBrainz').addEventListener('click', async () => {
  const status = $('tagsStatus');
  const rowsNow = tagEditor.rows();
  const files = tagEditor.files();
  if (!files.length) { setStatusEl(status, t('Elige uno o varios archivos primero'), 'error'); return; }
  const btn = $('tgMusicBrainz');
  btn.disabled = true;
  try {
    // What each song already says (title / artist, or "Artist - Title" in its name).
    const hints = rowsNow.map((r) => {
      let { title, artist } = r.tags;
      if (!title) {
        const base = r.name.replace(/\.[^.]+$/, '').replace(/^\d{1,3}[\s.\-_]+/, '').replace(/\s*\[[\w-]{6,}\]$/, '');
        const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
        if (m) { artist = artist || m[1]; title = m[2]; } else title = base;
      }
      return { title: title || '', artist: artist || '' };
    });
    const res = await uploadTo('/api/tags/identify', 'files', files, { hints: JSON.stringify(hints) }, (pct) => setStatusEl(status, pct < 100 ? `${t('Subiendo')} ${pct}%` : t('Buscando en MusicBrainz…'), ''));
    let found = 0;
    const releases = new Set();
    (res.results || []).forEach((r, i) => {
      if (!r || !rowsNow[i]) return;
      found += 1;
      for (const k of ['title', 'artist', 'album', 'album_artist', 'date', 'track']) if (r[k]) rowsNow[i].tags[k] = r[k];
      if (r.releaseId) releases.add(r.releaseId);
    });
    tagEditor.render();
    // All from one album and no cover chosen: its cover too.
    let cover = false;
    if (releases.size === 1 && !tagEditor.hasCover()) {
      try {
        const r = await fetch(`/api/tags/coverart?release=${[...releases][0]}`, { headers: { 'x-client-id': CLIENT_ID } });
        if (r.ok) {
          const blob = await r.blob();
          const ext = { 'image/png': 'png', 'image/webp': 'webp' }[blob.type] || 'jpg';
          tagEditor.setCover(new File([blob], `caratula.${ext}`, { type: blob.type || 'image/jpeg' }));
          cover = true;
        }
      } catch { /* no cover */ }
    }
    setStatusEl(status, found
      ? t('Encontradas {n} de {m}{c}. Revisa y pulsa «Guardar etiquetas».', { n: found, m: rowsNow.length, c: cover ? t(', con la carátula del disco') : '' })
      : t('MusicBrainz no ha encontrado estas canciones. Prueba a poner el título y el artista a mano, o añade tu clave de AcoustID en Ajustes → Conversión.'), found ? 'success' : 'error');
  } catch (err) {
    setStatusEl(status, err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

// === Descargar → Suscripciones: podcasts (desktop) ===
const podcastsUi = (() => {
  if (!desktopApi) return { load() {} };
  async function load() {
    let list = [];
    try { list = (await api('/api/podcasts')).podcasts || []; } catch { /* not ready */ }
    const ul = $('podList');
    ul.innerHTML = '';
    $('podEmpty').classList.toggle('hidden', list.length > 0);
    for (const p of list) {
      const li = document.createElement('li');
      li.className = 'sub-item';
      li.innerHTML = '<img class="pod-art" alt=""><div class="sub-text"><span class="sub-title"></span><span class="sub-meta"></span></div><div class="queue-actions"></div>';
      if (p.image) li.querySelector('img').src = p.image; else li.querySelector('img').remove();
      li.querySelector('.sub-title').textContent = p.title;
      li.querySelector('.sub-meta').textContent = [t('{n} episodios', { n: p.count }), p.lastCheck ? t('revisado {t}', { t: timeAgo(p.lastCheck) }) : '', p.lastError ? ts(p.lastError) : '', p.enabled ? '' : t('en pausa')].filter(Boolean).join(' · ');
      const a = li.querySelector('.queue-actions');
      a.append(
        iconButton('retry', t('Buscar episodios nuevos ahora'), async () => { try { const r = await postJson(`/api/podcasts/${p.id}/check`, {}); showToast(r.found ? t('{n} episodios nuevos en la cola', { n: r.found }) : t('No hay episodios nuevos')); load(); } catch (err) { showToast(err.message); } }),
        iconButton('save', t('Elegir episodios para bajar'), () => pickEpisodes(p)),
        iconButton(p.enabled ? 'pause' : 'play', p.enabled ? t('Pausar') : t('Reanudar'), async () => { await api(`/api/podcasts/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !p.enabled }) }); load(); }),
        iconButton('remove', t('Dejar de seguir'), async () => { await api(`/api/podcasts/${p.id}`, { method: 'DELETE' }); load(); }),
      );
      ul.appendChild(li);
    }
  }
  async function pickEpisodes(p) {
    let eps = [];
    try { eps = (await api(`/api/podcasts/${p.id}/episodes`)).episodes || []; } catch (err) { showToast(err.message); return; }
    const choice = await ask({
      title: p.title,
      text: eps.slice(0, 5).map((e, i) => `${i + 1}. ${e.title}${e.date ? ` (${formatDate(e.date)})` : ''}`).join('\n'),
      buttons: [{ label: t('Cancelar'), value: null }, { label: t('El último'), value: 1 }, { label: t('Los 5 últimos'), value: 5, primary: true }],
    });
    if (!choice) return;
    try {
      const r = await postJson(`/api/podcasts/${p.id}/download`, { guids: eps.slice(0, choice).map((e) => e.guid) });
      showToast(t('{n} episodios añadidos a la cola', { n: r.created }));
    } catch (err) { showToast(err.message); }
  }
  $('btnPodAdd').addEventListener('click', async () => {
    const status = $('podStatus');
    const url = $('podUrl').value.trim();
    if (!url) { setStatusEl(status, t('Pega la dirección del feed (RSS) del podcast.'), 'error'); return; }
    const btn = $('btnPodAdd');
    btn.disabled = true;
    setStatusEl(status, t('Leyendo el podcast…'), '');
    try {
      const p = await postJson('/api/podcasts', { url, interval: 6, backfill: Number($('podBackfill').value) });
      $('podUrl').value = '';
      setStatusEl(status, t('Suscrito a «{p}»', { p: p.title }), 'success');
      load();
    } catch (err) { setStatusEl(status, err.message, 'error'); } finally { btn.disabled = false; }
  });
  document.addEventListener('tg:view', (e) => { if (e.detail === 'dl-subs') load(); });
  return { load };
})();

// === Ajustes → Descargas: download window and repeating tasks (desktop) ===
(() => {
  if (!desktopApi) return;
  const DAY = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  function render(data) {
    if (!data) return;
    const w = data.window;
    $('winEnabled').checked = w.enabled;
    $('winFrom').value = w.from;
    $('winTo').value = w.to;
    if (w.enabled) setStatusEl($('winStatus'), data.open ? t('Ahora mismo se puede descargar.') : t('Ahora no: lo que añadas empezará a las {h}.', { h: w.from }), '');
    else setStatusEl($('winStatus'), '', '');
    const ul = $('recList');
    ul.innerHTML = '';
    $('recEmpty').classList.toggle('hidden', data.tasks.length > 0);
    for (const task of data.tasks) {
      const li = document.createElement('li');
      li.className = 'sub-item';
      li.innerHTML = '<div class="sub-text"><span class="sub-title"></span><span class="sub-meta"></span></div><div class="queue-actions"></div>';
      li.querySelector('.sub-title').textContent = task.name || task.url;
      const days = task.days.length === 7 ? t('cada día') : task.days.map((d) => DAY[d]).join(' ');
      li.querySelector('.sub-meta').textContent = [`${days} · ${task.time}`, ts(task.detail), task.lastRun ? t('última vez {t}', { t: timeAgo(task.lastRun) }) : '', task.lastError ? ts(task.lastError) : '', task.enabled ? '' : t('en pausa')].filter(Boolean).join(' · ');
      li.querySelector('.queue-actions').append(
        iconButton(task.enabled ? 'pause' : 'play', task.enabled ? t('Pausar') : t('Reanudar'), async () => render(await api(`/api/recurring/${task.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !task.enabled }) }))),
        iconButton('remove', t('Borrar la tarea'), async () => render(await api(`/api/recurring/${task.id}`, { method: 'DELETE' }))),
      );
      ul.appendChild(li);
    }
  }
  const load = async () => { try { render(await api('/api/recurring')); } catch { /* not ready */ } };
  const saveWindow = async () => {
    try { render(await postJson('/api/recurring/window', { enabled: $('winEnabled').checked, from: $('winFrom').value, to: $('winTo').value })); } catch (err) { setStatusEl($('winStatus'), err.message, 'error'); }
  };
  ['winEnabled', 'winFrom', 'winTo'].forEach((id) => $(id).addEventListener('change', saveWindow));
  $('btnRecAdd').addEventListener('click', async () => {
    const status = $('recStatus');
    const url = $('recUrl').value.trim();
    const days = [...$('recDays').querySelectorAll('input:checked')].map((x) => Number(x.value));
    try {
      const data = await postJson('/api/recurring', { url, time: $('recTimeAt').value, days, options: { ...downloadOptions(), playlist: isPlaylistUrl(url) } });
      $('recUrl').value = '';
      setStatusEl(status, t('Tarea añadida'), 'success');
      render(data);
    } catch (err) { setStatusEl(status, err.message, 'error'); }
  });
  document.addEventListener('tg:view', (e) => { if (e.detail === 'set-downloads') load(); });
})();

// === Ajustes → Sistema: the player's shortcuts, Last.fm, Discord (desktop) ===
(() => {
  if (!desktopApi || !desktopApi.getShortcuts) return;
  const NAMES = {
    toggle: 'Reproducir / pausa', next: 'Siguiente', prev: 'Anterior', stop: 'Parar', volup: 'Subir el volumen', voldown: 'Bajar el volumen',
    mute: 'Silenciar / con sonido', seekf: 'Adelantar 10 s', seekb: 'Atrasar 10 s', mini: 'Abrir o cerrar el mini reproductor',
    overlay: 'Mini reproductor: dejar pasar los clics sí / no', show: 'Mostrar TubeGrab',
  };
  const pretty = (acc) => String(acc || '').replace(/Control/g, 'Ctrl').replace(/MediaPlayPause/, '⏯ (multimedia)').replace(/MediaNextTrack/, '⏭ (multimedia)')
    .replace(/MediaPreviousTrack/, '⏮ (multimedia)').replace(/MediaStop/, '⏹ (multimedia)').replace(/\bUp\b/, '↑').replace(/\bDown\b/, '↓').replace(/\bLeft\b/, '←').replace(/\bRight\b/, '→').replace(/\+/g, ' + ');
  let cfg = null;
  function render() {
    $('keysGlobal').checked = cfg.global;
    const box = $('keysEditor');
    box.innerHTML = '';
    for (const a of Object.keys(NAMES)) {
      const row = document.createElement('div');
      row.className = 'row keys-row';
      row.innerHTML = '<span class="row-label"></span><button type="button" class="keys-box"></button>';
      row.querySelector('.row-label').textContent = t(NAMES[a]);
      const b = row.querySelector('.keys-box');
      const local = cfg.global && (cfg.localOnly || []).includes(a);
      b.textContent = cfg.keys[a] ? `${pretty(cfg.keys[a])}${local ? ` · ${t('solo en TubeGrab')}` : ''}` : t('Sin atajo');
      b.classList.toggle('failed', (cfg.failed || []).includes(a));
      if ((cfg.failed || []).includes(a)) b.title = t('Otro programa ya usa esta combinación');
      else if (local) b.title = t('Una tecla que escribe algo (letra, número, espacio, flecha) solo funciona con TubeGrab delante, para no quitártela en otros programas. Para que funcione siempre, añade Ctrl o Alt, o usa F1–F12 o el teclado numérico.');
      b.setAttribute('aria-label', `${t(NAMES[a])}: ${b.textContent}`);
      b.addEventListener('click', () => record(a, b));
      box.appendChild(row);
    }
    playerKeys.set(cfg);
    const failed = (cfg.failed || []).length;
    setStatusEl($('keysStatus'), failed ? t('{n} atajos no funcionan con la ventana en segundo plano: otro programa ya los usa. Cámbialos.', { n: failed }) : '', failed ? 'error' : '');
  }
  function record(action, b) {
    b.textContent = t('Pulsa la tecla o la combinación…');
    b.classList.add('recording');
    const onKey = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { done(); render(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { done(); save({ keys: { [action]: '' } }); return; }
      const acc = playerKeys.accelerator(e);
      if (!acc) return;
      done();
      save({ keys: { [action]: acc } });
    };
    const done = () => { document.removeEventListener('keydown', onKey, true); b.classList.remove('recording'); };
    document.addEventListener('keydown', onKey, true);
    b.addEventListener('blur', () => { done(); render(); }, { once: true });
  }
  async function save(patch) {
    const r = await desktopApi.setShortcuts(patch);
    if (!r) return;
    cfg = r;
    render();
    if (r.error) setStatusEl($('keysStatus'), t(r.error), 'error');
  }
  $('keysGlobal').addEventListener('change', () => save({ global: $('keysGlobal').checked }));
  $('keysReset').addEventListener('click', () => save({ reset: true }));

  // Last.fm
  function renderLfm(s) {
    if (!s) return;
    $('lfmEnabled').checked = s.enabled;
    if (document.activeElement !== $('lfmKey')) $('lfmKey').value = s.key || '';
    $('lfmSecret').placeholder = s.hasSecret ? '••••••••' : t('el «shared secret» de tu cuenta de API');
    $('lfmLabel').textContent = s.connected ? t('Conectado como {u}', { u: s.user || '?' }) : s.waiting ? t('Acepta el permiso en la página de Last.fm que se ha abierto y vuelve aquí.') : t('Sin conectar');
    $('lfmConnect').classList.toggle('hidden', s.connected);
    $('lfmFinish').classList.toggle('hidden', !s.waiting || s.connected);
    $('lfmDisconnect').classList.toggle('hidden', !s.connected);
    setStatusEl($('lfmStatus'), s.error ? ts(s.error) : '', s.error ? 'error' : '');
  }
  const lfm = async (patch) => renderLfm(await desktopApi.setLastfm(patch));
  $('lfmEnabled').addEventListener('change', () => lfm({ enabled: $('lfmEnabled').checked }));
  $('lfmKey').addEventListener('change', () => lfm({ key: $('lfmKey').value.trim() }));
  $('lfmSecret').addEventListener('change', () => { lfm({ secret: $('lfmSecret').value.trim() }); $('lfmSecret').value = ''; });
  $('lfmConnect').addEventListener('click', () => lfm({ connect: true }));
  $('lfmFinish').addEventListener('click', () => lfm({ finish: true }));
  $('lfmDisconnect').addEventListener('click', () => lfm({ disconnect: true }));

  // Discord
  const renderDc = (d) => {
    if (!d) return;
    if (d.error) { setStatusEl($('dcStatus'), t(d.error), 'error'); return; }
    $('dcEnabled').checked = d.enabled;
    if (document.activeElement !== $('dcAppId')) $('dcAppId').value = d.appId || '';
    setStatusEl($('dcStatus'), d.enabled && !d.appId ? t('Falta el ID de la aplicación.') : '', d.enabled && !d.appId ? 'error' : '');
  };
  $('dcEnabled').addEventListener('change', async () => renderDc(await desktopApi.setDiscord({ enabled: $('dcEnabled').checked })));
  $('dcAppId').addEventListener('change', async () => renderDc(await desktopApi.setDiscord({ appId: $('dcAppId').value.trim() })));

  async function load() {
    cfg = await desktopApi.getShortcuts();
    render();
    renderLfm(await desktopApi.getLastfm());
    renderDc(await desktopApi.getDiscord());
  }
  // "Did it arrive?": the last shortcut Windows delivered, while this page is open.
  let lastTimer = null;
  async function showLast() {
    if (currentView !== 'set-system') { clearInterval(lastTimer); lastTimer = null; return; }
    const r = await desktopApi.getShortcuts();
    if (!r || !r.last) return;
    const secs = Math.max(0, Math.round((Date.now() - r.last.at) / 1000));
    $('keysLast').textContent = t('Último atajo recibido: «{a}», hace {s} s.', { a: t(NAMES[r.last.action] || r.last.action), s: secs });
    $('keysLast').classList.toggle('fresh', secs < 4);
  }
  document.addEventListener('tg:view', (e) => {
    if (e.detail !== 'set-system') return;
    load();
    clearInterval(lastTimer);
    lastTimer = setInterval(showLast, 1500);
  });
})();

// === Ajustes → Sistema: automatic backup (desktop) ===
const autoBackup = (() => {
  if (!desktopApi || !desktopApi.getAutoBackup) return { check() {} };
  function render(s) {
    if (!s) return;
    $('abEnabled').checked = s.enabled;
    $('abDays').value = String(s.days);
    $('abDirLabel').textContent = s.dir ? `${s.dir}${s.last ? ` · ${t('última copia {t}', { t: timeAgo(s.last) })}` : ''}` : t('Ninguna');
  }
  async function write() {
    const text = JSON.stringify(await backup.build(), null, 2);
    return desktopApi.writeAutoBackup(text);
  }
  async function check() {
    try {
      const s = await desktopApi.getAutoBackup();
      if (s && s.due) await write();
    } catch { /* next time */ }
  }
  const set = async (patch) => render(await desktopApi.setAutoBackup(patch));
  $('abEnabled').addEventListener('change', async () => {
    await set({ enabled: $('abEnabled').checked });
    const s = await desktopApi.getAutoBackup();
    if (s.enabled && !s.dir) setStatusEl($('backupStatus'), t('Elige la carpeta de las copias.'), 'error');
    else check();
  });
  $('abDays').addEventListener('change', () => set({ days: Number($('abDays').value) }));
  $('abChoose').addEventListener('click', () => set({ choose: true }));
  $('abNow').addEventListener('click', async () => {
    const s = await desktopApi.getAutoBackup();
    if (!s.enabled || !s.dir) { setStatusEl($('backupStatus'), t('Activa la copia automática y elige su carpeta.'), 'error'); return; }
    const r = await write();
    setStatusEl($('backupStatus'), r && r.ok ? t('Copia guardada: {f}', { f: r.file }) : t('No se pudo guardar la copia.'), r && r.ok ? 'success' : 'error');
    render(await desktopApi.getAutoBackup());
  });
  document.addEventListener('tg:view', async (e) => { if (e.detail === 'set-system') render(await desktopApi.getAutoBackup()); });
  // A minute after opening, then every 6 hours: written only when it's due.
  setTimeout(check, 60 * 1000);
  setInterval(check, 6 * 3600 * 1000);
  return { check };
})();

// === Ajustes → Sistema: game mode (desktop): the mini player over your games ===
(() => {
  if (!desktopApi || !desktopApi.getGameMode) return;
  let state = null;
  function render(s) {
    if (!s) return;
    if (s.error) { showToast(s.error); return; }
    state = s;
    $('gmEnabled').checked = s.enabled;
    $('gmOpacity').value = String(s.opacity);
    $('gmOpacity').title = `${Math.round(s.opacity * 100)} %`;
    $('gmCorner').value = s.corner;
    $('gmCompact').checked = s.compact;
    $('gmThrough').checked = s.through;
    $('gmStatus').textContent = s.running ? t('ahora: «{g}» está abierto, el mini reproductor está encima', { g: s.running }) : s.games.length ? t('se comprueba cada pocos segundos') : t('el programa del juego (.exe)');
    const ul = $('gmList');
    ul.innerHTML = '';
    for (const g of s.games) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = g;
      li.appendChild(name);
      li.appendChild(iconButton('remove', t('Quitar «{g}»', { g }), () => save({ games: state.games.filter((x) => x !== g) })));
      ul.appendChild(li);
    }
  }
  const save = async (patch) => render(await desktopApi.setGameMode(patch));
  function add(name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return;
    const exe = n.endsWith('.exe') ? n : `${n}.exe`;
    if (state && state.games.includes(exe)) return;
    save({ games: [...(state ? state.games : []), exe] });
  }
  $('gmEnabled').addEventListener('change', () => save({ enabled: $('gmEnabled').checked }));
  $('gmOpacity').addEventListener('change', () => save({ opacity: Number($('gmOpacity').value) }));
  $('gmCorner').addEventListener('change', () => save({ corner: $('gmCorner').value }));
  $('gmCompact').addEventListener('change', () => save({ compact: $('gmCompact').checked }));
  $('gmThrough').addEventListener('change', () => save({ through: $('gmThrough').checked }));
  $('gmAdd').addEventListener('submit', (e) => { e.preventDefault(); add($('gmName').value); $('gmName').value = ''; });
  $('gmPick').addEventListener('click', async () => {
    const box = $('gmApps');
    box.innerHTML = '';
    box.classList.remove('hidden');
    const wait = document.createElement('li');
    wait.className = 'gm-empty';
    wait.textContent = t('Mirando qué hay abierto…');
    box.appendChild(wait);
    const apps = await desktopApi.listApps();
    box.innerHTML = '';
    if (!apps.length) { wait.textContent = t('No se ha encontrado nada abierto. Abre el juego y vuelve a probar.'); box.appendChild(wait); return; }
    for (const a of apps) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gm-app';
      const strong = document.createElement('strong');
      strong.textContent = a.exe;
      const small = document.createElement('small');
      small.textContent = a.title;
      b.append(strong, small);
      b.addEventListener('click', () => { add(a.exe); box.classList.add('hidden'); });
      li.appendChild(b);
      box.appendChild(li);
    }
  });
  if (desktopApi.onGameMode) {
    desktopApi.onGameMode(({ running }) => {
      showToast(running ? t('Modo juego: «{g}» abierto, el mini reproductor va encima', { g: running }) : t('Modo juego: terminado, el mini reproductor vuelve a como estaba'));
      desktopApi.getGameMode().then(render);
    });
  }
  document.addEventListener('tg:view', (e) => { if (e.detail === 'set-system') desktopApi.getGameMode().then(render); });
  desktopApi.getGameMode().then(render);
})();
