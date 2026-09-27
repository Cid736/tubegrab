// === DOM ===
const $ = (id) => document.getElementById(id);
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
const optSubtitlesWrap = $('optSubtitlesWrap');
const optSponsorblock = $('optSponsorblock');
const btnDownload = $('btnDownload');
const btnText = $('btnText');
const btnLoadingText = $('btnLoadingText');
const statusMessage = $('statusMessage');
const formatToggle = $('formatToggle');
const audioOptions = $('audioOptions');
const videoOptions = $('videoOptions');
const downloadExtras = $('downloadExtras');
const convertOptions = $('convertOptions');
const convertFormat = $('convertFormat');
const convertPreset = $('convertPreset');
const inputGroup = $('inputGroup');
const uploadGroup = $('uploadGroup');
const fileDrop = $('fileDrop');
const fileInput = $('fileInput');
const fileDropText = $('fileDropText');
const fileList = $('fileList');
const previewCard = $('previewCard');
const previewThumb = $('previewThumb');
const previewTitle = $('previewTitle');
const previewMeta = $('previewMeta');
const convertKindToggle = $('convertKindToggle');
const audioConvertSettings = $('audioConvertSettings');
const videoConvertSettings = $('videoConvertSettings');
const convertBitrate = $('convertBitrate');
const convertSampleRate = $('convertSampleRate');
const convertChannels = $('convertChannels');
const convertNormalize = $('convertNormalize');
const convertResolution = $('convertResolution');
const convertQuality = $('convertQuality');
const convertQualitySetting = $('convertQualitySetting');
const convertFps = $('convertFps');
const convertRotate = $('convertRotate');
const convertRemoveAudio = $('convertRemoveAudio');
const convertRemoveAudioOption = $('convertRemoveAudioOption');
const convertSpeed = $('convertSpeed');
const convertTrimStart = $('convertTrimStart');
const convertTrimEnd = $('convertTrimEnd');
const convertHint = $('convertHint');
const queueList = $('queueList');
const queueEmpty = $('queueEmpty');
const queueCount = $('queueCount');
const btnClearFinished = $('btnClearFinished');
const historySection = $('historySection');
const historyList = $('historyList');
const btnClearHistory = $('btnClearHistory');
const btnDesktopDownload = $('btnDesktopDownload');

let currentMode = 'audio'; // 'audio' | 'video' | 'convert'
let currentConvertKind = 'audio';
let selectedFiles = [];
let busy = false;

