<p align="center">
  <a href="#english">🇬🇧 English</a> &nbsp;·&nbsp; <a href="#español">🇪🇸 Español</a>
</p>

---

<a name="english"></a>

# TubeGrab

Local video/audio downloader **and** format converter with a job queue. Runs entirely on your machine — no external servers, no trackers. Available as a self-updating Windows desktop app (portable, light portable or installer), and deployable to your own server.

## Features

Every page is always visible in the sidebar, with no drop-down menus: **Download**, **Search**, **Subscriptions**, **Convert**, **Editor**, **Merge**, **Compress**, **Image**, **Queue**, **History** and **Settings** (with tabs: Appearance · Downloads · Conversion · System · About).

**Download**
- YouTube and 20+ sites: Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp, Mixcloud, Bilibili…
- Several links at once, whole playlists, or **pick which videos of a playlist** to download
- **Search** YouTube without a link, and download the results you tick
- **Subscriptions** (desktop app): channels or playlists checked every 1–24 h; new uploads download by themselves
- Audio: MP3, M4A, OPUS, OGG, FLAC, WAV or the original stream (96–320 kbps). Video: up to 4K/8K as MP4, MKV or WEBM
- **Download only a part** (e.g. 1:20–3:45, with a slider), or **split by chapters** into one file per chapter (tagged with title and track number)
- **Music mode**: clean "Artist - Title" (without "(Official Video)"…), artist tag and **square cover art**
- Cover art, metadata and chapters; subtitles in 9 languages, embedded or as a separate **.srt**; SponsorBlock

**Convert**
- 11 audio and 12 video formats, batch, presets (WhatsApp, Instagram/TikTok, YouTube, iPhone, podcast, audiobook…), speed, rotate, resolution…
- **Trim with a preview and waveform**: drag the handles and play the part before converting
- **Editor** with a timeline (thumbnails, waveform, zoom): keep from any second to any other, cut with the blade (B), mark in/out (I/O), remove or restore clips, undo/redo, frame stepping and NLE-style shortcuts (Space, J/L, arrows). Export with exact cuts (re-encoded, GPU if available) or fast cuts (stream copy, lossless, keyframe-aligned)
  - **Remove silences** in one click, a **clip list** (jump, remove, restore), **snapping** and ↑/↓ to jump between cuts
  - Output adjustments: **vertical 9:16 / square / 4:5** centre crop (with a live frame on the viewer), **fade in/out**, **volume** or mute, **rotate/mirror**, and **each clip as its own file**
- **Merge** several audio or video files into one (clips of other sizes are letterboxed)
- **Compress to a size** (e.g. 8 MB for Discord, 16 MB for WhatsApp): TubeGrab works out the quality, two-pass
- **Image**: a frame at any moment (with a slider) or the embedded cover art, as JPG/PNG/WEBP
- **Graphics card acceleration** (NVIDIA NVENC, Intel Quick Sync, AMD AMF) for H.264/H.265, with automatic CPU fallback

**Queue, history and desktop app**
- Real progress, speed and time left; **pause/resume** downloads (they continue where they stopped), **reorder** what's waiting, cancel, retry (temporary errors retry by themselves once); downloads/conversions at once and a **speed limit** are configurable
- **History with search**: open the file, show it in its folder, or download it again with the same options
- Saves straight to your folder; several files (chapters, subtitles) go together in a subfolder
- **System tray**: keep running when closed (downloads and subscriptions carry on); **detect copied links** (opt-in) and download them with one click
- Self-updating from GitHub Releases (SHA-256 verified), and keeps yt-dlp up to date
- Two interfaces (Windows 11 or macOS), light/dark, accent colours, backgrounds, text size, and **Spanish or English**
- Drag files or links anywhere onto the window; shortcuts Ctrl+1 Download · Ctrl+2 Convert · Ctrl+3 Queue · Ctrl+4 History · Ctrl+, Settings

## Usage

### 1. Node.js (development)

```bash
npm install
npm start
# Open http://localhost:3000
```

### 2. Desktop app (Windows)

