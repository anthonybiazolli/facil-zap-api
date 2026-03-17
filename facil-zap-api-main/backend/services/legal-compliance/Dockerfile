FROM node:20-alpine

# Instala o Chromium nativo e suas dependências para evitar o travamento do Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    git \
    openssl

# Força o Puppeteer a pular o download bugado e usar o navegador que instalamos acima
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app/services/legal-compliance

COPY services/legal-compliance/package*.json ./
RUN npm install

COPY prisma /app/prisma/
RUN npx prisma generate --schema=/app/prisma/schema.prisma

COPY services/legal-compliance/src ./src
COPY services/legal-compliance/tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]