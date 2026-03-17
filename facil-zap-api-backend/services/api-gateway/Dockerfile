FROM node:20-alpine
RUN apk add --no-cache git openssl

WORKDIR /app/services/api-gateway

COPY services/api-gateway/package*.json ./
RUN npm install

COPY prisma /app/prisma/
RUN npx prisma generate --schema=/app/prisma/schema.prisma

COPY services/api-gateway/src ./src
COPY services/api-gateway/tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]