// === Formats & presets ===
// `ext` is the downloaded file's extension (ALAC and HEVC reuse m4a/mp4).
const CONVERT_FORMAT_OPTIONS = {
  audio: [
    { value: 'mp3', ext: 'mp3', short: 'MP3', label: 'MP3 — el más compatible' },
    { value: 'm4a', ext: 'm4a', short: 'M4A', label: 'M4A (AAC) — iPhone, iTunes' },
    { value: 'aac', ext: 'aac', short: 'AAC', label: 'AAC — archivo AAC puro' },
    { value: 'ogg', ext: 'ogg', short: 'OGG', label: 'OGG (Vorbis)' },
    { value: 'opus', ext: 'opus', short: 'OPUS', label: 'OPUS — mejor calidad por kbps' },
    { value: 'wma', ext: 'wma', short: 'WMA', label: 'WMA — Windows Media' },
    { value: 'ac3', ext: 'ac3', short: 'AC3', label: 'AC3 — Dolby Digital' },
    { value: 'flac', ext: 'flac', short: 'FLAC', label: 'FLAC — sin pérdida', lossless: true },
    { value: 'alac', ext: 'm4a', short: 'ALAC', label: 'ALAC — sin pérdida de Apple', lossless: true },
    { value: 'wav', ext: 'wav', short: 'WAV', label: 'WAV — sin comprimir', lossless: true },
    { value: 'aiff', ext: 'aiff', short: 'AIFF', label: 'AIFF — sin comprimir (Mac)', lossless: true },
  ],
  video: [
    { value: 'mp4', ext: 'mp4', short: 'MP4', label: 'MP4 (H.264) — el más compatible' },
    { value: 'hevc', ext: 'mp4', short: 'MP4 H.265', label: 'MP4 (H.265/HEVC) — menos peso, más lento' },
    { value: 'webm', ext: 'webm', short: 'WEBM', label: 'WEBM (VP9) — para web' },
    { value: 'mkv', ext: 'mkv', short: 'MKV', label: 'MKV' },
    { value: 'mov', ext: 'mov', short: 'MOV', label: 'MOV — QuickTime / Apple' },
    { value: 'avi', ext: 'avi', short: 'AVI', label: 'AVI' },
    { value: 'wmv', ext: 'wmv', short: 'WMV', label: 'WMV — Windows Media' },
    { value: 'flv', ext: 'flv', short: 'FLV', label: 'FLV — Flash Video' },
    { value: 'mpg', ext: 'mpg', short: 'MPG', label: 'MPG (MPEG-2) — DVD, reproductores antiguos' },
    { value: '3gp', ext: '3gp', short: '3GP', label: '3GP — móviles antiguos' },
    { value: 'ogv', ext: 'ogv', short: 'OGV', label: 'OGV (Theora)' },
    { value: 'gif', ext: 'gif', short: 'GIF', label: 'GIF animado — sin sonido', gif: true },
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
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

// === Environment ===
const isElectronApp = navigator.userAgent.toLowerCase().includes('electron');
const desktopApi = window.desktop || null;
const desktopBanner = $('desktopBanner');
if (isElectronApp) {
  desktopBanner.remove();
  document.body.classList.add('is-desktop-app');
} else {
  btnDesktopDownload.href = 'https://github.com/Cid736/tubegrab/releases/latest/download/TubeGrab.exe';
}

// === App updater (desktop app only) ===
// `desktopApi`, not `desktop`: a top-level const can't shadow the global the
// preload exposes through contextBridge (it throws and stops the whole script).
if (window.updater) {
  const updateBanner = $('updateBanner');
  const updateBannerSubtitle = $('updateBannerSubtitle');
  const btnUpdate = $('btnUpdate');
  const updateProgress = $('updateProgress');
  const updateProgressFill = $('updateProgressFill');
  const updateProgressLabel = $('updateProgressLabel');
  const versionChip = $('versionChip');
  const STATUS_LABELS = {
    checking: 'Buscando actualizaciones…',
    'up-to-date': 'Última versión',
    error: 'No se pudo comprobar',
    dev: 'Modo desarrollo',
  };

  const renderUpdateState = (state) => {
    if (!state) return;
    const label = state.status === 'available' ? `Nueva: v${state.latest}` : STATUS_LABELS[state.status];
    versionChip.textContent = label ? `v${state.current} · ${label}` : `v${state.current}`;
    versionChip.dataset.status = state.status;
    versionChip.title = state.status === 'error' ? `${state.error} — pulsa para reintentar` : 'Pulsa para buscar actualizaciones';
    versionChip.classList.remove('hidden');
    if (state.status === 'available') {
      updateBannerSubtitle.textContent = `Versión ${state.latest} lista para descargar (tienes la ${state.current}).`;
      updateBanner.classList.remove('hidden');
    }
  };

  window.updater.onState(renderUpdateState);
  window.updater.getState().then(renderUpdateState);
  versionChip.addEventListener('click', () => window.updater.check());
  window.updater.onProgress(({ percent }) => {
    updateProgressFill.style.width = `${percent}%`;
    updateProgressLabel.textContent = `${percent}%`;
  });
  window.updater.onDownloaded(() => {
    updateProgress.classList.add('hidden');
    btnUpdate.disabled = false;
    btnUpdate.textContent = 'Reiniciar y actualizar';
    btnUpdate.dataset.stage = 'downloaded';
  });
  window.updater.onError((message) => {
    updateBannerSubtitle.textContent = `No se pudo actualizar: ${message}`;
    btnUpdate.disabled = false;
    btnUpdate.textContent = 'Reintentar';
    btnUpdate.dataset.stage = 'available';
    updateProgress.classList.add('hidden');
  });
  btnUpdate.addEventListener('click', () => {
    if (btnUpdate.dataset.stage === 'downloaded') { window.updater.quitAndInstall(); return; }
    btnUpdate.disabled = true;
    btnUpdate.textContent = 'Descargando...';
    updateProgress.classList.remove('hidden');
    window.updater.downloadUpdate();
  });
}

// === Desktop settings (download folder, engine) ===
if (desktopApi) {
  $('navSettings').classList.remove('hidden');

  // Window buttons (the native caption bar is hidden): Windows caption
  // buttons or macOS traffic lights, depending on the interface in use.
  $('trafficLights').classList.remove('hidden');
  for (const [id, action] of [['winClose', 'close'], ['winMin', 'minimize'], ['winMax', 'maximize'],
    ['capClose', 'close'], ['capMin', 'minimize'], ['capMax', 'maximize']]) {
    $(id).addEventListener('click', () => desktopApi.windowControl(action));
  }
  desktopApi.onWindowState(({ maximized }) => {
    document.body.classList.toggle('window-maximized', maximized);
    $('capMax').title = maximized ? 'Restaurar' : 'Maximizar';
    $('capMax').setAttribute('aria-label', $('capMax').title);
  });
  window.addEventListener('blur', () => document.body.classList.add('window-blurred'));
  window.addEventListener('focus', () => document.body.classList.remove('window-blurred'));

  const dirLabel = $('downloadDirLabel');
  const engineLabel = $('engineLabel');
  const btnUpdateEngine = $('btnUpdateEngine');
  const showDir = (s) => { if (s) { dirLabel.textContent = s.downloadDir; dirLabel.title = s.downloadDir; } };
  const showEngine = (s) => {
    if (!s) return;
    engineLabel.textContent = s.updating ? 'Comprobando actualizaciones…' : (s.error || (s.version ? `Versión ${s.version}` : '—'));
    btnUpdateEngine.disabled = Boolean(s.updating);
  };
  desktopApi.getSettings().then(showDir);
  desktopApi.getEngine().then(showEngine);
  desktopApi.onEngine(showEngine);
  $('btnChooseFolder').addEventListener('click', async () => showDir(await desktopApi.chooseFolder()));
  $('btnOpenFolder').addEventListener('click', () => desktopApi.openFolder());
  btnUpdateEngine.addEventListener('click', () => desktopApi.updateEngine());
}

// === Personalisation (Settings → Apariencia / Comportamiento) ===
// window.tgPrefs comes from theme-init.js, which already applied the saved
// appearance before first paint and validates every value it stores.
const prefsApi = window.tgPrefs;
const PICKERS = { uiDefault: 'uiDefaultPicker', theme: 'themePicker', accent: 'accentPicker', wall: 'wallPicker', glass: 'glassPicker', size: 'sizePicker' };
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
  fav.title = isFav ? `${UI_NAMES[ui]} es tu interfaz predeterminada` : `Usar ${UI_NAMES[ui]} como interfaz predeterminada`;
  fav.setAttribute('aria-label', fav.title);
  $('prefRemember').checked = p.remember;
  $('prefNotify').checked = p.notify;
  $('prefSound').checked = p.sound;
}

for (const [key, id] of Object.entries(PICKERS)) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('[data-value]');
    if (!b) return;
    prefsApi.set({ [key]: b.dataset.value });
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
$('btnResetPrefs').addEventListener('click', () => { prefsApi.resetAppearance(); renderPrefs(); });

// Soft two-note chime, synthesised (no audio file to ship or fetch).
let audioCtx = null;
function playDoneSound() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const t = audioCtx.currentTime;
    [[1046.5, 0], [1568, 0.1]].forEach(([freq, delay]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, t + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.6);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.65);
    });
  } catch { /* audio unavailable */ }
}

