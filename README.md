<p align="center">
  <a href="#english">🇬🇧 English</a> &nbsp;·&nbsp; <a href="#español">🇪🇸 Español</a>
</p>

---

<a name="english"></a>

# TubeGrab

Local YouTube video and audio downloader. Runs entirely on your machine — no external servers, no trackers, full privacy.

## Features

- Download in **MP4** (up to 1080p) or **MP3** (64–320 kbps)
- Video quality and audio bitrate selection
- 100% local processing using [yt-dlp](https://github.com/yt-dlp/yt-dlp) + ffmpeg
- Cookie support for age-restricted videos
- Available as a portable Windows app (no installation) or via Docker

## Usage

### 1. Node.js (development)

```bash
npm install
npm start
# Open http://localhost:3000
```

### 2. Portable Windows (no installation)

Run `TubeGrab.exe` from the `dist/TubeGrab/` folder — opens the browser automatically.

### 3. Docker

```bash
docker compose up
# Open http://localhost:3000
```

## Structure

```
├── server.js          # Express server + yt-dlp logic
├── electron-main.js   # Electron entry point (optional)
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── Dockerfile
└── docker-compose.yml
```

## Cookies (optional)

For restricted videos, place a `cookies.txt` file (Netscape format) in the project root next to `server.js`.

## Dependencies

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static)
- [Express](https://expressjs.com/)
- [yt-dlp-wrap-extended](https://www.npmjs.com/package/yt-dlp-wrap-extended)

## License

MIT

## Security

Automated security reviews are powered by [Claude](https://claude.ai) (Anthropic AI) and run on every significant change to detect vulnerabilities, insecure patterns and dependency risks. Findings are tracked in `BUGLOG.md`.

Found a vulnerability? Open an issue or contact directly.

---

<a name="español"></a>

# TubeGrab

Descargador local de videos y audio de YouTube. Funciona completamente en tu máquina — sin servidores externos, sin trackers, con privacidad total.

## Características

- Descarga en **MP4** (hasta 1080p) o **MP3** (64–320 kbps)
- Selección de calidad de video y bitrate de audio
- Procesamiento 100% local usando [yt-dlp](https://github.com/yt-dlp/yt-dlp) + ffmpeg
- Compatible con cookies para videos con restricciones de edad
- Disponible como app portable para Windows (sin instalación) o via Docker

## Modos de uso

### 1. Node.js (desarrollo)

```bash
npm install
npm start
# Abre http://localhost:3000
```

### 2. Portable Windows (sin instalación)

Ejecuta `TubeGrab.exe` desde la carpeta `dist/TubeGrab/` — abre el navegador automáticamente.

### 3. Docker

```bash
docker compose up
# Abre http://localhost:3000
```

## Cookies (opcional)

Para videos con restricciones, coloca un archivo `cookies.txt` (formato Netscape) en la raíz del proyecto junto a `server.js`.

## Seguridad

Las revisiones de seguridad automatizadas utilizan [Claude](https://claude.ai) (Anthropic AI) y se ejecutan en cada cambio significativo para detectar vulnerabilidades, patrones inseguros y riesgos en dependencias. Los hallazgos se registran en `BUGLOG.md`.

¿Encontraste una vulnerabilidad? Abre un issue o contacta directamente.
## Licencia

MIT
