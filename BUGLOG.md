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

---

## 2026-06-28 — Revisión 4 (Auditoría profesional completa)

### [MEDIA] Servidor escuchando en `0.0.0.0` — expuesto en red local
- **Archivo:** `server.js` línea 269
- **Descripción:** `app.listen(PORT, '0.0.0.0', ...)` hace que el servidor sea accesible desde cualquier dispositivo en la misma red local (LAN/WiFi). Cualquier persona en la red podría usar TubeGrab como downloader remoto, eludiendo el modelo de privacidad "ejecución local".
- **Severidad:** MEDIA
- **Fix:** Cambiado a `'127.0.0.1'` — el servidor solo acepta conexiones desde la misma máquina.

### [BAJA] Race condition en Electron — setTimeout fijo para esperar el servidor
- **Archivo:** `electron-main.js` línea 27-29
- **Descripción:** `setTimeout(() => mainWindow.loadURL(...), 1500)` asume que el servidor Express siempre arranca en menos de 1,5 segundos. En sistemas lentos o con carga alta, la ventana Electron cargaba una página de error en lugar de la app.
- **Severidad:** BAJA (bug de fiabilidad, no de seguridad)
- **Fix:** Reemplazado por `waitForServer()` que hace polling a `http://127.0.0.1:PORT` cada 200 ms (máx. 30 intentos = 6 s) y carga la URL solo cuando el servidor responde.

### Resultado de la auditoría
- No se detectó command injection: la URL se valida con `ytRegex` en ambos endpoints antes de pasarse a yt-dlp; `quality` y `bitrate` están en allowlist; `filename` se sanitiza con regex.
- No se detectó path traversal: los archivos temporales usan `os.tmpdir()` con nombre aleatorio (`Date.now()_random`).
- `helmet` activo, rate limiting activo en `/api/`.
- `execFile` usado para abrir navegador (no `exec`), sin shell injection.

---

## 2026-09-27 — Revisión 5 (auditoría completa + auditoría de dependencias)

### [BAJA] `/api/convert` no valida el tipo de archivo subido antes de pasarlo a ffmpeg
- **Archivo:** `server.js` (`upload = multer({ dest: os.tmpdir(), ... })`)
- **Descripción:** El endpoint acepta cualquier archivo subido y lo pasa directamente a ffmpeg (binario nativo) sin comprobar mimetype/extensión antes. No es una vulnerabilidad demostrada en el código propio, pero es una superficie de ataque innecesaria si el conversor queda expuesto públicamente (p. ej. desplegado en Render): un archivo corrupto a propósito podría intentar explotar algún fallo del propio ffmpeg.
- **Severidad:** BAJA (recomendación de hardening, no exploit confirmado)
- **Estado:** ✅ Aplicado (2026-09-27) — `multer` ahora usa `fileFilter`: rechaza cualquier subida cuyo mimetype no sea `audio/*`/`video/*`, salvo que el mimetype sea genérico (`application/octet-stream`, vacío) **y** la extensión coincida con un formato de audio/vídeo soportado — evita falsos rechazos de archivos reales que algunos navegadores/clientes reportan con mimetype genérico. Probado: un `.txt` se rechaza (400), un `.mp3` real con mimetype genérico se acepta y convierte correctamente.

### [BAJA] La app de escritorio abría también el navegador del sistema
- **Archivo:** `server.js` (auto-open al arrancar), `electron-main.js`
- **Descripción:** El auto-open del navegador (pensado para el build de consola standalone) se activaba también cuando `server.js` corría bifurcado dentro de la app de Electron, abriendo una pestaña del navegador duplicada además de la ventana nativa — no es un fallo de seguridad, pero rompía la experiencia de "app de escritorio".
- **Severidad:** BAJA (UX, no seguridad)
- **Estado:** ✅ Aplicado (2026-09-27) — `electron-main.js` pasa `TUBEGRAB_ELECTRON=1` al bifurcar el servidor; `server.js` solo abre el navegador si esa variable no está presente.

