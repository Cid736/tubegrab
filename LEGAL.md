<p align="center">
  <a href="#español">🇪🇸 Español</a> &nbsp;·&nbsp; <a href="#english">🇬🇧 English</a>
</p>

---

<a name="español"></a>

# Privacidad y condiciones de uso

TubeGrab es software gratuito y de código abierto (licencia MIT), mantenido por Eric Cid López a título personal. No se vende nada, no hay cuentas de usuario ni pagos.

## Privacidad

**TubeGrab no recoge ni envía datos personales al autor.** No hay analíticas, telemetría, publicidad ni rastreadores.

Lo que se guarda, siempre en tu propio equipo:

| Dato | Dónde | Para qué |
|---|---|---|
| Preferencias (idioma, tema, carpeta, opciones) | Carpeta de datos de la app / almacenamiento local del navegador | Recordar tus ajustes |
| Historial y suscripciones | Carpeta de datos de la app | Mostrar tus descargas y comprobar canales nuevos |
| Identificador aleatorio (`tubegrab_client`) | Almacenamiento local del navegador | Separar tu cola de la de otras pestañas; no identifica a la persona y no sale del equipo/servidor |
| `cookies.txt` (solo si tú lo añades) | Carpeta de datos de la app | Pasarlo a yt-dlp para vídeos que piden iniciar sesión |

Puedes borrar el historial desde **Historial → Borrar historial**, o todo eliminando la carpeta de datos (**Ajustes → Descargas → Cookies → Abrir carpeta**).

Conexiones a terceros (necesarias para funcionar; cada servicio aplica su propia política de privacidad):

- **El sitio del enlace** (YouTube, Vimeo, SoundCloud…): yt-dlp lo contacta para buscar, previsualizar y descargar. Las miniaturas de la vista previa se cargan directamente desde ese sitio.
- **SponsorBlock** (`sponsor.ajay.app`), solo si activas "Quitar patrocinios": recibe el identificador del vídeo.
- **GitHub** (`api.github.com`, `github.com`): comprobar y descargar actualizaciones de la app, de yt-dlp y, en la versión ligera, de ffmpeg.

**Cookies:** TubeGrab no usa cookies de seguimiento ni de terceros. Solo usa almacenamiento local estrictamente necesario para el funcionamiento, que está exento de consentimiento (art. 22.2 LSSI / art. 5.3 Directiva ePrivacy). Por eso no hay banner de cookies. El `cookies.txt` opcional son *tus* cookies de otro sitio, que tú decides aportar.

**Si alguien despliega TubeGrab en un servidor** (Docker/Render), quien lo despliega es el responsable del tratamiento de los datos de sus usuarios (registros del servidor, IP, etc.) y debe publicar su propia información legal.

## Condiciones de uso

- **Uso personal y responsabilidad del usuario.** Solo descarga contenido que tengas derecho a descargar: contenido propio, con licencia libre, de dominio público o con permiso del titular. Descargar contenido protegido puede infringir los derechos de autor y las condiciones de servicio del sitio de origen (las de YouTube, por ejemplo, prohíben descargar salvo donde el servicio lo permita). Tú eres responsable del uso que hagas de la app.
- **Sin garantía.** El software se ofrece "tal cual", sin garantías de ningún tipo, según la [licencia MIT](LICENSE). Los sitios cambian a menudo y las descargas pueden fallar.
- **Sin afiliación.** TubeGrab no está afiliado, patrocinado ni aprobado por YouTube, Google ni ninguno de los sitios compatibles. Sus nombres son marcas de sus respectivos titulares y se citan solo para indicar compatibilidad.
- **Componentes de terceros:** [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense) y [FFmpeg](https://ffmpeg.org) (compilación de gyan.dev, GPL), cada uno bajo su propia licencia.

## Contacto

Dudas, problemas o solicitudes de retirada: abre un *issue* en [github.com/Cid736/tubegrab](https://github.com/Cid736/tubegrab/issues).

---

<a name="english"></a>

# Privacy and terms of use

TubeGrab is free, open-source software (MIT licence), maintained by Eric Cid López as an individual. Nothing is sold; there are no user accounts or payments.

## Privacy

**TubeGrab doesn't collect or send any personal data to the author.** No analytics, telemetry, ads or trackers.

What is stored, always on your own computer:

| Data | Where | Why |
|---|---|---|
| Preferences (language, theme, folder, options) | App data folder / browser local storage | Remember your settings |
| History and subscriptions | App data folder | Show your downloads and check channels for new uploads |
| Random identifier (`tubegrab_client`) | Browser local storage | Keep your queue apart from other tabs; doesn't identify you and never leaves the computer/server |
| `cookies.txt` (only if you add it) | App data folder | Passed to yt-dlp for sign-in-only videos |

You can clear history from **History → Clear history**, or everything by deleting the data folder (**Settings → Downloads → Cookies → Open folder**).

Third-party connections (needed for the app to work; each service has its own privacy policy):

- **The linked site** (YouTube, Vimeo, SoundCloud…): yt-dlp contacts it to search, preview and download. Preview thumbnails load straight from that site.
- **SponsorBlock** (`sponsor.ajay.app`), only if you turn on "Remove sponsors": receives the video ID.
- **GitHub** (`api.github.com`, `github.com`): checking for and downloading updates of the app, yt-dlp and, in the light build, ffmpeg.

**Cookies:** TubeGrab uses no tracking or third-party cookies. It only uses local storage that is strictly necessary to work, which is exempt from consent under the EU ePrivacy Directive (art. 5(3)). That's why there's no cookie banner. The optional `cookies.txt` holds *your* cookies from another site, which you choose to provide.

**If someone deploys TubeGrab on a server** (Docker/Render), whoever deploys it is the controller of their users' data (server logs, IPs, etc.) and must publish their own legal information.

## Terms of use

- **Personal use; you are responsible.** Only download content you have the right to: your own, freely licensed, public domain, or with the owner's permission. Downloading protected content may infringe copyright and the source site's terms of service (YouTube's, for example, forbid downloading except where the service allows it). You are responsible for how you use the app.
- **No warranty.** The software is provided "as is", without warranty of any kind, under the [MIT licence](LICENSE). Sites change often and downloads may fail.
- **No affiliation.** TubeGrab isn't affiliated with, sponsored or endorsed by YouTube, Google or any supported site. Their names are trademarks of their owners and are mentioned only to state compatibility.
- **Third-party components:** [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense) and [FFmpeg](https://ffmpeg.org) (gyan.dev build, GPL), each under its own licence.

## Contact

Questions, problems or takedown requests: open an issue at [github.com/Cid736/tubegrab](https://github.com/Cid736/tubegrab/issues).