// Remember the last download options (restored on next launch).
const REMEMBERED_SELECTS = { audioFormat, audioBitrate, videoQuality, videoContainer };
const REMEMBERED_SWITCHES = { metadata: optMetadata, playlist: optPlaylist, subtitles: optSubtitles, sponsorblock: optSponsorblock };

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

// === Views (sidebar) & modes ===
// Views: download | convert | recents | settings. Within "download", the
// toolbar's segmented control picks the mode (audio | video).
let currentView = 'download';
let downloadMode = 'audio';
const VIEW_TITLES = {
  download: ['Descargar', 'YouTube y más de 20 sitios'],
  convert: ['Convertir', '23 formatos de audio y vídeo'],
  recents: ['Recientes', 'Terminadas en este equipo'],
  settings: ['Ajustes', 'TubeGrab para Windows'],
};

function setView(view) {
  currentView = view;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((el) => {
    el.classList.toggle('hidden', !(el.dataset.views || '').split(' ').includes(view));
  });
  const [title, subtitle] = VIEW_TITLES[view];
  $('viewTitle').textContent = title;
  $('viewSubtitle').textContent = subtitle;
  formatToggle.classList.toggle('hidden', view !== 'download');
  if (view === 'download') setMode(downloadMode);
  else if (view === 'convert') setMode('convert');
  if (view === 'recents') renderHistory();
}

