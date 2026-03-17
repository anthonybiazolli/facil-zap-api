FROM node:20-alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont nodejs yarn git openssl

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app/services/session-keeper

COPY services/session-keeper/package*.json ./
RUN npm install

COPY prisma /app/prisma/
RUN npx prisma generate --schema=/app/prisma/schema.prisma

COPY services/session-keeper/src ./src
COPY services/session-keeper/tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]