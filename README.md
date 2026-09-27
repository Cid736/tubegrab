<p align="center">
  <a href="#english">🇬🇧 English</a> &nbsp;·&nbsp; <a href="#español">🇪🇸 Español</a>
</p>

---

<a name="english"></a>

# TubeGrab

Local video/audio downloader **and** format converter with a job queue. Runs entirely on your machine — no external servers, no trackers. Available as a self-updating Windows desktop app, and deployable to your own server.

## Features

**Downloads**
- YouTube and 20+ sites: Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp, Mixcloud, Bilibili…
- Several links at once (one per line) and **whole playlists**
- Audio: MP3, M4A, OPUS, OGG, FLAC, WAV or the **original stream without re-encoding** (96–320 kbps)
- Video: best available up to 4K/8K or a fixed resolution, as MP4, MKV or WEBM
- Embedded **cover art, metadata and chapters**, embedded **subtitles** (ES/EN), and **SponsorBlock** to cut sponsor segments
- Live preview (title, thumbnail, duration) for a single link

**Conversion**
- **Batch**: convert many files in one go
- 11 audio formats (MP3, AAC, M4A, OGG, OPUS, WMA, AC3, FLAC, ALAC, WAV, AIFF) and 12 video formats (MP4 H.264, MP4 H.265/HEVC, WEBM, MKV, MOV, AVI, WMV, FLV, MPG, 3GP, OGV, animated GIF)
- **Presets**: WhatsApp, Instagram/TikTok, YouTube, email, iPhone/Apple (HEVC), web, GIF; podcast, audiobook, voice note, lossless…
- Audio: bitrate, sample rate, mono/stereo, loudness normalization. Video: resolution, quality, frame rate, rotate/mirror, strip audio. Both: speed (0.5×–2×) and trim start/end. Extract the audio from any video.