### Resultado de la auditoría de código
Revisión manual completa de `server.js`, `public/app.js` y `electron-main.js` centrada en los vectores típicos:
- **Inyección de comandos:** todas las llamadas a yt-dlp/ffmpeg usan `execFile`/`spawn` con argumentos en array, nunca shell — no hay forma de inyectar flags vía la URL o parámetros.
- **SSRF:** la regex de validación de YouTube exige el dominio seguido inmediatamente de `/`, bloqueando bypasses típicos (`youtube.com.evil.com`, `youtube.com@evil.com`).
- **XSS:** el frontend usa `textContent` para todo dato dinámico (título, autor, duración) y escapa el HTML antes de insertarlo en el historial vía `innerHTML`.
- **Path traversal:** los nombres de archivo (subidos o generados) nunca se usan como ruta real en disco — se generan IDs aleatorios; el nombre original solo llega sanitizado al header `Content-Disposition`.

### Resultado de la auditoría de dependencias (`npm audit`)
21 avisos totales. 20 de 21 vienen de `electron-builder` y su árbol de dependencias transitivas (`tar`, `extract-zip`, `js-yaml`, `xmldom`, etc.) — es una `devDependency` que solo corre al construir el `.exe` localmente, nunca se despliega. Los únicos de producción (`qs`, `body-parser`, vía `express`) son de denegación de servicio (fuera de alcance) o no aplican dado que el código valida los parámetros de query contra allowlists estrictas antes de usarlos. Electron 34.5.8 tiene varios CVEs listados, pero casi todos requieren cargar contenido web de terceros en el renderer — esta app solo carga su propio `localhost` con `nodeIntegration: false` y `contextIsolation: true`, lo que corta la mayoría de esos vectores. Recomendado actualizar Electron cuando sea posible.

---

## 2026-09-27 — Revisión 6 (actualizador integrado + servidor local)

### [ALTA] El actualizador instalaba el `.exe` descargado sin verificar su integridad
- **Archivo:** `electron-main.js` (actualizador, v1.4.0)
- **Descripción:** El `.exe` nuevo se descargaba y se ejecutaba sin comprobar que fuera exactamente el publicado. Una descarga corrupta o cortada a medias (la conexión cae antes de terminar) sustituía igualmente al `.exe` bueno, dejando la app rota, y las redirecciones HTTP se seguían hacia cualquier dominio.
- **Fix:** Se verifica el `sha256` y el tamaño del archivo contra el `digest` que GitHub publica para cada asset de la release; si no coinciden, se descarta y se borra. Si la release no tiene `digest`, no se ofrece la actualización. Las peticiones (incluidas las redirecciones, máx. 5) solo se permiten por HTTPS a `api.github.com`, `github.com`, `objects.githubusercontent.com` y `release-assets.githubusercontent.com`, con timeout de 30 s.
- **Límite conocido:** esto no protege frente a una cuenta de GitHub comprometida (el atacante podría publicar un `.exe` y su `digest`). Solo lo cubriría firmar el `.exe` con un certificado de firma de código.

### [MEDIA] Inyección de comandos en el script de PowerShell de instalación
- **Archivo:** `electron-main.js` (`updater:install`)
- **Descripción:** Las rutas (`PORTABLE_EXECUTABLE_FILE` y la del archivo temporal, que incluía la versión leída de `tag_name` de GitHub) se interpolaban dentro de comillas simples en el texto del script. Una ruta con un apóstrofo (p. ej. `C:\Users\O'Brien\...`) rompía el script, y un `tag_name` manipulado podía inyectar comandos o hacer path traversal en el nombre del archivo temporal.
- **Fix:** Las rutas y el PID se pasan como variables de entorno (`$env:TG_SRC`, etc.) y nunca se interpolan en el script. `tag_name` debe ser estrictamente `X.Y.Z`. La descarga va a un directorio aleatorio (`mkdtemp`) en vez de un nombre predecible en `%TEMP%`. Probado con una ruta que contiene espacios y un apóstrofo. Además, el movimiento se reintenta durante unos 15 s (el lanzador portable mantiene el `.exe` bloqueado un instante) y, si falla, se relanza la versión antigua en lugar de dejar al usuario sin app.

