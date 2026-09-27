// === DOM Elements ===
const urlInput = document.getElementById('urlInput');
const btnClear = document.getElementById('btnClear');
const audioBitrate = document.getElementById('audioBitrate');
const audioFormat = document.getElementById('audioFormat');
const videoQuality = document.getElementById('videoQuality');
const btnDownload = document.getElementById('btnDownload');
const btnText = document.getElementById('btnText');
const statusMessage = document.getElementById('statusMessage');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const formatToggle = document.getElementById('formatToggle');
const btnAudio = document.getElementById('btnAudio');
const btnVideo = document.getElementById('btnVideo');
const btnConvert = document.getElementById('btnConvert');
const audioOptions = document.getElementById('audioOptions');
const videoOptions = document.getElementById('videoOptions');
const convertOptions = document.getElementById('convertOptions');
const convertFormat = document.getElementById('convertFormat');
const inputGroup = document.getElementById('inputGroup');
const uploadGroup = document.getElementById('uploadGroup');
const fileDrop = document.getElementById('fileDrop');
const fileInput = document.getElementById('fileInput');
const fileDropText = document.getElementById('fileDropText');
const previewCard = document.getElementById('previewCard');
const previewThumb = document.getElementById('previewThumb');
const previewTitle = document.getElementById('previewTitle');
const previewMeta = document.getElementById('previewMeta');
const convertKindToggle = document.getElementById('convertKindToggle');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');
const btnClearHistory = document.getElementById('btnClearHistory');
const btnDesktopDownload = document.getElementById('btnDesktopDownload');

let currentMode = 'audio'; // 'audio', 'video' or 'convert'
let currentConvertKind = 'audio'; // 'audio' or 'video'
let selectedFile = null;

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

function currentConvertOption() {
  return CONVERT_FORMAT_OPTIONS[currentConvertKind].find((opt) => opt.value === convertFormat.value)
    || CONVERT_FORMAT_OPTIONS[currentConvertKind][0];
}

// === Desktop app banner: only makes sense in the browser. Running inside the
// Electron app itself, you're already using it, so hide the "download it"
// pitch entirely rather than show a pointless self-referential banner.
const isElectronApp = navigator.userAgent.toLowerCase().includes('electron');
const desktopBanner = document.getElementById('desktopBanner');
if (isElectronApp) {
  desktopBanner.remove();
  document.body.classList.add('is-desktop-app');
} else {
  btnDesktopDownload.href = 'https://github.com/Cid736/tubegrab/releases/latest/download/TubeGrab.exe';
}

// === Auto-updater (desktop app only) ===
// window.updater is only exposed by preload.js inside Electron; on the plain
// website this stays undefined and the whole block is skipped.
if (window.updater) {
  const updateBanner = document.getElementById('updateBanner');
  const updateBannerSubtitle = document.getElementById('updateBannerSubtitle');
  const btnUpdate = document.getElementById('btnUpdate');
  const updateProgress = document.getElementById('updateProgress');
  const updateProgressFill = document.getElementById('updateProgressFill');
  const updateProgressLabel = document.getElementById('updateProgressLabel');

  const versionChip = document.getElementById('versionChip');
  const STATUS_LABELS = {
    checking: 'Buscando actualizaciones…',
    'up-to-date': 'Última versión',
    error: 'No se pudo comprobar',
    dev: 'Modo desarrollo',
  };

  function renderUpdateState(state) {
    if (!state) return;
    const label = state.status === 'available' ? `Nueva: v${state.latest}` : STATUS_LABELS[state.status];
    versionChip.textContent = label ? `v${state.current} · ${label}` : `v${state.current}`;
    versionChip.dataset.status = state.status;
    versionChip.title = state.status === 'error'
      ? `${state.error} — pulsa para reintentar`
      : 'Pulsa para buscar actualizaciones';
    versionChip.classList.remove('hidden');

    if (state.status === 'available') {
      updateBannerSubtitle.textContent = `Versión ${state.latest} lista para descargar (tienes la ${state.current}).`;
      updateBanner.classList.remove('hidden');
    }
  }

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
    if (btnUpdate.dataset.stage === 'downloaded') {
      window.updater.quitAndInstall();
      return;
    }
    btnUpdate.disabled = true;
    btnUpdate.textContent = 'Descargando...';
    updateProgress.classList.remove('hidden');
    window.updater.downloadUpdate();
  });
}

