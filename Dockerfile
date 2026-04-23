# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

COPY --from=build /app/app ./app
COPY --from=build /app/controllers ./controllers
COPY --from=build /app/data ./data
COPY --from=build /app/middleware ./middleware
COPY --from=build /app/modules ./modules
COPY --from=build /app/public ./public
COPY --from=build /app/Pictures ./Pictures
COPY --from=build /app/repositories ./repositories
COPY --from=build /app/routes ./routes
COPY --from=build /app/services ./services
COPY --from=build /app/sessions ./sessions
COPY --from=build /app/utils ./utils
COPY --from=build /app/validation ./validation
COPY --from=build /app/index.js ./index.js
COPY --from=build /app/knexfile.js ./knexfile.js

EXPOSE 3010

CMD ["node", "index.js"]