From [Releases](https://github.com/Cid736/tubegrab/releases/latest), pick one:

| File | What it is |
|---|---|
| `TubeGrab.exe` | Portable, everything inside (~170 MB). No install. |
| `TubeGrab-Lite.exe` | Portable, light (~100 MB): downloads ffmpeg and yt-dlp on first launch (SHA-256 verified). |
| `TubeGrab-Setup.exe` | Installer, per user (no admin): Start menu and desktop shortcuts; updates by running the new installer silently. |

Each one updates itself to the same kind. Windows SmartScreen may warn "Unknown publisher" because the app isn't code-signed (see *Code signing* below) — click "Run anyway".

To build them yourself (needs Windows Developer Mode, so electron-builder can create symlinks):

```bash
npm run build          # dist/TubeGrab.exe + dist/TubeGrab-Setup.exe
npm run build:lite     # dist/TubeGrab-Lite.exe
```

**Maintainers, publishing a release:** tag `vX.Y.Z` (= `package.json` version) and upload the three assets with exactly those names; the updater of each kind looks for its own file and verifies GitHub's SHA-256 digest.

### 3. Docker

```bash
docker compose up
# Open http://localhost:3000
```

### 4. Deploy your own instance (e.g. Render)

The repo includes a `Dockerfile` and `render.yaml`. On Render: create a Web Service from this repo (Docker runtime is auto-detected), pick the Free plan, and add an environment variable `TRUST_PROXY=true`. Subscriptions, tray and clipboard features are desktop-only.

**Make it private:** add `TUBEGRAB_USERS` with one or more `user:password` pairs separated by commas (e.g. `ana:long-password,luis:another-one`). The browser then asks for a user and password before showing anything; failed attempts are limited to 30 per 15 minutes per IP. Without it, anyone with the link can use your instance — and you are responsible for what they download through it. To remove someone, delete their pair and save (Render redeploys).

## Code signing

The build signs the `.exe` files automatically when a certificate is provided through electron-builder's environment variables — nothing to change in the code:

- **Certificate file** (`.pfx`): set `CSC_LINK` (path or base64) and `CSC_KEY_PASSWORD`, then `npm run build`.
- **Free for open source:** [SignPath Foundation](https://signpath.org) signs OSS projects at no cost (apply with the GitHub repo; they sign in their CI).
- **Azure Trusted Signing** (low monthly cost): configure `win.azureSignOptions` in `package.json` and log in with the Azure CLI.

Once signed, SmartScreen's "Unknown publisher" warning goes away (immediately with EV certificates, after some reputation with standard ones).

## Structure

```
├── server.js              # Express server: job API (SSE progress), search, playlists, subscriptions, settings, security guards
├── lib/
│   ├── jobs.js            # Job queue: concurrency, progress, pause/resume, reorder, retry, multi-file results
│   ├── download.js        # yt-dlp: site allowlist, options (parts, chapters, music mode, subtitles, speed), search, playlists
│   ├── convert.js         # ffmpeg: formats, trim, compress to size, image, merge, GPU encoders
│   ├── subscriptions.js   # Channel/playlist subscriptions (desktop)
│   ├── auth.js            # Optional login for a private self-hosted instance (TUBEGRAB_USERS)
│   ├── filenames.js       # Safe names for files and folders saved to the user's folder
│   └── ffmpeg-release.js  # Pinned ffmpeg build (version, URL, SHA-256)
├── electron-main.js       # Desktop app: window, updater (3 kinds), components, tray, clipboard, save-to-folder
├── preload.js             # Minimal bridge exposed to the page
├── electron-builder.lite.js  # Light portable build
├── scripts/
│   ├── postinstall.js     # Linux: fetches yt-dlp (SHA-256 checked) · Windows: runs fetch-ffmpeg.js
│   └── fetch-ffmpeg.js    # Windows: pinned ffmpeg + ffprobe into bin/
├── public/
│   ├── theme-init.js      # Applies saved appearance before first paint (validated values)
│   ├── i18n.js            # Spanish / English
│   ├── index.html
│   ├── app.js
│   ├── style.css          # macOS interface + shared base
│   └── fluent.css         # Windows 11 interface (default)
├── test/                  # npm test (node:test): unit, real ffmpeg, API end-to-end and security tests
├── Dockerfile
├── docker-compose.yml
└── render.yaml
```

## Tests

```bash
npm test                    # 93 tests: options, conversions with real ffmpeg, compress/merge/image, queue, API, security
TG_NETWORK=1 npm test       # also real YouTube downloads
```

## Cookies (optional)

For restricted videos, add a `cookies.txt` file (Netscape format). Desktop app: Settings → Downloads → Cookies → "Open folder" (it goes in `%APPDATA%\tubegrab`). Server/Docker: next to `server.js`, or in the folder set by `TUBEGRAB_DATA_DIR`.

## Dependencies

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg](https://ffmpeg.org/) 9.0.2 on Windows (gyan.dev build, SHA-256 pinned); Debian's maintained ffmpeg 7.1 in Docker (`FFMPEG_BIN`); [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static) only as a last resort
- [Express](https://expressjs.com/) + [helmet](https://www.npmjs.com/package/helmet) + [express-rate-limit](https://www.npmjs.com/package/express-rate-limit)
- [multer](https://www.npmjs.com/package/multer) (file uploads for the converter)
- [Electron](https://www.electronjs.org/) 44 (desktop app only)
- Node.js 22+ (its permission model sandboxes the JavaScript yt-dlp runs to solve YouTube's challenges)

## License

MIT. Privacy, terms of use and third-party components: [LEGAL.md](LEGAL.md#english). Only download content you have the right to download.

## Security

Security reviews are AI-assisted (Claude, Anthropic) and run on significant changes to check for injection risks, insecure defaults and dependency vulnerabilities. Findings are tracked in [`BUGLOG.md`](BUGLOG.md).

**Last review:** 2026-09-28 (review #10, v2.5.0) — every new feature was reviewed: new IPC channels only take ids and booleans (files are opened or shown only if the app itself saved them; folder names are sanitised); search, playlists and subscriptions go through the same site allowlist (no generic extractor); merged uploads each pass the media-only ffmpeg input whitelist and the filter graph is built only from numbers and fixed strings; the light build and the installer update are SHA-256 verified; the page may only play local `blob:` media. Also fixed: copied-link detection crashed (Electron 44's clipboard is asynchronous), the portable app left a dead Start-menu shortcut after notifications, and the file prober misread resolutions. 0 known vulnerabilities; all components on their latest releases. Known limit: the .exe isn't code-signed yet (see *Code signing*). Details in BUGLOG.md.

Found a vulnerability? Open an issue or contact directly.

---

<a name="español"></a>

# TubeGrab

Descargador de vídeo/audio **y** conversor de formatos con cola de trabajos. Funciona completamente en tu equipo — sin servidores externos, sin trackers. Disponible como app de escritorio para Windows que se actualiza sola (portable, portable ligera o con instalador), y desplegable en tu propio servidor.

## Características

Todas las páginas están siempre a la vista en la barra lateral, sin menús desplegables: **Descargar**, **Buscar**, **Suscripciones**, **Convertir**, **Editor**, **Unir**, **Comprimir**, **Imagen**, **Cola**, **Historial** y **Ajustes** (con pestañas: Apariencia · Descargas · Conversión · Sistema · Acerca de).

**Descargar**
- YouTube y más de 20 sitios: Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp, Mixcloud, Bilibili…
- Varios enlaces a la vez, playlists completas, o **elegir qué vídeos de una playlist** descargar
- **Buscar** en YouTube sin tener el enlace, y descargar los resultados que marques
- **Suscripciones** (app de escritorio): canales o playlists revisados cada 1–24 h; lo nuevo se descarga solo
- Audio: MP3, M4A, OPUS, OGG, FLAC, WAV o el original (96–320 kbps). Vídeo: hasta 4K/8K en MP4, MKV o WEBM
- **Descargar solo un tramo** (p. ej. 1:20–3:45, con deslizador), o **dividir por capítulos** en un archivo por capítulo (con título y número de pista)
- **Modo música**: "Artista - Título" limpio (sin "(Official Video)"…), etiqueta de artista y **portada cuadrada**
- Portada, metadatos y capítulos; subtítulos en 9 idiomas, dentro del vídeo o como **.srt** aparte; SponsorBlock

**Convertir**
- 11 formatos de audio y 12 de vídeo, por lotes, preajustes (WhatsApp, Instagram/TikTok, YouTube, iPhone, podcast, audiolibro…), velocidad, girar, resolución…
- **Recorte con vista previa y forma de onda**: arrastra los tiradores y escucha el tramo antes de convertir
- **Editor** con línea de tiempo (miniaturas, forma de onda, zoom): quédate del segundo que quieras al que quieras, corta con la cuchilla (B), marca entrada/salida (I/O), quita o recupera tramos, deshaz/rehaz, avanza fotograma a fotograma y usa atajos de editor (Espacio, J/L, flechas). Exporta con cortes exactos (recodifica, con GPU si hay) o rápidos (copia sin pérdida, ajustados a fotogramas clave)
  - **Quitar silencios** con un clic, **lista de tramos** (saltar, quitar, recuperar), **imán** y ↑/↓ para saltar entre cortes
  - Ajustes del resultado: recorte **vertical 9:16 / cuadrado / 4:5** al centro (con el marco en el visor), **fundidos**, **volumen** o sin sonido, **girar/espejo** y **cada tramo en un archivo aparte**
- **Unir** varios audios o vídeos en uno (los clips de otro tamaño se encajan con bandas negras)
- **Comprimir a un tamaño** (p. ej. 8 MB para Discord, 16 MB para WhatsApp): TubeGrab calcula la calidad, en dos pasadas
- **Imagen**: un fotograma en cualquier momento (con deslizador) o la carátula incrustada, en JPG/PNG/WEBP
- **Aceleración por tarjeta gráfica** (NVIDIA NVENC, Intel Quick Sync, AMD AMF) para H.264/H.265, con vuelta automática al procesador

**Cola, historial y app de escritorio**
- Progreso real, velocidad y tiempo restante; **pausar/reanudar** descargas (siguen donde se quedaron), **reordenar** lo que espera, cancelar, reintentar (los errores temporales se reintentan solos una vez); descargas/conversiones a la vez y **límite de velocidad** configurables
- **Historial con búsqueda**: abrir el archivo, mostrarlo en su carpeta o volver a descargarlo con las mismas opciones
- Guarda directamente en tu carpeta; varios archivos (capítulos, subtítulos) van juntos en una subcarpeta
- **Bandeja del sistema**: seguir abierta al cerrar (descargas y suscripciones continúan); **detectar enlaces copiados** (opcional) y descargarlos con un clic
- Se actualiza sola desde GitHub Releases (verificada por SHA-256) y mantiene al día yt-dlp
- Dos interfaces (Windows 11 o macOS), claro/oscuro, colores, fondos, tamaño del texto, y **español o inglés**
- Arrastra archivos o enlaces a cualquier parte de la ventana; atajos Ctrl+1 Descargar · Ctrl+2 Convertir · Ctrl+3 Cola · Ctrl+4 Historial · Ctrl+, Ajustes

## Modos de uso

### 1. Node.js (desarrollo)

```bash
npm install
npm start
# Abre http://localhost:3000
```

### 2. App de escritorio (Windows)

En [Releases](https://github.com/Cid736/tubegrab/releases/latest), elige una:

| Archivo | Qué es |
|---|---|
| `TubeGrab.exe` | Portable, todo incluido (~170 MB). Sin instalar. |
| `TubeGrab-Lite.exe` | Portable ligera (~100 MB): descarga ffmpeg y yt-dlp la primera vez (verificados por SHA-256). |
| `TubeGrab-Setup.exe` | Instalador, por usuario (sin administrador): accesos en el menú Inicio y el escritorio; se actualiza ejecutando el nuevo instalador en silencio. |

Cada una se actualiza a su mismo tipo. Windows SmartScreen puede avisar "Editor desconocido" porque la app no está firmada (ver *Firma de código* más abajo) — dale a "Ejecutar de todas formas".

Para construirlas tú (necesitas el Modo Desarrollador de Windows, para que electron-builder pueda crear symlinks):

```bash
npm run build          # dist/TubeGrab.exe + dist/TubeGrab-Setup.exe
npm run build:lite     # dist/TubeGrab-Lite.exe
```

**Para quien mantenga el repo, al publicar una release:** etiqueta `vX.Y.Z` (= versión de `package.json`) y sube los tres archivos con esos nombres exactos; el actualizador de cada tipo busca el suyo y verifica la huella SHA-256 que publica GitHub.

### 3. Docker

```bash
docker compose up
# Abre http://localhost:3000
```

### 4. Desplegar tu propia instancia (ej. Render)

El repo incluye un `Dockerfile` y `render.yaml`. En Render: crea un Web Service desde este repo (detecta Docker automáticamente), elige el plan Free, y añade la variable de entorno `TRUST_PROXY=true`. Las suscripciones, la bandeja y el portapapeles solo están en la app de escritorio.

**Hacerla privada:** añade `TUBEGRAB_USERS` con uno o varios pares `usuario:contraseña` separados por comas (ej. `ana:contraseña-larga,luis:otra-distinta`). El navegador pedirá usuario y contraseña antes de mostrar nada; los intentos fallidos se limitan a 30 cada 15 minutos por IP. Sin ella, cualquiera con el enlace puede usar tu instancia, y lo que descarguen a través de ella es responsabilidad tuya. Para quitar a alguien, borra su par y guarda (Render vuelve a desplegar).

## Firma de código

La construcción firma los `.exe` automáticamente si se le da un certificado con las variables de entorno de electron-builder — sin tocar el código:

- **Archivo de certificado** (`.pfx`): define `CSC_LINK` (ruta o base64) y `CSC_KEY_PASSWORD` y ejecuta `npm run build`.
- **Gratis para código abierto:** [SignPath Foundation](https://signpath.org) firma proyectos open source sin coste (se solicita con el repo de GitHub; firman en su CI).
- **Azure Trusted Signing** (coste mensual bajo): configura `win.azureSignOptions` en `package.json` e inicia sesión con la CLI de Azure.

Con la firma desaparece el aviso "Editor desconocido" de SmartScreen (al momento con certificados EV; con los normales, tras ganar algo de reputación).

## Pruebas

```bash
npm test                    # 93 pruebas: opciones, conversiones con ffmpeg real, comprimir/unir/imagen, cola, API, seguridad
TG_NETWORK=1 npm test       # también descargas reales de YouTube
```

## Cookies (opcional)

Para vídeos con restricciones, añade un archivo `cookies.txt` (formato Netscape). App de escritorio: Ajustes → Descargas → Cookies → "Abrir carpeta" (va en `%APPDATA%\tubegrab`). Servidor/Docker: junto a `server.js`, o en la carpeta indicada en `TUBEGRAB_DATA_DIR`.

## Seguridad

Las revisiones de seguridad son asistidas por IA (Claude, Anthropic) y se ejecutan en cambios significativos para detectar riesgos de inyección, configuraciones inseguras y vulnerabilidades en dependencias. Los hallazgos se registran en [`BUGLOG.md`](BUGLOG.md).

**Última revisión:** 2026-09-28 (revisión 10, v2.5.0) — se revisó cada función nueva: los nuevos canales IPC solo aceptan ids y booleanos (solo se abren o muestran archivos que la propia app guardó; los nombres de carpeta se sanean); búsqueda, playlists y suscripciones pasan por la misma lista de sitios permitidos (sin extractor genérico); cada archivo de "Unir" pasa la lista blanca de entradas multimedia de ffmpeg y el grafo de filtros solo se construye con números y textos fijos; la versión ligera y la actualización del instalador se verifican por SHA-256; la página solo puede reproducir medios locales `blob:`. También corregido: la detección de enlaces copiados fallaba (el portapapeles de Electron 44 es asíncrono), la versión portable dejaba un acceso roto en el menú Inicio tras las notificaciones, y el analizador de archivos leía mal las resoluciones. 0 vulnerabilidades conocidas; todos los componentes en su última versión. Límite conocido: el .exe aún no está firmado (ver *Firma de código*). Detalles en BUGLOG.md.

¿Encontraste una vulnerabilidad? Abre un issue o contacta directamente.

## Licencia

MIT. Privacidad, condiciones de uso y componentes de terceros: [LEGAL.md](LEGAL.md#español). Descarga solo contenido que tengas derecho a descargar.
