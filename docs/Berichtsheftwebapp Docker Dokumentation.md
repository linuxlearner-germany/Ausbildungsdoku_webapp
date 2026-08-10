@

# WIWEB Berichtsheft – Docker-Dokumentation

---

In dieser Dokumentation wird die App mit MS SQL und hinter einem Proxy deployed.

---

## 

## Anlegen der Datenbank mit "SQL Server Management Studio 22"

---

In diesem Beispiel heißt die Datenbank "Berichtsheft" und wird mit dem Kompatibilitätsgrad "SQL Server 2025 (170)" angelegt. Außerdem wird ein SQL User benötigt in dem fall mit dem Beispiel Namen "docker". Es muss  "Benutzer muss das Kennwort bei der nächsten Anmeldung ändern" deaktiviert sein. Nutzer muss der Datenbank zugeordent werden und die Rolle "db_owner" bekommen. Für den Remote Login auf der Datenbank muss im "Sql Server Configuration Manager" " TCP/IP" Akterviert



![](.\Pictures\Dantenbankeigenschaften_Optionen.png) 

![](.\Pictures\Anmeldeeigenschaften_user_Allgemein.png)



![](.\Pictures\Anmeldeeigenschaften_user_Benutzerzuordnung.png)



![](.\Pictures\Anmeldeeigenschaften_user_status.png)





#### Docker-Container auf dem Server Deployen

---

###### Paket-Anforderungen

> Docker-compose
> 
> Docker

---

###### Repo Clonen

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
```

---

###### Docker-Compose Anpassen

```yml
services:
  app:
    # Produktionsnaher Modus: nur die App laeuft im Container, MSSQL und Redis werden extern angebunden.
    build:
      context: .
      #args:
        #HTTP_PROXY: "http://proxy.example.local:8080"
        #HTTPS_PROXY: "http://proxy.example.local:8080"
        #NO_PROXY: "localhost,127.0.0.1,.local"
      dockerfile: Dockerfile
      target: runtime
    image: ausbildungsdoku-webapp:latest
    container_name: ausbildungsdoku-app
    restart: unless-stopped
    init: true
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      TZ: ${TZ:-Europe/Berlin}
      HOST: ${HOST:-0.0.0.0}
      PORT: ${PORT:-3010}
      APP_BASE_URL: ${APP_BASE_URL:-}
      APP_BASE_PATH: ${APP_BASE_PATH:-}
      API_BASE_URL: ${API_BASE_URL:-}
      TRUST_PROXY: ${TRUST_PROXY:-false}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      REQUEST_BODY_LIMIT: ${REQUEST_BODY_LIMIT:-15mb}
      LOGIN_RATE_LIMIT_WINDOW_MS: ${LOGIN_RATE_LIMIT_WINDOW_MS:-60000}
      LOGIN_RATE_LIMIT_MAX_ATTEMPTS: ${LOGIN_RATE_LIMIT_MAX_ATTEMPTS:-5}
      SERVER_REQUEST_TIMEOUT_MS: ${SERVER_REQUEST_TIMEOUT_MS:-30000}
      SERVER_HEADERS_TIMEOUT_MS: ${SERVER_HEADERS_TIMEOUT_MS:-35000}
      SERVER_KEEP_ALIVE_TIMEOUT_MS: ${SERVER_KEEP_ALIVE_TIMEOUT_MS:-5000}
      SHUTDOWN_TIMEOUT_MS: ${SHUTDOWN_TIMEOUT_MS:-10000}
      SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET must be set}
      SESSION_COOKIE_NAME: ${SESSION_COOKIE_NAME:-berichtsheft.sid}
      SESSION_COOKIE_DOMAIN: ${SESSION_COOKIE_DOMAIN:-}
      SESSION_SECURE: ${SESSION_SECURE:-true}
      SESSION_SAME_SITE: ${SESSION_SAME_SITE:-lax}
      SESSION_MAX_AGE_MS: ${SESSION_MAX_AGE_MS:-86400000}
      SESSION_TTL_SECONDS: ${SESSION_TTL_SECONDS:-86400}
      REDIS_URL: ${REDIS_URL:-}
      REDIS_HOST: ${REDIS_HOST:-}
      REDIS_PORT: ${REDIS_PORT:-}
      REDIS_PASSWORD: ${REDIS_PASSWORD:-}
      REDIS_KEY_PREFIX: ${REDIS_KEY_PREFIX:-berichtsheft:}
      REDIS_CONNECT_TIMEOUT_MS: ${REDIS_CONNECT_TIMEOUT_MS:-10000}
      REDIS_COMMAND_TIMEOUT_MS: ${REDIS_COMMAND_TIMEOUT_MS:-5000}
      REDIS_MAX_RETRIES: ${REDIS_MAX_RETRIES:-4}
      REDIS_PING_INTERVAL_MS: ${REDIS_PING_INTERVAL_MS:-30000}
      MSSQL_HOST: ${MSSQL_HOST:-}
      MSSQL_PORT: ${MSSQL_PORT:-1433}
      MSSQL_DATABASE: ${MSSQL_DATABASE:-}
      DB_USER: ${DB_USER:-}
      DB_PASSWORD: ${DB_PASSWORD:-}
      MSSQL_ENCRYPT: ${MSSQL_ENCRYPT:-true}
      MSSQL_TRUST_SERVER_CERTIFICATE: ${MSSQL_TRUST_SERVER_CERTIFICATE:-false}
      MSSQL_POOL_MIN: ${MSSQL_POOL_MIN:-0}
      MSSQL_POOL_MAX: ${MSSQL_POOL_MAX:-10}
      MSSQL_CONNECTION_TIMEOUT_MS: ${MSSQL_CONNECTION_TIMEOUT_MS:-15000}
      MSSQL_REQUEST_TIMEOUT_MS: ${MSSQL_REQUEST_TIMEOUT_MS:-15000}
      APPLY_MIGRATIONS_ON_START: ${APPLY_MIGRATIONS_ON_START:-true}
      BOOTSTRAP_DATABASE_ON_START: ${BOOTSTRAP_DATABASE_ON_START:-true}
      RESET_DATABASE_ON_START: ${RESET_DATABASE_ON_START:-false}
      ENABLE_DEMO_DATA: ${ENABLE_DEMO_DATA:-false}
      INITIAL_ADMIN_USERNAME: ${INITIAL_ADMIN_USERNAME:-admin}
      INITIAL_ADMIN_EMAIL: ${INITIAL_ADMIN_EMAIL:-admin@example.com}
      INITIAL_ADMIN_PASSWORD: ${INITIAL_ADMIN_PASSWORD:?INITIAL_ADMIN_PASSWORD must be set}
      INITIAL_ADMIN_FORCE_PASSWORD_CHANGE: ${INITIAL_ADMIN_FORCE_PASSWORD_CHANGE:-true}
    ports:
      - "${APP_PORT_MAPPING:-3010:3010}"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:${PORT:-3010}${APP_BASE_PATH:-}/api/ready').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 20s
