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

---

## 2026-09-27 — Revisión 7 (v2.0.0: cola de trabajos, multi-sitio, dependencias)

### [ALTA — funcional] Las descargas de YouTube fallaban (HTTP 403)
- **Descripción:** El yt-dlp incluido (2026.03.17) tenía más de 6 meses; YouTube lo bloqueaba con 403. Además, yt-dlp ya necesita un motor de JavaScript para los retos de YouTube.
- **Fix:** yt-dlp actualizado a 2026.08.19. La app de escritorio mantiene una copia en su carpeta de datos que se actualiza sola una vez al día (`yt-dlp -U`) y se puede actualizar a mano desde Ajustes. Como motor JavaScript se usa el propio Node/Electron de la app (ver siguiente punto).

### [ALTA] Electron 34 con vulnerabilidades conocidas (pendiente desde la revisión 5)
- **Fix:** Actualizado a Electron 44.4.5 (Node 24) y electron-builder 26. `sandbox: true` explícito en la ventana.

### [MEDIA] Código JavaScript de YouTube ejecutado por el motor de retos
- **Descripción:** Para resolver los retos de YouTube, yt-dlp ejecuta JavaScript descargado de YouTube en el motor que se le da. Sin aislamiento, ese código tendría acceso completo al equipo.
- **Verificación:** yt-dlp lanza Node con su modelo de permisos (`--permission`) y rechaza versiones sin soporte (<22). Comprobado que Electron 44 actuando como Node lo respeta: con `--permission`, leer `C:\Windows\win.ini` y lanzar procesos devuelve `ERR_ACCESS_DENIED` (sin la opción, ambos están permitidos). Docker pasa a `node:24-slim` por el mismo motivo.

### [ALTA] Dependencias de producción con vulnerabilidades
- **Descripción:** `npm audit --omit=dev`: `ip-address` (alta: bypass de clasificación de IPs/SSRF, vía express-rate-limit), `qs` (moderada: DoS), `body-parser` (baja: límite de tamaño).
- **Fix:** `npm audit fix`. Eliminados paquetes sin uso tras la reescritura (`fluent-ffmpeg`, `node-fetch`, `yt-dlp-wrap-extended`, `open`) y `pkg` (abandonado, escalada de privilegios local sin arreglo; solo servía al antiguo build de consola, que se retira). Resultado: `npm audit` → 0 vulnerabilidades (producción y desarrollo).

### [MEDIA — hardening] ffmpeg podía abrir un "vídeo" que en realidad es una lista HLS/concat
- **Descripción:** Un archivo subido con extensión de vídeo puede ser una lista de reproducción que apunta a otros archivos locales o URLs; es un truco conocido para leer archivos del servidor a través de un conversor.
- **Verificación:** Probado con cargas HLS (`file:///…`), `ffconcat` y HLS con URL de red: el ffmpeg 6.1.1 incluido ya las rechaza por sus valores por defecto ("Invalid data" / "Operation not permitted"), así que no había filtración explotable.
- **Fix (defensa en profundidad):** ffmpeg abre la entrada con `-protocol_whitelist file` y `-format_whitelist` limitado a demuxers multimedia reales, para no depender de los valores por defecto de cada versión. Probado: los 40 archivos de prueba de todos los formatos siguen convirtiéndose; las cargas maliciosas se rechazan.

### [MEDIA — hardening] Configuración local de yt-dlp
- **Descripción:** yt-dlp lee archivos de configuración del usuario (p. ej. `%APPDATA%\yt-dlp\config`), que podrían añadir opciones como `--exec`.
- **Fix:** `--ignore-config` en todas las llamadas.

### [BAJA — DoS] Abuso de la nueva API de trabajos
- **Fix:** Máximo de trabajos por cliente (50 en web / 1000 en escritorio) y en total; máximo de enlaces por petición (20 web / 100 escritorio) y de playlists por petición (3 / 10), porque cada una lanza un yt-dlp de hasta 90 s; máximo 5 conexiones de eventos (SSE) por cliente. Probado: la 6.ª conexión SSE recibe 429.

### [ALTA — despliegue] El contenedor Docker no arrancaba y se ejecutaba como root
- **Descripción:** El Dockerfile solo copiaba `server.js` y `public/` (faltaba `lib/`), usaba Node 20 y corría como root.
- **Fix:** Copia `lib/`, `node:24-slim`, `USER node` y `FFMPEG_BIN=/usr/bin/ffmpeg` (el ffmpeg del sistema trae ffprobe).

### [MEDIA — funcional] Faltaba ffprobe (portada en MKV y SponsorBlock fallaban)
- **Fix:** `scripts/fetch-ffprobe.js` descarga el ffprobe 6.1.1 de la misma release que el ffmpeg de ffmpeg-static y solo lo acepta si su SHA-256 coincide con el fijado en el código.

### Resultado de la auditoría del código nuevo
- **SSRF / sitios:** solo URLs http(s) sin credenciales ni puerto, de una lista de dominios; extractor genérico desactivado (`--ies default,-generic`); `--` antes de la URL. Probado: `file://`, `127.0.0.1` y dominios ajenos se rechazan.
- **Aislamiento de trabajos:** cada navegador/app usa un id aleatorio de 128 bits; otro id recibe 404 al pedir un archivo ajeno (probado). Los archivos solo se sirven si están dentro del directorio del propio trabajo.
- **Escritorio:** guardado automático solo para URLs de la API de trabajos; "Mostrar en carpeta" solo abre rutas que la propia app guardó (el renderer nunca envía rutas); nombres de archivo saneados y sin sobrescribir.
- **XSS:** todo dato remoto (títulos, nombres de archivo, errores) se inserta con `textContent`.
- **Límite conocido:** el `.exe` sigue sin firma de código.

---

## 2026-09-27 — Revisión 8 (v2.2.0: personalización + actualización de componentes)

### [ALTA] ffmpeg/ffprobe 6.1.1 (enero de 2024) desactualizado
- **Descripción:** ffmpeg procesa entradas no fiables (archivos subidos para convertir y medios descargados). La versión incluida vía `ffmpeg-static` tenía más de dos años y medio de parches de seguridad pendientes en sus demuxers/decoders.
- **Fix:** `scripts/fetch-ffmpeg.js` instala ffmpeg + ffprobe **9.0.2** (build "essentials" de gyan.dev publicada en GitHub) en `bin/`, verificando el zip contra una huella SHA-256 fijada (coincide con el digest que publica GitHub). El servidor usa esa copia y el binario viejo de `ffmpeg-static` se excluye del `.exe`, así que ya no se distribuye. Sustituye a `fetch-ffprobe.js`.
- **Verificado:** los 23 formatos de salida, velocidad + rotación + recorte y los 40 archivos de entrada de prueba se convierten; descargas con portada en MKV, subtítulos y SponsorBlock funcionan; las cargas HLS/`ffconcat`/`subfile` maliciosas siguen rechazadas.

### [MEDIA] Electron concedía cualquier permiso que pidiera la página
- **Descripción:** Sin `setPermissionRequestHandler`, Electron concede automáticamente cámara, micrófono, ubicación, etc. (punto de la lista de seguridad oficial de Electron).
- **Fix:** Solo se permiten `notifications` y el portapapeles, y solo al origen local de la app; todo lo demás se deniega. También se bloquea la creación de `<webview>`. Probado: cámara, micrófono y ubicación → denegados; notificaciones y lectura del portapapeles → permitidos; `<webview>` no se crea.

### [BAJA — revisión del código nuevo] Personalización
- Las preferencias (tema, color, fondo, vidrio, tamaño) se guardan en `localStorage` y acaban en atributos/CSS; `theme-init.js` valida cada valor contra una lista cerrada antes de aplicarlo. Probado con valores manipulados (incluido HTML inyectado): se descartan y vuelven a los valores por defecto. Las "últimas opciones" recordadas solo se restauran si coinciden con una opción existente del formulario.
- El IPC nuevo (`appearance:theme`, `window:control`) solo acepta llamadas del origen local y solo valores de una lista fija.

### Resto de la revisión
- `npm audit` → 0 vulnerabilidades. `helmet` 8.3.0 y `express-rate-limit` 8.7.0 actualizados. Electron 44.4.5 y yt-dlp 2026.08.19 ya estaban en su última versión.
- **Límite conocido (sin cambios):** el `.exe` no está firmado. Además, el "fuse" `RunAsNode` de Electron no se puede desactivar porque la app lo usa para ejecutar su servidor y como motor JavaScript aislado de yt-dlp.

---

## 2026-09-27 — Revisión 9 (v2.4.0: pruebas completas, errores funcionales y seguridad)

Se añadió una batería de pruebas automáticas (`npm test`, 77 pruebas con el ejecutor de Node, sin dependencias nuevas; `TG_NETWORK=1` activa las descargas reales). Encontró varios de los fallos de abajo.

### [ALTA — seguridad] La ventana cargaba cualquier programa que respondiera en el puerto 3000
- **Descripción:** La app de escritorio esperaba a que *algo* respondiera en `localhost:3000` y cargaba esa página, que además recibía el puente de la app (`window.desktop`, `window.updater`) porque el origen coincidía. Otro programa en ese puerto (un servidor de desarrollo, u otro proceso local malicioso) se mostraba dentro de TubeGrab con acceso al puente. Como "localhost" también resuelve a IPv6, bastaba con ocupar `[::1]:3000` aunque nuestro servidor arrancara bien en `127.0.0.1:3000` (reproducido: la página ajena se cargó con `window.desktop` disponible).
- **Fix:** La ventana solo se carga cuando el **propio proceso hijo** confirma por IPC que escucha en ese puerto. El servidor reserva el puerto en `127.0.0.1` **y** en `::1`; si alguno está ocupado lo comunica y la app elige un puerto libre y lo guarda (el origen sigue siendo estable en los siguientes arranques). Probado con un servidor ajeno en `127.0.0.1:3000` y en `[::1]:3000`: la app arranca en otro puerto y nunca muestra la página ajena.

### [MEDIA — seguridad] Guardado de archivos con cualquier extensión
- **Fix (defensa en profundidad):** Lo que la app escribe en la carpeta de descargas solo puede tener una extensión multimedia conocida (si no, se añade `.bin`, así que nunca aparece un `.exe`/`.lnk`/`.bat`), y los nombres de dispositivo de Windows (`CON`, `NUL`, `COM1`…) se evitan. Código en `lib/filenames.js`, con pruebas.

### [MEDIA — seguridad] Docker usaba el ffmpeg viejo de ffmpeg-static y dependencias sin fijar
- **Descripción:** El Dockerfile definía `FFMPEG_BIN=/usr/bin/ffmpeg`, pero el servidor nunca leía esa variable: la versión web usaba el ffmpeg 6.1.1 de `ffmpeg-static` (el que se retiró en la revisión 8) y sin ffprobe. Además `package-lock.json` estaba en `.gitignore`, así que cada imagen resolvía versiones nuevas sin control, y yt-dlp se descargaba sin verificar.
- **Fix:** El servidor respeta `FFMPEG_BIN`; la imagen pasa a Debian 13 (`node:24-trixie-slim`, ffmpeg 7.1 mantenido por Debian, con ffprobe). `package-lock.json` se versiona y la imagen usa `npm ci`. yt-dlp (Docker y `postinstall` en Linux) solo se instala si su SHA-256 coincide con el publicado. Se quitó `python3-pip`, que no hacía falta. Probado construyendo y ejecutando la imagen: descargas, conversión y las cargas maliciosas rechazadas.

### [BAJA — seguridad] Sin límite global de procesos yt-dlp para vista previa y playlists
- **Fix:** Máximo de consultas simultáneas (8 vistas previas y 4 lecturas de playlist en la web; 4 y 3 en escritorio); el resto recibe 429. El límite por IP no acotaba el total.

### [ALTA — funcional] Descargas con tildes, ñ o "/" en el título fallaban al final
- **Descripción:** En Windows yt-dlp escribe por la tubería en la página de códigos ANSI: "Canción" llegaba como "Canci�n" y "IF/ELSE" (en disco "IF⧸ELSE") como "IFELSE". La ruta impresa no existía, así que la descarga se completaba pero el trabajo acababa en "La descarga falló", y los títulos se veían corruptos.
- **Fix:** `--encoding utf-8` en todas las llamadas a yt-dlp, y como red de seguridad se toma el único archivo terminado de la carpeta del trabajo. Prueba real con el vídeo que fallaba.

### [MEDIA — funcional] Nombres de archivo subidos con tildes se corrompían
- **Descripción:** multer leía el nombre como latin1: "Mi canción.wav" → "Mi canciÃ³n.mp3". **Fix:** `defParamCharset: 'utf8'`.

### [MEDIA — funcional] Con el puerto ocupado, el servidor decía "corriendo" y se caía
- **Descripción:** En Express 5 `app.listen` también llama a su callback cuando falla. **Fix:** el callback comprueba el error.

