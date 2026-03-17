FROM node:20-alpine
RUN apk add --no-cache git openssl

WORKDIR /app/services/anti-ban-engine

COPY services/anti-ban-engine/package*.json ./
RUN npm install

COPY prisma /app/prisma/
RUN npx prisma generate --schema=/app/prisma/schema.prisma

COPY services/anti-ban-engine/src ./src
COPY services/anti-ban-engine/tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]
