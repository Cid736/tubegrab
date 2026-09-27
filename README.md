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
  - a **desktop app** for Windows (single `.exe`, no install, no console window), with a built-in updater — it checks GitHub Releases on launch and lets you update in one click, no manual re-download
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

The desktop app checks GitHub Releases for a newer version on launch and can update itself in one click (see below) — no manual re-download needed. **Maintainers, publishing a release:** this check reads the release's `tag_name` (`vX.Y.Z`, matching `package.json`'s version) and looks for an asset named exactly `TubeGrab.exe`, so keep using `gh release create` as before; no extra build step or metadata file is needed.

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

**Last review:** 2026-09-27 (review #6) — covered the new in-app updater and the local server. Fixed: the updater now verifies each download's sha256 against GitHub's published digest and only talks to GitHub over HTTPS; the install script no longer interpolates file paths (command-injection fix); the app window can't navigate away from its own local UI, and updater IPC only accepts calls from it; the local server rejects DNS-rebinding and cross-site requests. Known limits: the `.exe` isn't code-signed, so a compromised GitHub account could still ship a malicious update, and Electron 34 should be upgraded. Details in `BUGLOG.md`.

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
  - **app de escritorio** para Windows (un único `.exe`, sin instalación, sin ventana de consola), con actualizador integrado — comprueba los Releases de GitHub al abrir y te deja actualizar con un clic, sin descargar el .exe a mano
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

La app de escritorio comprueba los Releases de GitHub al arrancar y puede actualizarse sola con un clic (ver más abajo) — sin descargar nada a mano. **Para quien mantenga el repo, al publicar una release:** esta comprobación lee el `tag_name` de la release (`vX.Y.Z`, igual que la versión en `package.json`) y busca un asset llamado exactamente `TubeGrab.exe`, así que sigue usando `gh release create` como hasta ahora; no hace falta ningún paso ni archivo extra.

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

**Última revisión:** 2026-09-27 (revisión 6) — revisados el nuevo actualizador integrado y el servidor local. Corregido: el actualizador verifica ahora el sha256 de cada descarga contra el digest publicado por GitHub y solo se conecta a GitHub por HTTPS; el script de instalación ya no interpola rutas (fix de inyección de comandos); la ventana de la app no puede navegar fuera de su propia interfaz local y el IPC del actualizador solo acepta llamadas de ella; el servidor local rechaza DNS rebinding y peticiones cross-site. Límites conocidos: el `.exe` no está firmado, así que una cuenta de GitHub comprometida aún podría publicar una actualización maliciosa, y conviene actualizar Electron 34. Detalles en `BUGLOG.md`.

¿Encontraste una vulnerabilidad? Abre un issue o contacta directamente.

## Licencia

MIT
