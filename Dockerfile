# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3010

CMD ["node", "index.js"]
