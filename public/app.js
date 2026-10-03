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
}

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
  return { build };
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
const REMEMBERED_SELECTS = { audioFormat, audioBitrate, videoQuality, videoContainer, subLangs, subMode };
const REMEMBERED_SWITCHES = { metadata: optMetadata, playlist: optPlaylist, subtitles: optSubtitles, sponsorblock: optSponsorblock, music: optMusic, lyrics: optLyrics, both: optBoth, normalize: optNormalize, bpm: optBpm, nfo: optNfo };

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
}

[...Object.values(REMEMBERED_SELECTS), ...Object.values(REMEMBERED_SWITCHES)]
  .forEach((el) => el.addEventListener('change', saveLastOptions));

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
  'set-appearance': { group: 'settings', title: 'Apariencia', sub: 'Idioma, interfaz, colores y tamaño', tab: 'Apariencia' },
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
  if (view === 'dl-link') setMode(downloadMode);
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
    if (currentView !== 'dl-link' && currentView !== 'cv-format') return;
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
    music: optMusic.checked,
    lyrics: optLyrics.checked,
    normalize: optNormalize.checked,
    bpm: optBpm.checked,
    nfo: optNfo.checked,
    rateLimit: prefsApi.get().rateLimit,
  };
}

// === Download profiles and rules ===
// A profile fills in the download form; a rule picks a profile (and/or a
// folder) for one channel. Kept by the server (on disk in the desktop app).
const profilesUi = (() => {
  let data = { profiles: [], rules: [] };
  const sel = $('dlProfile');
  const SAVE = '__save';
  const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const SWITCHES = { metadata: optMetadata, subtitles: optSubtitles, sponsorblock: optSponsorblock, music: optMusic, lyrics: optLyrics, normalize: optNormalize, bpm: optBpm, nfo: optNfo };
  const SELECTS = { audioFormat, audioBitrate, quality: videoQuality, container: videoContainer, subLangs, subMode };

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
  const keep = await skipAlready(items.map((i) => i.url), known);
  if (!keep) return false;
  items = items.filter((i) => keep.includes(i.url));
  if (!items.length) { statusEl.textContent = t('Nada nuevo que descargar.'); return false; }
  const opts = downloadOptions();
  try {
    const payload = { items: items.map((i) => ({ url: i.url, title: i.title })) };
    let created = (await postJson('/api/jobs/download', { ...opts, ...payload })).created;
    if (optBoth.checked) created += (await postJson('/api/jobs/download', { ...downloadOptions(downloadMode === 'audio' ? 'video' : 'audio'), ...payload })).created;
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
  return { thumb, close, hideHover };
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
    all(on) { items.forEach((i) => { i.checked = on; }); render(); },
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
}
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
    texts.push({ text: '', pos: 'bottom', size: 'm', from: null, to: null });
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
          text: tx.text.trim(), pos: tx.pos, size: tx.size,
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
  return { load };
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
  if (prev && prev.order !== job.order) sortRows();
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
};

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
  if (job.status === 'queued' || job.status === 'paused') {
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
    return wa ? a.order - b.order : b.createdAt - a.createdAt;
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
  let current = '';              // the playlist shown ('' = everything)
  const libUrl = (f) => `/api/library/file?client=${CLIENT_ID}&id=${f.id}`;
  const coverUrl = (f) => `/api/library/cover?client=${CLIENT_ID}&id=${f.id}`;
  const relOf = (f) => (f.folder ? `${f.folder}/${f.name}` : f.name);

  function visible() {
    const q = $('libSearch').value.trim().toLowerCase();
    const match = (f) => !q || `${f.folder} ${f.name}`.toLowerCase().includes(q);
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
    for (const p of playlists) add(p.id, `♫ ${p.name} (${p.items.filter(Boolean).length})`);
    add(NEW_LIST, t('+ Lista nueva…'));
    if (!playlists.some((p) => p.id === current)) current = '';
    sel.value = current;
    const pl = playlists.find((p) => p.id === current);
    $('libPlBar').classList.toggle('hidden', !pl);
    if (pl) $('libPlName').textContent = pl.name;
    $('libFilter').classList.toggle('hidden', Boolean(pl));
    $('libSort').classList.toggle('hidden', Boolean(pl));
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

  function render() {
    const list = $('libList');
    const shown = visible();
    list.innerHTML = '';
    $('libEmpty').classList.toggle('hidden', shown.length > 0 || !loaded);
    $('libEmptyText').textContent = current ? t('Esta lista está vacía: añade canciones con el botón ＋ de cada una.')
      : files.length ? t('Nada coincide con la búsqueda.') : t('Aún no hay nada en tu carpeta de descargas.');
    list.parentElement.classList.toggle('hidden', !shown.length);
    $('libCount').textContent = !loaded ? t('Cargando…')
      : shown.length > MAX_ROWS ? t('{n} archivos · se muestran {m}; busca para encontrar el resto', { n: shown.length, m: MAX_ROWS })
        : t('{n} archivos', { n: shown.length });
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
      main.querySelector('.lib-sub').textContent = [f.folder, formatBytes(f.size), formatDate(f.mtime), f.plays ? (f.plays === 1 ? t('1 vez') : t('{n} veces', { n: f.plays })) : '', f.lrc ? t('con letra') : ''].filter(Boolean).join(' · ');
      main.title = relOf(f);
      main.addEventListener('click', () => player.play(shown, shown.indexOf(f)));
      const actions = document.createElement('div');
      actions.className = 'queue-actions';
      if (current) {
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

  $('libSearch').addEventListener('input', render);
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
  return {
    render,
    url: libUrl,
    cover: coverUrl,
    files: () => files,
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
  const cur = () => list[index] || null;

  // ---- equalizer (Web Audio), saved per viewer ----
  const BANDS = [60, 230, 910, 3600, 14000];
  const PRESETS = { flat: [0, 0, 0, 0, 0], bass: [6, 4, 0, -1, -1], vocal: [-2, -1, 3, 4, 1], rock: [4, 2, -1, 2, 4], pop: [-1, 2, 4, 2, -1], classical: [3, 1, -1, 1, 3] };
  const EQ_KEY = 'tubegrab_eq';
  let eq = { preset: 'flat', gains: [0, 0, 0, 0, 0], crossfade: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(EQ_KEY));
    if (raw && (raw.preset in PRESETS || raw.preset === 'custom')) eq.preset = raw.preset;
    if (raw && Array.isArray(raw.gains) && raw.gains.length === 5 && raw.gains.every((g) => Number.isFinite(g) && g >= -12 && g <= 12)) eq.gains = raw.gains;
    if (raw && [0, 2, 4, 6, 10].includes(raw.crossfade)) eq.crossfade = raw.crossfade;
  } catch { /* defaults */ }
  const saveEq = () => { try { localStorage.setItem(EQ_KEY, JSON.stringify(eq)); } catch { /* ignore */ } };
  let actx = null;
  let filters = [];
  const gains = new Map();
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
      filters.reduce((a, b) => { a.connect(b); return b; }).connect(actx.destination);
      for (const m of [A, B]) {
        const g = actx.createGain();
        actx.createMediaElementSource(m).connect(g).connect(filters[0]);
        gains.set(m, g);
      }
    } catch { actx = null; }
  }
  function applyEq() {
    filters.forEach((f, i) => { f.gain.value = eq.gains[i]; });
    $('eqBands').querySelectorAll('input').forEach((el, i) => { el.value = String(eq.gains[i]); });
    $('eqPreset').value = eq.preset;
    $('eqCrossfade').value = String(eq.crossfade);
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
    if (PRESETS[eq.preset]) eq.gains = PRESETS[eq.preset].slice();
    applyEq();
  });
  $('eqCrossfade').addEventListener('change', () => { eq.crossfade = Number($('eqCrossfade').value); applyEq(); });
  applyEq();

  // ---- what's playing ----
  function show(f) {
    $('player').classList.remove('hidden');
    document.body.classList.add('has-player');
    $('plTitle').textContent = f.name.replace(/\.[^.]+$/, '');
    $('plSub').textContent = f.folder || '';
    const icon = $('plIcon');
    icon.innerHTML = ICONS[f.kind === 'video' ? 'video' : 'music'];
    if (f.kind !== 'video') {
      // The song's own cover, when it has one.
      const img = new Image();
      img.alt = '';
      img.className = 'player-cover';
      img.onload = () => { if (cur() === f) { icon.innerHTML = ''; icon.appendChild(img); } };
      img.src = library.cover(f);
    }
    const isVideo = f.kind === 'video';
    $('plExpand').classList.toggle('hidden', !isVideo);
    $('plFull').classList.toggle('hidden', !isVideo);
    $('playerVideoWrap').classList.toggle('hidden', !isVideo);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: $('plTitle').textContent, artist: f.folder || 'TubeGrab', ...(isVideo ? {} : { artwork: [{ src: library.cover(f), sizes: '400x400', type: 'image/jpeg' }] }),
      });
    }
    countedFor = null;
    lyrics.load(f);
    library.render();
    pushState();
  }
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
    deck.src = library.url(f);
    deck.play().catch(() => {});
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
    for (const m of [A, B]) { m.pause(); m.removeAttribute('src'); m.load(); }
    list = [];
    index = -1;
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
    if (!eq.crossfade || fading || repeat || !actx || cast.active() || !f || f.kind === 'video') return;
    const left = deck.duration - deck.currentTime;
    if (!Number.isFinite(left) || left > eq.crossfade || left <= 0.3) return;
    const n = index < list.length - 1 || shuffle ? nextIndex(1) : -1;
    const next = list[n];
    if (!next || next.kind === 'video') return;
    const from = deck;
    const to = deck === A ? B : A;
    const now = actx.currentTime;
    const gFrom = gains.get(from);
    const gTo = gains.get(to);
    to.src = library.url(next);
    to.volume = from.volume;
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
    m.addEventListener('play', () => { if (m === deck) { $('plPlay').classList.add('playing'); pushState(); } });
    m.addEventListener('pause', () => { if (m === deck && !fading) { $('plPlay').classList.remove('playing'); pushState(); } });
    m.addEventListener('loadedmetadata', () => {
      if (m !== deck) return;
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
    });
    m.addEventListener('ended', () => {
      if (m !== deck || fading) return;
      if (repeat) { m.currentTime = 0; m.play().catch(() => {}); return; }
      if (index < list.length - 1 || shuffle) step(1);
    });
    m.addEventListener('error', () => { if (m === deck && cur() && m.getAttribute('src')) showToast(t('No se puede reproducir este archivo aquí.')); });
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
  $('plExpand').addEventListener('click', () => $('playerVideoWrap').classList.toggle('hidden'));
  $('plFull').addEventListener('click', () => { if (A.requestFullscreen) A.requestFullscreen().catch(() => {}); });
  const panel = (id, btn) => {
    const open = $(id).classList.contains('hidden');
    ['plLyrics', 'plEq'].forEach((p) => $(p).classList.add('hidden'));
    $('plLyricsBtn').setAttribute('aria-pressed', 'false');
    $('plEqBtn').setAttribute('aria-pressed', 'false');
    $(id).classList.toggle('hidden', !open);
    $(btn).setAttribute('aria-pressed', String(open));
    if (open && id === 'plLyrics') lyrics.at(deck.currentTime, true);
  };
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
  const lyrics = (() => {
    let lines = [];
    let at = -1;
    let forId = null;
    async function load(f) {
      lines = [];
      at = -1;
      forId = f.id;
      const box = $('plLyricsLines');
      box.innerHTML = '';
      $('plLyricsEmpty').classList.add('hidden');
      if (f.kind === 'video') { $('plLyricsEmpty').classList.remove('hidden'); return; }
      let res = null;
      try { res = await api(`/api/library/lyrics?id=${f.id}`); } catch { /* none */ }
      if (forId !== f.id) return;
      if (res && res.synced && res.synced.length) {
        lines = res.synced;
        lines.forEach((l, i) => {
          const li = document.createElement('li');
          li.textContent = l.text || '♪';
          li.dataset.i = String(i);
          li.addEventListener('click', () => { if (cast.active()) cast.seek(l.t); else deck.currentTime = l.t; });
          box.appendChild(li);
        });
      } else if (res && res.plain) {
        for (const text of res.plain.split('\n')) {
          const li = document.createElement('li');
          li.className = 'plain';
          li.textContent = text || ' ';
          box.appendChild(li);
        }
      } else {
        $('plLyricsEmpty').classList.remove('hidden');
      }
    }
    function lineAt(sec) {
      let lo = 0; let hi = lines.length - 1; let found = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].t <= sec + 0.15) { found = mid; lo = mid + 1; } else hi = mid - 1; }
      return found;
    }
    return {
      load,
      at(sec, force = false) {
        if (!lines.length) return;
        const i = lineAt(sec);
        if (i === at && !force) return;
        at = i;
        const box = $('plLyricsLines');
        box.querySelectorAll('.on').forEach((el) => el.classList.remove('on'));
        const el = i >= 0 ? box.children[i] : null;
        if (el) {
          el.classList.add('on');
          if (!$('plLyrics').classList.contains('hidden')) el.scrollIntoView({ block: 'center', behavior: prefsApi.get().reduceMotion ? 'auto' : 'smooth' });
        }
      },
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

  // ---- mini player window (desktop) ----
  let pushTimer = null;
  function pushState() {
    if (!desktopApi || !desktopApi.playerState) return;
    const f = cur();
    desktopApi.playerState({
      title: f ? f.name.replace(/\.[^.]+$/, '') : '', sub: f ? f.folder || '' : '',
      playing: f ? !deck.paused : false, time: deck.currentTime || 0, duration: Number.isFinite(deck.duration) ? deck.duration : 0,
      cover: f && f.kind !== 'video' ? library.cover(f) : null,
    });
  }
  function pushStateSoon() { if (!pushTimer) pushTimer = setTimeout(() => { pushTimer = null; pushState(); }, 700); }
  if (desktopApi && desktopApi.openMini) {
    $('plMiniBtn').addEventListener('click', () => { desktopApi.openMini(); setTimeout(pushState, 800); });
    desktopApi.onPlayerCommand(({ cmd, value }) => {
      if (cmd === 'toggle') toggle();
      else if (cmd === 'next') step(1);
      else if (cmd === 'prev') step(-1);
      else if (cmd === 'seek' && Number.isFinite(value) && !cast.active()) deck.currentTime = value;
      pushState();
    });
  } else {
    $('plMiniBtn').classList.add('hidden');
    $('plCastBtn').classList.add('hidden');
  }
  return { play, current: cur };
})();

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

restoreLastOptions();
profilesUi.load();
setView(lastView());
tour.firstRun();
renderHistory();
connectEvents();
loadConfig();