// === Format Toggle ===
formatToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.format-btn');
  if (!btn || btn.classList.contains('active')) return;

  const mode = btn.dataset.mode;
  currentMode = mode;

  // Toggle active class
  document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // Move slider
  const slider = document.getElementById('toggleSlider');
  const sliderPositions = { audio: '0', video: '100%', convert: '200%' };
  slider.style.transform = `translateX(${sliderPositions[mode]})`;

  // Toggle URL input vs file upload
  inputGroup.classList.toggle('hidden', mode === 'convert');
  uploadGroup.classList.toggle('hidden', mode !== 'convert');
  if (mode === 'convert') hidePreview();

  // Toggle options visibility
  audioOptions.classList.toggle('hidden', mode !== 'audio');
  videoOptions.classList.toggle('hidden', mode !== 'video');
  convertOptions.classList.toggle('hidden', mode !== 'convert');

  if (mode === 'audio') {
    btnText.textContent = 'Descargar ' + audioFormat.value.toUpperCase();
  } else if (mode === 'video') {
    btnText.textContent = 'Descargar MP4';
  } else {
    refreshConvertUI();
  }

  clearStatus();
});

// === Convert settings ===
const audioConvertSettings = document.getElementById('audioConvertSettings');
const videoConvertSettings = document.getElementById('videoConvertSettings');
const convertBitrate = document.getElementById('convertBitrate');
const convertSampleRate = document.getElementById('convertSampleRate');
const convertChannels = document.getElementById('convertChannels');
const convertNormalize = document.getElementById('convertNormalize');
const convertResolution = document.getElementById('convertResolution');
const convertQuality = document.getElementById('convertQuality');
const convertQualitySetting = document.getElementById('convertQualitySetting');
const convertFps = document.getElementById('convertFps');
const convertRemoveAudio = document.getElementById('convertRemoveAudio');
const convertRemoveAudioOption = document.getElementById('convertRemoveAudioOption');
const convertTrimStart = document.getElementById('convertTrimStart');
const convertTrimEnd = document.getElementById('convertTrimEnd');
const convertHint = document.getElementById('convertHint');

function renderConvertFormats() {
  convertFormat.innerHTML = CONVERT_FORMAT_OPTIONS[currentConvertKind]
    .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
    .join('');
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

  if (opt.lossless) {
    convertHint.textContent = 'Formato sin pérdida: la calidad en kbps no aplica.';
  } else if (opt.gif) {
    convertHint.textContent = 'El GIF no lleva sonido. Sin resolución elegida se limita a 480 px de ancho y 12 fps; recórtalo para que no pese demasiado.';
  } else if (isAudio) {
    convertHint.textContent = 'Si eliges un vídeo, se extrae solo su audio.';
  } else {
    convertHint.textContent = '';
  }

  if (currentMode === 'convert') btnText.textContent = 'Convertir a ' + opt.short;
}

convertFormat.addEventListener('change', refreshConvertUI);

// === Convert Kind Toggle (Audio / Vídeo) ===
convertKindToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.kind-btn');
  if (!btn || btn.classList.contains('active')) return;

  currentConvertKind = btn.dataset.kind;
  document.querySelectorAll('.kind-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  renderConvertFormats();
  refreshConvertUI();
});

renderConvertFormats();
refreshConvertUI();

// === File Drop / Selection ===
fileDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDrop.classList.add('dragover');
});
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('dragover'));
fileDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDrop.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    fileInput.files = e.dataTransfer.files;
    handleFileSelect(e.dataTransfer.files[0]);
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleFileSelect(fileInput.files[0]);
});

function handleFileSelect(file) {
  selectedFile = file;
  const sizeMb = (file.size / 1024 / 1024).toFixed(1);
  fileDropText.textContent = `${file.name} (${sizeMb} MB)`;
  clearStatus();
}

// === Audio Format Change ===
audioFormat.addEventListener('change', () => {
  if (currentMode === 'audio') {
    btnText.textContent = 'Descargar ' + audioFormat.value.toUpperCase();
  }
});

// === URL Input Events ===
let previewDebounce = null;
let previewRequestId = 0;