**Queue & desktop app**
- Job queue with **real progress**, speed and time left; several downloads run in parallel; cancel any job
- Desktop app: saves straight to a folder you choose (with "Show in folder" / "Open folder"), taskbar progress, notifications when a job finishes
- **Self-updating**: the app updates itself from GitHub Releases in one click (SHA-256 verified), and keeps its download engine (yt-dlp) up to date automatically — sites like YouTube break old versions within weeks
- Local history of finished jobs (stored only on your device)
- Native macOS-style interface (Liquid Glass): floating glass sidebar, System Settings-style grouped lists, automatic light/dark mode, and a translucent (acrylic) window on Windows 11

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
├── server.js              # Express server: job API (SSE progress), metadata preview, security guards
├── lib/
│   ├── jobs.js            # Job queue: concurrency, progress, cancel, cleanup
│   ├── download.js        # yt-dlp: site allowlist, options, progress parsing, playlists
│   └── convert.js         # ffmpeg: formats, presets' settings, progress parsing
├── electron-main.js       # Desktop app: window, app updater, yt-dlp auto-update, save-to-folder
├── preload.js             # Minimal bridge exposed to the page (updater + desktop features)
├── scripts/
│   ├── postinstall.js     # Linux: fetches yt-dlp · Windows: runs fetch-ffprobe.js
│   └── fetch-ffprobe.js   # Windows: ffprobe next to ffmpeg (SHA-256 pinned)
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
- [Electron](https://www.electronjs.org/) 44 (desktop app only)
- Node.js 22+ (its permission model sandboxes the JavaScript yt-dlp runs to solve YouTube's challenges)

## License

MIT

## Security

Security reviews are AI-assisted (Claude, Anthropic) and run on significant changes to check for injection risks, insecure defaults and dependency vulnerabilities. Findings are tracked in [`BUGLOG.md`](BUGLOG.md).

**Last review:** 2026-09-27 (review #7, v2.0.0) — covered the new job API, multi-site downloads and the desktop features. 0 known vulnerabilities in dependencies (`npm audit`); Electron upgraded 34 → 44; unused and unmaintained packages removed. Downloads only accept an allowlist of sites (yt-dlp's generic extractor is disabled, so no SSRF), yt-dlp ignores local config files, and the JavaScript it runs for YouTube is sandboxed by Node's permission model (verified). Uploaded files can only be opened by real media demuxers without network access (blocks the HLS/concat "fake video" file-read trick). Jobs are private to the browser/app that created them. Known limits: the `.exe` isn't code-signed. Details in `BUGLOG.md`.

Found a vulnerability? Open an issue or contact directly.

---

<a name="español"></a>

# TubeGrab

Descargador de vídeo/audio **y** conversor de formatos con cola de trabajos. Funciona completamente en tu equipo — sin servidores externos, sin trackers. Disponible como app de escritorio para Windows que se actualiza sola, y desplegable en tu propio servidor.

## Características

**Descargas**
- YouTube y más de 20 sitios: Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp, Mixcloud, Bilibili…
- Varios enlaces a la vez (uno por línea) y **playlists completas**
- Audio: MP3, M4A, OPUS, OGG, FLAC, WAV o el **audio original sin recomprimir** (96–320 kbps)
- Vídeo: la mejor calidad disponible (hasta 4K/8K) o una resolución fija, en MP4, MKV o WEBM
- **Portada, metadatos y capítulos** incrustados, **subtítulos** incrustados (ES/EN) y **SponsorBlock** para quitar patrocinios
- Vista previa (título, miniatura, duración) de un enlace

**Conversión**
- **Por lotes**: convierte muchos archivos de una vez
- 11 formatos de audio (MP3, AAC, M4A, OGG, OPUS, WMA, AC3, FLAC, ALAC, WAV, AIFF) y 12 de vídeo (MP4 H.264, MP4 H.265/HEVC, WEBM, MKV, MOV, AVI, WMV, FLV, MPG, 3GP, OGV, GIF animado)
- **Preajustes**: WhatsApp, Instagram/TikTok, YouTube, email, iPhone/Apple (HEVC), web, GIF; podcast, audiolibro, nota de voz, sin pérdida…
- Audio: calidad, frecuencia, mono/estéreo, normalizar volumen. Vídeo: resolución, calidad, fotogramas, girar/espejo, quitar audio. Ambos: velocidad (0,5×–2×) y recorte de inicio/fin. Extrae el audio de cualquier vídeo.

**Cola y app de escritorio**
- Cola de trabajos con **progreso real**, velocidad y tiempo restante; varias descargas en paralelo; cancelar cualquier trabajo
- App de escritorio: guarda directamente en la carpeta que elijas (con "Mostrar en carpeta" / "Abrir carpeta"), progreso en la barra de tareas y notificación al terminar
- **Se actualiza sola**: la app se actualiza desde GitHub Releases con un clic (verificada por SHA-256) y mantiene al día su motor de descargas (yt-dlp) automáticamente — sitios como YouTube rompen las versiones antiguas en semanas
- Historial local de trabajos terminados (solo en tu equipo)
- Interfaz al estilo nativo de macOS (Liquid Glass): barra lateral de vidrio, listas agrupadas como Ajustes del Sistema, modo claro/oscuro automático y ventana translúcida (acrylic) en Windows 11

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

**Última revisión:** 2026-09-27 (revisión 7, v2.0.0) — cubre la nueva API de trabajos, las descargas de varios sitios y las funciones de escritorio. 0 vulnerabilidades conocidas en dependencias (npm audit); Electron actualizado de 34 a 44; eliminados paquetes sin uso o sin mantenimiento. Las descargas solo aceptan una lista de sitios permitidos (el extractor genérico de yt-dlp está desactivado, así que no hay SSRF), yt-dlp ignora archivos de configuración locales, y el JavaScript que ejecuta para YouTube queda aislado por el modelo de permisos de Node (verificado). Los archivos subidos solo los pueden abrir demuxers multimedia reales y sin acceso a red (bloquea el truco del "vídeo falso" HLS/concat para leer archivos). Los trabajos son privados del navegador o app que los creó. Límite conocido: el .exe no está firmado. Detalles en BUGLOG.md.

¿Encontraste una vulnerabilidad? Abre un issue o contacta directamente.

## Licencia

MIT