function setMode(mode) {
  currentMode = mode;
  if (mode !== 'convert') {
    if (downloadMode !== mode) { downloadMode = mode; saveLastOptions(); }
    document.querySelectorAll('.format-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('toggleSlider').style.transform = `translateX(${mode === 'video' ? '100%' : '0'})`;
  }
  applyMode();
  clearStatus();
}

$('nav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item) setView(item.dataset.view);
});
$('navSettings').addEventListener('click', () => setView('settings'));

formatToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.format-btn');
  if (btn && !btn.classList.contains('active')) setMode(btn.dataset.mode);
});

function applyMode() {
  const isConvert = currentMode === 'convert';
  inputGroup.classList.toggle('hidden', isConvert);
  uploadGroup.classList.toggle('hidden', !isConvert);
  if (isConvert) hidePreview(); else updateUrlState();
  audioOptions.classList.toggle('hidden', currentMode !== 'audio');
  videoOptions.classList.toggle('hidden', currentMode !== 'video');
  downloadExtras.classList.toggle('hidden', isConvert);
  optSubtitlesWrap.classList.toggle('hidden', currentMode !== 'video');
  convertOptions.classList.toggle('hidden', !isConvert);
  $('moreOptions').classList.toggle('hidden', !isConvert);
  refreshButton();
}

function refreshButton() {
  if (currentMode === 'convert') {
    const opt = currentConvertOption();
    const n = selectedFiles.length;
    btnText.textContent = n > 1 ? `Convertir ${n} archivos a ${opt.short}` : `Convertir a ${opt.short}`;
    return;
  }
  const n = parseUrls(urlInput.value).length;
  const what = currentMode === 'audio' ? AUDIO_DL_LABELS[audioFormat.value] : videoContainer.value.toUpperCase();
  btnText.textContent = n > 1 ? `Descargar ${n} enlaces (${what})` : `Descargar ${what}`;
}

audioFormat.addEventListener('change', () => {
  audioBitrate.disabled = LOSSLESS_DL.has(audioFormat.value);
  refreshButton();
});
videoContainer.addEventListener('change', refreshButton);

// === URLs ===
function parseUrls(text) {
  return String(text || '').split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/?\S*$/i.test(s));
}

function autoGrow() {
  urlInput.style.height = 'auto';
  if (!urlInput.value) return; // keep the single-row height the placeholder fits in
  urlInput.style.height = `${Math.min(urlInput.scrollHeight, 160)}px`;
}

let previewDebounce = null;
let previewRequestId = 0;

function updateUrlState() {
  const urls = parseUrls(urlInput.value);
  btnClear.classList.toggle('visible', urlInput.value.length > 0);
  urlHint.textContent = urls.length > 1 ? `${urls.length} enlaces — se descargarán todos.` : '';
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
      showStatus('Enlace detectado en el portapapeles ✨', 'success');
    }
  } catch { /* clipboard permission denied */ }
});

