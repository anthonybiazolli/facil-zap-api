FROM node:20-alpine
RUN apk add --no-cache git openssl

WORKDIR /app/services/payment-gateway

COPY services/payment-gateway/package*.json ./
RUN npm install

COPY prisma /app/prisma/
RUN npx prisma generate --schema=/app/prisma/schema.prisma

COPY services/payment-gateway/src ./src
COPY services/payment-gateway/tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]