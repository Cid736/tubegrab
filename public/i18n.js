// Interface language (Ajustes → Apariencia → Idioma). Spanish is the source
// text everywhere; English comes from this table. Loaded before app.js: it
// translates the static page once, and exposes t() for app.js's own strings
// and ts() for messages that arrive from the server (errors, job stages).
(function () {
  var lang = window.tgPrefs && window.tgPrefs.get().lang === 'en' ? 'en' : 'es';

  var EN = {
    // --- Navigation & titles ---
    'Descargar': 'Download', 'Enlace': 'Link', 'Buscar': 'Search', 'Suscripciones': 'Subscriptions',
    'Convertir': 'Convert', 'Formato': 'Format', 'Unir': 'Merge', 'Comprimir': 'Compress', 'Imagen': 'Image',
    'Cola': 'Queue', 'Historial': 'History', 'Ajustes': 'Settings', 'Apariencia': 'Appearance', 'Descargas': 'Downloads',
    'Conversión': 'Conversion', 'Sistema': 'System', 'Acerca de': 'About',
    'Descargar (Ctrl+1)': 'Download (Ctrl+1)', 'Convertir (Ctrl+2)': 'Convert (Ctrl+2)', 'Cola (Ctrl+3)': 'Queue (Ctrl+3)',
    'Historial (Ctrl+4)': 'History (Ctrl+4)', 'Ajustes (Ctrl+,)': 'Settings (Ctrl+,)', 'Submenú': 'Submenu',
    'Pega un enlace de YouTube y más de 20 sitios': 'Paste a link from YouTube and 20+ other sites',
    'YouTube y más de 20 sitios': 'YouTube and 20+ other sites',
    'Encuentra y descarga sin tener el enlace': 'Find and download without a link',
    'Lo nuevo de tus canales, descargado solo': 'New uploads from your channels, downloaded automatically',
    '23 formatos de audio y vídeo': '23 audio and video formats', 'Unir archivos': 'Merge files',
    'Varios audios o vídeos en uno solo': 'Several audio or video files into one',
    'Que pese lo que tú digas': 'Make it the size you want', 'Un fotograma o la carátula como imagen': 'A frame or the cover art as an image',
    'Descargas y conversiones en curso': 'Downloads and conversions in progress', 'Lo que has terminado en este equipo': 'What you finished on this computer',
    'Idioma, interfaz, colores y tamaño': 'Language, interface, colours and size', 'Carpeta, velocidad y cookies': 'Folder, speed and cookies',
    'Tarjeta gráfica y conversiones a la vez': 'Graphics card and parallel conversions', 'Avisos, bandeja y portapapeles': 'Notifications, tray and clipboard',
    'Versión y actualizaciones': 'Version and updates',
    // --- Window & toolbar ---
    'Minimizar': 'Minimize', 'Maximizar': 'Maximize', 'Restaurar': 'Restore', 'Cerrar': 'Close', 'Zoom': 'Zoom',
    'Tipo de descarga': 'Download type', 'Audio': 'Audio', 'Vídeo': 'Video', 'Interfaz': 'Interface',
    'Interfaz de Windows': 'Windows interface', 'Interfaz de Mac': 'Mac interface', 'Usar esta interfaz por defecto': 'Use this interface by default',
    '{ui} es tu interfaz predeterminada': '{ui} is your default interface', 'Usar {ui} como interfaz predeterminada': 'Use {ui} as the default interface',
    'Buscar actualizaciones': 'Check for updates',
    // --- Banners ---
    'Hay una actualización disponible': 'An update is available',
    'Descarga e instala la nueva versión sin salir de la app.': 'Download and install the new version without leaving the app.',
    'Actualizar': 'Update', 'Preparando TubeGrab…': 'Getting TubeGrab ready…',
    'Descargando los componentes de conversión y descarga (solo la primera vez).': 'Downloading the conversion and download components (first time only).',
    'No se pudieron descargar los componentes': "Couldn't download the components", 'Reintentar': 'Retry',
    'Nueva: v{v}': 'New: v{v}', 'Buscando actualizaciones…': 'Checking for updates…', 'Última versión': 'Up to date',
    'No se pudo comprobar': "Couldn't check", 'Modo desarrollo': 'Development mode', 'pulsa para reintentar': 'click to retry',
    'Pulsa para buscar actualizaciones': 'Click to check for updates',
    'Versión {v} · buscando actualizaciones…': 'Version {v} · checking for updates…', 'Versión {v} · es la última': 'Version {v} · up to date',
    'Versión {v} · hay una nueva: {n}': 'Version {v} · {n} is available',
    'Versión {v} · no se pudo comprobar: {e}. Se reintentará sola en unos minutos.': "Version {v} · couldn't check: {e}. It will retry by itself in a few minutes.",
    'Versión {v} · modo desarrollo': 'Version {v} · development mode', 'Versión {v}': 'Version {v}',
    'Versión {n} lista para descargar (tienes la {v}).': 'Version {n} is ready to download (you have {v}).',
    'Reiniciar y actualizar': 'Restart and update', 'No se pudo actualizar: {e}': "Couldn't update: {e}", 'Descargando…': 'Downloading…',
    // --- Link view ---
    'Pega un enlace o varios, uno por línea': 'Paste one or more links, one per line', 'Borrar': 'Clear',
    'Playlist': 'Playlist', 'Todos': 'All', 'Ninguno': 'None', 'Descargar seleccionados': 'Download selected',
    'Descargar {n} seleccionados': 'Download {n} selected', 'Leyendo la playlist…': 'Reading the playlist…',
    '{n} vídeos': '{n} videos', 'Desmarca lo que no quieras.': "Untick what you don't want.", 'No se pudo leer la playlist': "Couldn't read the playlist",
    '{n} capítulos': '{n} chapters', '{n} enlaces — se descargarán todos.': '{n} links — all will be downloaded.',
    'Enlace detectado en el portapapeles ✨': 'Link found in the clipboard ✨',
    'Formato': 'Format', 'Calidad': 'Quality', 'FLAC (sin pérdida)': 'FLAC (lossless)', 'WAV': 'WAV', 'Original': 'Original',
    'La mejor disponible': 'Best available', 'Portada y metadatos': 'Cover art and metadata', 'Playlist completa': 'Whole playlist',
    'Quitar patrocinios': 'Remove sponsors', 'Más opciones': 'More options', 'Modo música': 'Music mode',
    'artista y título limpios, portada cuadrada': 'clean artist and title, square cover', 'Dividir por capítulos': 'Split by chapters',
    'un archivo por capítulo': 'one file per chapter', 'Subtítulos': 'Subtitles', 'Idioma de los subtítulos': 'Subtitle language',
    'Español e inglés': 'Spanish and English', 'Español': 'Spanish', 'Inglés': 'English', 'Francés': 'French', 'Alemán': 'German',
    'Italiano': 'Italian', 'Portugués': 'Portuguese', 'Japonés': 'Japanese', 'Coreano': 'Korean',
    'Guardar los subtítulos': 'Save subtitles', 'Dentro del vídeo': 'Inside the video', 'Como archivo .srt aparte': 'As a separate .srt file',
    'Descargar solo un tramo': 'Download only a part', 'opcional': 'optional', 'Desde 0:00': 'From 0:00', 'Hasta el final': 'To the end',
    'Desde': 'From', 'Hasta': 'To', 'Inicio del tramo': 'Start of the part', 'Final del tramo': 'End of the part', 'final': 'end',
    'Solo se descargará el tramo {a}–{b}.': 'Only {a}–{b} will be downloaded.',
    'Se guardará un archivo por capítulo (si el vídeo tiene capítulos), juntos en una carpeta.': 'One file per chapter will be saved (if the video has chapters), together in a folder.',
    'Descargar {f}': 'Download {f}', 'Descargar {n} enlaces ({f})': 'Download {n} links ({f})', 'mejor calidad': 'best quality',
    'Añadiendo…': 'Adding…', 'Leyendo playlist…': 'Reading playlist…', 'Pega al menos un enlace': 'Paste at least one link',
    'Añadido a la cola': 'Added to the queue', '{n} añadidos a la cola': '{n} added to the queue',
    '{n} enlace(s) no soportado(s)': '{n} unsupported link(s)',
    // --- Search ---
    'Busca una canción, un vídeo, un artista…': 'Search for a song, a video, an artist…',
    'Busca en YouTube sin tener el enlace. Se descargará con el formato elegido arriba (Audio o Vídeo) y en Descargar → Enlace.': 'Search YouTube without a link. It downloads with the format chosen above (Audio or Video) and in Download → Link.',
    'Buscando…': 'Searching…', '{n} resultados': '{n} results', 'No se encontró nada. Prueba con otras palabras.': 'Nothing found. Try other words.',
    'Formato: {f}': 'Format: {f}', 'Descargar ahora': 'Download now',
    // --- Subscriptions ---
    'Las suscripciones funcionan en la app de escritorio, que es la que puede revisar tus canales cada pocas horas.': 'Subscriptions work in the desktop app, which can check your channels every few hours.',
    'Enlace de un canal o playlist (YouTube, SoundCloud…)': 'Link to a channel or playlist (YouTube, SoundCloud…)',
    'Revisar cada': 'Check every', 'Hora': 'Hour', '3 horas': '3 hours', '6 horas': '6 hours', '12 horas': '12 hours', 'Día': 'Day',
    'Al suscribirte, descargar ya': 'When subscribing, download now', 'Nada, solo lo nuevo': 'Nothing, only new uploads',
    'El último vídeo': 'The latest video', 'Los 3 últimos': 'The latest 3', 'Los 5 últimos': 'The latest 5', 'Suscribirse': 'Subscribe',
    'Tus suscripciones': 'Your subscriptions',
    'Aún no sigues ningún canal. Lo nuevo que publiquen se descargará solo mientras TubeGrab esté abierto (también en la bandeja).': "You don't follow any channel yet. New uploads download by themselves while TubeGrab is open (also in the tray).",
    'Lo nuevo se descargará como {f} (cámbialo con Audio/Vídeo arriba y en Descargar → Enlace).': 'New uploads will download as {f} (change it with Audio/Video above and in Download → Link).',
    'cada hora': 'hourly', 'cada 3 horas': 'every 3 hours', 'cada 6 horas': 'every 6 hours', 'cada 12 horas': 'every 12 hours', 'cada día': 'daily',
    'revisado {when}': 'checked {when}', 'comprobando…': 'checking…', 'Activa': 'Active', 'En pausa': 'Paused',
    'Comprobar ahora': 'Check now', 'Dejar de seguir': 'Unsubscribe', '{n} vídeos nuevos en la cola': '{n} new videos queued',
    'No hay nada nuevo': 'Nothing new', 'Pega el enlace de un canal o playlist.': 'Paste a channel or playlist link.',
    'Leyendo el canal…': 'Reading the channel…', 'Suscrito a {t}': 'Subscribed to {t}',
    // --- Convert: format ---
    'Arrastra archivos aquí': 'Drop files here', 'o haz clic para elegirlos · audio, vídeo o GIF': 'or click to choose them · audio, video or GIF',
    '{n} archivos ({size}) — haz clic para cambiar': '{n} files ({size}) — click to change',
    '▶ Escuchar el tramo': '▶ Play the part', 'Todo el archivo': 'Whole file', 'Inicio del recorte': 'Trim start', 'Final del recorte': 'Trim end',
    '{a} → {b} · {len}': '{a} → {b} · {len}',
    'Tipo': 'Type', 'Preajuste': 'Preset', 'Opciones avanzadas': 'Advanced options', 'Automática': 'Automatic',
    'Frecuencia de muestreo': 'Sample rate', 'Canales': 'Channels', 'Estéreo': 'Stereo', 'Mono': 'Mono',
    'Normalizar volumen': 'Normalize volume', 'Resolución': 'Resolution', 'Alta': 'High', 'Media': 'Medium', 'Baja': 'Low',
    'Fotogramas por segundo': 'Frames per second', 'Girar': 'Rotate', 'No': 'No', '90° a la derecha': '90° clockwise',
    '90° a la izquierda': '90° counter-clockwise', 'Espejo horizontal': 'Mirror horizontally', 'Espejo vertical': 'Mirror vertically',
    'Quitar el audio': 'Remove audio', 'Velocidad': 'Speed', 'Normal': 'Normal', 'Recortar desde': 'Trim from',
    'Final': 'End', 'Convertir a {f}': 'Convert to {f}', 'Convertir {n} archivos a {f}': 'Convert {n} files to {f}',
    'Formato sin pérdida: la calidad en kbps no aplica.': "Lossless format: kbps quality doesn't apply.",
    'El GIF no lleva sonido. Sin resolución elegida se limita a 480 px de ancho y 12 fps; recórtalo para que no pese demasiado.': "GIFs have no sound. Without a chosen resolution it's limited to 480 px wide and 12 fps; trim it so it isn't too big.",
    'Si eliges un vídeo, se extrae solo su audio.': 'If you pick a video, only its audio is extracted.',
    'Elige uno o varios archivos primero': 'Choose one or more files first', 'Subiendo…': 'Uploading…', 'Subiendo': 'Uploading',
    '{ok} en cola · {n} con error — {first}': '{ok} queued · {n} failed — {first}', 'No se pudo subir el archivo.': "Couldn't upload the file.",
    'Personalizado': 'Custom', 'Música — alta calidad': 'Music — high quality', 'iPhone / Apple Music': 'iPhone / Apple Music',
    'Podcast / voz': 'Podcast / voice', 'Audiolibro — ligero': 'Audiobook — small', 'Nota de voz (OPUS)': 'Voice note (OPUS)',
    'Archivo sin pérdida': 'Lossless archive', 'WhatsApp — ligero': 'WhatsApp — small', 'Instagram / TikTok': 'Instagram / TikTok',
    'YouTube — máxima calidad': 'YouTube — top quality', 'Email — lo más ligero': 'Email — smallest', 'iPhone / Apple (HEVC)': 'iPhone / Apple (HEVC)',
    'Web (WEBM)': 'Web (WEBM)', 'GIF para redes': 'GIF for social media',
    'MP3 — el más compatible': 'MP3 — most compatible', 'M4A (AAC) — iPhone, iTunes': 'M4A (AAC) — iPhone, iTunes', 'AAC — archivo AAC puro': 'AAC — raw AAC file',
    'OGG (Vorbis)': 'OGG (Vorbis)', 'OPUS — mejor calidad por kbps': 'OPUS — best quality per kbps', 'WMA — Windows Media': 'WMA — Windows Media',
    'AC3 — Dolby Digital': 'AC3 — Dolby Digital', 'FLAC — sin pérdida': 'FLAC — lossless', 'ALAC — sin pérdida de Apple': "ALAC — Apple's lossless",
    'WAV — sin comprimir': 'WAV — uncompressed', 'AIFF — sin comprimir (Mac)': 'AIFF — uncompressed (Mac)',
    'MP4 (H.264) — el más compatible': 'MP4 (H.264) — most compatible', 'MP4 (H.265/HEVC) — menos peso, más lento': 'MP4 (H.265/HEVC) — smaller, slower',
    'WEBM (VP9) — para web': 'WEBM (VP9) — for the web', 'MOV — QuickTime / Apple': 'MOV — QuickTime / Apple', 'FLV — Flash Video': 'FLV — Flash Video',
    'MPG (MPEG-2) — DVD, reproductores antiguos': 'MPG (MPEG-2) — DVD, old players', '3GP — móviles antiguos': '3GP — old phones',
    'OGV (Theora)': 'OGV (Theora)', 'GIF animado — sin sonido': 'Animated GIF — no sound',
    // --- Convert: merge / compress / image ---
    'Arrastra los archivos que quieres unir': 'Drop the files you want to merge', 'se unen en este orden; puedes cambiarlo abajo': 'they are joined in this order; you can change it below',
    '{n} archivos · añade más aquí': '{n} files · add more here', 'Resultado': 'Result', 'Tamaño del vídeo': 'Video size',
    'Como el primer vídeo': 'Like the first video', 'Subir': 'Move up', 'Bajar': 'Move down', 'Quitar': 'Remove',
    'En vídeo, los clips de otro tamaño se encajan con bandas negras; los archivos de audio aparecen con imagen en negro.': 'For video, clips of another size are letterboxed; audio files get a black picture.',
    'Unir {n} archivos': 'Merge {n} files', 'Elige al menos dos archivos para unir.': 'Choose at least two files to merge.',
    'Arrastra los vídeos o audios que quieres que pesen menos': 'Drop the videos or audio files you want smaller',
    'cada archivo se comprime por separado': 'each file is compressed separately', 'Que pese como mucho': 'Maximum size',
    'Otro tamaño (MB)': 'Other size (MB)', 'p. ej. 12': 'e.g. 12',
    'TubeGrab calcula la calidad para que quepa. Si el tamaño es muy pequeño para la duración, baja la resolución o te avisa.': "TubeGrab works out the quality so it fits. If the size is too small for the length, it lowers the resolution or tells you.",
    'Comprimir a {mb} MB': 'Compress to {mb} MB', 'Comprimir {n} archivos a {mb} MB': 'Compress {n} files to {mb} MB',
    'Indica un tamaño entre 1 y 4000 MB.': 'Enter a size between 1 and 4000 MB.',
    'Arrastra un vídeo o una canción': 'Drop a video or a song', 'saca un fotograma o la carátula como imagen': 'take a frame or the cover art as an image',
    'Momento del vídeo': 'Moment in the video', 'Qué imagen': 'Which image', 'Fotograma': 'Frame', 'Carátula': 'Cover art',
    'En el momento': 'At', 'PNG (sin pérdida)': 'PNG (lossless)', 'Extraer imagen': 'Extract image', 'Extraer {n} imágenes': 'Extract {n} images',
    // --- Queue ---
    'Actividad': 'Activity', 'Pausar todo': 'Pause all', 'Reanudar todo': 'Resume all', 'Borrar terminadas': 'Clear finished',
    'Lo que descargues o conviertas aparecerá aquí.': 'What you download or convert will show up here.',
    'Ordena lo que está esperando con ↑ ↓, o pulsa ⤒ para que sea lo siguiente. Las descargas en pausa siguen donde se quedaron.': 'Reorder waiting items with ↑ ↓, or press ⤒ to make it next. Paused downloads carry on where they stopped.',
    'En cola': 'Queued', 'quedan {t}': '{t} left', 'Guardando…': 'Saving…', 'Guardado': 'Saved', 'Completado': 'Done',
    'No se pudo guardar': "Couldn't save", 'Cancelado': 'Canceled', 'Error': 'Error', '{n} archivos': '{n} files',
    'Que sea lo siguiente': 'Make it next', 'Subir en la cola': 'Move up', 'Bajar en la cola': 'Move down', 'Reanudar': 'Resume',
    'Pausar': 'Pause', 'Cancelar': 'Cancel', 'Abrir la carpeta': 'Open the folder', 'Abrir': 'Open', 'Mostrar en la carpeta': 'Show in folder',
    'Guardar': 'Save', 'Quitar de la lista': 'Remove from the list', '{n} en curso': '{n} in progress', '{n} en pausa': '{n} paused',
    'Conversión terminada': 'Conversion finished', 'Descarga terminada': 'Download finished', 'Algo falló': 'Something failed',
    // --- History ---
    'Buscar en el historial': 'Search history', 'Borrar historial': 'Clear history', 'Aún no hay nada aquí.': 'Nothing here yet.',
    'Nada coincide con "{q}".': 'Nothing matches "{q}".', 'Volver a descargar': 'Download again',
    'ahora mismo': 'just now', 'hace {n} min': '{n} min ago', 'hace {n} h': '{n} h ago', 'hace {n} días': '{n} days ago',
    // --- Settings ---
    'Restablecer': 'Reset', 'Idioma': 'Language', 'Interfaz predeterminada': 'Default interface', 'al abrir la app': 'when the app opens',
    'Aspecto': 'Appearance', 'Automático': 'Automatic', 'Claro': 'Light', 'Oscuro': 'Dark', 'Color de énfasis': 'Accent colour',
    'Azul': 'Blue', 'Morado': 'Purple', 'Rosa': 'Pink', 'Rojo': 'Red', 'Naranja': 'Orange', 'Amarillo': 'Yellow', 'Verde': 'Green',
    'Grafito': 'Graphite', 'Fondo': 'Background', 'Aurora': 'Aurora', 'Océano': 'Ocean', 'Atardecer': 'Sunset', 'Bosque': 'Forest',
    'Vidrio': 'Glass', 'Transparente': 'Clear', 'Tintado': 'Tinted', 'Opaco': 'Opaque', 'Tamaño del texto': 'Text size',
    'Pequeño': 'Small', 'Grande': 'Large', 'Carpeta': 'Folder', 'Carpeta de descargas': 'Download folder', 'Cambiar…': 'Change…',
    'Límite de velocidad': 'Speed limit', 'por descarga': 'per download', 'Sin límite': 'No limit', 'Descargas a la vez': 'Downloads at once',
    'Recordar mis últimas opciones': 'Remember my last options', 'formato, calidad…': 'format, quality…',
    'Si YouTube corta descargas al bajar muchas a la vez, baja "Descargas a la vez" a 1 o 2.': 'If YouTube cuts downloads when fetching many at once, set "Downloads at once" to 1 or 2.',
    'Cookies': 'Cookies',
    'Para vídeos con restricción de edad o que piden iniciar sesión: guarda un cookies.txt en la carpeta de datos.': 'For age-restricted or sign-in videos: put a cookies.txt in the data folder.',
    'Abrir carpeta': 'Open folder', 'cookies.txt encontrado: se usa en todas las descargas.': 'cookies.txt found: it is used for every download.',
    'Aceleración por tarjeta gráfica': 'Graphics card acceleration', 'Comprobando tu tarjeta gráfica…': 'Checking your graphics card…',
    'Activada': 'On', 'Desactivada': 'Off', 'Conversiones a la vez': 'Conversions at once',
    'La tarjeta gráfica acelera los vídeos MP4, MKV, MOV y H.265 varias veces. Si algo sale mal con ella, TubeGrab lo repite con el procesador automáticamente.': 'The graphics card speeds up MP4, MKV, MOV and H.265 videos several times. If something goes wrong with it, TubeGrab redoes it on the processor automatically.',
    'Detectada: {gpu}. Los vídeos H.264/H.265 se convierten con ella.': 'Found: {gpu}. H.264/H.265 videos are converted with it.',
    'No se encontró una tarjeta compatible (NVIDIA, Intel o AMD); se usa el procesador.': 'No compatible card found (NVIDIA, Intel or AMD); the processor is used.',
    'Avisos': 'Notifications', 'Avisar al terminar': 'Notify when finished', 'Sonido al terminar': 'Sound when finished', 'Windows': 'Windows',
    'Seguir en la bandeja al cerrar': 'Keep running in the tray when closed', 'las descargas y suscripciones continúan': 'downloads and subscriptions carry on',
    'Detectar enlaces copiados': 'Detect copied links', 'te ofrece descargarlos con un clic': 'offers to download them in one click',
    'Con "Detectar enlaces copiados", TubeGrab mira el portapapeles solo mientras está abierto y solo reacciona a enlaces de sitios compatibles. Nada sale de tu equipo.': 'With "Detect copied links", TubeGrab looks at the clipboard only while it is open and only reacts to links from supported sites. Nothing leaves your computer.',
    'Estos ajustes están en la app de escritorio.': 'These settings are in the desktop app.',
    'Actualizaciones': 'Updates', 'Buscar actualización': 'Check for update', 'Motor de descargas': 'Download engine', 'Versión instalada': 'Installed version',
    'El motor (yt-dlp) se actualiza solo una vez al día. Los sitios cambian a menudo; si una descarga falla, prueba a actualizarlo.': 'The engine (yt-dlp) updates itself once a day. Sites change often; if a download fails, try updating it.',
    'Privacidad y condiciones': 'Privacy and terms', 'Sin analíticas ni rastreadores. Descarga solo contenido que tengas derecho a descargar.': 'No analytics or trackers. Only download content you have the right to download.', 'Leer': 'Read',
    'Código abierto': 'Open source', 'Todo se procesa en tu equipo. Para uso personal; respeta los derechos de autor.': 'Everything is processed on your computer. For personal use; respect copyright.',
    'Comprobando actualizaciones…': 'Checking for updates…',
    'Portable: un solo .exe con todo incluido, sin instalar.': 'Portable: a single .exe with everything included, no install.',
    'Portable ligera: descarga ffmpeg y yt-dlp la primera vez.': 'Light portable: downloads ffmpeg and yt-dlp the first time.',
    'Instalada: con acceso en el menú Inicio; se actualiza con su instalador.': 'Installed: with a Start menu shortcut; updates through its installer.',
    'TubeGrab para Windows': 'TubeGrab for Windows',
    'Un único .exe, sin instalación (o con instalador). Guarda directamente en tu carpeta, se actualiza solo y tiene suscripciones. Windows puede avisar de "Editor desconocido" porque la app no tiene firma de pago: pulsa "Ejecutar de todas formas". Código abierto en': 'A single .exe, no install (or with an installer). Saves straight to your folder, updates itself and has subscriptions. Windows may warn "Unknown publisher" because the app has no paid signature: click "Run anyway". Open source on',
    'Todo se procesa en tu equipo · Para uso personal; respeta los derechos de autor.': 'Everything is processed on your computer · For personal use; respect copyright.',

    // --- Messages from the server / main process (ts) ---
    'Enlace no válido o sitio no soportado.': 'Invalid link or unsupported site.',
    'No se pudo obtener información del enlace.': "Couldn't get information about the link.",
    'El servidor está ocupado, inténtalo en unos segundos.': 'The server is busy, try again in a few seconds.',
    'Escribe qué quieres buscar (máx. 200 caracteres).': 'Type what you want to search for (max. 200 characters).',
    'No se pudo buscar ahora mismo. Inténtalo de nuevo.': "Couldn't search right now. Try again.",
    'Ese enlace no es una playlist, o está vacía.': "That link isn't a playlist, or it's empty.",
    'Demasiadas conexiones abiertas.': 'Too many open connections.',
    'Hay demasiados trabajos en la cola. Elimina algunos terminados e inténtalo de nuevo.': 'There are too many jobs in the queue. Remove some finished ones and try again.',
    'Ningún enlace válido. Sitios soportados: YouTube, Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp y más.': 'No valid link. Supported sites: YouTube, Vimeo, SoundCloud, X/Twitter, TikTok, Instagram, Facebook, Twitch, Dailymotion, Reddit, Bandcamp and more.',
    'Tramo no válido. Usa segundos o mm:ss, y que "Hasta" sea mayor que "Desde".': 'Invalid part. Use seconds or mm:ss, with "To" after "From".',
    'No se puede recortar y dividir por capítulos a la vez.': "You can't trim and split by chapters at the same time.",
    'No se recibió ningún archivo.': 'No file was received.', 'Formato de destino no soportado.': 'Unsupported target format.',
    'Tiempo de recorte no válido. Usa segundos o mm:ss, y que "Hasta" sea mayor que "Desde".': 'Invalid trim time. Use seconds or mm:ss, with "To" after "From".',
    'Formato de imagen no soportado.': 'Unsupported image format.', 'Elige fotograma o carátula.': 'Choose frame or cover art.',
    'Momento no válido. Usa segundos o mm:ss.': 'Invalid time. Use seconds or mm:ss.', 'Formato de destino no soportado para unir.': 'Unsupported target format for merging.',
    'Este trabajo no se puede reintentar ahora.': "This job can't be retried right now.", 'Este trabajo no se puede pausar.': "This job can't be paused.",
    'Este trabajo no está en pausa.': "This job isn't paused.", 'No se puede mover ese trabajo.': "That job can't be moved.",
    'El archivo ya no está disponible.': 'The file is no longer available.', 'Trabajo no encontrado.': 'Job not found.',
    'Falta el identificador de cliente.': 'Missing client id.', 'Origen no permitido.': 'Origin not allowed.',
    'Demasiadas peticiones, espera un minuto.': 'Too many requests, wait a minute.', 'Solo se admiten archivos de audio o vídeo.': 'Only audio or video files are accepted.',
    'Error al subir el archivo.': 'Upload error.', 'Petición no válida.': 'Invalid request.', 'Error interno del servidor.': 'Internal server error.',
    'Las suscripciones solo están en la app de escritorio.': 'Subscriptions are only in the desktop app.', 'Suscripción no encontrada.': 'Subscription not found.',
    'Has llegado al máximo de suscripciones.': "You've reached the maximum number of subscriptions.", 'Ya estás suscrito a ese canal o playlist.': "You're already subscribed to that channel or playlist.",
    'No se encontraron vídeos en ese enlace (¿es un canal o una playlist?).': 'No videos found at that link (is it a channel or a playlist?).',
    'No se pudo comprobar (¿sin conexión?).': "Couldn't check (offline?).", 'Solo en la app de escritorio.': 'Only in the desktop app.',
    'El sitio pide iniciar sesión (restricción de edad o anti-bots). Añade un archivo cookies.txt: en la app, Ajustes → Descargas → Cookies.': 'The site asks you to sign in (age restriction or anti-bot). Add a cookies.txt file: in the app, Settings → Downloads → Cookies.',
    'El vídeo es privado.': 'The video is private.', 'El sitio bloqueó la descarga (403). Prueba a actualizar el motor de descargas.': 'The site blocked the download (403). Try updating the download engine.',
    'Enlace no soportado.': 'Unsupported link.', 'El vídeo no está disponible.': 'The video is not available.',
    'Esa calidad o formato no está disponible para este vídeo.': "That quality or format isn't available for this video.", 'La descarga falló.': 'The download failed.',
    'No se pudo convertir el archivo. Verifica que sea un archivo de audio/vídeo válido.': "Couldn't convert the file. Check that it's a valid audio/video file.",
    'No se pudo convertir el archivo.': "Couldn't convert the file.", 'No se pudo leer la duración del archivo.': "Couldn't read the file's length.",
    'No se pudo leer el archivo.': "Couldn't read the file.", 'Este archivo no tiene carátula.': 'This file has no cover art.',
    'Este archivo no tiene imagen de vídeo; prueba con "Carátula".': 'This file has no video picture; try "Cover art".',
    'Ese momento está fuera del vídeo.': "That moment is outside the video.", 'No se generó ningún archivo.': 'No file was produced.', 'Error desconocido': 'Unknown error',
    'Iniciando…': 'Starting…', 'Descargando': 'Downloading', 'Descargando vídeo': 'Downloading video', 'Descargando audio': 'Downloading audio',
    'Convirtiendo audio…': 'Converting audio…', 'Uniendo vídeo y audio…': 'Merging video and audio…', 'Reintentando…': 'Retrying…',
    'Etiquetando capítulos…': 'Tagging chapters…', 'Convirtiendo': 'Converting', 'Convirtiendo (GPU)': 'Converting (GPU)', 'Comprimiendo': 'Compressing',
    'Analizando…': 'Analysing…', 'Analizando (1/2)': 'Analysing (1/2)', 'Comprimiendo (2/2)': 'Compressing (2/2)', 'Extrayendo imagen': 'Extracting image',
    'Analizando archivos…': 'Analysing files…',
    'Sin conexión a Internet': 'No Internet connection', 'No se encuentra GitHub (¿sin conexión?)': "Can't reach GitHub (offline?)",
    'La fecha y hora del equipo no son correctas': "The computer's date and time are wrong",
    'Conexión segura rechazada (¿antivirus o red que inspecciona HTTPS?)': 'Secure connection refused (antivirus or a network inspecting HTTPS?)',
    'No se pudo conectar a través del proxy': "Couldn't connect through the proxy", 'No se pudo conectar con GitHub': "Couldn't connect to GitHub",
    'GitHub limita las consultas ahora mismo; se reintentará más tarde': 'GitHub is rate-limiting right now; it will retry later',
    'Tiempo de espera agotado': 'Timed out', 'Demasiadas redirecciones': 'Too many redirects', 'versión publicada no válida': 'invalid published version',
    'el archivo descargado no coincide con la firma publicada (sha256)': "the downloaded file doesn't match the published signature (sha256)",
    'No se pudo actualizar el motor de descargas.': "Couldn't update the download engine.", 'Guardado cancelado': 'Saving canceled',
    'No se pudo guardar el archivo': "Couldn't save the file",
    'yt-dlp descargado no coincide con su huella SHA-256': "the downloaded yt-dlp doesn't match its SHA-256",
    'ffmpeg descargado no coincide con su huella SHA-256': "the downloaded ffmpeg doesn't match its SHA-256",
  };

  // Server messages with values inside.
  var PATTERNS = [
    [/^Uniendo (\d+) archivos$/, 'Merging $1 files'],
    [/^El archivo es demasiado grande \(máx\. (\d+) MB\)\.$/, 'The file is too big (max. $1 MB).'],
    [/^No se pudo iniciar (yt-dlp|ffmpeg): (.*)$/, "Couldn't start $1: $2"],
    [/^No se pudo leer "(.*)"\.$/, 'Couldn\'t read "$1".'],
    [/^"(.*)" no tiene sonido\.$/, '"$1" has no sound.'],
    [/^No cabe en (.+) MB: para esta duración hacen falta al menos (\d+) MB\.$/, "It doesn't fit in $1 MB: this length needs at least $2 MB."],
    [/^No cabe en (.+) MB con una calidad aceptable: para esta duración hacen falta al menos (\d+) MB \(o recórtalo antes\)\.$/, "It doesn't fit in $1 MB at an acceptable quality: this length needs at least $2 MB (or trim it first)."],
    [/^GitHub respondió (\d+)$/, 'GitHub answered $1'],
    [/^la versión (.*) no tiene un \.exe verificable$/, 'version $1 has no verifiable .exe'],
    [/^Origen de actualización no permitido: (.*)$/, 'Update origin not allowed: $1'],
  ];
  // Pieces of job descriptions ("MP4 Mejor calidad · por capítulos", "Unir 3 archivos · MP4"…).
  var PIECES = [
    ['Mejor calidad', 'Best quality'], ['por capítulos', 'by chapters'], ['–fin', '–end'], ['Comprimir a', 'Compress to'],
    ['carátula', 'cover art'], ['fotograma', 'frame'], ['Unir ', 'Merge '], [' archivos', ' files'], [' más', ' more'],
  ];

  function fill(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars && Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m; });
  }

  window.t = function (s, vars) {
    var out = lang === 'en' && Object.prototype.hasOwnProperty.call(EN, s) ? EN[s] : s;
    return fill(out, vars);
  };

  window.ts = function (s) {
    if (lang !== 'en' || !s) return s;
    s = String(s);
    if (Object.prototype.hasOwnProperty.call(EN, s)) return EN[s];
    for (var i = 0; i < PATTERNS.length; i++) if (PATTERNS[i][0].test(s)) return s.replace(PATTERNS[i][0], PATTERNS[i][1]);
    for (var j = 0; j < PIECES.length; j++) s = s.split(PIECES[j][0]).join(PIECES[j][1]);
    return s;
  };

  window.tgI18n = { lang: lang, EN: EN };
  if (lang !== 'en') return;

  // Translate the static page: text nodes and a few attributes, by exact match.
  function translateNode(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var raw = node.nodeValue;
      var key = raw.trim();
      if (key && Object.prototype.hasOwnProperty.call(EN, key)) node.nodeValue = raw.replace(key, EN[key]);
    }
    root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function (el) {
      ['placeholder', 'title', 'aria-label'].forEach(function (attr) {
        var v = el.getAttribute(attr);
        if (v && Object.prototype.hasOwnProperty.call(EN, v)) el.setAttribute(attr, EN[v]);
      });
    });
  }
  translateNode(document.body);
})();
