# syntax=docker/dockerfile:1.7

# Schlankes Node-LTS-Image als gemeinsame Basis für Build und Runtime.
FROM node:20-bookworm-slim AS base
# Einheitliches Arbeitsverzeichnis in allen Stages.
WORKDIR /app

FROM base AS deps
# Nur Package-Metadaten kopieren, damit Dependency-Layer bei Code-Änderungen wiederverwendbar bleibt.
COPY package*.json ./
RUN npm ci --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

FROM deps AS build
# Vollständiger Quellcode wird nur in der Build-Stage benötigt.
COPY . .
# Baut das React-Frontend in `public/` für die Runtime.
RUN npm run build

FROM node:20-bookworm-slim AS runtime
# Runtime bleibt getrennt von der Build-Stage und enthält nur Produktionsabhängigkeiten.
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# Dev-Dependencies werden im finalen Image nicht installiert.
RUN npm ci --omit=dev --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

# Nur Laufzeitdateien aus der Build-Stage übernehmen.
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

# Standardport der HTTP-Anwendung.
EXPOSE 3010

# App-Start inklusive Runtime-Initialisierung, Migrationen und optionalem Bootstrap.
CMD ["node", "index.js"]
