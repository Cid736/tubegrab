# Bug Log — TubeGrab (AA)

## 2026-06-25 — Revisión 1

### [HIGH] exec() con interpolación de string — inyección de shell
- **Fix:** Reemplazado `exec()` por `execFile()`.

### [HIGH] Open redirect en `/api/proxy-download`
- **Fix:** Eliminado el endpoint.

### [MEDIUM] Filename sin codificar en `Content-Disposition`
- **Fix:** Cambiado a `filename*=UTF-8''<encoded>` (RFC 5987).

---

## 2026-06-25 — Revisión 2

### [LOW] `/api/stream` no validaba la URL de YouTube
- **Archivo:** `server.js`
- **Fix:** Añadida la misma validación `ytRegex` que en `/api/download` antes de pasar la URL a yt-dlp.

### [LOW] `filename` del query string sin sanitizar en `/api/stream`
- **Archivo:** `server.js`
- **Fix:** El filename del query string se limpia con regex antes de usarse en el header.

---

## 2026-06-25 — Revisión 3

### [LOW] `bitrate` y `quality` pasados a yt-dlp sin validación
- **Archivo:** `server.js` líneas 148, 191
- **Fix:** Allowlist explícita: `quality` en `['360','480','720','1080','1440','2160']`, `bitrate` en `['64','96','128','192','256','320']`. Valores fuera del set se ignoran y se usa el por defecto (`1080` / `128`).
