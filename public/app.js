// === DOM Elements ===
const urlInput = document.getElementById('urlInput');
const btnClear = document.getElementById('btnClear');
const audioBitrate = document.getElementById('audioBitrate');
const videoQuality = document.getElementById('videoQuality');
const btnDownload = document.getElementById('btnDownload');
const btnText = document.getElementById('btnText');
const statusMessage = document.getElementById('statusMessage');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const formatToggle = document.getElementById('formatToggle');
const btnAudio = document.getElementById('btnAudio');
const btnVideo = document.getElementById('btnVideo');
const audioOptions = document.getElementById('audioOptions');
const videoOptions = document.getElementById('videoOptions');

let currentMode = 'audio'; // 'audio' or 'video'

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
  if (mode === 'video') {
    slider.style.transform = 'translateX(100%)';
  } else {
    slider.style.transform = 'translateX(0)';
  }

  // Toggle options visibility
  if (mode === 'audio') {
    audioOptions.classList.remove('hidden');
    videoOptions.classList.add('hidden');
    btnText.textContent = 'Descargar MP3';
  } else {
    audioOptions.classList.add('hidden');
    videoOptions.classList.remove('hidden');
    btnText.textContent = 'Descargar MP4';
  }

  clearStatus();
});

// === URL Input Events ===
urlInput.addEventListener('input', () => {
  btnClear.classList.toggle('visible', urlInput.value.length > 0);
});

btnClear.addEventListener('click', () => {
  urlInput.value = '';
  btnClear.classList.remove('visible');
  urlInput.focus();
  clearStatus();
});

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
    };

    const formatLabel = currentMode === 'audio' ? 'MP3' : 'MP4';
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
    const defaultFilename = currentMode === 'audio' ? 'audio.mp3' : 'video.mp4';
    const downloadFilename = data.filename || defaultFilename;

    if (data.downloadUrl) {
      const downloadUrl = data.downloadUrl.startsWith('/api/') 
        ? data.downloadUrl 
        : `/api/proxy-download?url=${encodeURIComponent(data.downloadUrl)}&filename=${encodeURIComponent(downloadFilename)}`;

      if (currentMode === 'audio') {
        // Audio: quick stream, just trigger the download link
        showStatus('Preparando archivo de audio...', 'success');
        animateProgress(80);

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = downloadFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        showStatus('¡Descarga MP3 iniciada! 🎉', 'success');
        animateProgress(100);
      } else {
        // Video: fetch with progress (server downloads+merges first, then sends)
        showStatus('Descargando y fusionando vídeo + audio... esto puede tardar', '');
        animateProgress(25);

        const streamRes = await fetch(downloadUrl);

        if (!streamRes.ok) {
          throw new Error('Error al descargar el vídeo del servidor');
        }

        const contentLength = streamRes.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;

        const reader = streamRes.body.getReader();
        const chunks = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;

          if (total > 0) {
            const pct = Math.min(25 + Math.round((received / total) * 70), 95);
            animateProgress(pct);
            const mb = (received / 1024 / 1024).toFixed(1);
            const totalMb = (total / 1024 / 1024).toFixed(1);
            showStatus(`Descargando vídeo... ${mb} / ${totalMb} MB`, 'success');
          } else {
            const mb = (received / 1024 / 1024).toFixed(1);
            showStatus(`Descargando vídeo... ${mb} MB`, 'success');
          }
        }

        animateProgress(100);
        showStatus('¡Descarga MP4 completada! 🎉', 'success');

        // Create blob and trigger download
        const blob = new Blob(chunks, { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = downloadFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    }
  } catch (err) {
    showStatus(err.message, 'error');
  } finally {
    setLoading(false);
    setTimeout(hideProgress, 2000);
  }
}

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