async function fetchPreview(url) {
  const requestId = ++previewRequestId;
  try {
    const data = await api('/api/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    if (requestId !== previewRequestId) return;
    previewThumb.src = data.thumbnail || '';
    previewThumb.style.visibility = data.thumbnail ? 'visible' : 'hidden';
    previewTitle.textContent = data.title;
    previewMeta.textContent = [data.site, data.uploader, formatDuration(data.duration)].filter(Boolean).join(' · ');
    previewCard.classList.remove('hidden');
  } catch {
    if (requestId === previewRequestId) hidePreview();
  }
}

function hidePreview() {
  previewRequestId += 1;
  previewCard.classList.add('hidden');
}

// === Convert settings ===
function currentConvertOption() {
  return CONVERT_FORMAT_OPTIONS[currentConvertKind].find((opt) => opt.value === convertFormat.value)
    || CONVERT_FORMAT_OPTIONS[currentConvertKind][0];
}

function renderConvertFormats() {
  convertFormat.innerHTML = CONVERT_FORMAT_OPTIONS[currentConvertKind]
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join('');
  convertPreset.innerHTML = PRESETS[currentConvertKind]
    .map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
}

function refreshConvertUI() {
  const opt = currentConvertOption();
  const isAudio = currentConvertKind === 'audio';
  audioConvertSettings.classList.toggle('hidden', !isAudio);
  videoConvertSettings.classList.toggle('hidden', isAudio);
  convertBitrate.disabled = Boolean(opt.lossless);
  if (opt.lossless) convertBitrate.value = '';
  convertQualitySetting.classList.toggle('hidden', Boolean(opt.gif));
  convertRemoveAudioOption.classList.toggle('hidden', Boolean(opt.gif));

  if (opt.lossless) convertHint.textContent = 'Formato sin pérdida: la calidad en kbps no aplica.';
  else if (opt.gif) convertHint.textContent = 'El GIF no lleva sonido. Sin resolución elegida se limita a 480 px de ancho y 12 fps; recórtalo para que no pese demasiado.';
  else if (isAudio) convertHint.textContent = 'Si eliges un vídeo, se extrae solo su audio.';
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

convertKindToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.kind-btn');
  if (!btn || btn.classList.contains('active')) return;
  currentConvertKind = btn.dataset.kind;
  document.querySelectorAll('.kind-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  renderConvertFormats();
  refreshConvertUI();
});

// === Files ===
fileDrop.addEventListener('dragover', (e) => { e.preventDefault(); fileDrop.classList.add('dragover'); });
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
fileDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDrop.classList.remove('dragover');
  if (e.dataTransfer.files.length) setFiles([...e.dataTransfer.files]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) setFiles([...fileInput.files]); });

function setFiles(files) {
  selectedFiles = files.slice(0, 50);
  const total = selectedFiles.reduce((acc, f) => acc + f.size, 0);
  fileDropText.textContent = selectedFiles.length === 1
    ? `${selectedFiles[0].name} (${formatBytes(total)})`
    : `${selectedFiles.length} archivos (${formatBytes(total)}) — haz clic para cambiar`;
  fileList.innerHTML = selectedFiles.length > 1
    ? selectedFiles.map((f) => `<li><span>${escapeHtml(f.name)}</span><span>${formatBytes(f.size)}</span></li>`).join('')
    : '';
  fileList.classList.toggle('hidden', selectedFiles.length < 2);
  clearStatus();
  refreshButton();
}

// === Submit ===
btnDownload.addEventListener('click', handleSubmit);

async function handleSubmit() {
  if (busy) return;
  if (currentMode === 'convert') return submitConvert();
  return submitDownload();
}

async function submitDownload() {
  const urls = parseUrls(urlInput.value);
  if (!urls.length) {
    showStatus('Pega al menos un enlace', 'error');
    shakeInput();
    return;
  }
  setBusy(true, optPlaylist.checked ? 'Leyendo playlist…' : 'Añadiendo…');
  try {
    const data = await api('/api/jobs/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        urls,
        mode: currentMode,
        audioFormat: audioFormat.value,
        audioBitrate: audioBitrate.value,
        quality: videoQuality.value,
        container: videoContainer.value,
        metadata: optMetadata.checked,
        playlist: optPlaylist.checked,
        subtitles: optSubtitles.checked,
        sponsorblock: optSponsorblock.checked,
      }),
    });
    const skipped = data.rejected && data.rejected.length ? ` · ${data.rejected.length} enlace(s) no soportado(s)` : '';
    showStatus(`${data.created === 1 ? 'Añadido' : `${data.created} añadidos`} a la cola${skipped}`, 'success');
    urlInput.value = '';
    autoGrow();
    updateUrlState();
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    setBusy(false);
  }
}

