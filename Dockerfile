# Imagen base de Node.js
FROM node:20-slim

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

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm install --omit=dev

# Copiar el código de la aplicación
COPY server.js ./
COPY public/ ./public/

# El puerto que Render usará (por defecto 10000, pero configuramos 3000)
ENV PORT=3000
EXPOSE 3000

# Comando para arrancar la app
CMD ["node", "server.js"]
