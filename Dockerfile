# syntax=docker/dockerfile:1.7

FROM node:24.18.0-bookworm-slim AS base

WORKDIR /app

FROM base AS deps
COPY package*.json ./

RUN npm ci --no-audit --allow-remote=root --fetch-retries=5 --fetch-retry-maxtimeout=120000 --include=optional

FROM deps AS build
COPY . .
RUN npm run build

FROM node:24.18.0-bookworm-slim AS runtime-base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system appuser \
  && useradd --system --gid appuser --create-home --home-dir /home/appuser appuser

WORKDIR /app
ENV NODE_ENV=production

FROM runtime-base AS local
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .
COPY --from=build --chown=appuser:appuser /app/public ./public
EXPOSE 3010
USER appuser
CMD ["node", "index.js"]

FROM runtime-base AS runtime

ARG APP_VERSION=1.1.0
LABEL org.opencontainers.image.title="Ausbildungsdoku Webapp" \
  org.opencontainers.image.version="${APP_VERSION}" \
  org.opencontainers.image.source="https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp"

COPY package*.json ./

RUN npm ci --omit=dev --no-audit --allow-remote=root --fetch-retries=5 --fetch-retry-maxtimeout=120000 --include=optional

COPY --from=build --chown=appuser:appuser /app/app ./app
COPY --from=build --chown=appuser:appuser /app/controllers ./controllers
COPY --from=build --chown=appuser:appuser /app/data ./data
COPY --from=build --chown=appuser:appuser /app/middleware ./middleware
COPY --from=build --chown=appuser:appuser /app/modules ./modules
COPY --from=build --chown=appuser:appuser /app/public ./public
COPY --from=build --chown=appuser:appuser /app/Pictures ./Pictures
COPY --from=build --chown=appuser:appuser /app/repositories ./repositories
COPY --from=build --chown=appuser:appuser /app/routes ./routes
COPY --from=build --chown=appuser:appuser /app/scripts ./scripts
COPY --from=build --chown=appuser:appuser /app/services ./services
COPY --from=build --chown=appuser:appuser /app/sessions ./sessions
COPY --from=build --chown=appuser:appuser /app/utils ./utils
COPY --from=build --chown=appuser:appuser /app/validation ./validation
COPY --from=build --chown=appuser:appuser /app/index.js ./index.js
COPY --from=build --chown=appuser:appuser /app/knexfile.js ./knexfile.js
COPY --from=build --chown=appuser:appuser /app/package.json ./package.json

EXPOSE 3010
USER appuser
CMD ["node", "index.js"]