function uploadOne(file, fields, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v));
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/jobs/convert');
    xhr.setRequestHeader('x-client-id', CLIENT_ID);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error((data && data.error) || `Error ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('No se pudo subir el archivo.'));
    xhr.send(form);
  });
}

async function submitConvert() {
  if (!selectedFiles.length) {
    showStatus('Elige uno o varios archivos primero', 'error');
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

  setBusy(true, 'Subiendo…');
  const files = selectedFiles.slice();
  let ok = 0;
  const failures = [];
  for (let i = 0; i < files.length; i++) {
    const prefix = files.length > 1 ? `${i + 1}/${files.length} · ` : '';
    try {
      await uploadOne(files[i], fields, (pct) => {
        btnLoadingText.textContent = `Subiendo ${prefix}${pct}%`;
      });
      ok += 1;
    } catch (err) {
      failures.push(`${files[i].name}: ${err.message}`);
    }
  }
  setBusy(false);
  if (failures.length) showStatus(`${ok} en cola · ${failures.length} con error — ${failures[0]}`, 'error');
  else showStatus(`${ok === 1 ? 'Añadido' : `${ok} añadidos`} a la cola`, 'success');
}

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
}

function onJob(job, live) {
  const prev = jobs.get(job.id);
  jobs.set(job.id, job);
  if (ACTIVE.has(job.status)) liveJobs.add(job.id);
  const justFinished = live && prev && ACTIVE.has(prev.status) && job.status === 'done';
  if (justFinished && liveJobs.has(job.id)) {
    autoSave(job);
    addToHistory(job.fileName || job.title, job.detail);
    notify(job);
    if (prefsApi.get().sound) playDoneSound();
  }
  if (live && prev && ACTIVE.has(prev.status) && job.status === 'error') notify(job);
  renderRow(job);
}

function fileUrl(job) {
  return `/api/jobs/${job.id}/file?client=${CLIENT_ID}`;
}

function autoSave(job) {
  if (desktopApi) {
    saved.set(job.id, 'saving');
    desktopApi.saveJob(job.id, CLIENT_ID);
  } else {
    const a = document.createElement('a');
    a.href = fileUrl(job);
    a.download = job.fileName || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    saved.set(job.id, 'saved');
  }
}

if (desktopApi) {
  desktopApi.onSaved(({ jobId, ok, error }) => {
    saved.set(jobId, ok ? 'saved' : 'failed');
    if (ok) {
      // The file now lives in the user's folder; free the temp copy.
      api(`/api/jobs/${jobId}/file`, { method: 'DELETE' }).catch(() => {});
    } else if (error) {
      showStatus(error, 'error');
    }
    const job = jobs.get(jobId);
    if (job) renderRow(job);
  });
}

function notify(job) {
  if (!isElectronApp || !prefsApi.get().notify || document.hasFocus() || typeof Notification === 'undefined') return;
  const title = job.status === 'done' ? (job.type === 'convert' ? 'Conversión terminada' : 'Descarga terminada') : 'Algo falló';
  try { new Notification(title, { body: job.status === 'done' ? (job.fileName || job.title) : `${job.title}: ${job.error}`, silent: false }); } catch { /* ignore */ }
}

function statusLine(job) {
  switch (job.status) {
    case 'queued': return 'En cola';
    case 'running':
    case 'processing': {
      const parts = [job.stage];
      if (job.progress !== null && job.progress !== undefined) parts.push(`${job.progress}%`);
      if (job.speed) parts.push(`${formatBytes(job.speed)}/s`);
      if (job.eta) parts.push(`quedan ${formatEta(job.eta)}`);
      return parts.join(' · ');
    }
    case 'done': {
      const s = saved.get(job.id);
      const size = job.fileSize ? formatBytes(job.fileSize) : '';
      if (s === 'saving') return `Guardando… ${size}`;
      if (s === 'saved') return desktopApi ? `Guardado · ${size}` : `Completado · ${size}`;
      if (s === 'failed') return 'No se pudo guardar';
      return `Completado · ${size}`;
    }
    case 'canceled': return 'Cancelado';
    case 'error': return job.error || 'Error';
    default: return job.stage || '';
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
  stop: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/>'),
  reveal: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>'),
  save: svg('<path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  remove: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
};

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
    queueList.prepend(li);
  }
  li.dataset.status = job.status;
  const iconKey = ['done', 'error', 'canceled'].includes(job.status) ? job.status : (job.type === 'convert' ? 'convert' : 'download');
  const icon = li.querySelector('.queue-icon');
  if (icon.dataset.icon !== iconKey) { icon.innerHTML = ICONS[iconKey]; icon.dataset.icon = iconKey; }

  const title = li.querySelector('.queue-title');
  title.textContent = job.fileName || job.title;
  title.title = job.title;
  li.querySelector('.queue-fill').style.width = `${job.progress ?? 0}%`;
  li.classList.toggle('indeterminate', ACTIVE.has(job.status) && job.status !== 'queued' && (job.progress === null || job.progress === undefined));
  li.querySelector('.queue-status').textContent = job.status === 'error'
    ? statusLine(job)
    : `${job.detail ? `${job.detail} — ` : ''}${statusLine(job)}`;

  const actions = li.querySelector('.queue-actions');
  actions.innerHTML = '';
  const addBtn = (icon, label, onClick, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `queue-btn ${cls}`;
    b.innerHTML = ICONS[icon];
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', onClick);
    actions.appendChild(b);
  };
  if (ACTIVE.has(job.status)) {
    addBtn('stop', 'Cancelar', () => api(`/api/jobs/${job.id}/cancel`, { method: 'POST' }).catch((e) => showStatus(e.message, 'error')));
  } else {
    if (job.status === 'done') {
      if (desktopApi && saved.get(job.id) === 'saved') {
        addBtn('reveal', 'Mostrar en la carpeta', () => desktopApi.showInFolder(job.id), 'primary');
      } else if (!job.released) {
        addBtn('save', 'Guardar', () => autoSave(job), 'primary');
      }
    }
    addBtn('remove', 'Quitar de la lista', () => api(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {}));
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

function renderQueueMeta() {
  const all = [...jobs.values()];
  const active = all.filter((j) => ACTIVE.has(j.status));
  queueEmpty.classList.toggle('hidden', all.length > 0);
  btnClearFinished.classList.toggle('hidden', all.length === active.length);
  queueCount.textContent = active.length ? `${active.length} en curso` : '';
  const badge = $('navBadge');
  badge.textContent = String(active.length);
  badge.classList.toggle('hidden', active.length === 0);

  if (desktopApi) {
    const running = active.filter((j) => j.status !== 'queued');
    if (!active.length) desktopApi.setProgress(-1);
    else if (!running.some((j) => typeof j.progress === 'number')) desktopApi.setProgress(2); // indeterminate
    else desktopApi.setProgress(running.reduce((acc, j) => acc + (j.progress || 0), 0) / running.length / 100);
  }
}

btnClearFinished.addEventListener('click', () => {
  for (const job of jobs.values()) {
    if (!ACTIVE.has(job.status)) api(`/api/jobs/${job.id}`, { method: 'DELETE' }).catch(() => {});
  }
});

// === History (stored locally in this browser only) ===
const HISTORY_KEY = 'tubegrab_history';
const HISTORY_MAX = 15;

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function addToHistory(name, badge) {
  try {
    const history = getHistory();
    history.unshift({ name, badge, date: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
  } catch { /* localStorage unavailable */ }
  renderHistory();
}

function renderHistory() {
  const history = getHistory();
  historySection.classList.toggle('hidden', history.length === 0);
  $('historyEmpty').classList.toggle('hidden', history.length > 0);
  btnClearHistory.classList.toggle('hidden', history.length === 0);
  historyList.innerHTML = history.map((item) => `
    <li class="history-item">
      <span class="history-name">${escapeHtml(item.name)}</span>
      <span class="history-badge">${escapeHtml(item.badge || '')}</span>
    </li>`).join('');
}

btnClearHistory.addEventListener('click', () => {
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

function showStatus(msg, type) {
  statusMessage.textContent = msg;
  statusMessage.className = `status-message${type ? ` ${type}` : ''}`;
}

function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.className = 'status-message';
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
renderPrefs();
restoreLastOptions();
setView('download');
renderHistory();
connectEvents();