urlInput.addEventListener('input', () => {
  btnClear.classList.toggle('visible', urlInput.value.length > 0);

  clearTimeout(previewDebounce);
  const url = urlInput.value.trim();
  if (!isYouTubeUrl(url)) {
    hidePreview();
    return;
  }
  previewDebounce = setTimeout(() => fetchPreview(url), 700);
});

btnClear.addEventListener('click', () => {
  urlInput.value = '';
  btnClear.classList.remove('visible');
  urlInput.focus();
  clearStatus();
  hidePreview();
});

async function fetchPreview(url) {
  const requestId = ++previewRequestId;
  try {
    const res = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (requestId !== previewRequestId) return; // stale response, a newer URL was typed since
    if (!res.ok) { hidePreview(); return; }

    const data = await res.json();
    if (requestId !== previewRequestId) return;

    previewThumb.src = data.thumbnail || '';
    previewThumb.style.visibility = data.thumbnail ? 'visible' : 'hidden';
    previewTitle.textContent = data.title;
    previewMeta.textContent = [data.uploader, formatDuration(data.duration)].filter(Boolean).join(' · ');
    previewCard.classList.remove('hidden');
  } catch (e) {
    hidePreview();
  }
}

function hidePreview() {
  previewCard.classList.add('hidden');
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Paste from clipboard on focus if input is empty
urlInput.addEventListener('focus', async () => {
  if (urlInput.value) return;
  try {
    const text = await navigator.clipboard.readText();
    if (isYouTubeUrl(text)) {
      urlInput.value = text;
      btnClear.classList.add('visible');
      showStatus('URL detectada en el portapapeles ✨', 'success');
    }
  } catch (e) { /* clipboard permission denied, ignore */ }
});

// === Download ===
btnDownload.addEventListener('click', handleDownload);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleDownload();
});

async function handleDownload() {
  if (currentMode === 'convert') {
    return handleConvert();
  }

  const url = urlInput.value.trim();
  if (!url) {
    showStatus('Pega un link de YouTube primero', 'error');
    shakeInput();
    return;
  }
  if (!isYouTubeUrl(url)) {
    showStatus('Eso no parece un link válido de YouTube', 'error');
    shakeInput();
    return;
  }

  setLoading(true);
  clearStatus();
  showProgress();

  try {
    const body = {
      url,
      mode: currentMode,
      quality: videoQuality.value,
      audioBitrate: audioBitrate.value,
      audioFormat: audioFormat.value,
    };

    const formatLabel = currentMode === 'audio' ? audioFormat.value.toUpperCase() : 'MP4';
    showStatus('Conectando con servidor seguro...', '');
    animateProgress(10);

    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || data.suggestion || 'Error desconocido');
    }

    animateProgress(20);
    const defaultFilename = currentMode === 'audio' ? `audio.${audioFormat.value}` : 'video.mp4';
    const downloadFilename = data.filename || defaultFilename;

    if (data.downloadUrl) {
      const downloadUrl = data.downloadUrl.startsWith('/api/') 
        ? data.downloadUrl 
        : `/api/proxy-download?url=${encodeURIComponent(data.downloadUrl)}&filename=${encodeURIComponent(downloadFilename)}`;

      // Both audio and video are fully processed server-side (yt-dlp download +
      // ffmpeg re-encode/merge) before anything is sent, so both use the same
      // fetch-with-progress flow rather than a bare <a href> download link.
      const isAudio = currentMode === 'audio';
      const label = isAudio ? formatLabel : 'MP4';
      const verb = isAudio ? 'Extrayendo y convirtiendo audio' : 'Descargando y fusionando vídeo + audio';
      showStatus(`${verb}... esto puede tardar`, '');
      animateProgress(25);

      const streamRes = await fetch(downloadUrl);

      if (!streamRes.ok) {
        throw new Error(`Error al descargar el ${isAudio ? 'audio' : 'vídeo'} del servidor`);
      }

      const contentLength = streamRes.headers.get('Content-Length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const mimeType = streamRes.headers.get('Content-Type') || (isAudio ? 'audio/mpeg' : 'video/mp4');

      const reader = streamRes.body.getReader();
      const chunks = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;

        const mb = (received / 1024 / 1024).toFixed(1);
        if (total > 0) {
          const pct = Math.min(25 + Math.round((received / total) * 70), 95);
          animateProgress(pct);
          const totalMb = (total / 1024 / 1024).toFixed(1);
          showStatus(`Descargando... ${mb} / ${totalMb} MB`, 'success');
        } else {
          showStatus(`Descargando... ${mb} MB`, 'success');
        }
      }

      animateProgress(100);
      showStatus(`¡Descarga ${label} completada! 🎉`, 'success');
      addToHistory(downloadFilename, label, isAudio ? 'Audio' : 'Vídeo');

      // Create blob and trigger download
      const blob = new Blob(chunks, { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    }
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    setLoading(false);
    setTimeout(hideProgress, 2000);
  }
}

