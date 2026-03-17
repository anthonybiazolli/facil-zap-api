FROM node:20-alpine
RUN apk add --no-cache git openssl

WORKDIR /app/services/legal-compliance

COPY services/legal-compliance/package*.json ./
RUN npm install

COPY prisma /app/prisma/
RUN npx prisma generate --schema=/app/prisma/schema.prisma

COPY services/legal-compliance/src ./src
COPY services/legal-compliance/tsconfig.json ./
RUN npm run build

CMD ["npm", "start"]
