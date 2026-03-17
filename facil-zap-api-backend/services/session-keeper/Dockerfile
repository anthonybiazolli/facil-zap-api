FROM node:20-alpine
RUN apk add --no-cache git openssl ffmpeg python3 make g++

WORKDIR /app/services/session-keeper

COPY services/session-keeper/package*.json ./
RUN npm install

COPY prisma /app/prisma/
RUN npx prisma generate --schema=/app/prisma/schema.prisma

COPY services/session-keeper/src ./src
COPY services/session-keeper/tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]