```





###### Dockerfile Anpassen

---

###### Dockerfile mit Proxy

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base

ARG HTTP_PROXY=http://proxy.example.local:8080
ARG HTTPS_PROXY=http://proxy.example.local:8080
ARG NO_PROXY=localhost,127.0.0.1,.local

ENV HTTP_PROXY=$HTTP_PROXY
ENV HTTPS_PROXY=$HTTPS_PROXY
ENV NO_PROXY=$NO_PROXY
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTPS_PROXY
ENV no_proxy=$NO_PROXY

WORKDIR /app

FROM base AS deps
COPY package*.json ./

RUN npm config set proxy "$HTTP_PROXY" \
  && npm config set https-proxy "$HTTPS_PROXY" \
  && npm ci --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000 --include=optional

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-slim AS runtime-base

ARG HTTP_PROXY=http://proxy.example.local:8080
ARG HTTPS_PROXY=http://proxy.example.local:8080
ARG NO_PROXY=localhost,127.0.0.1,.local

ENV HTTP_PROXY=$HTTP_PROXY
ENV HTTPS_PROXY=$HTTPS_PROXY
ENV NO_PROXY=$NO_PROXY
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTPS_PROXY
ENV no_proxy=$NO_PROXY

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

COPY package*.json ./

RUN npm config set proxy "$HTTP_PROXY" \
  && npm config set https-proxy "$HTTPS_PROXY" \
  && npm ci --omit=dev --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000 --include=optional

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

```



Dockerfile  ohne Proxy

---

```dockerfile
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

```





###### Redis docker-compose anpassen