async function handleConvert() {
  if (!selectedFile) {
    showStatus('Elige un archivo de audio o vídeo primero', 'error');
    return;
  }

  const opt = currentConvertOption();
  const targetFormat = opt.value;
  setLoading(true);
  clearStatus();
  showProgress();

  try {
    showStatus(`Convirtiendo a ${opt.short}...`, '');
    animateProgress(20);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('targetFormat', targetFormat);
    formData.append('trimStart', convertTrimStart.value.trim());
    formData.append('trimEnd', convertTrimEnd.value.trim());
    if (currentConvertKind === 'audio') {
      formData.append('audioBitrate', convertBitrate.value);
      formData.append('sampleRate', convertSampleRate.value);
      formData.append('channels', convertChannels.value);
      formData.append('normalize', String(convertNormalize.checked));
    } else {
      formData.append('resolution', convertResolution.value);
      formData.append('quality', convertQuality.value);
      formData.append('fps', convertFps.value);
      formData.append('removeAudio', String(convertRemoveAudio.checked));
    }

    const res = await fetch('/api/convert', {
      method: 'POST',
      body: formData,
    });

    animateProgress(60);

    if (!res.ok) {
      let errMsg = 'Error al convertir el archivo';
      try {
        const data = await res.json();
        errMsg = data.error || errMsg;
      } catch (e) { /* ignore parse error */ }
      throw new Error(errMsg);
    }

    const blob = await res.blob();
    animateProgress(90);

    const baseName = selectedFile.name.replace(/\.[^/.]+$/, '') || 'audio';
    const downloadFilename = `${baseName}.${opt.ext}`;

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = downloadFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    animateProgress(100);
    showStatus(`¡Conversión a ${opt.short} completada! 🎉`, 'success');
    addToHistory(downloadFilename, opt.short, 'Conversión');
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    setLoading(false);
    setTimeout(hideProgress, 2000);
  }
}

// === History (stored locally in this browser only) ===
const HISTORY_KEY = 'tubegrab_history';
const HISTORY_MAX = 8;

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function addToHistory(name, badge, kind) {
  try {
    const history = getHistory();
    history.unshift({ name, badge, kind, date: Date.now() });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_MAX)));
    renderHistory();
  } catch (e) { /* localStorage unavailable, ignore */ }
}

function renderHistory() {
  const history = getHistory();
  historySection.classList.toggle('hidden', history.length === 0);
  historyList.innerHTML = history.map(item => `
    <li class="history-item">
      <span class="history-item-name">${escapeHtml(item.name)}</span>
      <span class="history-item-badge">${escapeHtml(item.badge)}</span>
    </li>
  `).join('');
}

btnClearHistory.addEventListener('click', () => {
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* ignore */ }
  renderHistory();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

renderHistory();

// === Helpers ===
function isYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com|m\.youtube\.com)\/.+/i.test(url);
}

function showStatus(msg, type) {
  statusMessage.textContent = msg;
  statusMessage.className = 'status-message' + (type ? ` ${type}` : '');
}

function clearStatus() {
  statusMessage.textContent = '';
  statusMessage.className = 'status-message';
}

function setLoading(loading) {
  btnDownload.classList.toggle('loading', loading);
}

function showProgress() {
  progressBar.classList.remove('hidden');
  progressFill.style.width = '0%';
}

function hideProgress() {
  progressBar.classList.add('hidden');
}

function animateProgress(percent) {
  progressFill.style.width = percent + '%';
}

function shakeInput() {
  const wrapper = document.querySelector('.input-wrapper');
  wrapper.style.animation = 'shake 0.4s ease';
  setTimeout(() => wrapper.style.animation = '', 400);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    50% { transform: translateX(6px); }
    75% { transform: translateX(-4px); }
  }
`;
document.head.appendChild(style);
