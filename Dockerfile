# Imagen base de Node.js. yt-dlp usa este mismo Node (>=22, con su modelo de
# permisos) como motor JavaScript aislado para resolver los retos de YouTube.
FROM node:24-slim

# Instalar dependencias del sistema: python3 (para yt-dlp) y ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Descargar e instalar yt-dlp manualmente para asegurar la última versión
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias (incluye scripts/ porque el postinstall lo necesita)
COPY package*.json ./
COPY scripts/ ./scripts/

# Instalar solo dependencias de producción
RUN npm install --omit=dev

# Copiar el código de la aplicación
COPY server.js ./
COPY lib/ ./lib/
COPY public/ ./public/

# No ejecutar como root: el servidor solo necesita leer /app y escribir en /tmp.
USER node

# El puerto que Render usará (por defecto 10000, pero configuramos 3000)
ENV PORT=3000
# Dentro de un contenedor hay que escuchar en todas las interfaces: el mapeo
# de puertos de Docker no llega a un proceso que solo escucha en 127.0.0.1.
ENV HOST=0.0.0.0
# Usar el ffmpeg del sistema (trae ffprobe al lado, que yt-dlp necesita para
# portadas en MKV y SponsorBlock) en vez del binario de ffmpeg-static.
ENV FFMPEG_BIN=/usr/bin/ffmpeg
EXPOSE 3000

# Comando para arrancar la app
CMD ["node", "server.js"]
