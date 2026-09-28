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
const optChapters = $('optChapters');
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
const REMEMBERED_SWITCHES = { metadata: optMetadata, playlist: optPlaylist, subtitles: optSubtitles, sponsorblock: optSponsorblock, music: optMusic };

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
  'cv-merge': { group: 'convert', title: 'Unir archivos', sub: 'Varios audios o vídeos en uno solo', tab: 'Unir' },
  'cv-compress': { group: 'convert', title: 'Comprimir', sub: 'Que pese lo que tú digas', tab: 'Comprimir' },
  'cv-image': { group: 'convert', title: 'Imagen', sub: 'Un fotograma o la carátula como imagen', tab: 'Imagen' },
  queue: { group: null, title: 'Cola', sub: 'Descargas y conversiones en curso' },
  history: { group: null, title: 'Historial', sub: 'Lo que has terminado en este equipo' },
  'set-appearance': { group: 'settings', title: 'Apariencia', sub: 'Idioma, interfaz, colores y tamaño', tab: 'Apariencia' },
  'set-downloads': { group: 'settings', title: 'Descargas', sub: 'Carpeta, velocidad y cookies', tab: 'Descargas' },
  'set-convert': { group: 'settings', title: 'Conversión', sub: 'Tarjeta gráfica y conversiones a la vez', tab: 'Conversión' },
  'set-system': { group: 'settings', title: 'Sistema', sub: 'Avisos, bandeja y portapapeles', tab: 'Sistema' },
  'set-about': { group: 'settings', title: 'Acerca de', sub: 'Versión y actualizaciones', tab: 'Acerca de' },
};
const DOWNLOAD_VIEWS = new Set(['dl-link', 'dl-search', 'dl-subs']);
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
  document.dispatchEvent(new CustomEvent('tg:view', { detail: view }));
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
  $('inputGroup').classList.toggle('hidden', isConvert);
  $('uploadGroup').classList.toggle('hidden', !isConvert);
  if (isConvert) hidePreview(); else updateUrlState();
  $('audioOptions').classList.toggle('hidden', currentMode !== 'audio');
  $('videoOptions').classList.toggle('hidden', currentMode !== 'video');
  $('downloadExtras').classList.toggle('hidden', isConvert);
  $('dlMoreOptions').classList.toggle('hidden', isConvert);
  $('optMusicWrap').classList.toggle('hidden', currentMode !== 'audio');
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
function describeDownloadFormat(short = false) {
  if (downloadMode === 'audio') {
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
function downloadOptions() {
  return {
    mode: downloadMode,
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
    rateLimit: prefsApi.get().rateLimit,
  };
}

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
    const chapters = data.chapters > 1 ? t('{n} capítulos', { n: data.chapters }) : '';
    $('previewMeta').textContent = [data.site, data.uploader, formatDuration(data.duration), chapters].filter(Boolean).join(' · ');
    previewCard.classList.remove('hidden');
    previewDuration = data.duration || null;
    dlRange.setDuration(previewDuration);
    syncDlRange();
  } catch {
    if (requestId === previewRequestId) hidePreview();
  }
}

