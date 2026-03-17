FROM node:20-alpine
RUN apk add --no-cache git openssl

WORKDIR /app/services/message-queue

COPY services/message-queue/package*.json ./
RUN npm install

COPY prisma /app/prisma/
RUN npx prisma generate --schema=/app/prisma/schema.prisma

COPY services/message-queue/src ./src
COPY services/message-queue/tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]
