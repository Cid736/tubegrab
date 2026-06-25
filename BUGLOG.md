# Bug Log — TubeGrab (AA)

## 2026-06-25

### [HIGH] exec() con interpolación de string — inyección de shell
- **Archivo:** `server.js`
- **Fix:** Reemplazado `exec(\`cmd /c start...\`)` por `execFile('cmd', ['/c', 'start', url])` para evitar inyección si PORT contiene metacaracteres.

### [HIGH] Open redirect en `/api/proxy-download`
- **Archivo:** `server.js`
- **Fix:** Eliminado el endpoint `/api/proxy-download` (era redundante; el frontend ya llama directamente a `/api/stream`).

### [MEDIUM] Filename sin codificar en cabecera `Content-Disposition`
- **Archivo:** `server.js`
- **Fix:** Cambiado `filename="..."` por `filename*=UTF-8''<encoded>` siguiendo RFC 5987 en ambos modos audio y video.
