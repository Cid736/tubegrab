<p align="center">
  <a href="#english">🇬🇧 English</a> &nbsp;·&nbsp; <a href="#español">🇪🇸 Español</a>
</p>

---

<a name="english"></a>

# TubeGrab

Local YouTube video/audio downloader **and** audio/video format converter. Runs entirely on your machine — no external servers, no trackers, full privacy. Also downloadable as a self-contained desktop app, and deployable to your own server if you want it reachable outside your machine.

## Features

- **Download from YouTube** in MP4 (up to 4K) or MP3/OGG (64–320 kbps), with a live preview (title, thumbnail, duration) before downloading
- **Convert your own files** between audio formats (MP3, WAV, OGG, M4A, FLAC, OPUS) or video formats (MP4, WEBM, MKV, AVI, MOV), via drag-and-drop
- Local download/conversion history (kept in your browser only)
- 100% local processing using [yt-dlp](https://github.com/yt-dlp/yt-dlp) + ffmpeg — nothing is uploaded to a third party
- Cookie support for age-restricted videos
- Available as:
  - a **desktop app** for Windows (single `.exe`, no install, no console window)
  - a **Docker** container
  - a **web app** you can self-host (e.g. on [Render](https://render.com), free tier)

## Usage

### 1. Node.js (development)

```bash
npm install
npm start
# Open http://localhost:3000
```

### 2. Desktop app (Windows, no installation)

Download the latest `.exe` from [Releases](https://github.com/Cid736/tubegrab/releases/latest) — it opens its own window, no browser or console needed. Windows SmartScreen may warn "Unknown publisher" since the app isn't code-signed; this is expected for an unsigned executable, not a sign of a broken build — click "Run anyway".

To build it yourself:

```bash
npm run build          # Electron app -> dist/TubeGrab.exe (the real desktop app)
npm run build:exe      # pkg console build -> dist/TubeGrab.exe (lightweight, shows a terminal)
```

Building with `npm run build` needs Windows Developer Mode enabled (Settings → Privacy & security → For developers) so electron-builder can create symlinks without admin rights.

### 3. Docker

```bash
docker compose up
# Open http://localhost:3000
```

### 4. Deploy your own instance (e.g. Render)

The repo includes a `Dockerfile` and `render.yaml`. On Render: create a Web Service from this repo (Docker runtime is auto-detected), pick the Free plan, and add an environment variable `TRUST_PROXY=true` (needed so the app binds correctly and rate-limiting reads the real client IP behind Render's proxy).

## Structure

```
├── server.js              # Express server: YouTube download, format conversion, metadata preview
├── electron-main.js       # Desktop app entry point (Electron)
├── scripts/
│   └── postinstall.js     # Fetches a Linux yt-dlp binary on non-Windows npm installs
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── Dockerfile
├── docker-compose.yml
└── render.yaml
```

## Cookies (optional)

For restricted videos, place a `cookies.txt` file (Netscape format) in the project root next to `server.js`.

## Dependencies

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static)
- [Express](https://expressjs.com/) + [helmet](https://www.npmjs.com/package/helmet) + [express-rate-limit](https://www.npmjs.com/package/express-rate-limit)
- [multer](https://www.npmjs.com/package/multer) (file uploads for the converter)
- [yt-dlp-wrap-extended](https://www.npmjs.com/package/yt-dlp-wrap-extended)
- [Electron](https://www.electronjs.org/) (desktop app only)

## License

MIT

## Security

Security reviews are AI-assisted (Claude, Anthropic) and run on significant changes to check for injection risks, insecure defaults and dependency vulnerabilities. Findings are tracked in [`BUGLOG.md`](BUGLOG.md).

**Last review:** 2026-09-27 — full manual review of `server.js`, `app.js` and `electron-main.js` (command injection, SSRF, XSS, path traversal) plus a dependency audit. No high-confidence exploitable vulnerabilities found in application code. One hardening recommendation: `/api/convert` doesn't validate uploaded file type before passing it to ffmpeg — low real-world risk locally, worth restricting if self-hosting publicly. `npm audit` flags several packages, but nearly all are `electron-builder`'s build-time-only dependencies (never deployed); the couple of runtime ones (`qs`, `body-parser`, pulled in by Express) are DoS-only or not reachable given how inputs are validated here.

Found a vulnerability? Open an issue or contact directly.

---

<a name="español"></a>

# TubeGrab

Descargador local de vídeo/audio de YouTube **y** conversor de formatos de audio/vídeo. Funciona completamente en tu máquina — sin servidores externos, sin trackers, con privacidad total. También disponible como app de escritorio autónoma, y desplegable en tu propio servidor si quieres tenerlo accesible fuera de tu máquina.

## Características

- **Descarga de YouTube** en MP4 (hasta 4K) o MP3/OGG (64–320 kbps), con vista previa (título, miniatura, duración) antes de descargar
- **Convierte tus propios archivos** entre formatos de audio (MP3, WAV, OGG, M4A, FLAC, OPUS) o de vídeo (MP4, WEBM, MKV, AVI, MOV), arrastrando y soltando
- Historial local de descargas/conversiones (guardado solo en tu navegador)
- Procesamiento 100% local usando [yt-dlp](https://github.com/yt-dlp/yt-dlp) + ffmpeg — nada se sube a terceros
- Compatible con cookies para vídeos con restricción de edad
- Disponible como:
  - **app de escritorio** para Windows (un único `.exe`, sin instalación, sin ventana de consola)
  - contenedor **Docker**
  - **app web** autoalojable (por ejemplo en [Render](https://render.com), plan gratuito)

## Modos de uso

### 1. Node.js (desarrollo)

```bash
npm install
npm start
# Abre http://localhost:3000
```

### 2. App de escritorio (Windows, sin instalación)

Descarga el último `.exe` desde [Releases](https://github.com/Cid736/tubegrab/releases/latest) — abre su propia ventana, no necesita navegador ni consola. Windows SmartScreen puede avisar "Editor desconocido" porque la app no tiene firma de código de pago; es normal en un ejecutable sin firmar, no significa que esté roto — dale a "Ejecutar de todas formas".

Para construirla tú mismo:

```bash
npm run build          # App de Electron -> dist/TubeGrab.exe (la app de escritorio real)
npm run build:exe      # Build de consola con pkg -> dist/TubeGrab.exe (ligero, muestra terminal)
```

Para `npm run build` necesitas el Modo Desarrollador de Windows activado (Configuración → Privacidad y seguridad → Para desarrolladores), para que electron-builder pueda crear symlinks sin permisos de administrador.

### 3. Docker

```bash
docker compose up
# Abre http://localhost:3000
```

### 4. Desplegar tu propia instancia (ej. Render)

El repo incluye un `Dockerfile` y `render.yaml`. En Render: crea un Web Service desde este repo (detecta Docker automáticamente), elige el plan Free, y añade la variable de entorno `TRUST_PROXY=true` (necesaria para que la app escuche correctamente y el rate-limiting lea la IP real del cliente detrás del proxy de Render).

## Cookies (opcional)

Para vídeos con restricciones, coloca un archivo `cookies.txt` (formato Netscape) en la raíz del proyecto junto a `server.js`.

## Seguridad

Las revisiones de seguridad son asistidas por IA (Claude, Anthropic) y se ejecutan en cambios significativos para detectar riesgos de inyección, configuraciones inseguras y vulnerabilidades en dependencias. Los hallazgos se registran en [`BUGLOG.md`](BUGLOG.md).

**Última revisión:** 2026-09-27 — revisión manual completa de `server.js`, `app.js` y `electron-main.js` (inyección de comandos, SSRF, XSS, path traversal) más auditoría de dependencias. No se encontraron vulnerabilidades explotables de alta confianza en el código de la app. Una recomendación de hardening: `/api/convert` no valida el tipo de archivo subido antes de pasarlo a ffmpeg — riesgo real bajo en uso local, vale la pena restringirlo si se autoaloja públicamente. `npm audit` marca varios paquetes, pero casi todos son dependencias de build de `electron-builder` (nunca se despliegan); los pocos de producción (`qs`, `body-parser`, vía Express) son solo de denegación de servicio o no explotables dado cómo se valida la entrada aquí.

¿Encontraste una vulnerabilidad? Abre un issue o contacta directamente.

## Licencia

MIT
