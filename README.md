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

## Estructura

```
AA/
├── server.js          # Servidor Express + lógica yt-dlp
├── electron-main.js   # Entrada Electron (opcional)
├── build-launcher.cs  # Launcher C# para distribución portable
├── build-portable.js  # Script para construir la versión portable
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── Dockerfile
└── docker-compose.yml
```

## Cookies (opcional)

Para videos con restricciones, coloca un archivo `cookies.txt` (formato Netscape) en la raíz del proyecto junto a `server.js`.

## Dependencias

- [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static)
- [Express](https://expressjs.com/)
- [yt-dlp-wrap-extended](https://www.npmjs.com/package/yt-dlp-wrap-extended)

## Licencia

MIT
