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