```docker-compose.server-redis.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runtime
    image: ausbildungsdoku-webapp:latest
    container_name: ausbildungsdoku-app
    restart: unless-stopped
    init: true
    depends_on:
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: ${NODE_ENV:-production}
      TZ: ${TZ:-Europe/Berlin}
      HOST: ${HOST:-0.0.0.0}
      PORT: ${PORT:-3010}

      APP_BASE_URL: ${APP_BASE_URL:-}
      APP_BASE_PATH: ${APP_BASE_PATH:-}
      API_BASE_URL: ${API_BASE_URL:-}
      TRUST_PROXY: ${TRUST_PROXY:-false}

      LOG_LEVEL: ${LOG_LEVEL:-info}
      REQUEST_BODY_LIMIT: ${REQUEST_BODY_LIMIT:-15mb}

      SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET must be set}
      SESSION_COOKIE_NAME: ${SESSION_COOKIE_NAME:-berichtsheft.sid}
      SESSION_COOKIE_DOMAIN: ${SESSION_COOKIE_DOMAIN:-}
      SESSION_SECURE: ${SESSION_SECURE:-true}
      SESSION_SAME_SITE: ${SESSION_SAME_SITE:-lax}
      SESSION_MAX_AGE_MS: ${SESSION_MAX_AGE_MS:-86400000}
      SESSION_TTL_SECONDS: ${SESSION_TTL_SECONDS:-86400}

      REDIS_URL: redis://redis:6379
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ""
      REDIS_KEY_PREFIX: ${REDIS_KEY_PREFIX:-berichtsheft:}
      REDIS_CONNECT_TIMEOUT_MS: ${REDIS_CONNECT_TIMEOUT_MS:-10000}
      REDIS_COMMAND_TIMEOUT_MS: ${REDIS_COMMAND_TIMEOUT_MS:-5000}
      REDIS_MAX_RETRIES: ${REDIS_MAX_RETRIES:-4}
      REDIS_PING_INTERVAL_MS: ${REDIS_PING_INTERVAL_MS:-30000}

      MSSQL_HOST: ${MSSQL_HOST:-}
      MSSQL_PORT: ${MSSQL_PORT:-1433}
      MSSQL_DATABASE: ${MSSQL_DATABASE:-}
      DB_USER: ${DB_USER:-}
      DB_PASSWORD: ${DB_PASSWORD:-}
      MSSQL_ENCRYPT: ${MSSQL_ENCRYPT:-true}
      MSSQL_TRUST_SERVER_CERTIFICATE: ${MSSQL_TRUST_SERVER_CERTIFICATE:-false}
      MSSQL_POOL_MIN: ${MSSQL_POOL_MIN:-0}
      MSSQL_POOL_MAX: ${MSSQL_POOL_MAX:-10}
      MSSQL_CONNECTION_TIMEOUT_MS: ${MSSQL_CONNECTION_TIMEOUT_MS:-15000}
      MSSQL_REQUEST_TIMEOUT_MS: ${MSSQL_REQUEST_TIMEOUT_MS:-15000}

      APPLY_MIGRATIONS_ON_START: ${APPLY_MIGRATIONS_ON_START:-true}
      BOOTSTRAP_DATABASE_ON_START: ${BOOTSTRAP_DATABASE_ON_START:-true}
      RESET_DATABASE_ON_START: ${RESET_DATABASE_ON_START:-false}
      ENABLE_DEMO_DATA: ${ENABLE_DEMO_DATA:-false}

      INITIAL_ADMIN_USERNAME: ${INITIAL_ADMIN_USERNAME:-admin}
      INITIAL_ADMIN_EMAIL: ${INITIAL_ADMIN_EMAIL:-admin@example.com}
      INITIAL_ADMIN_PASSWORD: ${INITIAL_ADMIN_PASSWORD:?INITIAL_ADMIN_PASSWORD must be set}
      INITIAL_ADMIN_FORCE_PASSWORD_CHANGE: ${INITIAL_ADMIN_FORCE_PASSWORD_CHANGE:-true}

    ports:
      - "${APP_PORT_MAPPING:-3010:3010}"

    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:${PORT:-3010}${APP_BASE_PATH:-}/api/ready').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 20s

  redis:
    image: redis:7-alpine
    container_name: ausbildungsdoku-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 10

volumes:
  redis-data:
```



###### .env anpasse

---

```.env
NODE_ENV=development
TZ=Europe/Berlin
HOST=0.0.0.0
PORT=3010
APP_PORT_MAPPING=3010:3010

APP_BASE_URL=
APP_BASE_PATH=
API_BASE_URL=
TRUST_PROXY=false
LOG_LEVEL=info
SERVER_REQUEST_TIMEOUT_MS=30000
SERVER_HEADERS_TIMEOUT_MS=35000
SERVER_KEEP_ALIVE_TIMEOUT_MS=5000
SHUTDOWN_TIMEOUT_MS=10000
REQUEST_BODY_LIMIT=15mb

SESSION_SECRET=BitteAendernSehrLangUndSicher123!
SESSION_COOKIE_NAME=berichtsheft.sid
SESSION_COOKIE_DOMAIN=
SESSION_SECURE=false
SESSION_SAME_SITE=lax
SESSION_MAX_AGE_MS=86400000
SESSION_TTL_SECONDS=86400

REDIS_URL=
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_KEY_PREFIX=berichtsheft:
REDIS_CONNECT_TIMEOUT_MS=10000
REDIS_COMMAND_TIMEOUT_MS=5000
REDIS_MAX_RETRIES=4
REDIS_PING_INTERVAL_MS=30000

MSSQL_HOST=192.168.1.168
MSSQL_PORT=1433
MSSQL_DATABASE=Berichtsheft
DB_USER=docker
DB_PASSWORD='5A"cN$!:R9@bzY*O*'
MSSQL_PASSWORD=
MSSQL_ENCRYPT=true
MSSQL_TRUST_SERVER_CERTIFICATE=true
MSSQL_POOL_MIN=0
MSSQL_POOL_MAX=10
MSSQL_CONNECTION_TIMEOUT_MS=15000
MSSQL_REQUEST_TIMEOUT_MS=15000

APPLY_MIGRATIONS_ON_START=true
BOOTSTRAP_DATABASE_ON_START=true
RESET_DATABASE_ON_START=false
ENABLE_DEMO_DATA=false

INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=Admin123!
INITIAL_ADMIN_FORCE_PASSWORD_CHANGE=true


APPLY_MIGRATIONS_ON_START=true
```

---

---

#### Container starten und testen

---

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml up -d --build
```

###### Redis logs

```bash
docker compose -f docker-compose.server-redis.yml logs -f app
```

###### app logs

```bash
docker logs ausbildungsdoku-app
```