### [BAJA — funcional] Otros
- Abrir el `.exe` dos veces lanzaba una segunda copia que peleaba por el puerto: ahora se trae al frente la ventana abierta.
- Cada proceso usa su propia carpeta temporal (antes una segunda copia borraba los archivos de la primera); las subidas también van ahí y se limpian si la app se cierra a mitad.
- Un nombre subido como `CON.wav` no se podía crear en Windows.
- "cookies.txt junto a la app" no servía en el `.exe` portable (se descomprime en una carpeta temporal nueva en cada arranque): ahora va en la carpeta de datos, con botón en Ajustes → General → Cookies.
- Varios errores de yt-dlp salían en inglés ("This video is unavailable", Vimeo "logged-in"); el filtro de "privado" era demasiado amplio.
- El `.exe` incluía archivos que no usa (Dockerfile, README, scripts antiguos `build-portable.js` y `build-launcher.cs`, que se eliminan): ahora solo se empaqueta lo necesario.

### Mejoras
- **Reintentar:** botón en las descargas fallidas o canceladas, y un reintento automático tras errores temporales (p. ej. 403 de YouTube al bajar varias a la vez). En una playlist de 20 vídeos los fallos pasaron de 3 a 1 (el restante ahora también se resuelve con el arreglo de codificación).
- **Arrastrar y soltar** en cualquier parte de la ventana: archivos → Convertir, enlaces → Descargar.
- **Atajos:** Ctrl+1/2/3 (Descargar, Convertir, Recientes) y Ctrl+, (Ajustes).

### Resto de la revisión
- `npm audit` → 0 vulnerabilidades; Electron 44.4.5, express 5.2.1, multer 2.4.0, helmet 8.3.0, express-rate-limit 8.7.0, yt-dlp 2026.08.19 y ffmpeg 9.0.2: todos en su última versión.
- Pruebas de seguridad automatizadas: Host (DNS rebinding), Origin, id de cliente, ids de trabajo manipulados, salida de `public/`, URLs no permitidas (incluida `169.254.169.254`), JSON enorme/roto, subidas no multimedia, formatos `__proto__`, recortes inyectados, límite de conexiones SSE, privacidad entre clientes, HLS/`ffconcat`/`subfile`/ffmetadata maliciosos y preferencias manipuladas.
- **Límite conocido (sin cambios):** el `.exe` no está firmado; el fuse `RunAsNode` sigue siendo necesario.

---

## 2026-09-27 — v2.4.1: "No se pudo comprobar" en otro equipo

### [MEDIA — funcional] El buscador de actualizaciones fallaba en algunos equipos
- **Descripción:** El actualizador usaba el cliente HTTPS de Node, que **no usa el almacén de certificados de Windows ni el proxy del sistema**. En equipos con antivirus que inspecciona HTTPS (Avast, ESET, Kaspersky…) o redes corporativas, la conexión con GitHub se rechazaba aunque el navegador funcionara. Además solo se comprobaba una vez al arrancar, y el motivo solo se veía al pasar el ratón.
- **Fix:** Las peticiones pasan por la pila de red de Chromium (`electron.net`): certificados de Windows y proxy del sistema, como el navegador. Se sigue comprobando **cada** redirección contra la lista de hosts de GitHub y se mantiene la verificación SHA-256 del `.exe`. Mensajes claros (sin conexión, fecha/hora incorrecta, antivirus/red, proxy, límite de GitHub), reintento automático a los 10 minutos tras un error y comprobación cada 6 horas. Ajustes → Actualizaciones muestra la versión, el estado y el motivo del error, con botón para reintentar.
- **Verificado:** con una build de prueba 2.3.9, detecta la 2.4.0, la descarga (170 MB, con la redirección al CDN de GitHub) y la huella SHA-256 coincide; con un proxy roto muestra "No se pudo conectar a través del proxy" y programa el reintento.

---

## 2026-09-28 — Revisión 10 (v2.5.0: barra lateral plana, 21 funciones nuevas y su revisión)

Nuevas funciones: playlist a elegir, tramo antes de descargar, dividir por capítulos, modo música, suscripciones, búsqueda, subtítulos .srt y 9 idiomas, unir, comprimir a un tamaño, imagen/carátula, recorte con forma de onda, aceleración por GPU, detección de enlaces copiados, bandeja del sistema, historial con búsqueda/abrir/volver a descargar, cola con pausa y prioridades, límite de velocidad, inglés, instalador, versión ligera y preparación para firmar. La barra lateral muestra todas las páginas a la vista, sin desplegables (Ajustes usa pestañas). Añadidos LEGAL.md (privacidad y condiciones de uso, enlazado desde Ajustes → Acerca de) y nombres accesibles (`aria-label`) en los campos de enlace, búsqueda, suscripciones e historial.

### [MEDIA — funcional] La detección de enlaces copiados provocaba un error del proceso principal
- **Descripción:** En Electron 44 `clipboard.readText()` devuelve una Promise, no texto: `text.trim is not a function` salía en un diálogo cada 1,5 s (lo vio el usuario durante las pruebas).
- **Fix:** Se espera la Promise; cualquier fallo al leer el portapapeles (bloqueado por otra app, contenido no textual) cuenta como "nada nuevo" y nunca lanza. Probado: solo ofrece enlaces de sitios compatibles (ignora texto normal y dominios no permitidos), sin errores.

### [BAJA — funcional] La versión portable dejaba un acceso roto en el menú Inicio
- **Descripción:** Para mostrar notificaciones, Windows/Electron crea un acceso "TubeGrab Pro" en el menú Inicio que apunta a la copia temporal del `.exe` portable; al cerrar la app queda roto (ocurría desde que hay notificaciones).
- **Fix:** La portable borra su acceso al cerrarse y, al arrancar, los accesos rotos de sesiones anteriores. Solo toca accesos a un "TubeGrab Pro.exe" dentro de la carpeta temporal, nunca el del instalador.

### [BAJA — funcional] El analizador de archivos no leía la resolución
- **Descripción:** Al quitar etiquetas de códec tipo `0x31637661`, también quitaba el "0x720" de "1280x720". "Unir" usaba 16:9 a 720p en vez del tamaño del primer vídeo. **Fix:** solo se quitan etiquetas completas (`\b0x…\b`). Con prueba.

### [BAJA — funcional] Otros encontrados al probar
- Música: el título conservaba "(Official Video)" (la expresión distinguía mayúsculas) y el nombre de archivo perdía el artista. Tramo de audio: empezaba en el fotograma clave anterior (25 s en vez de 15); ahora el corte es exacto. Capítulos: cada archivo llevaba el título del vídeo entero; ahora título, pista (1/10…) y álbum propios.
- Versión ligera: la GPU se detectaba antes de que ffmpeg estuviera descargado y se quedaba en "sin GPU"; ahora se reintenta.
- "Reanudar todo" no respetaba el orden de la cola. Nombres de carpeta: "AC/DC" pasaba a "DC"; ahora "AC_DC".
- README: `%APPDATA%\tubegrab` salía con un tabulador en lugar de "\t".

### Revisión de seguridad de lo nuevo
- **IPC nuevo** (`openSaved`, `savedExists`, `setOptions`, `components:retry`, `saveJob` con varios archivos): solo acepta ids de trabajo y booleanos. Abrir/mostrar solo funciona con rutas que la propia app guardó (registro en `saved.json`); el nombre de subcarpeta se sanea a un único nombre (nunca una ruta; nombres de dispositivo de Windows evitados) y lo guardado sigue limitado a extensiones multimedia, subtítulos e imágenes.
- **Búsqueda, playlists y suscripciones:** la búsqueda es un único argumento `ytsearch15:<texto>` tras `--` (máx. 200 caracteres); los resultados, las entradas de playlist y los enlaces de suscripción pasan por la lista de sitios permitidos, con el extractor genérico desactivado. Suscripciones solo en escritorio, por cliente, máx. 100, con el mismo límite de procesos simultáneos.
- **Unir / comprimir / imagen:** cada archivo subido pasa por el filtro de tipos y por la lista blanca de demuxers/protocolos de ffmpeg (probado otra vez con HLS/concat/subfile). El grafo de filtros de "Unir" solo contiene números calculados y textos fijos; tamaño objetivo, momento y formatos se validan contra listas o rangos. Máx. 50 archivos (10 en la web).
- **GPU:** los codificadores se eligen de una tabla fija tras una prueba de 1 fotograma; si fallan, se repite con el procesador.
- **Versión ligera e instalador:** ffmpeg se descarga con huella SHA-256 fijada y yt-dlp contra las sumas publicadas en su release, por la pila de red de Chromium y solo desde hosts de GitHub; la actualización del instalador usa el `.exe` verificado por SHA-256 igual que la portable. Instalador por usuario (sin permisos de administrador).
- **Página:** CSP añade solo `media-src 'self' blob:` (vista previa local del recorte). Las preferencias nuevas (idioma, límite de velocidad) se validan contra listas cerradas; los ajustes de servidor (concurrencia, GPU) solo se pueden cambiar desde la app de escritorio y se acotan (1–6 descargas, 1–4 conversiones).
- **Portapapeles:** desactivado por defecto; solo se lee mientras la app está abierta y nada sale del equipo.
- `npm audit` → 0 vulnerabilidades; Electron, express, multer, helmet, express-rate-limit, yt-dlp y ffmpeg en su última versión. 93 pruebas automáticas (incluidas las nuevas de seguridad). **Límite conocido:** el `.exe` aún no está firmado; la construcción ya firma sola si se aporta un certificado (ver README).

---

## 2026-09-28 — v2.5.1: instancia web privada

### [MEDIUM] Una instancia desplegada (Render/Docker) era pública para cualquiera con el enlace
- **Riesgo:** desconocidos podían usar el servidor para descargar contenido, y la responsabilidad legal y el consumo recaían en quien lo despliega.
- **Fix:** nueva variable `TUBEGRAB_USERS="usuario:contraseña,…"` → autenticación HTTP Basic en todas las peticiones (página y API), comparación de tiempo constante (hash SHA-256 + `timingSafeEqual`, también para usuarios inexistentes) y límite de 30 intentos fallidos por IP cada 15 minutos. Sin la variable, todo sigue igual; la app de escritorio la ignora. Al arrancar sin ella y fuera de localhost, el servidor avisa en el registro. `render.yaml` la declara con `sync: false` (se rellena en el panel, nunca en git). Pruebas nuevas en `test/server.test.js`.

---

## 2026-09-29 — v2.6.0: Editor con línea de tiempo

Nueva página **Convertir → Editor**: visor, línea de tiempo con miniaturas y forma de onda, zoom, cabezal, cortes (B), entrada/salida (I/O), quitar/recuperar tramos, deshacer/rehacer, "del segundo X al Y" (quedarse con o quitar) y atajos tipo editor de vídeo. Exporta con cortes exactos (filtros `trim`/`atrim` + `concat`, GPU con respaldo a CPU) o rápidos (copia de flujos por tramo y demuxer `concat`).

### Revisión de seguridad
- **`/api/jobs/edit`:** los tramos llegan como JSON y se validan en `parseSegments`: máx. 200 pares de números finitos, 0 ≤ inicio < fin ≤ 24 h, ordenados y fusionados; en el grafo de filtros solo entran números formateados con `toFixed(3)`. Formato de destino de una lista cerrada (o "original", que se traduce con una tabla fija por extensión); el modo rápido solo con "original".
- **Modo rápido:** la lista del demuxer `concat` la escribe el servidor, con nombres propios (`partN.ext`) junto a la lista, sin `-safe 0` (el modo seguro del demuxer rechaza cualquier otra ruta) y con `-protocol_whitelist file`. La entrada subida sigue pasando por la lista blanca de demuxers/protocolos. Las partes temporales se borran al terminar.
- **Página:** la previsualización usa `blob:` locales (ya permitido por la CSP) y el archivo no sale del equipo hasta pulsar Exportar. Pruebas nuevas en `test/convert.test.js` y `test/server.test.js` (100 en total).

---

## 2026-09-29 — v2.7.0: Editor más completo

Nuevo en el Editor: **quitar silencios** (se calcula en el navegador con la forma de onda ya decodificada; se puede deshacer), **lista de tramos**, **imán** y saltos entre cortes (↑/↓), y **ajustes del resultado**: formato de pantalla 9:16 / 1:1 / 4:5 / 16:9 (recorte al centro, con marco en el visor), fundidos de entrada y salida, volumen o sin sonido, girar/espejo y cada tramo en un archivo aparte (también con cortes rápidos).

### Revisión de seguridad
- Los ajustes nuevos solo aceptan valores de listas fijas (`parseEditEffects`: fundidos 0,5/1/2 s, volúmenes, cuatro proporciones y la tabla `ROTATIONS` ya existente); cualquier otro valor se ignora. Al grafo de filtros solo llegan números calculados en el servidor. Pedir ajustes con cortes rápidos se rechaza (400).
- "Cada tramo aparte" usa nombres generados por el servidor (`<nombre> (tramo N)`), sin nada del cliente salvo el nombre del archivo ya saneado. Pruebas nuevas: 9:16 + fundidos + silencio, cuadrado girado, archivos por separado (exacto y rápido) y valores maliciosos.

---

## 2026-09-29 — v2.8.0: Editor a pantalla completa