function hidePreview() {
  previewRequestId += 1;
  previewCard.classList.add('hidden');
  $('playlistCard').classList.add('hidden');
  previewDuration = null;
  dlRange.setDuration(null);
  $('dlRangeRow').classList.add('hidden');
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

/** Queues picked search/playlist results with the current options. */
async function queueItems(items, statusEl) {
  const opts = downloadOptions();
  try {
    const data = await postJson('/api/jobs/download', { ...opts, items: items.map((i) => ({ url: i.url, title: i.title })) });
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
function createPickList(ul, onChange, { quick } = {}) {
  let items = [];
  const render = () => {
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
      const img = document.createElement('img');
      img.className = 'pick-thumb';
      img.alt = '';
      img.loading = 'lazy';
      if (item.thumbnail) img.src = item.thumbnail; else img.style.visibility = 'hidden';
      const text = document.createElement('span');
      text.className = 'pick-text';
      const title = document.createElement('span');
      title.className = 'pick-title';
      title.textContent = item.title || item.url;
      const meta = document.createElement('span');
      meta.className = 'pick-meta';
      meta.textContent = [item.channel, formatDuration(item.duration)].filter(Boolean).join(' · ');
      text.append(title, meta);
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
function refreshDlHint() {
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
    const sub = await postJson('/api/subscriptions', { url, options: downloadOptions(), interval: Number($('subInterval').value), backfill: Number($('subBackfill').value) });
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
const SHORTCUT_VIEWS = { 1: 'dl-link', 2: 'cv-format', 3: 'queue', 4: 'history', ',': 'set-appearance' };
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
  setBusy(true, optPlaylist.checked ? t('Leyendo playlist…') : t('Añadiendo…'));
  try {
    const data = await postJson('/api/jobs/download', {
      ...downloadOptions(),
      urls,
      playlist: optPlaylist.checked,
      chapters: optChapters.checked,
      sectionStart: dlStart.value.trim(),
      sectionEnd: dlEnd.value.trim(),
    });
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

  const RULER = 22;
  const VTRACK = 52;
  const ATRACK = 40;
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
  const keptLength = () => kept().reduce((acc, g) => acc + (g.e - g.s), 0);
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
    segs.splice(i, 1, { s: g.s, e: sec, off: g.off }, { s: sec, e: g.e, off: g.off });
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
    segs = [{ s: 0, e: duration, off: false }];
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
    if (!video.paused) raf = requestAnimationFrame(tick);
  }
  video.addEventListener('play', () => { $('edPlay').classList.add('playing'); if (!raf) raf = requestAnimationFrame(tick); });
  video.addEventListener('pause', () => { $('edPlay').classList.remove('playing'); draw(); updateTime(); });
  video.addEventListener('seeked', () => { draw(); updateTime(); });

  function updateTime() {
    $('edTime').textContent = tc(now());
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
    ctx.font = '10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    // Ruler
    const step = niceStep(70 / p);
    ctx.fillStyle = colors.text2;
    ctx.strokeStyle = colors.hair;
    ctx.beginPath();
    for (let s = Math.floor(t0 / step) * step; s <= t1; s += step) {
      const x = Math.round(s * p - timeline.scrollLeft) + 0.5;
      ctx.moveTo(x, RULER - 8); ctx.lineTo(x, RULER);
      const label = step < 1 ? tc(s).replace(/^0:/, '') : formatDuration(Math.round(s)) || '0:00';
      ctx.fillText(label, x + 3, 8);
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
    $('editDropText').textContent = file ? `${file.name} (${formatBytes(file.size)})` : t('Arrastra un vídeo o un audio para editarlo');
    $('editor').classList.add('hidden');
    setStatusEl($('editStatus'), '', '');
    if (!file) return;
    url = URL.createObjectURL(file);
    video.src = url;
    thumbVideo.src = url;
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
    segs = [{ s: 0, e: duration, off: false }];
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
    requestAnimationFrame(updatePreview);
  });
  video.addEventListener('error', () => {
    if (!file) return;
    $('editor').classList.add('hidden');
    setStatusEl($('editStatus'), t('Este formato no se puede previsualizar aquí. Conviértelo antes a MP4 en Convertir → Formato.'), 'error');
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

  // ---- clip list ----
  function renderClips() {
    const list = $('edClips');
    list.innerHTML = '';
    list.classList.toggle('hidden', segs.length < 2);
    if (segs.length < 2) return;
    segs.forEach((g, i) => {
      const li = document.createElement('li');
      li.className = `ed-clip${g.off ? ' off' : ''}${i === sel ? ' selected' : ''}`;
      li.innerHTML = `<button type="button" class="ed-clip-main"><span class="ed-clip-n">${i + 1}</span>`
        + `<span class="ed-clip-t">${escapeHtml(tc(g.s))} → ${escapeHtml(tc(g.e))}</span>`
        + `<span class="ed-clip-d">${escapeHtml(formatTime(g.e - g.s, true))}</span></button>`
        + `<button type="button" class="link-btn ed-clip-toggle">${escapeHtml(g.off ? t('Recuperar') : t('Quitar'))}</button>`;
      li.querySelector('.ed-clip-main').addEventListener('click', () => { sel = i; seek(g.s); changed(); });
      li.querySelector('.ed-clip-toggle').addEventListener('click', () => { sel = i; toggleSel(); });
      list.appendChild(li);
    });
  }

  // ---- live preview of the shape, rotation and volume ----
  function updatePreview() {
    const frame = $('edCrop');
    const aspect = $('edAspect').value;
    const rotate = $('edRotate').value;
    const vol = $('edVolume').value;
    video.muted = vol === 'mute';
    video.volume = vol && vol !== 'mute' ? Math.min(1, Number(vol)) : 1;
    if (!hasVideo || !video.videoWidth) { frame.classList.add('hidden'); video.style.transform = ''; return; }
    const box = video.getBoundingClientRect();
    const fit = Math.min(box.width / video.videoWidth, box.height / video.videoHeight);
    let cw = video.videoWidth * fit;
    let ch = video.videoHeight * fit;
    const quarter = rotate === '90' || rotate === '270';
    let k = 1;
    if (quarter) { k = Math.min(box.width / ch, box.height / cw); [cw, ch] = [ch * k, cw * k]; }
    const transforms = { 90: `rotate(90deg) scale(${k})`, 270: `rotate(-90deg) scale(${k})`, 180: 'rotate(180deg)', hflip: 'scaleX(-1)' };
    video.style.transform = transforms[rotate] || '';
    if (!aspect) { frame.classList.add('hidden'); return; }
    const [rw, rh] = aspect.split(':').map(Number);
    const r = rw / rh;
    const w = cw / ch > r ? ch * r : cw;
    const h = cw / ch > r ? ch : cw / r;
    // Centred in the viewer (the video element is centred and not moved by the transform).
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.left = `${video.offsetLeft + (video.offsetWidth - w) / 2}px`;
    frame.style.top = `${video.offsetTop + (video.offsetHeight - h) / 2}px`;
    $('edCropLabel').textContent = aspect;
    frame.classList.remove('hidden');
  }
  new ResizeObserver(() => updatePreview()).observe($('edViewer'));
  ['edAspect', 'edRotate', 'edVolume', 'edFade', 'edSeparate'].forEach((id) => $(id).addEventListener('change', () => { updatePreview(); refreshExportUI(); }));

  // ---- buttons ----
  $('edPrevCut').addEventListener('click', () => jumpCut(-1));
  $('edNextCut').addEventListener('click', () => jumpCut(1));
  $('edSilence').addEventListener('click', removeSilences);
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
  const hasEffects = () => Boolean($('edAspect').value || $('edFade').value || $('edVolume').value || $('edRotate').value);
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
    $('edQualityRow').classList.toggle('hidden', mode === 'fast' || audioOnly);
    $('edModeHint').textContent = mode === 'fast'
      ? t('Rápidos: sin volver a codificar, al instante y sin perder calidad, pero cada tramo empieza en el fotograma clave anterior (puede adelantarse un poco).')
      : t('Exactos: corta en el fotograma justo (vuelve a codificar el vídeo).');
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
    video.pause();
    const btn = $('btnEdit');
    btn.disabled = true;
    try {
      await uploadTo('/api/jobs/edit', 'file', [file], {
        segments: JSON.stringify(k.map((g) => [Number(g.s.toFixed(3)), Number(g.e.toFixed(3))])),
        targetFormat: $('edFormat').value, mode, quality: $('edQuality').value,
        aspect: $('edAspect').value, fade: $('edFade').value, volume: $('edVolume').value, rotate: $('edRotate').value,
        separate: String($('edSeparate').checked),
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
    if (prefsApi.get().sound) playDoneSound();
  }
  if (live && prev && ACTIVE.has(prev.status) && job.status === 'error') notify(job);
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
    desktopApi.saveJob(job.id, CLIENT_ID, count, job.title);
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
    } else if (error) {
      showStatus(ts(error), 'error');
    }
    const job = jobs.get(jobId);
    if (job) renderRow(job);
    renderHistory();
  });
}

function notify(job) {
  if (!isElectronApp || !prefsApi.get().notify || document.hasFocus() || typeof Notification === 'undefined') return;
  const title = job.status === 'done' ? (job.type === 'convert' ? t('Conversión terminada') : t('Descarga terminada')) : t('Algo falló');
  try { new Notification(title, { body: job.status === 'done' ? (job.fileName || job.title) : `${job.title}: ${ts(job.error)}`, silent: false }); } catch { /* ignore */ }
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
    add('top', t('Que sea lo siguiente'), () => jobAction(job, 'move', { where: 'top' }), 'queue-only-btn');
    add('up', t('Subir en la cola'), () => jobAction(job, 'move', { where: 'up' }), 'queue-only-btn');
    add('down', t('Bajar en la cola'), () => jobAction(job, 'move', { where: 'down' }), 'queue-only-btn');
  }
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
$('btnResumeAll').addEventListener('click', () => postJson('/api/jobs/pause-all', { resume: true }).catch((e) => showToast(e.message)));

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
    history.unshift({
      id: job.id,
      name: (job.files || []).length === 1 ? job.fileName : job.title,
      badge: job.detail || '',
      date: Date.now(),
      type: job.type,
      files: (job.files || []).length,
      source: job.source || null,
      request: job.request || null,
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

// === Init ===
renderConvertFormats();
refreshConvertUI();
setMergeKind('audio');
renderMerge();
refreshCompressButton();
refreshImageUI();
renderPrefs();
restoreLastOptions();
setView('dl-link');
renderHistory();
connectEvents();
loadConfig();
