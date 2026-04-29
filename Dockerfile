# syntax=docker/dockerfile:1.7

# Gemeinsames Node-LTS-Basisimage fuer Build und Runtime.
FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
# Abhaengigkeiten werden getrennt installiert, damit Build-Layer wiederverwendbar bleiben.
COPY package*.json ./
RUN npm ci --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

FROM deps AS build
# Das Frontend wird einmalig gebaut und spaeter in die Runtime uebernommen.
COPY . .
RUN npm run build

FROM node:20-slim AS runtime-base
# Runtime-Basis mit PDF-Fonts und eigenem Non-Root-User fuer den App-Prozess.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system appuser \
  && useradd --system --gid appuser --create-home --home-dir /home/appuser appuser
WORKDIR /app
ENV NODE_ENV=production

FROM runtime-base AS local
# Lokales Docker-Image enthaelt Quellcode, Tests und Dev-Dependencies fuer Docker-first Wartung.
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .
COPY --from=build --chown=appuser:appuser /app/public ./public
EXPOSE 3010
USER appuser
CMD ["node", "index.js"]

FROM runtime-base AS runtime
# Produktions-Runtime enthaelt nur benoetigte Produktionsabhaengigkeiten.
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

# Laufzeitdateien, Builds und Migrationsskripte werden aus der Build-Stage uebernommen.
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