- El Editor ocupa todo el ancho de la ventana: visor grande con un panel de ajustes a la derecha (Recortar · Ajustes del resultado · Exportar) y, debajo, herramientas y una línea de tiempo más alta con etiquetas de pista (V1/A1). La altura del visor se adapta a la de la ventana; por debajo de ~900 px de ancho todo pasa a una columna (container queries).
- El resto de páginas ya no se quedan en 680/820 px: crecen con la ventana hasta 1200/1280 px.
- Tiempos en tipografía monoespaciada y más grandes (regla, contador, lista de tramos) para que se lean bien en pantallas con escalado.
- Sin cambios en el servidor ni en lo que se exporta.

---

## 2026-09-29 — Revisión 11 (v2.8.1): acceso privado y Editor

Alcance: todo lo añadido desde la revisión 10 — `lib/auth.js` (acceso con contraseña), `/api/jobs/edit` y `runEdit` (modos exacto y rápido, ajustes, archivos por separado), y el código del Editor en la página. Método: lectura del código, hipótesis de ataque comprobadas con el servidor y ffmpeg reales, y pruebas automáticas nuevas para cada una.

### [HIGH] Un `TUBEGRAB_USERS` mal escrito dejaba la instancia abierta sin avisar
- **Archivos:** `lib/auth.js`, `server.js`
- **Reproducción:** `TUBEGRAB_USERS=solousuario` (o `ana:`, `:clave`, `" , "`) → el servidor arrancaba y respondía `200` a cualquiera. Quien creía tener la web privada la tenía pública (y responde de lo que otros descarguen con ella).
- **Fix:** falla cerrado. `parseUsers` devuelve los problemas de cada entrada (falta `:`, usuario vacío, contraseña de menos de 8 caracteres, usuario repetido, entrada vacía/coma de más) y, si la variable está puesta y hay alguno, el servidor no arranca (código 1) y explica qué corregir. El mensaje nunca incluye contraseñas. Sin la variable (o vacía) todo sigue como antes; la app de escritorio la ignora.
- **Además:** aviso al arrancar si hay contraseña, el servidor escucha fuera de localhost y falta `TRUST_PROXY` (detrás de un proxy todos compartirían la IP del proxy y un atacante bloquearía a todos). README: usar solo con HTTPS y las contraseñas no pueden llevar comas.

### [LOW] Exportar con muchos tramos y todos los ajustes podía superar el límite de la línea de comandos de Windows
- **Archivo:** `lib/convert.js` (`editArgs`/`runEdit`)
- **Reproducción:** 200 tramos + 9:16 + fundidos + volumen + girar con una ruta larga → orden de 32 236 caracteres (límite de Windows: 32 767); con algo más fallaba al lanzar ffmpeg.
- **Fix:** el grafo de filtros se escribe en `graph.txt` dentro de la carpeta del trabajo y se pasa con `-/filter_complex` (ffmpeg ≥ 7; la app usa 9.0.2 y la imagen Docker 7.1); se borra al terminar. La orden queda en ~2 000 caracteres con cualquier número de tramos.
- **Verificado en la imagen Docker (2026-09-30, ffmpeg 7.1.5, configurada como en Render con `TRUST_PROXY` y `TUBEGRAB_USERS`):** sin contraseña → 401, con contraseña → 200; tres exportaciones reales por la API — 3 tramos 9:16 con fundidos y volumen (404×720, 8,00 s), 200 tramos 1:1 girado y sin sonido en MKV (720×720, 19,97 s) y cortes rápidos en archivos separados (2 archivos); y con `TUBEGRAB_USERS=solousuario` el contenedor no arranca y explica el error.

### Comprobado sin hallazgos (con pruebas nuevas)
- **Login:** solo pasa el par exacto usuario/contraseña (mayúsculas, espacios, base64 roto, sin `:`, 100 KB de basura, `__proto__`/`constructor` como usuario → rechazados); comparación en tiempo constante; tras 30 fallos por IP en 15 min, `429` incluso con la contraseña buena; la API y el flujo de eventos también piden login.
- **Editor, valores maliciosos:** `aspect`, `fade`, `volume`, `rotate`, `quality`, `audioBitrate` con `drawtext`, `movie=`, `;`, `[x]` o rutas nunca llegan a los argumentos de ffmpeg (solo listas fijas); el grafo solo contiene números, nombres de filtro fijos y etiquetas propias.
- **Nombres de archivo:** `..\..\..\Windows\evil'.mp4`, `../../etc/cron.d/x".mp4`, `it's a "test" <b>.mp4` y `CON.mp4`, en los cuatro modos (exacto, rápido, y ambos con "cada tramo aparte") → todo se crea dentro de la carpeta del trabajo, con nombres saneados y sin restos temporales. La lista del demuxer `concat` solo contiene `partN.ext` creados por el servidor, así que una comilla en el nombre subido no la puede romper.
- **Página:** los 18 `innerHTML` de `app.js` usan plantillas fijas o `escapeHtml`; títulos y nombres de archivo que vienen del servidor van por `textContent`.
- **Dependencias:** `npm audit` → 0 vulnerabilidades.
- Pruebas nuevas: `test/auth.test.js` (5), y en `test/server.test.js` y `test/convert.test.js` (arranque con variable rota, límite de intentos, valores maliciosos, 200 tramos, nombres hostiles).

---

## 2026-09-30 — v2.9.0: Editor — texto, logo, ruido, velocidad, GIF y stickers

Nuevo: textos sobre el vídeo (hasta 5; posición, tamaño y desde/hasta sobre el vídeo original, que el servidor traslada a la línea de tiempo del resultado teniendo en cuenta cortes y velocidad), logo o marca de agua (esquina, tamaño, opacidad), quitar ruido de fondo (`highpass` + `afftdn`), velocidad por tramo (0,25×–4×, con `setpts`/`atempo`; la vista previa usa `playbackRate`) y exportar como GIF (paleta propia), sticker de WhatsApp (WebP animado 512×512) o de Telegram (VP9 WebM, 512 px, ≤ 3 s). Todo se previsualiza en el visor.

### Revisión de seguridad
- **Texto del usuario:** nunca entra en el grafo de filtros. Cada texto se escribe en su propio archivo (`textN.txt`) y `drawtext` lo lee con `textfile=` y `expansion=none`, así que ni `%{…}` ni comillas, `:`, `;`, `,` o `[x]` se interpretan. Se eliminan caracteres de control; máx. 5 textos de 200 caracteres y 3 líneas; posición y tamaño de listas fijas. Probado con `50% %{pts} ' : \ , ; [x] drawtext=textfile=/etc/passwd` → se dibuja tal cual.
- **Logo:** campo de subida aparte que solo acepta `image/png|jpeg|webp` con extensión `.png/.jpg/.jpeg/.webp` (SVG, vídeos disfrazados o `.exe` → 400), máx. 5 MB, y ffmpeg lo abre solo con los demuxers `png_pipe,jpeg_pipe,webp_pipe` y el protocolo `file`. Un logo corrupto hace fallar el trabajo sin más. Posición, tamaño y opacidad de listas fijas.
- **Archivos auxiliares** (grafo, textos y una copia de la fuente): se crean dentro de la carpeta del trabajo con nombres fijos, ffmpeg se ejecuta con esa carpeta como directorio de trabajo (así las rutas del grafo no llevan `C:` ni nada del usuario) y se borran al terminar, también si falla.
- **Velocidad:** solo valores de la lista; dos tramos solapados con velocidades distintas → 400. Velocidad, texto, logo y ruido con cortes rápidos → 400.
- **CSP:** `img-src` añade `blob:` para la vista previa del logo (URLs creadas por la propia página a partir del archivo elegido); `script-src`/`default-src` siguen sin `blob:` (probado).
- **Docker:** se añade `fonts-dejavu-core` para dibujar texto; en Windows se usa Arial Negrita del sistema.
- Pruebas nuevas: `test/editor.test.js` (validación, texto hostil, texto visible solo en su tramo, logo en su esquina, velocidad 2×/0,25×/mixta, ruido, GIF y stickers), API del editor en `test/server.test.js` (SVG, vídeo como PNG, extensión falsa, logo > 5 MB, textos inválidos, ajustes con cortes rápidos) y `test/i18n.test.js` (sin claves repetidas y el Editor traducido entero; encontró una clave repetida antigua, `Formato`, ya quitada).

---

## 2026-09-30 — v2.10.0: música — etiquetas, carpetas, letras y descargas programadas

Nuevo: página **Etiquetas** (editar en lote título, artista, álbum, artista del álbum, pista, disco, año, género, carátula y letra; numerar; título desde el nombre; renombrar «Artista - Título»; buscar letras), **carpetas automáticas** por artista / artista y álbum (escritorio), **letras** de LRCLIB al descargar audio (incrustadas + `.lrc` sincronizado) y **descargas programadas** (la cola de descargas espera hasta una hora; escritorio).

### Revisión de seguridad
- **LRCLIB (nuevo servicio externo):** solo `https://lrclib.net`, sin seguir redirecciones, 10 s de límite y 512 KB máximo de respuesta; solo se envían artista, título, álbum y duración, y solo si el usuario activa las letras. Lo que vuelve se limpia (sin caracteres de control, máx. 20 000 caracteres) y el `.lrc` solo contiene líneas `[mm:ss.xx] texto`, así que una respuesta rara no puede escribir otra cosa. Añadido a LEGAL.md. Probado con un servidor falso: respuestas gigantes, 500, JSON roto, códigos de escape ANSI, instrumental, y que la petición va con nuestro User-Agent y `redirect: 'error'`.
- **Metadatos de yt-dlp (`TGMETA`):** solo 8 campos conocidos, como texto corto sin caracteres de control o números; lo demás se descarta.
- **Carpetas por artista/álbum:** los nombres vienen de internet, así que el proceso principal los convierte con `safeFolderName` en un único nombre de carpeta (nunca una ruta: `AC/DC` → `AC_DC`, `..`, `CON`…); la página solo manda texto y la opción se elige de una lista cerrada (`none`/`artist`/`artist-album`).
- **`.lrc` en la carpeta del usuario:** se añade `lrc` (texto) a la lista de extensiones que se pueden guardar; antes se habría guardado como `.lrc.bin`. Una canción y su `.lrc` se guardan juntas, no en una subcarpeta.
- **Etiquetas:** solo MP3/M4A/FLAC/OGG/OPUS; una entrada por archivo; campos conocidos; texto sin caracteres de control (máx. 300; letra 20 000); pista `3` o `3/12`, año `2024[-MM[-DD]]`. Los valores van a ffmpeg como argumentos `-metadata clave=valor` (sin shell); probado que `= ; # \` y saltos de línea se escriben y se leen tal cual en los cuatro formatos. La carátula es un campo aparte (PNG/JPG/WEBP, máx. 5 MB, demuxers de imagen) y solo en MP3/M4A/FLAC. `/api/tags/read` borra los archivos subidos en cuanto responde. Los nombres de salida siguen saneados (`../../evil.mp3`, `CON.flac` → probados).
- **Descargas programadas:** solo en la app de escritorio (en una instancia web compartida un visitante podría parar la cola de todos → 404). La hora solo se acepta como `hh:mm` exacto; como mucho 24 h por delante; afecta solo a las descargas.
- Pruebas nuevas: `test/music.test.js` (13), cola programada en `test/jobs.test.js`, API de etiquetas y programación en `test/server.test.js`, y `test/i18n.test.js` ampliado a Etiquetas, Cola, Ajustes → Descargas y el formulario de descarga (encontró cadenas sin traducir, ya traducidas). Además, una descarga real con yt-dlp + letras (LRCLIB simulado): MP3 con la letra incrustada y `.lrc` al lado.

---

## 2026-09-30 — v3.0.0: biblioteca, reproductor, enviar al móvil, extensión y copia de seguridad

Nuevo: **Biblioteca** con reproductor (escritorio), **Enviar al móvil** con QR, **extensión del navegador** (Chrome/Edge/Brave/Opera, MV3) y **copia de seguridad** (ajustes, historial y suscripciones).

### Revisión de seguridad
- **Biblioteca:** la carpeta sale de los ajustes de la app, nunca de una petición. El escaneo no sigue enlaces simbólicos, no entra en carpetas ocultas, se limita a 5 niveles y 5 000 archivos multimedia. La página solo conoce identificadores HMAC aleatorios por ejecución; al servir, se comprueba con `realpath` que el archivo real sigue dentro de la carpeta (un id manipulado hacia `../` o un enlace hacia fuera → 404). Se sirve con `sendFile` (Range para poder saltar), `no-store` y `nosniff`, y solo al identificador de cliente de la app. En una instancia web todas estas rutas dan 404.
- **Enviar al móvil:** servidor HTTP aparte en la red local que solo responde a `GET/HEAD /s/<token>` y `/s/<token>/file` (token de 128 bits, 30 min, máx. 20); nada más de la app es accesible desde ahí (probado: `/`, `/api/jobs`, tokens falsos, `../../etc/passwd` → 404; `POST` → 405). La página del móvil escapa el nombre del archivo y lleva `default-src 'none'`. Solo direcciones IPv4 privadas; si no hay red local, error claro y no se abre nada. El servidor se cierra cuando no queda nada compartido. LEGAL.md explica que no conviene usarlo en WiFi públicas.
- **Extensión y `tubegrab://`:** cualquier web podría abrir un enlace así (el navegador pregunta), por eso `lib/protocol.js` solo acepta exactamente `tubegrab://download?url=<enlace de un sitio compatible>` (≤ 4 KB) y la app solo rellena la casilla de descarga: nunca descarga sola. Probado con sitios no permitidos, `file:///`, `javascript:`, otras rutas y enlaces enormes. La extensión solo pide el permiso `contextMenus`; su botón en YouTube vive en un shadow root cerrado. Se registra `tubegrab://` para el usuario (HKCU) solo en la app empaquetada.
- **Copia de seguridad:** al importar, las preferencias pasan por el mismo saneador de siempre, el historial se valida campo a campo (id de 32 hex, textos acotados, `source` solo `http(s)`), las suscripciones se recrean a través del servidor (que las valida como nuevas) y la carpeta de descargas solo se aplica si existe en este PC. El archivo se lee/escribe con diálogos nativos (máx. 5 MB) y no incluye `cookies.txt`. Probado en la app real con una copia hostil (HTML en el idioma, `javascript:` en el historial, sitio no permitido, carpeta inexistente, opción falsa): todo descartado.
- **Mostrar en la carpeta:** el proceso principal solo muestra un archivo multimedia cuyo `realpath` esté dentro de la carpeta de descargas.
- **Pruebas:** `test/library.test.js` (escaneo, resolución, red local, servidor de compartir, enlaces `tubegrab://`), API de la biblioteca en modo escritorio en `test/server.test.js`, `test/i18n.test.js` ampliado (Biblioteca, Sistema, reproductor y diálogo). Además, la app de escritorio real arrancada con datos aislados (`TUBEGRAB_USER_DATA`, nuevo, solo para pruebas) y controlada por CDP: biblioteca, reproducción, QR con la IP local real, copia hostil y un segundo arranque con `tubegrab://`.

