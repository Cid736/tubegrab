<p align="center">
  <a href="#english">🇬🇧 English</a> &nbsp;·&nbsp; <a href="#español">🇪🇸 Español</a>
</p>

---

<a name="english"></a>

# TubeGrab

Local video/audio downloader **and** format converter with a job queue. Runs entirely on your machine — no external servers, no trackers. Available as a self-updating Windows desktop app (portable, light portable or installer), and deployable to your own server.

## Features

Every page is always visible in the sidebar, with no drop-down menus: **Download**, **Search**, **Subscriptions**, **Convert**, **Editor**, **Subtitles**, **Merge**, **Compress**, **Image**, **Tags**, **Queue**, **History**, **Library**, **Statistics** and **Settings** (with tabs: Appearance · Downloads · Conversion · System · About).

**Download**
- YouTube and 20+ sites: Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp, Mixcloud, Bilibili…
- Several links at once, whole playlists, or **pick which videos of a playlist** to download
- **Search** YouTube without a link, and download the results you tick — hover a thumbnail for a silent preview, or press ▶ to watch it with sound
  - with **the same download options** as Download (profile, format, quality, extras), and **copy the links** of the results or download **only their thumbnails**
- **Import from Spotify or Apple Music**: paste a playlist, album or song link; each song is looked up on YouTube and downloaded with your options
- **Podcasts** (desktop): subscribe to a feed (RSS); new episodes download by themselves with their cover, date and chapters, in a folder of their own
- **Only the thumbnail** of a video, in full size
- **Proxy** (desktop) for sites blocked on your network
- **Subscriptions** (desktop app): channels or playlists checked every 1–24 h; new uploads download by themselves
- Audio: MP3, M4A, OPUS, OGG, FLAC, WAV or the original stream (96–320 kbps). Video: up to 4K/8K as MP4, MKV or WEBM
- **Download only a part** (e.g. 1:20–3:45, with a slider), or **split by chapters** into one file per chapter (tagged with title and track number)
- **Music mode**: clean "Artist - Title" (without "(Official Video)"…), artist tag and **square cover art**
- **Lyrics** (optional): found on LRCLIB (free, no account), embedded in the song, plus a synced **.lrc** file next to it when available
- **Folders by artist / album** (desktop): downloads can go into `Artist/Album` automatically
- **Scheduled downloads** (desktop): the queue waits until a time you choose (e.g. at night); conversions still run
- **Audio and video at once**: one click downloads both, each in its own format
- **Your own file names**: presets ("Artist - Title", "Date - Title"…) or a template with `{title}` `{artist}` `{channel}` `{album}` `{date}` `{year}` `{track}` `{id}`
- **Start now** (desktop): a queued download starts at once, without waiting for its turn
- **Start with Windows** (desktop): in the tray, so subscriptions and scheduled downloads keep working
- Cover art, metadata and chapters; subtitles in 9 languages, embedded or as a separate **.srt**; SponsorBlock
- SponsorBlock: cut the sponsors out **or mark them as chapters** you can skip in any player
- **Profiles**: save your options under a name ("FLAC music", "Video for the phone"…) and pick them with one click — also on the phone page
- **Rules**: "from this channel → this profile, into this folder"
- **"You already have it"**: before downloading something again (by the video's own id), you're asked whether to skip it; search and playlist results show a badge
- **Even out the volume** (EBU R128, two passes) so every song plays equally loud
- **BPM and key** written into the tags (MP3, FLAC, OGG, OPUS), with the Camelot code, for DJs
- **Record live streams from the start** (YouTube), and **stop and save** whenever you like from the queue
- **Mirror a playlist** (subscription): all of it in its own folder, kept the same — what's removed from the playlist goes to the Recycle Bin, and an `.m3u8` in its order
- **Sheet for Jellyfin / Kodi / Plex**: an `.nfo` and the poster next to the video

**Convert**
- 11 audio and 12 video formats, batch, presets (WhatsApp, Instagram/TikTok, YouTube, iPhone, podcast, audiobook…), speed, rotate, resolution…
- **Remove the vocals (karaoke) or keep only the vocals** (approximate: works best with stereo studio songs)
- **Trim with a preview and waveform**: drag the handles and play the part before converting
- **Editor** that fills the window (viewer, settings panel and a timeline with thumbnails, waveform and zoom): keep from any second to any other, cut with the blade (B), mark in/out (I/O), remove or restore clips, undo/redo, frame stepping and NLE-style shortcuts (Space, J/L, arrows). Export with exact cuts (re-encoded, GPU if available) or fast cuts (stream copy, lossless, keyframe-aligned)
  - **Remove silences** in one click, a **clip list** (jump, remove, restore), **snapping** and ↑/↓ to jump between cuts
  - Output adjustments: **vertical 9:16 / square / 4:5** centre crop (with a live frame on the viewer), **fade in/out**, **volume** or mute, **rotate/mirror**, and **each clip as its own file**
  - **Titles** (up to 5, with position, size and when they show), a **logo/watermark** in any corner, **background-noise removal**, **slow motion / fast forward per clip** (0.25×–4×), all previewed live on the viewer
  - Export as **animated GIF**, **WhatsApp sticker** (animated WebP 512×512) or **Telegram sticker** (WebM, up to 3 s)
  - **Automatic subtitles** burnt into the video (classic, or big word-by-word "TikTok" style with the word being said lit), **background music** that lowers by itself while someone speaks, **several shapes at once** (9:16 + 1:1 + 16:9, one file each), a frame that **follows the movement** (or that you drag by hand), and **cut at every change of shot**
  - **Best moments**: keeps only the liveliest stretches (louder, more cuts) for a summary or a short
  - **Animated titles**: fade in, slide in, rise or typewriter
  - **Record the screen** (a whole screen, a window or just part of it, with the computer's sound) straight into the Editor
- **Subtitles** with **Whisper** (whisper.cpp), on your computer and offline once installed: an `.srt`, the plain transcript, or the video with the subtitles in it; 15 languages or detected, and translation into English
- **Merge** several audio or video files into one (clips of other sizes are letterboxed)
- **Compress to a size** (e.g. 8 MB for Discord, 16 MB for WhatsApp): TubeGrab works out the quality, two-pass
- **Image**: a frame at any moment (with a slider) or the embedded cover art, as JPG/PNG/WEBP
- **Tags**: edit title, artist, album, album artist, track, year, genre, **BPM, key** and **cover art** of many songs at once (MP3, M4A, FLAC, OGG, OPUS), number tracks in order, take titles from file names, **detect BPM and key**, rename to "Artist - Title" and add lyrics — audio is copied, never re-encoded
- **Fill in from MusicBrainz**: artist, title, album, year, track number and the album cover; by the song's sound with a free AcoustID key, otherwise by its title and artist
- **Watch folder** (desktop): every audio or video file you drop into a folder is converted by itself with a preset
- **Graphics card acceleration** (NVIDIA NVENC, Intel Quick Sync, AMD AMF) for H.264/H.265, with automatic CPU fallback

**Queue, history and desktop app**
- Real progress, speed and time left; **pause/resume** downloads (they continue where they stopped), **reorder** what's waiting, cancel, retry (temporary errors retry by themselves once); downloads/conversions at once and a **speed limit** are configurable
- **The queue survives a restart**: what hadn't finished is queued again (paused ones stay paused); **priority** per download (urgent, normal, when there's time)
- **Download hours** (only from 2:00 to 7:00, say) and **repeating tasks** ("this playlist every day at 3:00")
- **History with search**: open the file, show it in its folder, or download it again with the same options
- **Library and player** (desktop): everything in your download folder, searchable, with favourites, star ratings, sorting and folder groups, with a player bar that keeps playing across pages (shuffle, repeat, media keys, videos too)
  - **Synced lyrics** while the song plays (from its `.lrc`), cover art, an **equalizer** with presets and **crossfade** between songs
  - **Your own playlists** (reorder, play, export as `.m3u8`), **find duplicates** (exact copies and same names) and send the extra ones to the Recycle Bin, sort by **most played**
  - **Play on the TV**: Chromecast and DLNA/UPnP TVs and speakers on your WiFi (play, pause, seek, next)
  - **Mini player**: a small window that stays on top of the others
  - The mini player **can be dragged anywhere** (it opens where you left it) and has mute and keyboard controls
  - **Your own keyboard shortcuts** (any key or combination; plain letter keys only inside TubeGrab): play/pause, next, previous, stop, volume up/down, mute, ±10 s, mini player, show the app — also with the window in the background or in the tray; ⏮ ⏯ ⏭ in the **taskbar thumbnail** and in the tray menu
  - **Cover grid**, **smart lists** (not played yet, added this month, most played, recently played, 4–5 stars), **search by a line of the lyrics**, the **.srt subtitles** next to a video, and **radio mode** (when the list ends, similar songs from your library)
  - **Send a whole list to the phone** at once: one QR, every file or all of them as a .zip
  - **Listen without downloading** (desktop), like a music app: play any search result, a YouTube playlist or your **Spotify / Apple Music playlists** straight from YouTube, nothing saved; ⬇ downloads the song you like
  - **Escuchar** page: paste a Spotify, Apple Music or YouTube playlist link and it stays as a list of yours (play, shuffle, add to what's playing, download all, update from the link)
  - **Up next** list (jump, remove, save as a list), **radio** with YouTube's mix of similar songs, and a **mini player that searches and plays** by itself, with volume, shuffle, repeat and radio; as an **overlay** over a game: see-through, always on top, fixed in place, clicks passing through, compact, in a corner
  - **Lyrics in step**: followed frame by frame, the line being sung fills in like karaoke, and − / + moves them if a version starts earlier or later (remembered per song)
  - **Last.fm** scrobbling and **Discord** "Listening to…" (with your own free keys)
- **Statistics**: downloads and conversions per month, top channels and artists, most played, library size
- **Disk space** (desktop): a warning when the disk runs low, and an optional limit for the downloads folder (warn, or move the oldest files to the Recycle Bin — never favourites)
- **Command line**: `tubegrab "link" --mp3` (Settings → System installs the command); also `node cli.js` / `npm run cli` from the repository
- **Send to phone**: a QR code with a link on your WiFi that expires in 30 minutes — no cables, no cloud
- **Browser extension** (Chrome, Edge, Brave, Opera): a button on YouTube and "Download with TubeGrab" in the right-click menu open the link in the app (see `extension/README.md`)
- **Backup**: export settings, history and subscriptions to a file and import them on another PC
- **Automatic backup** (desktop) into a folder of yours (OneDrive, a drive…) every day, week or month, keeping the last 8; **notifications with buttons** ("Open", "Show in folder")
- **Control from your phone** (desktop): scan a QR and a page on your WiFi lets you send links to download on the PC and follow them
- **Phone notifications** (desktop): a message on your phone through the free ntfy app when a long task finishes (or fails)
- **Your own look**: any accent colour and your own background picture (with its own veil and blur) or **three colours of your own**; a short **tour** on first launch (and in Settings → About)
  - **Quick styles** in one click (Midnight, Paper, Neon, Terminal, Forest, Sunset, Compact) and a **style code** to copy your look to another computer
  - **Typeface** (system, wide, serif, monospaced, narrow), bolder text, five text sizes, **spacing** (compact, normal, roomy), **corners** (square, normal, round), content centred or across the whole window, thin or hidden scroll bars
  - **Side menu your way**: left or right, icons only, normal or wide, icons in the accent colour, each a colour or none, and **choose which pages show and in what order**
  - **Dark mode by schedule** (say from 20:00 to 7:00), hide the description under the title or the Windows/Mac button, and **pick the page the app opens on**
- **Comfort**: estimated file size before downloading, "Retry what failed", reopens on the page you left, **?** shows every shortcut, search box in Settings, **high contrast** and **reduce animations**, tray menu with "Download the copied link", open folder, pause/resume all; the phone page follows the phone's language and lets you pick format and quality
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

**Make it private:** add `TUBEGRAB_USERS` with one or more `user:password` pairs separated by commas (e.g. `ana:long-password,luis:another-one`). The browser then asks for a user and password before showing anything; failed attempts are limited to 30 per 15 minutes per IP. Passwords need at least 8 characters and can't contain commas; if the variable is malformed (missing `:`, short password, repeated user, stray comma) the server **refuses to start** and says why, instead of running open. Only use it over HTTPS (Render provides it) and keep `TRUST_PROXY=true` behind a proxy so the attempt limit is per visitor. Without it, anyone with the link can use your instance — and you are responsible for what they download through it. To remove someone, delete their pair and save (Render redeploys).

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
│   ├── ffmpeg-release.js  # Pinned ffmpeg build (version, URL, SHA-256)
│   ├── library.js         # Library, own playlists, duplicates, lyrics, LAN sharing (phone, and seekable for the TV)
│   ├── whisper.js         # Automatic subtitles (whisper.cpp, pinned): .srt, transcript, burnt-in captions
│   ├── analysis.js        # Tempo (BPM) and key, worked out from the sound
│   ├── loudness.js        # Same loudness for every file (EBU R128, two passes)
│   ├── cast.js            # Chromecast (CASTV2) and DLNA/UPnP on the local network
│   ├── seen.js            # "You already have it": downloads by video id
│   ├── profiles.js        # Download profiles and channel rules
│   └── watch.js           # Watch folder (desktop)
├── cli.js                 # Command line: tubegrab <link> --mp3 …
├── electron-main.js       # Desktop app: window, updater (3 kinds), components, tray, clipboard, save-to-folder, mini player, disk space
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
npm test                    # 237 tests: options, conversions with real ffmpeg, compress/merge/image, queue, API, security
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

**Last review:** 2026-10-04 (review #16, v3.7.1): listening without downloading and the Spotify lists checked with attack tests (only YouTube's media servers, ids and links validated, lists cleaned, at most 3 yt-dlp at once). Before that: (review #15, v3.5.0) — everything new in 3.5 reviewed with attack tests: fetching podcasts, Spotify/Apple pages and MusicBrainz only ever reaches public addresses (checked by the connection itself, also through redirects and IPv4-in-IPv6 tricks, which were the bug fixed here); fpcalc never opens an upload (our whitelisted ffmpeg makes a WAV for it); imported songs become plain YouTube searches after `--`; the proxy is validated before yt-dlp sees it; screen recording only right after you pick a screen, never the microphone or camera; the Last.fm secret never reaches the page; the queue file and tasks are checked again when read. Details in BUGLOG.md.

**Review #13:** 2026-10-01 (v3.3.0) — v3.1–v3.3 reviewed with attack tests: phone control only on the WiFi address, for a phone paired by QR, with Host/Origin checks; file-name templates only from our own tags (no `/`, `..`, `%(`…); "start now" desktop-only so nobody can bypass a shared server's limits; tampered prefs (colour, background, template) never reach the page. Found and fixed during testing: an infinite loop in the download button text and a stale size estimate. 0 known vulnerabilities; all dependencies current.

**Review #12:** 2026-09-30 (v3.0.1) — whole codebase, attack hypotheses tested live. Fixed: a tampered backup could point the download folder at a network share (Windows would send the user's NTLM hash to it) — only local disk folders are accepted now; `tubegrab://` is registered as `"exe" -- "%1"` so nothing after the link can become a Chromium switch; phone sharing listens only on the advertised WiFi address and never leaves files open; lyrics responses are capped while streaming; Electron 44.5.1. 0 known vulnerabilities.

**Review of v2.9.0 → v3.0.0:** 2026-09-30 — every new feature was reviewed with attack tests: editor titles are drawn from files and never parsed as filter syntax, logos and covers accept only small PNG/JPG/WEBP pictures, lyrics come only from lrclib.net with size/time caps and cleaned output, library files are served only from the download folder by random id (real path checked), phone sharing serves only the shared file on the local network behind an expiring token, `tubegrab://` links can only prefill a supported link, and backups are validated field by field. Details per version in BUGLOG.md.

**Review #11:** 2026-09-29 (v2.8.1) — private-instance login, the timeline editor and its output adjustments, with new attack tests. Fixed: a malformed `TUBEGRAB_USERS` left the server **open** without warning (now it refuses to start; passwords ≥ 8 characters, no repeated users, and the error never prints a password); an editor export with ~200 parts and every adjustment could exceed Windows' 32 767-character command line (the filter graph now goes to ffmpeg in a file). Tested: hostile values in every editor field never reach ffmpeg, upload names like `..\..\evil'.mp4` or `CON.mp4` stay inside the job folder in every mode, the fast-mode concat list only ever names the server's own part files, failed logins are limited per IP (then even the right password waits), and every `innerHTML` in the page uses fixed templates or escaped values. 0 known vulnerabilities.

**Previous review:** 2026-09-28 (review #10, v2.5.0) — every new feature was reviewed: new IPC channels only take ids and booleans (files are opened or shown only if the app itself saved them; folder names are sanitised); search, playlists and subscriptions go through the same site allowlist (no generic extractor); merged uploads each pass the media-only ffmpeg input whitelist and the filter graph is built only from numbers and fixed strings; the light build and the installer update are SHA-256 verified; the page may only play local `blob:` media. Also fixed: copied-link detection crashed (Electron 44's clipboard is asynchronous), the portable app left a dead Start-menu shortcut after notifications, and the file prober misread resolutions. 0 known vulnerabilities; all components on their latest releases. Known limit: the .exe isn't code-signed yet (see *Code signing*). Details in BUGLOG.md.

Found a vulnerability? Open an issue or contact directly.

---

<a name="español"></a>

# TubeGrab

Descargador de vídeo/audio **y** conversor de formatos con cola de trabajos. Funciona completamente en tu equipo — sin servidores externos, sin trackers. Disponible como app de escritorio para Windows que se actualiza sola (portable, portable ligera o con instalador), y desplegable en tu propio servidor.

## Características

Todas las páginas están siempre a la vista en la barra lateral, sin menús desplegables: **Descargar**, **Buscar**, **Suscripciones**, **Convertir**, **Editor**, **Subtítulos**, **Unir**, **Comprimir**, **Imagen**, **Etiquetas**, **Cola**, **Historial**, **Biblioteca**, **Estadísticas** y **Ajustes** (con pestañas: Apariencia · Descargas · Conversión · Sistema · Acerca de).

**Descargar**
- YouTube y más de 20 sitios: Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp, Mixcloud, Bilibili…
- Varios enlaces a la vez, playlists completas, o **elegir qué vídeos de una playlist** descargar
- **Buscar** en YouTube sin tener el enlace, y descargar los resultados que marques; pasa el ratón por una miniatura para ver una vista previa sin sonido, o pulsa ▶ para verlo con sonido
  - con **las mismas opciones de descarga** que en Descargar (perfil, formato, calidad, extras), y **copiar los enlaces** de los resultados o bajar **solo sus miniaturas**
- **Importar de Spotify o Apple Music**: pega el enlace de una playlist, un álbum o una canción; cada canción se busca en YouTube y se descarga con tus opciones
- **Podcasts** (app de escritorio): suscríbete a un feed (RSS); los episodios nuevos se bajan solos con su portada, su fecha y sus capítulos, en su propia carpeta
- **Solo la miniatura** de un vídeo, a tamaño completo
- **Proxy** (app de escritorio) para sitios bloqueados en tu red
- **Suscripciones** (app de escritorio): canales o playlists revisados cada 1–24 h; lo nuevo se descarga solo
- Audio: MP3, M4A, OPUS, OGG, FLAC, WAV o el original (96–320 kbps). Vídeo: hasta 4K/8K en MP4, MKV o WEBM
- **Descargar solo un tramo** (p. ej. 1:20–3:45, con deslizador), o **dividir por capítulos** en un archivo por capítulo (con título y número de pista)
- **Modo música**: "Artista - Título" limpio (sin "(Official Video)"…), etiqueta de artista y **portada cuadrada**
- **Letras** (opcional): las busca en LRCLIB (gratis, sin cuenta), las incrusta en la canción y, si están sincronizadas, guarda también un **.lrc** al lado
- **Carpetas por artista / álbum** (escritorio): las descargas pueden ir solas a `Artista/Álbum`
- **Descargas programadas** (escritorio): la cola espera hasta la hora que elijas (por ejemplo, de noche); las conversiones siguen
- **Audio y vídeo a la vez**: un clic descarga los dos, cada uno en su formato
- **Nombres de archivo a tu gusto**: plantillas listas («Artista - Título», «Fecha - Título»…) o la tuya con `{title}` `{artist}` `{channel}` `{album}` `{date}` `{year}` `{track}` `{id}`
- **Empezar ya** (escritorio): una descarga en cola arranca al momento, sin esperar turno
- **Iniciar con Windows** (escritorio): en la bandeja, para que las suscripciones y lo programado sigan funcionando
- Portada, metadatos y capítulos; subtítulos en 9 idiomas, dentro del vídeo o como **.srt** aparte; SponsorBlock
- SponsorBlock: quitar los patrocinios **o marcarlos como capítulos** que puedes saltar en cualquier reproductor
- **Perfiles**: guarda tus opciones con un nombre («Música FLAC», «Vídeo para el móvil»…) y elígelas con un clic, también desde la página del móvil
- **Reglas**: «lo de este canal → con este perfil y en esta carpeta»
- **«Ya lo tienes»**: antes de bajar algo otra vez (por el id del vídeo) te pregunta si saltarlo; en las búsquedas y playlists sale marcado
- **Igualar el volumen** (EBU R128, en dos pasadas) para que todo suene igual de fuerte
- **BPM y tonalidad** en las etiquetas (MP3, FLAC, OGG, OPUS), con el código Camelot, para DJs
- **Grabar directos desde el principio** (YouTube), y **parar y guardar** cuando quieras desde la cola
- **Espejo de una playlist** (suscripción): entera, en su carpeta y siempre igual; lo que quiten de la playlist va a la papelera, y un `.m3u8` en su orden
- **Ficha para Jellyfin / Kodi / Plex**: un `.nfo` y la portada junto al vídeo

**Convertir**
- 11 formatos de audio y 12 de vídeo, por lotes, preajustes (WhatsApp, Instagram/TikTok, YouTube, iPhone, podcast, audiolibro…), velocidad, girar, resolución…
- **Quitar la voz (karaoke) o quedarte solo con la voz** (aproximado: va mejor con canciones de estudio en estéreo)
- **Recorte con vista previa y forma de onda**: arrastra los tiradores y escucha el tramo antes de convertir
- **Editor** que ocupa toda la ventana (visor, panel de ajustes y línea de tiempo con miniaturas, forma de onda y zoom): quédate del segundo que quieras al que quieras, corta con la cuchilla (B), marca entrada/salida (I/O), quita o recupera tramos, deshaz/rehaz, avanza fotograma a fotograma y usa atajos de editor (Espacio, J/L, flechas). Exporta con cortes exactos (recodifica, con GPU si hay) o rápidos (copia sin pérdida, ajustados a fotogramas clave)
  - **Quitar silencios** con un clic, **lista de tramos** (saltar, quitar, recuperar), **imán** y ↑/↓ para saltar entre cortes
  - Ajustes del resultado: recorte **vertical 9:16 / cuadrado / 4:5** al centro (con el marco en el visor), **fundidos**, **volumen** o sin sonido, **girar/espejo** y **cada tramo en un archivo aparte**
  - **Textos** (hasta 5, con posición, tamaño y cuándo salen), **logo o marca de agua** en cualquier esquina, **quitar ruido de fondo**, **cámara lenta o rápida por tramo** (0,25×–4×), todo con vista previa en el visor
  - Exporta como **GIF animado**, **sticker de WhatsApp** (WebP animado 512×512) o **sticker de Telegram** (WebM, hasta 3 s)
  - **Subtítulos automáticos** dentro del vídeo (clásicos, o grandes palabra a palabra estilo TikTok con la palabra que se dice resaltada), **música de fondo** que baja sola cuando hablan, **varios formatos a la vez** (9:16 + 1:1 + 16:9, un archivo cada uno), un encuadre que **sigue el movimiento** (o que mueves a mano) y **cortar en cada cambio de plano**
  - **Mejores momentos**: deja solo los tramos más movidos (más volumen, más cambios de plano) para un resumen o un vídeo corto
  - **Textos animados**: aparecer, deslizar, subir o máquina de escribir
  - **Grabar la pantalla** (entera, una ventana o solo un trozo, con el sonido del equipo) directo al Editor
- **Subtítulos** con **Whisper** (whisper.cpp), en tu equipo y sin Internet una vez instalado: un `.srt`, el texto o el vídeo con los subtítulos puestos; 15 idiomas o detectarlo solo, y traducir al inglés
- **Unir** varios audios o vídeos en uno (los clips de otro tamaño se encajan con bandas negras)
- **Comprimir a un tamaño** (p. ej. 8 MB para Discord, 16 MB para WhatsApp): TubeGrab calcula la calidad, en dos pasadas
- **Imagen**: un fotograma en cualquier momento (con deslizador) o la carátula incrustada, en JPG/PNG/WEBP
- **Etiquetas**: cambia título, artista, álbum, artista del álbum, pista, año, género, **BPM, tono** y **carátula** de muchas canciones a la vez (MP3, M4A, FLAC, OGG, OPUS), numera las pistas en orden, saca títulos del nombre del archivo, **detecta BPM y tonalidad**, renombra a "Artista - Título" y añade letras; el audio se copia, nunca se recodifica
- **Rellenar con MusicBrainz**: artista, título, álbum, año, número de pista y la carátula del disco; por cómo suena la canción con una clave gratuita de AcoustID, o si no por su título y artista
- **Carpeta vigilada** (escritorio): cada audio o vídeo que dejes en una carpeta se convierte solo con un preajuste
- **Aceleración por tarjeta gráfica** (NVIDIA NVENC, Intel Quick Sync, AMD AMF) para H.264/H.265, con vuelta automática al procesador

**Cola, historial y app de escritorio**
- Progreso real, velocidad y tiempo restante; **pausar/reanudar** descargas (siguen donde se quedaron), **reordenar** lo que espera, cancelar, reintentar (los errores temporales se reintentan solos una vez); descargas/conversiones a la vez y **límite de velocidad** configurables
- **La cola sobrevive a un reinicio**: lo que no había terminado vuelve a la cola (lo pausado sigue en pausa); **prioridad** por descarga (urgente, normal, cuando haya tiempo)
- **Horario de descargas** (solo de 2:00 a 7:00, por ejemplo) y **tareas que se repiten** («esta playlist cada día a las 3:00»)
- **Historial con búsqueda**: abrir el archivo, mostrarlo en su carpeta o volver a descargarlo con las mismas opciones
- **Biblioteca y reproductor** (escritorio): todo lo de tu carpeta de descargas, con búsqueda, favoritos, estrellas, orden y grupos por carpeta, y una barra de reproducción que sigue sonando al cambiar de página (aleatorio, repetir, teclas multimedia, también vídeos)
  - **Letras sincronizadas** mientras suena la canción (de su `.lrc`), carátula, **ecualizador** con estilos y **fundido entre canciones**
  - **Listas propias** (ordenar, reproducir, guardar como `.m3u8`), **buscar duplicados** (copias exactas y mismo nombre) y mandar los que sobran a la papelera, ordenar por **más escuchado**
  - **Enviar a la tele**: Chromecast y teles o altavoces DLNA/UPnP de tu WiFi (reproducir, pausa, saltar, siguiente)
  - **Mini reproductor**: una ventanita que se queda encima de las demás
  - El mini reproductor **se arrastra a donde quieras** (se abre donde lo dejaste) y tiene silencio y control con el teclado
  - **Tus propios atajos de teclado** (cualquier tecla o combinación; las letras sueltas solo dentro de TubeGrab): reproducir/pausa, siguiente, anterior, parar, subir/bajar volumen, silenciar, ±10 s, mini reproductor, mostrar la app; también con la ventana en segundo plano o en la bandeja; ⏮ ⏯ ⏭ en la **miniatura de la barra de tareas** y en el menú de la bandeja
  - **Vista de carátulas**, **listas inteligentes** (sin escuchar, añadidas este mes, las más escuchadas, escuchadas hace poco, 4–5 estrellas), **buscar por un trozo de la letra**, los **subtítulos .srt** de un vídeo, y **modo radio** (al acabar la lista, canciones parecidas de tu biblioteca)
  - **Enviar una lista entera al móvil** de una vez: un QR, cada archivo o todos en un .zip
  - **Escuchar sin descargar** (app de escritorio), como una app de música: cualquier resultado de Buscar, una playlist de YouTube o **tus playlists de Spotify / Apple Music** suenan directo desde YouTube, sin guardar nada; ⬇ descarga la que te guste
  - Página **Escuchar**: pega el enlace de una playlist de Spotify, Apple Music o YouTube y se queda como una lista tuya (reproducir, aleatorio, añadir a lo que suena, descargar todo, actualizar desde el enlace)
  - Lista **A continuación** (saltar, quitar, guardar como lista), **radio** con la mezcla de canciones parecidas de YouTube, y un **mini reproductor que busca y reproduce** él solo, con volumen, aleatorio, repetir y radio; como **overlay** sobre un juego: transparente, siempre encima, fijo, dejando pasar los clics, compacto, en una esquina
  - **Letra a la par**: se sigue fotograma a fotograma, la línea que se canta se rellena como en un karaoke, y con − / + se ajusta si una versión empieza antes o después (se recuerda por canción)
  - **Last.fm** (scrobbling) y **Discord** («Escuchando…»), con tus propias claves gratuitas
- **Estadísticas**: descargas y conversiones por mes, canales y artistas que más, lo más escuchado y el tamaño de la biblioteca
- **Espacio en disco** (escritorio): aviso cuando queda poco y un límite opcional para la carpeta de descargas (avisar, o mover lo más antiguo a la papelera; nunca los favoritos)
- **Línea de comandos**: `tubegrab "enlace" --mp3` (Ajustes → Sistema instala el comando); también `node cli.js` / `npm run cli` desde el repositorio
- **Enviar al móvil**: un código QR con un enlace en tu WiFi que caduca en 30 minutos, sin cables ni nube
- **Extensión del navegador** (Chrome, Edge, Brave, Opera): un botón en YouTube y «Descargar con TubeGrab» en el menú del botón derecho abren el enlace en la app (ver `extension/README.md`)
- **Copia de seguridad**: exporta ajustes, historial y suscripciones a un archivo e impórtalos en otro PC
- **Copia automática** (app de escritorio) en una carpeta tuya (OneDrive, un disco…) cada día, semana o mes, guardando las 8 últimas; **avisos con botones** («Abrir», «Mostrar en la carpeta»)
- **Control desde el móvil** (escritorio): escaneas un QR y una página en tu WiFi te deja mandar enlaces para que se descarguen en el PC y ver cómo van
- **Avisos en el móvil** (escritorio): un aviso en el móvil, con la app gratuita ntfy, cuando termina (o falla) una tarea larga
- **A tu gusto**: cualquier color de énfasis y tu propia imagen de fondo (con su velo y su desenfoque) o **tres colores tuyos**; una **presentación** corta la primera vez (y en Ajustes → Acerca de)
  - **Estilos rápidos** de un clic (Medianoche, Papel, Neón, Terminal, Bosque, Atardecer, Compacto) y un **código de estilo** para llevar tu aspecto a otro equipo
  - **Tipo de letra** (del sistema, ancha, con remates, monoespaciada, estrecha), texto más grueso, cinco tamaños de texto, **espaciado** (compacto, normal, amplio), **esquinas** (rectas, normales, redondas), contenido centrado o a toda la ventana, barras de desplazamiento finas u ocultas
  - **El menú lateral como quieras**: a la izquierda o a la derecha, solo iconos, normal o ancho, iconos del color de énfasis, de colores o sin color, y **elige qué páginas se ven y en qué orden**
  - **Modo oscuro por horario** (de 20:00 a 7:00, por ejemplo), ocultar la descripción bajo el título o el botón Windows/Mac, y **elegir en qué página se abre la app**
- **Comodidad**: tamaño aproximado antes de descargar, «Reintentar lo que falló», se abre en la página donde lo dejaste, **?** muestra todos los atajos, buscador en Ajustes, **alto contraste** y **reducir animaciones**, menú de la bandeja con «Descargar el enlace copiado», abrir la carpeta, pausar/reanudar todo; la página del móvil sale en su idioma y deja elegir formato y calidad
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

**Hacerla privada:** añade `TUBEGRAB_USERS` con uno o varios pares `usuario:contraseña` separados por comas (ej. `ana:contraseña-larga,luis:otra-distinta`). El navegador pedirá usuario y contraseña antes de mostrar nada; los intentos fallidos se limitan a 30 cada 15 minutos por IP. Las contraseñas necesitan al menos 8 caracteres y no pueden llevar comas; si la variable está mal escrita (sin `:`, contraseña corta, usuario repetido, coma de más) el servidor **no arranca** y explica por qué, en vez de quedar abierto. Úsala solo con HTTPS (Render lo pone) y deja `TRUST_PROXY=true` detrás de un proxy para que el límite de intentos sea por visitante. Sin ella, cualquiera con el enlace puede usar tu instancia, y lo que descarguen a través de ella es responsabilidad tuya. Para quitar a alguien, borra su par y guarda (Render vuelve a desplegar).

## Firma de código

La construcción firma los `.exe` automáticamente si se le da un certificado con las variables de entorno de electron-builder — sin tocar el código:

- **Archivo de certificado** (`.pfx`): define `CSC_LINK` (ruta o base64) y `CSC_KEY_PASSWORD` y ejecuta `npm run build`.
- **Gratis para código abierto:** [SignPath Foundation](https://signpath.org) firma proyectos open source sin coste (se solicita con el repo de GitHub; firman en su CI).
- **Azure Trusted Signing** (coste mensual bajo): configura `win.azureSignOptions` en `package.json` e inicia sesión con la CLI de Azure.

Con la firma desaparece el aviso "Editor desconocido" de SmartScreen (al momento con certificados EV; con los normales, tras ganar algo de reputación).

## Pruebas

```bash
npm test                    # 237 pruebas: opciones, conversiones con ffmpeg real, comprimir/unir/imagen, cola, API, seguridad
TG_NETWORK=1 npm test       # también descargas reales de YouTube
```

## Cookies (opcional)

Para vídeos con restricciones, añade un archivo `cookies.txt` (formato Netscape). App de escritorio: Ajustes → Descargas → Cookies → "Abrir carpeta" (va en `%APPDATA%\tubegrab`). Servidor/Docker: junto a `server.js`, o en la carpeta indicada en `TUBEGRAB_DATA_DIR`.

## Seguridad

Las revisiones de seguridad son asistidas por IA (Claude, Anthropic) y se ejecutan en cambios significativos para detectar riesgos de inyección, configuraciones inseguras y vulnerabilidades en dependencias. Los hallazgos se registran en [`BUGLOG.md`](BUGLOG.md).

**Última revisión:** 2026-10-04 (revisión 16, v3.7.1): escuchar sin descargar y las listas de Spotify revisados con pruebas de ataque (solo los servidores de medios de YouTube, ids y enlaces validados, listas limpiadas, como mucho 3 yt-dlp a la vez). Antes: (revisión 15, v3.5.0) — todo lo nuevo de la 3.5 revisado con pruebas de ataque: los podcasts, las páginas de Spotify/Apple y MusicBrainz solo llegan a direcciones públicas (lo comprueba la propia conexión, también tras redirecciones y con trucos de IPv4 dentro de IPv6, que era el fallo corregido aquí); fpcalc nunca abre lo que se sube (nuestro ffmpeg con lista blanca le prepara un WAV); las canciones importadas son búsquedas de YouTube en texto plano después de `--`; el proxy se valida antes de llegar a yt-dlp; grabar la pantalla solo justo después de elegirla, nunca el micrófono ni la cámara; el secreto de Last.fm nunca llega a la página; el archivo de la cola y las tareas se vuelven a validar al leerlos. Detalles en BUGLOG.md.

**Revisión 13:** 2026-10-01 (v3.3.0) — v3.1–v3.3 revisadas con pruebas de ataque: el control desde el móvil solo en la dirección de la WiFi, para un móvil emparejado por QR, comprobando Host y Origin; las plantillas de nombre solo con nuestras etiquetas (sin `/`, `..`, `%(`…); «Empezar ya» solo en escritorio para que nadie se salte los límites de un servidor compartido; las preferencias manipuladas (color, fondo, plantilla) nunca llegan a la página. Encontrado y corregido al probar: un bucle infinito en el texto del botón de descarga y un tamaño estimado que no se actualizaba. 0 vulnerabilidades conocidas; dependencias al día.

**Revisión 12:** 2026-09-30 (v3.0.1) — todo el código, con hipótesis de ataque probadas en real. Corregido: una copia de seguridad manipulada podía apuntar la carpeta de descargas a una carpeta de red (Windows enviaría el hash NTLM del usuario a ese servidor); ahora solo se aceptan carpetas de un disco local; `tubegrab://` se registra como `"exe" -- "%1"` para que nada detrás del enlace pueda ser una opción de Chromium; enviar al móvil solo escucha en la dirección de la WiFi que anuncia y nunca deja archivos abiertos; las respuestas de letras tienen tope mientras llegan; Electron 44.5.1. 0 vulnerabilidades conocidas.

**Revisión de v2.9.0 → v3.0.0:** 2026-09-30 — cada función nueva se revisó con pruebas de ataque: los textos del Editor se dibujan desde archivos y nunca se interpretan como filtros, logos y carátulas solo admiten imágenes PNG/JPG/WEBP pequeñas, las letras solo vienen de lrclib.net con límites de tamaño y tiempo y se limpian, la biblioteca solo sirve archivos de la carpeta de descargas por id aleatorio (comprobando la ruta real), enviar al móvil solo sirve el archivo compartido en la red local con un enlace que caduca, los enlaces `tubegrab://` solo pueden rellenar un enlace de un sitio compatible y las copias de seguridad se validan campo a campo. Detalles por versión en BUGLOG.md.

**Revisión 11:** 2026-09-29 (v2.8.1) — acceso privado con contraseña, el Editor con línea de tiempo y sus ajustes, con pruebas de ataque nuevas. Corregido: un `TUBEGRAB_USERS` mal escrito dejaba el servidor **abierto** sin avisar (ahora no arranca; contraseñas de 8 caracteres o más, sin usuarios repetidos, y el error nunca muestra una contraseña); exportar desde el Editor con ~200 tramos y todos los ajustes podía superar el límite de 32 767 caracteres de la línea de comandos de Windows (el grafo de filtros va ahora a ffmpeg en un archivo). Probado: valores maliciosos en cada campo del Editor nunca llegan a ffmpeg, nombres como `..\..\evil'.mp4` o `CON.mp4` quedan dentro de la carpeta del trabajo en todos los modos, la lista `concat` del modo rápido solo nombra partes creadas por el servidor, los intentos fallidos se limitan por IP (y después hasta la contraseña buena espera), y todo `innerHTML` de la página usa plantillas fijas o valores escapados. 0 vulnerabilidades conocidas.

**Revisión anterior:** 2026-09-28 (revisión 10, v2.5.0) — se revisó cada función nueva: los nuevos canales IPC solo aceptan ids y booleanos (solo se abren o muestran archivos que la propia app guardó; los nombres de carpeta se sanean); búsqueda, playlists y suscripciones pasan por la misma lista de sitios permitidos (sin extractor genérico); cada archivo de "Unir" pasa la lista blanca de entradas multimedia de ffmpeg y el grafo de filtros solo se construye con números y textos fijos; la versión ligera y la actualización del instalador se verifican por SHA-256; la página solo puede reproducir medios locales `blob:`. También corregido: la detección de enlaces copiados fallaba (el portapapeles de Electron 44 es asíncrono), la versión portable dejaba un acceso roto en el menú Inicio tras las notificaciones, y el analizador de archivos leía mal las resoluciones. 0 vulnerabilidades conocidas; todos los componentes en su última versión. Límite conocido: el .exe aún no está firmado (ver *Firma de código*). Detalles en BUGLOG.md.

¿Encontraste una vulnerabilidad? Abre un issue o contacta directamente.

## Licencia

MIT. Privacidad, condiciones de uso y componentes de terceros: [LEGAL.md](LEGAL.md#español). Descarga solo contenido que tengas derecho a descargar.