### [MEDIA] `window.updater` expuesto a cualquier contenido que cargue la ventana
- **Archivo:** `electron-main.js`
- **Descripción:** El preload expone `window.updater` a lo que muestre la ventana. Nada impedía que la ventana navegara a otro sitio o abriera ventanas nuevas (que heredan el preload), y el IPC no comprobaba quién llamaba.
- **Fix:** `will-navigate` bloquea cualquier navegación fuera de `http://localhost:PORT/`. `setWindowOpenHandler` deniega las ventanas nuevas y abre los enlaces `https://` en el navegador del sistema. Los handlers IPC `updater:download` y `updater:install` ignoran a cualquier remitente cuyo frame no sea el origen local. Además, se impide lanzar descargas concurrentes.

### [BAJA] Servidor local vulnerable a DNS rebinding y a peticiones cross-site
- **Archivo:** `server.js`
- **Descripción:** Cualquier web que el usuario visitara en su navegador podía lanzar peticiones a `http://localhost:3000` (p. ej. un POST multipart a `/api/convert` o un GET a `/api/stream`, usando las cookies de YouTube de `cookies.txt` si existen). Con DNS rebinding podía además leer las respuestas.
- **Fix:** Si el servidor escucha en `127.0.0.1`, solo responde a peticiones con `Host` `localhost:PORT` o `127.0.0.1:PORT` (403 en otro caso). En `/api/`, cualquier petición con una cabecera `Origin` distinta del propio host se rechaza con 403. Probado: la página y la API funcionan con normalidad; `Host: evil.com`, un POST cross-site y una subida cross-site a `/api/convert` devuelven 403.

### Pendiente (no aplicado)
- Si otro programa ya ocupa el puerto 3000, `waitForServer` recibe su respuesta y la ventana carga ese contenido ajeno. Con los fixes anteriores ese contenido ya no puede usar el actualizador para nada útil. Para eliminar el caso del todo habría que usar un puerto aleatorio o un token compartido entre Electron y el servidor.
- Firmar el `.exe` (ver límite conocido arriba).
- Actualizar Electron 34 (ver revisión 5).

---

## 2026-09-27 — Actualizador: fallos encontrados al probarlo de principio a fin

### [ALTA — funcional] "Reiniciar y actualizar" cerraba la app sin instalar nada (v1.4.0 – v1.5.0)
- **Archivo:** `electron-main.js` (`updater:install`)
- **Descripción:** El script auxiliar se lanzaba como `powershell.exe` desacoplado (`detached: true`). Sin consola, PowerShell 5.1 termina al instante con código 0 sin ejecutar el comando, así que la app se cerraba, el `.exe` no se sustituía y la app no se volvía a abrir.
- **Fix:** El auxiliar se lanza con `cmd /c start "" /min powershell.exe ...`, que le da una consola propia y le permite sobrevivir al cierre de la app. La línea de comandos se pasa literal (`windowsVerbatimArguments`); las rutas siguen yendo por variables de entorno. Probado de principio a fin con el `.exe` empaquetado: una build 1.4.9 detectó la 1.5.0, la descargó, verificó el sha256, se cerró, quedó sustituida por el `.exe` exacto de la 1.5.0 y se relanzó sola.
- **Consecuencia:** las versiones 1.4.0 – 1.5.0 no pueden actualizarse solas. Quien las use tiene que descargar la 1.6.0 manualmente una vez.

### [MEDIA — funcional] El aviso de nueva versión podía perderse
- **Descripción:** El aviso se enviaba a la ventana en cuanto respondía GitHub. Si la página aún no había terminado de cargar, el mensaje se perdía.
- **Fix:** El proceso principal guarda el estado del actualizador y la página lo pide al cargar (`updater:getState`), además de recibir los cambios. La cabecera muestra siempre la versión actual y su estado (`v1.6.0 · Última versión`, `Nueva: vX`, `No se pudo comprobar`); al pulsarla se vuelve a comprobar.