---

## 2026-09-30 — Revisión 12 (v3.0.1)

Alcance: todo el código actual (servidor, proceso principal de Electron, página, extensión y dependencias), con hipótesis de ataque comprobadas en real antes de corregir. `npm audit` → 0 vulnerabilidades.

### [MEDIUM] Una copia de seguridad manipulada podía apuntar la carpeta de descargas a un servidor de red
- **Archivos:** `electron-main.js`, `server.js`, `lib/filenames.js`
- **Reproducción:** `path.isAbsolute()` acepta `\servidor\carpeta`, `//servidor/carpeta` y rutas de dispositivo (`\?\…`, `\.\PhysicalDrive0`). Al importar una copia con `downloadDir` así, la app hacía `stat` sobre esa ruta: Windows se conecta por SMB y envía el hash NTLM del usuario al servidor del atacante, y las descargas acabarían guardándose allí.
- **Fix:** `isLocalFolderPath()` solo acepta rutas de un disco local (`C:\…`; `/…` fuera de Windows), sin `\`, `//` ni rutas de dispositivo. Se exige al importar la carpeta, al cargar `settings.json` (una copia ya importada vuelve a la carpeta por defecto) y en el servidor al leer la carpeta de la biblioteca.

### [MEDIUM] `tubegrab://`: opciones de Chromium detrás del enlace se aplicaban
- **Archivo:** `electron-main.js`
- **Reproducción:** arrancando la app con `tubegrab://download?url=x --gpu-launcher=…`, Chromium intentó usar ese lanzador (el ataque clásico de protocolos en Electron, CVE-2018-1000006). Desde un navegador no es explotable en la práctica porque las URL llevan comillas y espacios codificados y no pueden salir de `"%1"`, pero otro programa que lance el enlace sin codificar sí podría.
- **Fix:** el protocolo se registra como `"exe" -- "%1"`: tras `--` Chromium ya no lee opciones. Comprobado: con `--` delante, la opción inyectada se ignora y el enlace sigue llegando a la app. Las instalaciones de la 3.0.0 se vuelven a registrar solas al arrancar.

### [LOW] Enviar al móvil escuchaba en todas las interfaces y podía dejar archivos abiertos
- **Archivo:** `lib/library.js`
- **Reproducción:** el servidor de compartir escuchaba en `0.0.0.0` (también en VPN o adaptadores públicos) aunque solo anuncia la IP de la WiFi; una petición `HEAD` abría el archivo sin cerrarlo, y una descarga cortada a medias lo dejaba abierto (repetido, agota descriptores).
- **Fix:** escucha solo en la dirección privada que va en el QR (si cambia la red, se reinicia y los enlaces viejos caducan), máx. 32 conexiones; `HEAD` responde sin abrir el archivo y la descarga usa `stream.pipeline`, que lo cierra pase lo que pase. Probado: por `127.0.0.1` ya no responde; tras cortar una descarga el archivo se puede borrar en Windows (no queda abierto).

### [LOW] Letras: la respuesta se leía entera antes de comprobar el tamaño
- **Archivo:** `lib/lyrics.js`
- **Fix:** se lee por trozos y se corta en 512 KB aunque falte o mienta la longitud. Probado con una respuesta infinita.

### Otros
- **Electron 44.4.5 → 44.5.1** (parche de seguridad de Chromium).
- La pantalla completa del reproductor no funcionaba (el permiso `fullscreen` estaba bloqueado): se permite solo a la propia página de la app.

### Comprobado sin hallazgos
- Subidas rechazadas a media petición (vídeo grande + logo no válido, repetido): multer borra lo subido; prueba permanente añadida.
- Ventana: `nodeIntegration: false`, `contextIsolation`, `sandbox`, navegación y ventanas nuevas bloqueadas; todas las IPC comprueban el remitente.
- Rutas nuevas de la API dentro de la protección de origen, límites de peticiones y (en web) del acceso con contraseña; la biblioteca y compartir no existen en la versión web.
- Extensión: solo permiso `contextMenus`, sin `externally_connectable`, botón en shadow root cerrado.
- Pruebas nuevas: validador de carpetas, comprobaciones estáticas del proceso principal (registro con `--`, carpeta local, aislamiento de la ventana), servidor de compartir (dirección, `HEAD`, descarga cortada, cambio de red), letras sin fin, subida rechazada. 174 pruebas.

---

## 2026-09-30 — v3.1.0: control desde el móvil, avisos, aspecto propio y presentación

Nuevo: **control desde el móvil** (página en la WiFi para mandar descargas al PC), **avisos en el móvil** con ntfy, **color de énfasis y fondo propios**, y **presentación** de primer uso.

### Revisión de seguridad
- **Control desde el móvil (`lib/remote.js`):** no es el servidor de la app expuesto a la red, sino uno aparte con tres rutas (`/pair/<código>`, `/`, `POST /add`), solo en la dirección privada de la WiFi y sin JavaScript en la página (CSP `default-src 'none'`, `form-action 'self'`). Emparejar exige el código de 256 bits del QR (máx. 10 fallos por minuto e IP); después, una cookie `HttpOnly; SameSite=Strict` derivada del código (cambiar el código desconecta todos los móviles). Se rechaza cualquier `Host` que no sea exactamente esa dirección (contra DNS rebinding), un `Origin` ajeno, otro tipo de contenido y cuerpos de más de 16 KB. Los enlaces pasan por la misma API de descargas y sus comprobaciones (lista de sitios, límites) que los de la app. La página nunca muestra lo que envía el móvil: los mensajes son fijos y los títulos se escapan. El enlace secreto solo viaja dentro del QR (la API de la app no lo devuelve en texto). Solo en escritorio.
- **Avisos (ntfy):** desde el proceso principal, publicación JSON (UTF-8) a un servidor `https://` sin credenciales ni rutas (por defecto `ntfy.sh`), sin seguir redirecciones, 10 s de límite y máx. 30 avisos por hora; solo título y nombre del archivo. Canal aleatorio de 96 bits; LEGAL.md explica que quien lo conozca puede leer los avisos.
- **Aspecto propio:** el color solo se acepta como `#rrggbb`; la imagen la reduce la propia página a un JPEG y solo se aplica si es exactamente `data:image/jpeg;base64,…` (≤ 3 MB), así que nada arbitrario llega al CSS (probado con inyecciones de CSS, SVG, URLs y comillas).
- Pruebas nuevas: `test/remote.test.js` (emparejar, cookie, formulario, Host ajeno, Origin ajeno, 415, cuerpo enorme, fuerza bruta, cambio de código, persistencia), integración de escritorio en `test/server.test.js`, `test/prefs.test.js` (color y fondo manipulados) e `i18n` ampliado. En la app real: presentación, color e imagen propios, aviso real recibido en ntfy.sh y QR de control.

---

## 2026-10-01 — v3.2.0: comodidad y accesibilidad

Nuevo: tamaño estimado antes de descargar, «Reintentar lo que falló», se reabre en la última página, ayuda de atajos (**?**), buscador en Ajustes, alto contraste y reducir animaciones (también si Windows lo pide), menú de la bandeja con acciones rápidas, y la página del móvil en el idioma del móvil con formato y calidad a elegir.

### Revisión de seguridad
- **Tamaño estimado:** `/api/info` añade `sizes`, calculado solo con números de la lista de formatos de yt-dlp (alturas 1–4320, tamaños positivos < 1 TB); cualquier otro dato se ignora (probado con alturas `<script>`, negativas y enormes).
- **Última página:** se guarda solo el nombre de la vista y al abrir solo se acepta si es una de las conocidas; las de escritorio siguen sin abrirse en la web.
- **Buscador de Ajustes:** busca en el texto que ya muestra la página y pinta los resultados con `textContent`.
- **Accesibilidad:** dos preferencias booleanas más en el mismo saneador (probadas con valores manipulados).
- **Bandeja:** «Descargar el enlace copiado» lee el portapapeles solo al pulsarlo y solo acepta enlaces de sitios compatibles (misma función que la detección de enlaces copiados); la descarga pasa por la API normal.
- **Página del móvil:** formato y calidad solo de listas fijas (y la API los vuelve a validar); el idioma se elige entre dos textos fijos según `Accept-Language`, nunca se refleja nada de la petición (probado).
- 182 pruebas.

---

## 2026-10-01 — Revisión 13 (v3.3.0): audio y vídeo a la vez, nombres, «Empezar ya», favoritos, orden, iniciar con Windows

Nuevo: descargar audio y vídeo a la vez; plantillas de nombre de archivo; «Empezar ya» en la cola; favoritos y estrellas en la biblioteca (guardados por ruta en `library.json`); ordenar y agrupar por carpeta; iniciar con Windows en la bandeja (`--hidden`).

### [MEDIUM] «Empezar ya» se saltaba los límites de un servidor compartido
- **Riesgo:** en una instancia web pública, un visitante podía marcar sus 50 trabajos como «empezar ya» y arrancarlos todos a la vez, por encima del límite de descargas simultáneas que protege el servidor.
- **Fix:** la ruta `/api/jobs/:id/now` solo existe en la app de escritorio (404 en web) y el botón solo aparece allí. Prueba añadida.

### [LOW] Marcar favoritos/estrellas escribía en disco sin límite de peticiones
- **Fix:** límite de peticiones como el resto de acciones (además de ser solo escritorio y exigir el id de cliente).

### Plantillas de nombre (revisado sin hallazgos)
- Solo etiquetas de una lista fija, traducidas a campos de yt-dlp en el servidor; el texto fijo solo admite letras, números, espacios y `- _ . , ( ) [ ] ! & ' + # @`; sin `/`, `\`, `:`, `%`, `{…}` desconocidas; no puede empezar por punto ni contener `..`; máx. 120 caracteres y debe incluir `{title}` o `{id}`. La preferencia también se valida en la página. El archivo resultante sigue comprobándose dentro de la carpeta del trabajo. Probado con yt-dlp real.

### Otros (revisado sin hallazgos)
- Favoritos: solo ids del último escaneo, `fav` booleano y estrellas 0–5; el archivo `library.json` se limpia al leerlo (probado manipulado) y tiene tope de 20 000 entradas.
- Iniciar con Windows: se registra para el usuario con un argumento fijo (`--hidden`) y solo en la app empaquetada.
- Audio y vídeo a la vez: dos peticiones normales a la API (mismos límites y validaciones).
- Encontrado al probar en la app real: el texto del botón entraba en recursión infinita con «Audio y vídeo a la vez» en modo Audio (corregido), y el tamaño estimado no se recalculaba al cambiar de modo (corregido).
- `npm audit` → 0 vulnerabilidades; dependencias en su última versión. 187 pruebas.

### Pasada general de seguridad (tras la v3.3.0)
- **Código:** sin `eval`/`new Function`, sin comandos con shell (todos los `exec` son expresiones regulares), sin HTML construido con datos sin escapar, `openExternal` solo para `https://`, `openPath` solo con carpetas de la app o validadas, y ningún registro imprime contraseñas, cookies ni tokens.
- **Repositorio:** ningún archivo privado versionado (cookies, ajustes, códigos de emparejamiento, certificados) ni claves o contraseñas reales en el historial. `.gitignore` ahora excluye también `cookies.txt`, certificados (`*.pfx`, `*.p12`, `*.pem`), `settings.json` y `remote.json` por si acabaran en la carpeta del proyecto.
- **Riesgos que quedan (documentados, por diseño):** enviar al móvil, el control desde el móvil y el acceso con contraseña de la web usan HTTP dentro de la red local (quien esté en la misma WiFi podría ver el tráfico: usarlos solo en redes de confianza; la web pública en Render va por HTTPS); el canal de ntfy.sh lo puede leer quien conozca su nombre (es largo y aleatorio); el `.exe` no está firmado.

---

## 2026-10-03 — v3.4.0: subtítulos con Whisper, perfiles, tele, listas, estadísticas y mucho más

Nuevo: subtítulos automáticos (whisper.cpp) en una página propia y en el Editor; en el Editor, música de fondo que baja sola cuando hablan, varios formatos a la vez, encuadre que sigue el movimiento (o a mano) y cortar en escenas; perfiles de descarga y reglas por canal; aviso de «ya lo tienes»; igualar el volumen; BPM y tonalidad; grabar directos desde el principio con «Parar y guardar»; espejo de playlists con `.m3u8`; ficha `.nfo` + póster para Jellyfin/Kodi/Plex; en la biblioteca, letras sincronizadas, carátula, ecualizador con fundido entre canciones, listas propias, duplicados, más escuchado, enviar a la tele (Chromecast/DLNA) y mini reproductor; estadísticas; carpeta vigilada; límite de espacio en disco; y línea de comandos (`tubegrab`).

### Revisión de seguridad
- **Whisper:** el motor (whisper.cpp `b5130`) y los tres modelos se descargan solo de GitHub y Hugging Face (y su CDN), con cada salto de redirección comprobado, y se aceptan solo si su SHA-256 coincide con el fijado en el código (y el tamaño, en los modelos). Del zip solo se copian `whisper-cli.exe`, `whisper.dll` y las `ggml*.dll`. whisper-cli solo recibe un WAV que hacemos nosotros y nombres de archivo nuestros dentro de la carpeta del trabajo.
- **Subtítulos quemados:** el `.ass` lo escribimos nosotros; de las palabras se quitan `{`, `}` y `\` para que nada de lo transcrito pueda convertirse en códigos de estilo (probado con `{\an8}`). El filtro usa nombres fijos dentro de la carpeta del trabajo (nada que escapar).
- **Editor:** música, encuadre y subtítulos solo con valores de listas fijas; los puntos del encuadre se validan (máx. 300, tiempo y posición numéricos) y la expresión de `crop` se genera solo con números (probado que no contiene sintaxis de filtros). La música entra con la misma lista blanca de formatos que cualquier subida.
- **Enviar a la tele:** solo se habla con direcciones de red privada (10/8, 172.16/12, 192.168/16); la descripción DLNA tiene que venir del mismo equipo que respondió y su `controlURL` también; respuestas con tope de 256 KB y tiempo límite; el XML se lee con expresiones concretas (sin intérprete XML, sin entidades externas). El archivo se sirve con un token aleatorio de 4 h en el mismo servidor de red local de «Enviar al móvil», ahora con `Range` para poder saltar (probado: 206, `-N`, 416 y que un enlace de tele no abre la página del móvil). Chromecast usa TLS con certificado propio de Google sin verificar (no hay otra forma con la app por defecto): solo hacia direcciones de la red local que respondieron como Chromecast.
- **Carpeta vigilada:** la carpeta solo se elige en el diálogo de la app (la página no puede mandar una ruta); solo archivos de primer nivel, de audio/vídeo, sin enlaces, ≤ 4 GB y cuando dejan de crecer; el original nunca se borra (moverlo a «Convertidos» es opcional y solo dentro de esa carpeta). Las opciones se validan como en «Convertir».
- **Espejo de playlists:** los archivos de un espejo se llaman `Título [id]` dentro de una carpeta propia; solo se mandan a la papelera (recuperables) archivos multimedia de esa carpeta cuyo id ya no está en la lista, y nunca más de la mitad de una vez (una lista vacía o cortada no puede vaciarla).
- **Espacio en disco:** lo que se mueve va a la papelera; nunca favoritos, 4–5 estrellas ni nada de la última semana.
- **Duplicados:** se comparan tamaño + primeros y últimos 256 KB; borrar es mandar a la papelera, y solo archivos multimedia de la carpeta de descargas (ruta real comprobada).
- **Mini reproductor:** misma página de la app, sin navegación ni ventanas nuevas; los botones solo se aceptan de esa ventana y el estado solo de la principal (la carátula, solo con la ruta exacta de nuestra API).
- **Línea de comandos:** el enlace pasa por la misma lista blanca de sitios; las opciones salen de una lista fija. El comando `tubegrab.cmd` se escribe en la carpeta `WindowsApps` del usuario (ya en el PATH) y se niega si la ruta de la app contiene comillas o `%`.
- **Perfiles, reglas, «ya lo tienes» y listas:** cada opción de un perfil pasa por la misma validación que una descarga; carpetas de las reglas reducidas a un solo nombre (probado con `../../Windows`); todos con topes de tamaño y limpiados al leer el archivo (probado manipulado). En una instancia web van solo en memoria y por visitante (probado que otro visitante no ve los perfiles).
- **Ficha `.nfo`:** XML escapado (probado con `<script>`, comillas y `&`); de los metadatos de yt-dlp solo se aceptan ids `[\w-]`, extractores `\w` y enlaces de sitios soportados.
- **Directos:** «Parar y guardar» une solo los trozos que hay en la carpeta del trabajo, con la misma lista blanca de formatos de entrada.
- **Encontrado al probar en la app real:** los botones nuevos del reproductor se montaban sobre los controles con la ventana estrecha (corregido); la línea de comandos tomaba una opción desconocida con guion como si fuera un enlace (ahora la rechaza).
- `npm audit` → 0 vulnerabilidades. 210 pruebas.

---

## 2026-10-03 — Revisión 14 (v3.4.1): vista previa en Buscar y repaso de seguridad

Nuevo: en Buscar y en la lista de una playlist, al pasar el ratón por la miniatura sale una vista previa sin sonido, y ▶ / ⏸ abre el vídeo con sonido debajo del resultado. Usa el reproductor de YouTube en su dominio sin cookies (`youtube-nocookie.com`), dentro de un `iframe` con `sandbox` (sin ventanas emergentes ni navegar la página), y la CSP solo deja enmarcar ese dominio (`frame-src`). El reproductor no recibe la API de la app (el puente de Electron solo existe en la ventana principal) y la página nunca escucha sus mensajes.

### [MEDIUM] Línea de comandos: un enlace `tubegrab://` podía leerse como orden de descarga
- **Riesgo:** el registro de `tubegrab://` lanza la app como `TubeGrab.exe -- "<enlace>"`. La lectura de `--download` miraba todos los argumentos, también los de después de `--`; si un navegador llegara a partir el enlace en varios argumentos, una página web podría poner una descarga en la cola sin que la pidieras.
- **Fix:** solo se leen las opciones propias **antes** de `--`; todo lo que venga detrás (el enlace de una web) solo rellena la caja de Descargar, como antes.

### [MEDIUM] Límite de espacio: podía mandar a la papelera archivos que no eran de TubeGrab
- **Riesgo:** al pasar el límite de la carpeta, se elegían los archivos más antiguos de cualquier tipo «guardable», incluidos `.jpg`, `.txt` o listas que el usuario hubiera puesto ahí.
- **Fix:** solo audio y vídeo (además de lo que ya se excluía: favoritos, 4–5 estrellas y la última semana).

### [LOW] Carpeta vigilada: las opciones se guardaban tal cual llegaban
- **Fix:** solo hasta 20 valores de texto cortos (letras, números, `. : _ -`) y siempre con un formato de destino; el resto se descarta al guardarlas y al leerlas del archivo (probado con objetos anidados, textos largos y `;`).

### [LOW] Carátulas de la biblioteca: sin tope de procesos a la vez
- **Fix:** como mucho dos ffmpeg sacando carátulas a la vez (el resto espera su turno); siguen cacheadas.

### [LOW] Otros endurecimientos
- Listas `.m3u8`: cada entrada en una sola línea pase lo que pase con el nombre del archivo.
- Editor: el idioma de los subtítulos automáticos se valida ya al leer la petición (antes solo al lanzar Whisper).

### Revisado sin hallazgos
HTML construido en la página (todo con `textContent` o escapado), procesos (ninguno con shell), rutas que manda la página (siempre por id o comprobadas dentro de la carpeta de descargas), teles (solo red local, mismo equipo que respondió), servidor de red local (tokens aleatorios, `Range` acotado), descargas de Whisper (SHA-256 fijado). `npm audit` → 0 vulnerabilidades. 211 pruebas.

---

## 2026-10-04 — Revisión 15 (v3.5.0): Spotify/Apple, podcasts, MusicBrainz, cola que sobrevive, atajos y más

Nuevo en la 3.5.0: Buscar con las mismas opciones que Descargar y copiar enlaces; importar listas de Spotify y Apple Music; podcasts por RSS; solo la miniatura; SponsorBlock como capítulos; proxy; quitar la voz o quedarse con ella; Mejores momentos, textos animados y grabar la pantalla en el Editor; MusicBrainz/AcoustID en Etiquetas; la cola se guarda y vuelve tras un reinicio, con prioridades, horario de descargas y tareas que se repiten; en la Biblioteca, carátulas, listas inteligentes, búsqueda por letra, subtítulos .srt, modo radio y enviar una lista entera al móvil (página + .zip); atajos de teclado propios (también en segundo plano), botones en la miniatura de la barra de tareas, mini reproductor que se arrastra y recuerda su sitio; Last.fm y Discord; avisos con botones; copia de seguridad automática.

### [MEDIUM] Conexiones a Internet: una dirección IPv6 podía esconder una IPv4 de la red local
- **Riesgo:** los podcasts, las páginas de Spotify/Apple y MusicBrainz se piden desde el propio equipo. La comprobación de «solo direcciones públicas» reconocía `::ffff:127.0.0.1`, pero no la misma dirección escrita en hexadecimal (`::ffff:7f00:1`), ni `::7f00:1` o `2002:7f00:1::` (6to4). Un feed o un servidor DNS podía así apuntar a este equipo o al router.
- **Fix:** las direcciones IPv6 se leen palabra por palabra; cualquier IPv4 dentro de una IPv6 (mapeada, compatible, 6to4 o NAT64) se comprueba como IPv4, y además se rechazan las locales únicas, de enlace y multicast. La comprobación la hace la conexión misma (consulta DNS propia), también tras cada redirección (probado).

### [MEDIUM] fpcalc (AcoustID) abría directamente el archivo subido
- **Riesgo:** fpcalc lleva su propio FFmpeg sin la lista blanca de formatos de TubeGrab: un archivo disfrazado (por ejemplo una lista HLS con extensión `.mp3`) podría hacerle leer otros archivos o pedir direcciones de red.
- **Fix:** fpcalc nunca ve la subida: el ffmpeg de TubeGrab (solo formatos multimedia reales y solo archivos locales) saca los dos primeros minutos a un WAV, y fpcalc lee ese WAV (que se borra al terminar). La duración que se manda a AcoustID es la de la canción entera.

### [LOW] MusicBrainz: la cola de peticiones no tenía tope
- **Fix:** como mucho 40 búsquedas esperando su turno (una por segundo, como pide MusicBrainz); el resto recibe «ocupado» en vez de acumularse sin fin en una instancia compartida.

### [LOW] Grabar la pantalla: Electron pedía el permiso `media`
- **Fix:** solo se concede si no pide ni micrófono ni cámara, viene de la página de la app y el usuario acaba de elegir una pantalla o ventana (vale 30 s y una sola vez; probado que una segunda petición sin elegir se rechaza). El sonido del equipo solo con una pantalla entera.

### Revisado sin hallazgos
- **Importar:** solo se leen páginas fijas de `open.spotify.com` y `music.apple.com` (id validado, sin seguir otros dominios); cada canción llega a yt-dlp como `ytsearch1:Artista - Título` en texto plano, sin saltos de línea, detrás de `--`, nunca como playlist.
- **Podcasts:** feed y episodios por la conexión de solo direcciones públicas, con topes de tamaño (feed 15 MB, episodio 2 GB, portada 8 MB); títulos limpiados antes de ser nombres de archivo o carpeta; etiquetas y capítulos en `ffmetadata` escapado (probado con `= ; # \` y saltos de línea); la portada entra en ffmpeg solo como imagen.
- **Cola que sobrevive:** al leer `queue.json` cada trabajo vuelve a pasar por las mismas comprobaciones que una petición (probado con entradas manipuladas: sitio no soportado, `file://`, cliente falso).
- **Proxy:** solo `http(s)://` o `socks4/5://` con servidor y puerto, sin espacios; validado al guardarlo y otra vez antes de yt-dlp (probado con `--exec`, saltos de línea y puertos imposibles). En una instancia web ni se puede cambiar ni se muestra.
- **Enviar una lista al móvil:** solo archivos de la biblioteca por id; la página escapa nombres y título; los nombres dentro del .zip se limpian (sin carpetas ni `..`); enlace con token aleatorio que caduca en 1 h.
- **Subtítulos y letras de la biblioteca:** solo archivos junto al vídeo con su mismo nombre, ≤ 2 MB, servidos como `text/vtt` con `nosniff`.
- **Atajos, Last.fm, Discord, copia automática:** combinaciones de teclas de una lista fija; el secreto y la sesión de Last.fm nunca llegan a la página; a Discord solo título, artista y tiempo, y solo si se activa; la copia automática solo escribe y borra archivos `TubeGrab-copia-AAAA-MM-DD.json` en la carpeta elegida en el diálogo.
- **Encontrado al probar en la app real:** las grabaciones de pantalla no traen su duración y el Editor no las abría (ahora se busca la duración, en la página y en ffmpeg); MusicBrainz descartaba canciones cuyo vídeo era más corto que la versión del disco; el mini reproductor no recordaba dónde lo dejaste.
- `npm audit --omit=dev` (lo que va dentro de la app) → 0 vulnerabilidades. `npm audit` completo avisa de `http-cache-semantics` (aviso nuevo, GHSA-ch52-4w7c-c8xp), que solo usa electron-builder para descargar Electron al **construir** el .exe; no tiene versión corregida y no va dentro de la app. 224 pruebas.

---

## 2026-10-04 — v3.5.1: la barra del reproductor se descolocaba

### [UI] Barra del reproductor apretada y título cortado
- **Síntoma:** con la ventana a media anchura (la barra lateral ocupa parte), el reproductor seguía en tres columnas: el título se cortaba («DJ TUFF - Mig…»), la barra de tiempo quedaba diminuta y los botones de la derecha, amontonados.
- **Causa:** la barra decidía su forma por el ancho de la **ventana**, no por el suyo.
- **Fix:** se coloca según su propio ancho (`@container`): ancha, en una fila; mediana, título y herramientas arriba y controles con la barra de tiempo abajo, a lo ancho; estrecha, en una columna. Con la ventana estrecha (la página entera se desplaza) el reproductor queda pegado abajo y no se pierde al final. Probado a 1300, 1100, 1000, 700 y 560 px.

---

## 2026-10-04 — v3.6.0: la interfaz, a gusto de cada uno

### [UI] Casi todo el aspecto se puede cambiar (Ajustes → Apariencia)
- **Nuevo:** tipo de letra, texto más grueso, cinco tamaños, espaciado, esquinas, ancho del contenido, barras de desplazamiento; menú lateral a la izquierda o a la derecha, solo iconos / normal / ancho, color de sus iconos, qué páginas se ven y en qué orden; modo oscuro por horario; fondo con tres colores propios; velo y desenfoque para la imagen propia; descripción bajo el título y botón Windows/Mac opcionales; página de inicio; estilos rápidos; código de estilo para copiar el aspecto.
- **Cómo:** todo sigue pasando por `theme-init.js` antes de pintar: cada valor se comprueba contra una lista fija (o un rango de números enteros, `#rrggbb`, `HH:MM`, o páginas conocidas sin repetir) y acaba como atributo en `<html>`; las reglas viven en `custom.css`, encima de las dos interfaces. Ocultar todas las páginas del menú no se puede (vuelven todas).
- **Código de estilo:** solo lleva las claves del aspecto (nunca la carpeta, el límite de velocidad, la plantilla de nombres ni tu imagen) y al pegarlo pasa por las mismas comprobaciones; probado con valores con CSS inyectado, `__proto__` y claves ajenas.
- **Encontrado al probarlo en la app:** con «Muy grande» en una ventana pequeña, los cuatro temas y los cinco tamaños no cabían y aparecía desplazamiento horizontal; ahora los grupos de botones bajan de línea. Probado en Windows y Mac, en español e inglés, con cada estilo rápido, menú a la derecha, solo iconos y la imagen desenfocada. 230 pruebas.

---

## 2026-10-04 — v3.7.0: escuchar sin descargar, tus listas de Spotify y la letra a la par

### [Nuevo] Escuchar sin descargar (app de escritorio)
- **Qué:** cualquier vídeo de YouTube suena en el reproductor sin guardarse: desde Buscar, una playlist, el mini reproductor (que ahora busca y reproduce solo y enseña lo que viene) o la nueva página **Escuchar**, donde se guardan las playlists de Spotify, Apple Music o YouTube pegando su enlace. Cada canción de Spotify se busca en YouTube cuando le toca (la de la misma duración, mejor la subida «- Topic», para que la letra cuadre) y el vídeo encontrado se recuerda en la lista. Radio con la mezcla de YouTube; lista «A continuación».
- **Seguridad:** el servidor solo reenvía el sonido desde los servidores de medios de YouTube (`*.googlevideo.com`, comprobado también tras redirecciones) y solo a direcciones públicas (netfetch); el id de vídeo se valida (11 caracteres) antes de llegar a yt-dlp; solo se pasan a YouTube las cabeceras que yt-dlp indica de una lista corta; el `Range` del reproductor se valida; nunca se enseña la dirección del sonido a la página. Solo en la app de escritorio (en un servidor propio sería un repetidor de música para cualquiera) y no con proxy. Los mensajes nuevos del mini reproductor (buscar y reproducir, añadir, saltar, agrandar) pasan por una lista blanca en el proceso principal: ids de YouTube, textos cortados y solo miniaturas de `i.ytimg.com`. Las listas (`stream-lists.json`) se validan al leerlas y al guardarlas (máx. 100 listas de 500 canciones; enlaces solo de Spotify, Apple o YouTube).

### [UI] La letra no iba del todo sincronizada
- **Causa:** se movía con `timeupdate`, que el reproductor lanza unas 4 veces por segundo, y se adelantaba 0,15 s; y con vídeos (intro más larga que la canción) la letra iba tarde.
- **Fix:** se sigue fotograma a fotograma mientras se ve, la línea que se canta se rellena como en un karaoke y las demás se apagan; botones − / + para adelantar o retrasar (por canción, se recuerda); si el vídeo dura distinto que la canción, se avisa. Para las canciones de Spotify la letra se busca con su artista y título reales, y al elegir el vídeo se prefiere el que dura lo mismo que la canción. 236 pruebas.

---

## 2026-10-04 — v3.7.1: la música sigue con la ventana cerrada; revisión 16

### [UI] Al cerrar la ventana se paraba la música aunque el mini reproductor estuviera abierto
- **Causa:** el reproductor vive en la ventana principal; cerrarla (sin «seguir en la bandeja») cerraba la app.
- **Fix:** con el mini reproductor abierto, cerrar la ventana solo la oculta (la página que reproduce sigue viva) y avisa una vez. ↗ en el mini reproductor la vuelve a abrir; cerrar el mini reproductor cierra la app (o, con «seguir en la bandeja», pausa y se queda allí). Probado en la app: la canción siguió sonando con la ventana cerrada, y al cerrar el mini no quedó ningún proceso.

### [Seguridad] Revisión 16 (todo lo de la 3.6 y la 3.7)
- **Corregido:** pedir muchas canciones distintas a la vez lanzaba un yt-dlp por cada una sin límite; ahora van como mucho 3 a la vez, hasta 30 esperando, y el resto recibe «ocupado».
- **Comprobado con pruebas de ataque contra el servidor en modo escritorio:** ids de vídeo inventados o con saltos de línea, rutas `../` y opciones de yt-dlp camufladas → 400; sin identificador de cliente → 400; importar listas desde `127.0.0.1`, `file://`, `javascript:`, otros dominios o `open.spotify.com.evil.example` → 400; listas hechas a mano con miniaturas de otros sitios, canciones vacías o datos que no son canciones → se limpian; todo esto no existe en un servidor web propio (404).
- **Repasado a mano:** el sonido solo se pide a `*.googlevideo.com` y a direcciones públicas, también tras redirecciones; la página nunca ve esa dirección. Todo lo que muestran la página, la lista «A continuación», las listas y el mini reproductor (títulos de YouTube o de Spotify) va como texto, nunca como HTML. Los mensajes del mini reproductor al proceso principal pasan por una lista blanca. El código de estilo y los desfases de la letra se validan al leerlos. `npm audit --omit=dev` → 0 vulnerabilidades. 237 pruebas.

---

## 2026-10-04 — v3.7.2: atajos con cualquier tecla y un mini reproductor más completo

### [UI] Los atajos solo aceptaban combinaciones
- **Síntoma:** una tecla sola (una letra, el espacio, una flecha, una tecla de puntuación del teclado español) no se podía poner; solo las multimedia y F1–F24.
- **Causa:** el proceso principal rechazaba toda tecla suelta que no fuera de esa lista (para no robársela a los demás programas), y la página no reconocía las teclas de puntuación de un teclado que no sea inglés.
- **Fix:** ahora vale cualquier tecla o combinación. Las que funcionan aunque TubeGrab no esté delante: F1–F24, las multimedia, el teclado numérico, Inicio/Fin/RePág/AvPág/Insert y cualquier combinación con Ctrl, Alt o Win. Una tecla que escribe algo (letra, número, espacio, flecha, sola o con Mayús) funciona solo con TubeGrab delante (se ve «solo en TubeGrab» en su casilla), así no se le quita esa tecla a los demás programas; mientras escribes en un campo de TubeGrab no cuenta. Las teclas de puntuación se reconocen por su posición. La lista blanca de teclas del proceso principal sigue igual.

### [UI] Mini reproductor con más controles sin crecer
- Volumen (barra pequeña y rueda del ratón sobre el reproductor), tiempo transcurrido y total, aleatorio, repetir, modo radio y ⬇ para descargar la canción que suena desde YouTube; sigue midiendo 360 × 128. Las órdenes nuevas pasan por la misma lista blanca del proceso principal.

---

## 2026-10-04 — v3.7.3: el mini reproductor como overlay

### [UI] Al cerrar la lupa, el mini reproductor no volvía a su sitio
- **Síntoma:** abajo en la pantalla, al abrir la búsqueda subía para caber (bien), pero al cerrarla se quedaba arriba.
- **Fix:** recuerda dónde estaba antes de abrirse y vuelve exactamente ahí (si lo arrastras con la búsqueda abierta, se queda donde lo dejaste). Mientras está abierta no se guarda esa posición provisional. Probado abajo a la derecha: 892 → 562 → 892.

### [Nuevo] Ajustes propios del mini reproductor (pestaña «Ajustes» de la lupa)
- 📌 siempre encima (nivel «screen-saver», que también queda por encima de juegos en ventana sin bordes), opacidad del 20 % al 100 %, del todo visible al pasar el ratón, fijar la posición, dejar pasar los clics (overlay; se vuelve a usar manteniendo Ctrl encima o desde la bandeja), tamaño compacto (300 × 64) y llevarlo a una esquina con un clic. Se guardan en settings.json y se validan al leerlos; las órdenes nuevas del mini reproductor (`miniPrefs`, `snap`, `hover`, `grab`) pasan por la lista blanca del proceso principal y solo las acepta de la ventana del mini reproductor.

---

## 2026-10-04 — v3.7.4: más sencillo y accesible; revisión 17

### [Accesibilidad] Auditoría automática de todas las páginas y del mini reproductor
- **Cómo:** en la app real, por CDP, cada página: botones y pestañas sin nombre, campos sin etiqueta, imágenes sin `alt`, opciones sin estado (`aria-checked`), ids repetidos, texto secundario demasiado tenue; y recorrido con la tecla Tab de verdad (70 paradas por página) comprobando que cada control enseña dónde está el foco.
- **Encontrado y corregido:** el selector Lista / Carátulas de la Biblioteca no decía cuál estaba elegido a un lector de pantalla. Todo lo demás pasó (los campos de texto enseñan el foco en su recuadro).

### [UI] Apariencia más sencilla
- Arriba quedan lo básico y los estilos rápidos; letra, espaciado, esquinas, menú lateral, barra superior y página de inicio pasan a «Más opciones de aspecto», cerrado. El buscador de Ajustes lo abre solo si lo que buscas está dentro.

### [Bugs] Revisión 17
- **«Del todo visible al pasar el ratón»** (mini reproductor) no hacía nada: escuchaba `mouseenter` en `document`, que el navegador nunca lanza ahí; ahora en `<html>`. Probado: 40 % de opacidad quieto, 100 % con el ratón encima.
- **Con un proxy**, cada canción de YouTube fallaba y el reproductor recorría la lista entera saltando; ahora pregunta el motivo y, si no es la canción, se para y lo explica.
- **Sin conexión**, una lista de Spotify iba saltando canción tras canción; ahora para tras tres fallos seguidos y pregunta si hay Internet.
- Seguridad: lo nuevo (ajustes del mini reproductor) solo lo acepta el proceso principal desde la ventana del mini reproductor y con valores comprobados; `npm audit --omit=dev` → 0.

---

## 2026-10-04 — v3.7.5: el mini reproductor con juegos

### [Bug] El overlay no salía por encima del juego
- **Causa:** un juego que pasa a primer plano (sobre todo en «ventana sin bordes») puede ponerse él mismo «siempre encima», por encima de las demás ventanas que lo estaban.
- **Fix:** mientras el mini reproductor deba ir encima, cada 1,5 s vuelve a ponerse arriba (`setAlwaysOnTop(…, 'screen-saver')` + `moveTop()`, sin quitar el foco). Sobre un juego a pantalla completa «exclusiva» Windows no deja mostrar nada; se explica en sus ajustes.

### [Bug] Al cambiar de ventana se quedaba bloqueado y había que cerrarlo
- **Causa:** al pulsar sus botones, la ventana del mini reproductor se quedaba con el teclado: un juego a pantalla completa que pierde el foco se minimiza, y con «dejar pasar los clics» ya no se podía volver a usar el mini (ni Ctrl llegaba bien tras Alt+Tab).
- **Fix:** nueva opción, activada por defecto, «No quitarle el teclado al juego al pulsar sus botones» (ventana que no se activa; solo la búsqueda toma el teclado mientras está abierta). Al llegar a él con Alt+Tab se puede usar aunque los clics pasen a través, y al salir nunca se queda medio agarrado. Atajo nuevo `Ctrl+Alt+O` para dejar pasar los clics sí / no, también desde la bandeja.

### [UI] Los atajos dentro del juego: saber si llegan
- Al cambiar el volumen, la canción o la pausa, el mini reproductor lo enseña un momento encima («🔊 Volumen 35 %»), así se ve desde el juego. En Ajustes → Sistema, «Último atajo recibido» dice si Windows ha entregado el atajo, para probarlo con el juego delante. Se explica que las teclas sueltas solo valen dentro de TubeGrab y que algunos drivers gráficos usan Ctrl+Alt+flechas.
- Silenciar pasa a `Ctrl+Alt+0` por defecto: `Ctrl+Alt+M` lo suele tener otro programa en Windows (salía en rojo).


---

## 2026-10-04 — v3.8.0: sonido, «Ahora suena» y letras traducidas

### [Feature] Panel «Sonido» (antes «Ecualizador»)
- **Mismo volumen en todas las canciones:** mide lo fuerte que suena cada canción mientras suena (la potencia media de lo que no es silencio, sin contar el volumen de la app) y la lleva poco a poco a un mismo nivel (−12 a +8 dB), con un limitador para que nada sature. Se recuerda por canción, así la siguiente vez empieza ya corregida. Probado con un tono a −43 dB (+8 dB) y una canción normal (+5,5 dB, igual con el volumen al 50 % que al 100 %).
- **Velocidad** 0,5–2× con «mantener el tono»; el fundido entre canciones cuenta en segundos reales a esa velocidad. Fundido de hasta 12 s.
- **Temporizador para dormir:** 15 min a 2 h o «al acabar esta canción»; los últimos 30 s bajan poco a poco y luego se pausa (y el volumen vuelve a su sitio para la próxima vez).
- **Estilos propios del ecualizador** (hasta 20), más «Electrónica» y «Noche».

### [Feature] «Ahora suena»
- Al pulsar la carátula de la barra (o «En grande» en la letra): la carátula en grande (de YouTube, la imagen grande recortada al cuadrado), el fondo con sus colores, la letra como karaoke, controles, volumen, visualizador (barras u onda) y pantalla completa. Esc cierra, Tab no se sale de la vista y el foco vuelve a donde estaba.
- El visualizador también puede salir en el mini reproductor: la ventana principal le manda unas barras unas 14 veces por segundo, solo mientras está abierto y suena.

### [Feature] Letras
- **Traducir:** la letra en tu idioma debajo de cada línea (Google Translate, solo las palabras de la canción; los estribillos se mandan una vez y cada letra se guarda traducida en el equipo). Si ya está en tu idioma, lo dice.
- **Canciones descargadas sin letra:** se busca en LRCLIB por artista y título (de las etiquetas o del nombre «Artista - Título»).

### [Bug] Letras basura de LRCLIB
- **Causa:** cualquiera puede subir letras a LRCLIB y la entrada principal de «Never Gonna Give You Up» decía solo «probe»: salía una línea en vez de la letra.
- **Fix:** una entrada con menos de 3 líneas y menos de 10 letras no se da por buena; se usa la mejor de la búsqueda (primero las sincronizadas). Test con una entrada «probe».

### [Bug] El desfase de la letra de las canciones descargadas se perdía al reiniciar
- **Causa:** se guardaba por el id del archivo, que cambia en cada arranque.
- **Fix:** se guarda por la ruta dentro de la carpeta de descargas (igual que el volumen recordado).


---

## 2026-10-04 — v3.9.0: hecho para ti, tu música, listas en carpetas

### [Feature] Lo que escuchas (solo en este equipo)
- Cada canción, al dejar de sonar, se apunta con los segundos que sonó de verdad (a 1,5× cuentan los segundos reales); una «escucha» son 30 s o media canción. `lib/listenlog.js` → `listen-history.json`, como mucho 60 000 escuchas y 3 años. Se escribe al momento (la app puede cerrarse en cualquier instante) y se puede pausar o borrar en Escuchar → Opciones.
- **Hecho para ti** (Escuchar): mixes diarios de tus tres artistas de los últimos 60 días (la mezcla de YouTube de su canción que más pones, con las tuyas suyas intercaladas; cambia cada día), lo más escuchado (90 días), escuchado hace poco y redescubre (lo que ponías y lleva un mes sin sonar). Tus artistas, cada uno con su radio.
- **Tu música** (Estadísticas): el resumen de un año o de siempre, en tu zona horaria; las canciones se pueden reproducir desde ahí y el top guardarse como lista.

### [Feature] Listas
- **Carpetas** (escribe una nueva o elige una que ya tengas) y **mosaico** de cuatro carátulas.
- **Se mantienen al día solas:** las que vienen de un enlace se vuelven a leer a los 3 min de arrancar y luego cada 3 h si llevan 12 h sin leerse, una cada vez. Los vídeos ya encontrados se conservan.
- **Radio de una lista:** las mezclas de YouTube de tres de sus canciones, entrelazadas, sin repetir las de la lista (las tres a la vez: unos 4 s en vez de 12).
- **Suena tu archivo:** una canción de YouTube que ya tienes descargada (mismo artista y título) suena desde tu biblioteca, también sin Internet. Se puede desactivar.
- **Guardar solas las que más escucho** (desactivado por defecto): la quinta vez que suena una canción de YouTube se descarga en MP3, una sola vez, y nunca si ya la tenías.


---

## 2026-10-04 — v3.10.0: modo juego, la música desde el móvil, Discord; revisión 18

### [Feature] Modo juego automático (Ajustes → Sistema)
- Tus juegos por su programa (`.exe`), escritos o elegidos de lo que tienes abierto. Cada 8 s se mira la lista de procesos de Windows (`tasklist`, solo nombres; nada toca el juego). Al abrirse uno, el mini reproductor se pone encima con tu opacidad, compacto y en tu esquina (y dejando pasar los clics si quieres); al cerrarlo, vuelve a como estaba (se guarda en disco por si se cierra la app a mitad de partida) y se cierra si solo se abrió para el juego.
- Probado con el Bloc de notas haciendo de juego: se abre compacto arriba a la derecha y al cerrarlo vuelve todo a su sitio.

### [Feature] La música desde el móvil
- La página del móvil tiene «Música»: lo que suena con su carátula de YouTube, el tiempo y el volumen; ⏮ ⏯ ⏭, volumen y silencio; y «Buscar una canción»: escribes el nombre y suena en el PC (en su propia página, porque la de música se recarga sola). Probado: pausa, −10 % de volumen y «Despacito» sonando en 4 s.
- La ventana principal le cuenta al servidor lo que suena (solo títulos, tiempos, volumen y la carátula de YouTube, cuando cambia algo); lo que pide el móvil lo comprueba el servidor y otra vez la app.

### [Feature] Discord
- Las canciones de YouTube muestran su carátula y un botón «YouTube» en tu perfil.

### [Seguridad] Revisión 18 (todo lo nuevo de la 3.8 a la 3.10)
- **Página de música del móvil:** solo con la cookie del emparejamiento; solo nuestro formulario (Origin y tipo de contenido); acciones de una lista fija, el texto de búsqueda limpio y como mucho 200 caracteres, cuerpos de más de 2 KB cortados; títulos y «a continuación» escapados; la política sigue sin permitir scripts e imágenes solo de `i.ytimg.com`. Pruebas de ataque nuevas en `test/remote.test.js`.
- **Historial de escuchas y traducción:** solo canciones con clave válida (`yt:` + id o `f:` + ruta), textos cortos y sin caracteres de control, miniaturas solo de YouTube; un archivo manipulado se lee con cuidado (test). La traducción solo acepta 250 líneas cortas a un idioma de la lista.
- **Modo juego:** `tasklist` y PowerShell con argumentos fijos (nada de lo que escribes llega a una línea de comandos); nombres validados (`*.exe`, sin rutas) y nunca programas de Windows o de TubeGrab.
- **Accesibilidad:** auditoría de todas las páginas, del panel Sonido, la letra, «A continuación», «Ahora suena» y una lista hecha para ti: nada sin nombre ni sin etiqueta; en «Ahora suena» el tabulador no se sale y Esc cierra.


---

## 2026-10-04 — v3.10.1: listas en el mini reproductor

### [Feature] Pestaña «Listas» en el mini reproductor
- Hecho para ti (mixes diarios, lo más escuchado, escuchado hace poco, redescubre) y tus listas (las de carpetas detrás, con su carpeta). ▶ reproduce; al abrir una se ve su contenido y se empieza desde la canción que elijas, o con aleatorio.
- El mini reproductor solo pide «esta lista, desde esta canción»: la ventana principal lo comprueba (id de lista de 16 hex, o uno de los seis tipos; canción por posición o por su clave) y la monta igual que en Escuchar (con tu archivo si ya la tienes). Probado: ▶, empezar en la tercera, empezar en la segunda de «Lo más escuchado» (sonó el archivo descargado), aleatorio, el mix diario, y dos órdenes falsas ignoradas.
- Las canciones aún sin carátula (de Spotify) dejan su hueco para que los títulos queden alineados.


---

## 2026-10-04 — v3.10.2: el mini reproductor ya no se queda atascado

### [Bug] El mini reproductor no dejaba hacer nada (ni cerrarlo ni moverlo)
- Con «dejar pasar los clics» y «fijarlo aquí» activados, todos los clics lo atravesaban; como el ajuste se guarda, seguía igual tras reiniciar. La salida (mantener Ctrl y mover el ratón encima, Ctrl+Alt+O o la bandeja) no se veía.
- Ahora, al abrirlo tú (botón, atajo), siempre empieza usable con el ratón; volver a pulsar el botón del mini en TubeGrab con él abierto también lo hace usable. Solo el modo juego lo abre dejando pasar los clics, si así lo elegiste. Los textos explican que hay que mover el ratón con Ctrl pulsado.
- Probado con el estado atascado guardado en disco: se abre usable; activado con él abierto, el botón lo desactiva.


---

## 2026-10-04 — v3.10.3: la web explica las tres descargas

### [Feature] «Descargar» en la web: las tres opciones
- En la versión web, el botón «Descargar» del aviso «TubeGrab para Windows» abre un diálogo con las tres versiones: Instalador (recomendado), Portable y Portable ligera, con qué hace cada una, su tamaño y el archivo; cada una se descarga directamente.
- Los tamaños y la versión salen de la última release de GitHub (`/api/desktop/latest`, solo nombres y tamaños, como mucho una consulta por hora; si GitHub no responde, se muestran los aproximados).
- Probado en Edge: tamaños reales (163, 163 y 96 MB), enlaces directos, claro/oscuro, móvil sin desbordes, Esc y clic fuera cierran, inglés.


---

## 2026-10-04 — v3.11.0: Escuchar renovado, Favoritas, perfiles de Spotify

### [Feature] Escuchar con aspecto de app de música (propio, no una copia)
- Inicio con saludo, filtros (Todo · Listas · Hecho para ti · Artistas), accesos rápidos y tarjetas grandes; artistas en círculo. Cada lista: cabecera con el color de su portada, ▶ grande (⏸ si esa lista suena), aleatorio, descargar, «⋯» (cola, radio, guardar, añadir a otra lista, actualizar, copiar enlace, borrar), buscador y barra fija al bajar.
- Canciones en tabla: clic selecciona y doble clic/Intro escucha (o un clic, a elegir), ↑/↓, Alt+↑/↓ y arrastrar para reordenar (`move` en el servidor), Supr quita, menú con el botón derecho o Mayús+F10. La que suena, en color con barras animadas (también si suena tu archivo descargado en su lugar).
- Personalizar: moderno o clásico, siempre oscuro, color de la app / de la portada que suena / uno tuyo, cabecera con color, tamaño de portadas, filas compactas, saludo, artistas y atajos. Colores, nombres y estrella propios de TubeGrab (nada de los de Spotify).
- Barra del reproductor más limpia: botón de reproducir redondo, barras de posición y volumen rellenas, puntos en los botones activos, estrella de Favoritas.

### [Feature] Favoritas
- Estrella en cada canción, en el reproductor y con Alt+Mayús+F; lista «Favoritas» en Escuchar y en el mini reproductor (`likes.json`, solo en este equipo; las mismas reglas que lo escuchado: solo claves yt:/f:, texto limpio, miniaturas solo de YouTube, máx. 5000).

### [Feature] Atajos para escuchar
- Espacio, Ctrl+←/→, Mayús+←/→, Ctrl+↑/↓, Ctrl+Mayús+↓, Ctrl+S, Ctrl+R (ya no recarga la ventana), Alt+Mayús+Q/J/R/H/S/F, Ctrl+L, Ctrl+F, Ctrl+/. No actúan en el editor ni con un diálogo abierto; los de Ajustes → Sistema van primero.

### [Feature] Perfil de Spotify entero
- Pega `open.spotify.com/user/…`: se traen las listas públicas que enseña el perfil (Spotify solo enseña las 10 primeras sin iniciar sesión; si hay más, se avisa), en la carpeta «Spotify · nombre», sin repetir las que ya tenías. Solo se leen enlaces de perfil válidos; los de cada lista los construye TubeGrab.

### [Bug] El vídeo encontrado para una canción podía ir a otra
- Al borrar (o mover) una canción mientras sonaba la lista, el vídeo de YouTube encontrado para una canción de Spotify se guardaba por su posición antigua, en su vecina. Ahora se guarda en la canción buscada con ese nombre.
- Probado: atajos, reordenar, filtro, Favoritas (YouTube y archivo), mini reproductor, perfil con 10 listas (9 nuevas + 1 que ya estaba; repetido: 0), claro y oscuro, sin controles sin nombre. 252 pruebas.


---

## 2026-10-04 — v3.12.0: mantener descargada, seguir donde lo dejaste, varias canciones, salidas de sonido, karaoke

### [Feature] Mantener una lista descargada
- Interruptor en cada lista tuya: sus canciones se encolan (con tu formato de audio de Descargar) una sola vez cada una (`got`), y al actualizarse la lista sola se bajan las nuevas. La marca sobrevive a releer la lista. El servidor guarda quién lo pidió (su id, nunca uno enviado) y vuelve a comprobar las opciones al usarlas.
- Probado: 5 canciones a la cola y descargadas; volver a activarla no repite ninguna.

### [Feature] Seguir donde lo dejaste y modo audiolibro
- Al abrir la app vuelve la lista que sonaba, en la misma canción y segundo, en pausa. Cerrar el reproductor lo olvida.
- Audios de 15 min o más: cada uno recuerda su punto y su velocidad; botones −30 s / +30 s y menú de capítulos (de tu archivo con ffmpeg, o del vídeo de YouTube). Una canción normal después vuelve a velocidad 1.
- Probado con un libro de 16 min y 3 capítulos: capítulo 2, +30 s, 1,25×, recargar → en pausa en 5:32 a 1,25×; otra canción a 1×; el libro otra vez, en su punto.

### [Feature] Varias canciones a la vez y «Deshacer»
- Ctrl+clic, Mayús+clic, Mayús+↑/↓, Ctrl+A; barra con Escuchar, Cola, Añadir a una lista, Descargar, Quitar; menú para varias (también Favoritas); arrastrar o Alt+↑/↓ las mueve juntas (`moveMany`).
- Quitar canciones, borrar una lista o quitar de Favoritas ya no pregunta: sale «Deshacer» (y Ctrl+Z). Las canciones vuelven a su sitio (`insert`) y la lista con su enlace, carpeta y ajustes (papelera en memoria, 10 min).

### [Feature] Por dónde suena, pausa al desconectar, karaoke
- Menú de salidas de sonido en el reproductor (`AudioContext.setSinkId`); si la elegida desaparece, suena por la de Windows y vuelve cuando reaparece. Electron solo da el permiso «speaker-selection» (ver los altavoces); micrófono y cámara siguen denegados.
- Si se desconectan los cascos/Bluetooth mientras suena, pausa (se puede quitar en Sonido).
- Karaoke: izquierda menos derecha quita el centro (la voz) y un paso bajo devuelve los graves. Medido: una voz en el centro baja a un 12 % (−18 dB); lo de los lados se queda.
- 257 pruebas.


---

## 2026-10-05 — v3.13.0: revisar la biblioteca, audio oficial, descargas comprobadas, novedades

### [Feature] Biblioteca → Revisar
- Cada canción se lee una vez con ffmpeg (en segundo plano, una a una; `library-info.json` hasta que el archivo cambie): calidad del propio audio (no del total, que infla la carátula), etiquetas, carátula, letra (también un .lrc al lado) y de dónde vino (el enlace que guarda la descarga).
- Pestañas: Calidad (por debajo de 128 kb/s en MP3, 112 en AAC… YouTube no da más de ~160: no se proponen mejoras falsas), Datos (MusicBrainz rellena solo lo que falta, y solo si la duración coincide ±15 s; copia sin recodificar, comprobada antes de sustituir), Letras (LRCLIB), Álbumes (MusicBrainz: el álbum oficial más antiguo con ese nombre y sus canciones; bajar las que faltan) y Espacio (lo que más ocupa, vídeos, sin abrir en 6 meses → papelera de Windows).
- Los nombres para buscar se limpian: un vídeo bajado sin modo música tiene «Artista - Canción (Official Video)» de título y el canal («Queen Official») de artista.
- Probado: 13 canciones; letra de Despacito encontrada (.lrc + en el archivo); un archivo de 40 s llamado «Bohemian Rhapsody» ya no recibe datos de otra versión.

### [Feature] Audio oficial (modo música)
- Si el enlace es un videoclip («Official Video», «Video Oficial», «MV»…), se busca el audio de la canción: una subida «- Topic» del artista, un «Official Audio» del mismo canal o una del canal del artista que no sea un clip; mismo nombre, sin otras versiones entre paréntesis (live, piano, remix…) y que no dure más. Si no hay uno así, se baja el vídeo como siempre.
- Probado: Rick Astley (Official Video) → «Never Gonna Give You Up (2022 Remaster)» de su canal; Uptown Funk → su «Official Audio»; Queen, Ed Sheeran, Despacito → el original (no había uno seguro). Antes de afinarlo cogía una versión «Pianoforte» y una subida de un fan.

### [Feature] Descargas comprobadas
- Al terminar: que se abra, que dure al menos el 90 % de lo que decía el vídeo y que sus últimos 8 s se decodifiquen. Si no, se borra y se baja otra vez (una vez).

### [Feature] Novedades de tus artistas
- Cada 12 h, de tus 8 artistas más escuchados: su canal (buscado una vez: el que se llama como ellos, «Official» o «VEVO», o el de uno de sus vídeos) y sus vídeos más nuevos. La primera vez solo se apunta lo que hay; luego, lo nuevo (sin directos, versiones, reacciones, letras ni shorts) sale en Escuchar y como aviso de Windows (una vez cada uno).
- `ytsearchdate` ya no existe en yt-dlp y la búsqueda de YouTube no respeta «ordenar por fecha»: por eso el canal.

### [Bug] Al revisar, las canciones borradas no se olvidaban si no había nada nuevo que leer
- 264 pruebas.


---

## 2026-10-05 — v3.14.0: Ctrl+K, el menú del Explorador, tu biblioteca en el móvil

### [Feature] Ctrl+K
- Un cuadro para ir a cualquier sitio: secciones, ajustes (los del buscador de Ajustes), tus listas de Escuchar, las canciones de tu biblioteca y acciones (mini reproductor, Revisar, Duplicados, Favoritas, Ahora suena, Personalizar Escuchar, atajos). ↑/↓, Intro, Esc; combobox accesible.

### [Feature] Menú del botón derecho del Explorador (Windows)
- Ajustes → Sistema → «Menú del botón derecho»: «Convertir a MP3 / Comprimir / Abrir en el editor con TubeGrab» en audios y vídeos. Un solo `.reg` importado en HKCU (sin administrador), quitado al desactivarlo; se vuelve a escribir si la app portátil cambia de sitio. En Windows 11, en «Mostrar más opciones».
- El archivo llega como `exe --tg-file=<acción> -- "%1"`: después de `--`, nada puede tomarse como opción; solo un archivo de audio/vídeo real. El proceso principal pasa la ruta al servidor con un pase de un solo uso (10 min) y la página solo recibe el pase: ninguna página puede pedir una ruta.
- MP3: se convierte en el sitio, como la carpeta vigilada (el original no se toca). Comprimir / editor: la sección se abre con el archivo cargado.
- Probado: registro escrito y borrado; MP3 hecho desde una segunda instancia; el editor abre el vídeo; `win.ini` ignorado.

### [Feature] Tu biblioteca en el móvil
- Nueva pestaña «En el móvil» en la página del teléfono: tu música (y vídeos) con buscador; suena en el móvil desde el PC, con saltos por rangos de bytes y la siguiente al acabar (un script de 1 línea con nonce; CSP con `media-src 'self'` solo en esa página). Solo con el móvil emparejado y solo archivos de la biblioteca.
- 265 pruebas.


---

## 2026-10-04 — v3.14.1: el menú del Explorador, encendido solo

### [Bug] El menú del botón derecho no salía
- Había que encenderlo en Ajustes → Sistema y era fácil no verlo: el registro estaba vacío. Ahora se activa solo la primera vez que se abre la app (instalada o portátil); si lo apagas en Ajustes, se queda apagado.
- Desinstalar quita también las entradas del menú (no al actualizar).


---

## 2026-10-07 — v4.0.0: Escuchar, una app aparte

### [Cambio] Escuchar sin descargar sale de TubeGrab
- La pestaña Escuchar (listas de Spotify / Apple Music / YouTube, Favoritas, «Hecho para ti», novedades, el resumen del año) es ahora la app **CLMusic** (repositorio propio), con su propia página para descargarla en TubeGrab (pestaña **CLMusic**: instalador, portable y portable ligera). TubeGrab se queda con descargar, convertir y la biblioteca con su reproductor de archivos.
- Quitado: rutas `/api/stream/*`, `/api/streamlists*`, `/api/listen*`; `lib/stream.js`, `streamlists.js`, `listenlog.js`, `likes.js`, `news.js`; perfiles de Spotify en `importlist.js`; la vista, el streaming dentro del reproductor, el resumen de Estadísticas, las pestañas Buscar/Listas del mini reproductor, «poner una canción» desde el móvil (y sus carátulas de YouTube: su CSP pasa a `img-src 'none'`), los comandos `stream/enqueue/playList/playQuery/save` en el proceso principal y el botón de YouTube en Discord. 296 selectores CSS y 179 traducciones que solo usaba Escuchar.
- Seguridad: menos superficie (ningún relé de audio ni yt-dlp por id desde la página). Un test comprueba que ninguna de esas rutas responde ya (web y escritorio) ni se crean sus archivos.
- Comprobado: identificadores no definidos o sin usar antes/después de cada archivo (0 nuevos); en la app real, Biblioteca, cola, Estadísticas, Ctrl+K y mini reproductor sin errores. CLMusic copia tus datos de `%APPDATA%\tubegrab` la primera vez (no los mueve).
- 242 pruebas.

### [Seguridad — CRÍTICA en `npm audit`] `proxy-addr` ≤ 2.0.7 (GHSA-jqcg-44mw-7w3h)
- Suplantación de IP cuando la subred de confianza es IPv4 mapeada en IPv6. TubeGrab solo activa `trust proxy` con `TRUST_PROXY` (la web) y por número de saltos, no por subred, así que en la práctica no le afectaba. Aun así, actualizada a 2.0.8 (dependencia de Express). `npm audit --omit=dev`: 0.

### Revisión de la pestaña CLMusic
- `/api/clmusic/latest`: solo pregunta a la API de GitHub (una vez por hora, 5 min si falla), solo devuelve los tamaños de los tres nombres de archivo conocidos y una versión `x.y.z`. La página los escribe con `textContent`. Los enlaces van a `github.com/Cid736/clmusic/releases/latest/download/…`.
- 242 pruebas.


---

## 2026-10-07 — v4.0.1: CLMusic se llama ahora Rumoria

### [Legal] Nombre de la app de música
- **Por qué:** «CLMusic» chocaba con un reproductor de música para Windows que ya existía («CLMusicPlayer»), con una empresa británica («CL MUSIC LTD») y con la cantante CL. «Rumoria» no tiene marcas registradas en EE. UU., ni uso en la web, ni repos en GitHub, y sus dominios están libres.
- **Cambios:** la pestaña, el logo (`public/rumoria.png`), la ruta (`/api/rumoria/latest`), los enlaces de descarga (`Cid736/rumoria`, `Rumoria-Setup.exe`, `Rumoria.exe` y `Rumoria-Lite.exe`), las traducciones, README y LEGAL. Las entradas antiguas de este registro conservan el nombre de entonces.

### [Legal] El nombre «TubeGrab», revisado
- **Registros:** no hay marcas «TUBEGRAB» registradas en EE. UU. y no aparece otra app con ese nombre. Las normas de marca de Google prohíben usar «YouTube» o sus variantes en el nombre de una app; «Tube» suelto es genérico y apps como TubeMate o TubeDigger lo usan desde hace años.
- **Decisión:** se mantiene. El riesgo es moderado-bajo mientras se publique solo en GitHub. Si algún día va a una tienda de apps, conviene cambiarlo.
- 242 pruebas.
