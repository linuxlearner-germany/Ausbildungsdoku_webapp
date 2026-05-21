# DATENBANKNAMEwebapp Docker Deployment Dokumentation

---

Diese Dokumentation beschreibt das **finale Docker-Deployment** der DATENBANKNAMEwebapp / Ausbildungsdoku Webapp mit:

- Docker
- Docker Compose
- Node.js-App-Container
- Redis-Container
- externem Microsoft SQL Server
- optionalem Proxy für `npm`, `apt` und Docker-Builds
- automatischen Datenbankmigrationen

Die Dokumentation beschreibt nur den Docker-basierten Betrieb.

> **Hinweis zu Platzhaltern:** Sensible und umgebungsspezifische Werte wurden durch Platzhalter ersetzt, z. B. `<DATENBANKNAME>`, `<SQL_BENUTZER>`, `<SQL_PASSWORT_HIER_EINTRAGEN>`, `<MSSQL_SERVER_IP_ODER_HOSTNAME>`, `<REDIS_PASSWORT_AENDERN>` und `<PROXY_PORT>`. Diese Werte müssen vor dem produktiven Einsatz angepasst werden.


---

## 1. Ziel des Deployments

Das Deployment stellt die Webapp als Docker-Container bereit.

Die Anwendung läuft in folgendem Aufbau:

```text
Benutzer / Browser
        |
        | HTTP oder HTTPS
        v
Docker-Server
        |
        +-- ausbildungsdoku-app
        |     Node.js Webapp
        |     Container-Port: 3010
        |     Host-Port:      3010
        |
        +-- ausbildungsdoku-redis
        |     Redis für Sessions / Cache
        |     intern erreichbar als redis:6379
        |
        +-- externer Microsoft SQL Server
              Datenbank: `<DATENBANKNAME>`
              Port:     1433
```

---

## 2. Verwendete Services

| Service | Containername | Aufgabe |
|---|---|---|
| `app` | `ausbildungsdoku-app` | Startet die Node.js-Webapp |
| `redis` | `ausbildungsdoku-redis` | Stellt Redis für Sessions/Cache bereit |
| Externer MSSQL | kein Docker-Container | Speichert die Anwendungsdaten |

---

## 3. Voraussetzungen auf dem Server

Auf dem Zielserver müssen installiert sein:

```bash
SQL_BENUTZER --version
SQL_BENUTZER compose version
git --version
```

Benötigt werden:

| Voraussetzung | Beschreibung |
|---|---|
| Docker | Führt die Container aus |
| Docker Compose Plugin | Startet mehrere Services gemeinsam |
| Git | Klont und aktualisiert das Repository |
| Netzwerkzugriff zum SQL Server | App muss `MSSQL_HOST:1433` erreichen |
| Freier Host-Port `3010` | Zugriff auf die Webapp |
| `.env`-Datei | Enthält Konfiguration und Secrets |
| Optional: Proxy | Falls Server nur über Proxy ins Internet kommt |

---

## 4. Datenbank vorbereiten

Die Datenbank wird extern auf einem Microsoft SQL Server betrieben.

### 4.1 Datenbank anlegen

In SQL Server Management Studio:

1. Verbindung zum SQL Server herstellen.
2. Neue Datenbank anlegen.
3. Datenbankname setzen:

```text
<DATENBANKNAME>
```

4. Kompatibilitätsgrad passend zur SQL-Server-Version wählen.
5. Datenbank speichern.

---

### 4.2 SQL-Benutzer anlegen

Beispielbenutzer:

```text
SQL_BENUTZER
```

Wichtig:

- SQL Server Authentication verwenden.
- Starkes Passwort vergeben.
- Option **Benutzer muss das Kennwort bei der nächsten Anmeldung ändern** deaktivieren.
- Benutzer der Datenbank `DATENBANKNAME` zuordnen.
- Rolle `db_owner` vergeben.
- Login aktivieren.

Beispiel per SQL:

```sql
USE master;
GO

CREATE LOGIN SQL_BENUTZER WITH PASSWORD = 'SQL_PASSWORT_HIER_EINTRAGEN';
GO

USE DATENBANKNAME;
GO

CREATE USER SQL_BENUTZER FOR LOGIN SQL_BENUTZER;
ALTER ROLE db_owner ADD MEMBER SQL_BENUTZER;
GO
```

Falls der Benutzer schon existiert:

```sql
ALTER LOGIN SQL_BENUTZER ENABLE;
ALTER LOGIN SQL_BENUTZER WITH PASSWORD = 'SQL_PASSWORT_HIER_EINTRAGEN';

USE DATENBANKNAME;
ALTER ROLE db_owner ADD MEMBER SQL_BENUTZER;
```

---

### 4.3 TCP/IP für SQL Server aktivieren

Im SQL Server Configuration Manager:

1. **SQL Server Network Configuration** öffnen.
2. **Protocols for MSSQLSERVER** auswählen.
3. **TCP/IP** aktivieren.
4. SQL Server Dienst neu starten.
5. Port `1433` prüfen.

---

### 4.4 Verbindung vom Docker-Server testen

```bash
nc -vz MSSQL_SERVER_IP_ODER_HOSTNAME 1433
```

Falls `nc` fehlt:

```bash
apt update
apt install -y netcat-openbsd
```

---

## 5. Repository auf dem Server clonen

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
```

Prüfen:

```bash
ls
```

Wichtige Dateien:

```text
Dockerfile
SQL_BENUTZER-compose.yml
SQL_BENUTZER-compose.server-redis.yml
package.json
package-lock.json
.env
app/
controllers/
data/
repositories/
routes/
services/
```

---

## 6. Dockerfile ohne Proxy

Diese Variante wird genutzt, wenn der Server direkt Zugriff auf Internet, npm Registry und Debian Paketquellen hat.

```SQL_BENUTZERfile
# syntax=SQL_BENUTZER/SQL_BENUTZERfile:1.7

# -------------------------------------------------------------------
# Basis-Stage
# -------------------------------------------------------------------
# Node.js 20 Slim wird als gemeinsames Basisimage verwendet.
# Slim ist kleiner als das volle Debian-Image, enthält aber genug
# Systembasis für native Node-Abhängigkeiten.
FROM node:20-slim AS base

# Arbeitsverzeichnis im Container.
# Alle folgenden COPY/RUN/CMD-Befehle beziehen sich auf /app.
WORKDIR /app


# -------------------------------------------------------------------
# Dependencies-Stage
# -------------------------------------------------------------------
FROM base AS deps

# Nur package.json und package-lock.json kopieren.
# Vorteil: Docker kann den npm-ci-Layer cachen, solange sich
# die Dependencies nicht ändern.
COPY package*.json ./

# npm ci installiert exakt die Versionen aus package-lock.json.
# --no-audit verhindert unnötige Netzwerkabfragen.
# fetch-retry-Werte helfen bei langsamen oder instabilen Netzwerken.
RUN npm ci --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000


# -------------------------------------------------------------------
# Build-Stage
# -------------------------------------------------------------------
FROM deps AS build

# Projektdateien in den Build-Container kopieren.
COPY . .

# Build-Skript aus package.json ausführen.
# Dabei werden Frontend-/Asset-Dateien erzeugt.
RUN npm run build


# -------------------------------------------------------------------
# Runtime-Basis
# -------------------------------------------------------------------
FROM node:20-slim AS runtime-base

# Systempakete installieren:
# - ca-certificates: TLS/HTTPS-Verbindungen
# - fonts-dejavu-core: Fonts für PDF-/Dokumentausgabe
# Danach apt-Cache löschen, um das Image klein zu halten.
# Zusätzlich wird ein Non-Root-User appuser angelegt.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system appuser \
  && useradd --system --gid appuser --create-home --home-dir /home/appuser appuser

WORKDIR /app

# Standardmäßig Produktion im Runtime-Image.
ENV NODE_ENV=production


# -------------------------------------------------------------------
# Lokale Stage
# -------------------------------------------------------------------
FROM runtime-base AS local

# Dev-/lokale Stage enthält node_modules und Quellcode.
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=appuser:appuser . .
COPY --from=build --chown=appuser:appuser /app/public ./public

# Die App lauscht im Container auf Port 3010.
EXPOSE 3010

# Containerprozess läuft nicht als root.
USER appuser

# Startet die Anwendung.
CMD ["node", "index.js"]


# -------------------------------------------------------------------
# Produktions-Runtime
# -------------------------------------------------------------------
FROM runtime-base AS runtime

# Dependency-Dateien erneut kopieren.
COPY package*.json ./

# Nur Produktionsabhängigkeiten installieren.
# --omit=dev entfernt Dev-Dependencies aus dem Runtime-Image.
RUN npm ci --omit=dev --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

# Laufzeitdateien aus der Build-Stage kopieren.
# --chown stellt sicher, dass appuser Zugriff auf Dateien hat.
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

---

## 7. Dockerfile mit Proxy

Diese Variante ist nötig, wenn der Server nur über einen Proxy ins Internet kommt.

Beispielproxy:

```text
proxy.example.local:PROXY_PORT
```

```SQL_BENUTZERfile
# syntax=SQL_BENUTZER/SQL_BENUTZERfile:1.7

# -------------------------------------------------------------------
# Basis-Stage mit Proxy
# -------------------------------------------------------------------
FROM node:20-slim AS base

# Proxy-Parameter als Build-Argumente.
# Diese Werte können beim Build überschrieben werden.
ARG HTTP_PROXY=http://proxy.example.local:PROXY_PORT
ARG HTTPS_PROXY=http://proxy.example.local:PROXY_PORT
ARG NO_PROXY=localhost,127.0.0.1,.wiweb.local

# Proxy-Variablen groß und klein setzen.
# Manche Tools nutzen HTTP_PROXY, andere http_proxy.
ENV HTTP_PROXY=$HTTP_PROXY
ENV HTTPS_PROXY=$HTTPS_PROXY
ENV NO_PROXY=$NO_PROXY
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTPS_PROXY
ENV no_proxy=$NO_PROXY

WORKDIR /app


# -------------------------------------------------------------------
# Dependencies-Stage
# -------------------------------------------------------------------
FROM base AS deps

COPY package*.json ./

# npm explizit auf den Proxy konfigurieren.
# Danach Dependencies reproduzierbar installieren.
RUN npm config set proxy "$HTTP_PROXY" \
  && npm config set https-proxy "$HTTPS_PROXY" \
  && npm ci --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000 --include=optional


# -------------------------------------------------------------------
# Build-Stage
# -------------------------------------------------------------------
FROM deps AS build

COPY . .
RUN npm run build


# -------------------------------------------------------------------
# Runtime-Basis mit Proxy
# -------------------------------------------------------------------
FROM node:20-slim AS runtime-base

ARG HTTP_PROXY=http://proxy.example.local:PROXY_PORT
ARG HTTPS_PROXY=http://proxy.example.local:PROXY_PORT
ARG NO_PROXY=localhost,127.0.0.1,.wiweb.local

ENV HTTP_PROXY=$HTTP_PROXY
ENV HTTPS_PROXY=$HTTPS_PROXY
ENV NO_PROXY=$NO_PROXY
ENV http_proxy=$HTTP_PROXY
ENV https_proxy=$HTTPS_PROXY
ENV no_proxy=$NO_PROXY

# apt-get nutzt ebenfalls die Proxy-Umgebungsvariablen.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system appuser \
  && useradd --system --gid appuser --create-home --home-dir /home/appuser appuser

WORKDIR /app
ENV NODE_ENV=production


# -------------------------------------------------------------------
# Runtime-Stage
# -------------------------------------------------------------------
FROM runtime-base AS runtime

COPY package*.json ./

# Produktionsabhängigkeiten ebenfalls über Proxy installieren.
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

---

## 8. SQL_BENUTZER-compose.yml

Diese Datei definiert den App-Service.

```yaml
services:
  app:
    # App wird aus dem lokalen Dockerfile gebaut.
    build:
      # Build-Kontext ist der aktuelle Projektordner.
      context: .

      # Expliziter Dockerfile-Name.
      SQL_BENUTZERfile: Dockerfile

      # Es wird nur die Produktions-Stage aus dem Dockerfile gebaut.
      target: runtime

    # Name des lokal gebauten Images.
    image: ausbildungsdoku-webapp:latest

    # Fester Containername für Logs, Debugging und Restart-Befehle.
    container_name: ausbildungsdoku-app

    # Container startet automatisch neu, außer er wurde manuell gestoppt.
    restart: unless-stopped

    # Init-Prozess im Container aktivieren.
    # Hilft beim sauberen Beenden von Node-Prozessen.
    init: true

    environment:
      # Laufzeitumgebung.
      # Für Produktion: production
      # Für Tests ohne HTTPS teilweise development.
      NODE_ENV: ${NODE_ENV:-production}

      # Zeitzone im Container.
      TZ: ${TZ:-Europe/Berlin}

      # Host und Port innerhalb des Containers.
      HOST: ${HOST:-0.0.0.0}
      PORT: ${PORT:-3010}

      # Öffentliche Basis-URL.
      # Bei direktem Testbetrieb kann leer bleiben.
      APP_BASE_URL: ${APP_BASE_URL:-}
      APP_BASE_PATH: ${APP_BASE_PATH:-}
      API_BASE_URL: ${API_BASE_URL:-}

      # Bei Betrieb hinter Reverse Proxy auf true setzen.
      TRUST_PROXY: ${TRUST_PROXY:-false}

      # Logging und Requestgrößen.
      LOG_LEVEL: ${LOG_LEVEL:-info}
      REQUEST_BODY_LIMIT: ${REQUEST_BODY_LIMIT:-15mb}

      # Login Rate Limit.
      LOGIN_RATE_LIMIT_WINDOW_MS: ${LOGIN_RATE_LIMIT_WINDOW_MS:-60000}
      LOGIN_RATE_LIMIT_MAX_ATTEMPTS: ${LOGIN_RATE_LIMIT_MAX_ATTEMPTS:-5}

      # Server-Timeouts.
      SERVER_REQUEST_TIMEOUT_MS: ${SERVER_REQUEST_TIMEOUT_MS:-30000}
      SERVER_HEADERS_TIMEOUT_MS: ${SERVER_HEADERS_TIMEOUT_MS:-35000}
      SERVER_KEEP_ALIVE_TIMEOUT_MS: ${SERVER_KEEP_ALIVE_TIMEOUT_MS:-5000}
      SHUTDOWN_TIMEOUT_MS: ${SHUTDOWN_TIMEOUT_MS:-10000}

      # Session-Konfiguration.
      SESSION_SECRET: ${SESSION_SECRET:?SESSION_SECRET must be set}
      SESSION_COOKIE_NAME: ${SESSION_COOKIE_NAME:-berichtsheft.sid}
      SESSION_COOKIE_DOMAIN: ${SESSION_COOKIE_DOMAIN:-}
      SESSION_SECURE: ${SESSION_SECURE:-true}
      SESSION_SAME_SITE: ${SESSION_SAME_SITE:-lax}
      SESSION_MAX_AGE_MS: ${SESSION_MAX_AGE_MS:-86400000}
      SESSION_TTL_SECONDS: ${SESSION_TTL_SECONDS:-86400}

      # Redis-Konfiguration.
      REDIS_URL: ${REDIS_URL:-}
      REDIS_HOST: ${REDIS_HOST:-}
      REDIS_PORT: ${REDIS_PORT:-}
      REDIS_PASSWORD: ${REDIS_PASSWORD:-}
      REDIS_KEY_PREFIX: ${REDIS_KEY_PREFIX:-berichtsheft:}
      REDIS_CONNECT_TIMEOUT_MS: ${REDIS_CONNECT_TIMEOUT_MS:-10000}
      REDIS_COMMAND_TIMEOUT_MS: ${REDIS_COMMAND_TIMEOUT_MS:-5000}
      REDIS_MAX_RETRIES: ${REDIS_MAX_RETRIES:-4}
      REDIS_PING_INTERVAL_MS: ${REDIS_PING_INTERVAL_MS:-30000}

      # MSSQL-Verbindung.
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

      # Migrationen und Bootstrap.
      APPLY_MIGRATIONS_ON_START: ${APPLY_MIGRATIONS_ON_START:-true}
      BOOTSTRAP_DATABASE_ON_START: ${BOOTSTRAP_DATABASE_ON_START:-true}
      RESET_DATABASE_ON_START: ${RESET_DATABASE_ON_START:-false}
      ENABLE_DEMO_DATA: ${ENABLE_DEMO_DATA:-false}

      # Initialer Admin.
      INITIAL_ADMIN_USERNAME: ${INITIAL_ADMIN_USERNAME:-admin}
      INITIAL_ADMIN_EMAIL: ${INITIAL_ADMIN_EMAIL:-admin@example.com}
      INITIAL_ADMIN_PASSWORD: ${INITIAL_ADMIN_PASSWORD:?INITIAL_ADMIN_PASSWORD must be set}
      INITIAL_ADMIN_FORCE_PASSWORD_CHANGE: ${INITIAL_ADMIN_FORCE_PASSWORD_CHANGE:-true}

    ports:
      # Host-Port:Container-Port.
      # Standard: 3010 auf dem Host auf 3010 im Container.
      - "${APP_PORT_MAPPING:-3010:3010}"

    healthcheck:
      # Prüft, ob die App intern bereit ist.
      test: ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:${PORT:-3010}${APP_BASE_PATH:-}/api/ready').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 20s
```

---

## 9. SQL_BENUTZER-compose.server-redis.yml

Diese Datei ergänzt Redis.

```yaml
services:
  redis:
    # Offizielles Redis-Alpine-Image.
    image: redis:7.4-alpine

    # Fester Containername.
    container_name: ausbildungsdoku-redis

    # Redis automatisch neu starten.
    restart: unless-stopped

    # Redis wird mit Passwort gestartet.
    # --save '' deaktiviert RDB-Snapshots.
    # --appendonly no deaktiviert AOF.
    # Für reine Sessiondaten ist das akzeptabel.
    command:
      - sh
      - -c
      - redis-server --save '' --appendonly no --dir /data --requirepass "REDIS_PASSWORT_AENDERN"

    ports:
      # Redis nur lokal auf dem Docker-Host erreichbar machen.
      # Dadurch ist Redis nicht offen im Netzwerk erreichbar.
      - "127.0.0.1:6379:6379"

    volumes:
      # Redis-Datenverzeichnis als Docker-Volume.
      - redis-data:/data

    healthcheck:
      # Redis-Verfügbarkeit mit Passwort prüfen.
      test: ["CMD-SHELL", "redis-cli -a \"REDIS_PASSWORT_AENDERN\" ping | grep -q PONG"]
      interval: 10s
      timeout: 5s
      retries: 10

volumes:
  # Docker verwaltet dieses Volume.
  redis-data:
```

Passend dazu in `.env`:

```env
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=REDIS_PASSWORT_AENDERN
REDIS_URL=
```

---

## 10. .env-Datei

Die `.env` muss im Projektordner liegen.

```env
# ------------------------------------------------------------
# Allgemeine App-Konfiguration
# ------------------------------------------------------------

NODE_ENV=production
TZ=Europe/Berlin
HOST=0.0.0.0
PORT=3010
APP_PORT_MAPPING=3010:3010


# ------------------------------------------------------------
# URLs und Proxy-Verhalten der App
# ------------------------------------------------------------

APP_BASE_URL=
APP_BASE_PATH=
API_BASE_URL=

# true, wenn die App hinter Nginx/Reverse Proxy läuft.
TRUST_PROXY=false


# ------------------------------------------------------------
# Logging und Serverlimits
# ------------------------------------------------------------

LOG_LEVEL=info
SERVER_REQUEST_TIMEOUT_MS=30000
SERVER_HEADERS_TIMEOUT_MS=35000
SERVER_KEEP_ALIVE_TIMEOUT_MS=5000
SHUTDOWN_TIMEOUT_MS=10000
REQUEST_BODY_LIMIT=15mb


# ------------------------------------------------------------
# Sessions und Cookies
# ------------------------------------------------------------

SESSION_SECRET=SESSION_SECRET_HIER_EINTRAGEN
SESSION_COOKIE_NAME=berichtsheft.sid
SESSION_COOKIE_DOMAIN=

# Ohne HTTPS im Test: false
# Mit HTTPS in Produktion: true
SESSION_SECURE=false

SESSION_SAME_SITE=lax
SESSION_MAX_AGE_MS=86400000
SESSION_TTL_SECONDS=86400


# ------------------------------------------------------------
# Redis
# ------------------------------------------------------------

REDIS_URL=
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=REDIS_PASSWORT_AENDERN
REDIS_KEY_PREFIX=berichtsheft:
REDIS_CONNECT_TIMEOUT_MS=10000
REDIS_COMMAND_TIMEOUT_MS=5000
REDIS_MAX_RETRIES=4
REDIS_PING_INTERVAL_MS=30000


# ------------------------------------------------------------
# Microsoft SQL Server
# ------------------------------------------------------------

MSSQL_HOST=MSSQL_SERVER_IP_ODER_HOSTNAME
MSSQL_PORT=1433
MSSQL_DATABASE=DATENBANKNAME
DB_USER=SQL_BENUTZER
DB_PASSWORD='SQL_PASSWORT_HIER_EINTRAGEN'

# Bei SQL Server mit Verschlüsselung true.
MSSQL_ENCRYPT=true

# Bei selbstsignierten Zertifikaten oder interner Testumgebung true.
MSSQL_TRUST_SERVER_CERTIFICATE=true

MSSQL_POOL_MIN=0
MSSQL_POOL_MAX=10
MSSQL_CONNECTION_TIMEOUT_MS=15000
MSSQL_REQUEST_TIMEOUT_MS=15000


# ------------------------------------------------------------
# Migrationen und Bootstrap
# ------------------------------------------------------------

# Muss true sein, damit DB-Migrationen beim Start ausgeführt werden.
APPLY_MIGRATIONS_ON_START=true

# Erstellt initiale Daten, falls vorgesehen.
BOOTSTRAP_DATABASE_ON_START=true

# Produktiv immer false lassen.
RESET_DATABASE_ON_START=false

# Produktiv normalerweise false.
ENABLE_DEMO_DATA=false


# ------------------------------------------------------------
# Initialer Admin
# ------------------------------------------------------------

INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=ADMIN_PASSWORT_HIER_EINTRAGEN
INITIAL_ADMIN_FORCE_PASSWORD_CHANGE=true
```

---

## 11. Finaler Startbefehl

Das finale Deployment wird mit beiden Compose-Dateien gestartet:

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d --build
```

Der Befehl bedeutet:

| Teil | Bedeutung |
|---|---|
| `SQL_BENUTZER compose` | Docker Compose Plugin |
| `-f SQL_BENUTZER-compose.server-redis.yml` | Redis-Definition laden |
| `-f SQL_BENUTZER-compose.yml` | App-Definition laden |
| `up` | Services erstellen/starten |
| `-d` | Im Hintergrund starten |
| `--build` | App-Image neu bauen |

---

## 12. Alle wichtigen Befehle

### 12.1 Deployment starten

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d --build
```

### 12.2 Deployment ohne Neubuild starten

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d
```

### 12.3 Deployment stoppen

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml down
```

### 12.4 Deployment sauber stoppen und Orphans entfernen

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml down --remove-orphans
```

### 12.5 Container neu starten

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml restart
```

### 12.6 Nur App neu starten

```bash
SQL_BENUTZER restart ausbildungsdoku-app
```

### 12.7 Nur Redis neu starten

```bash
SQL_BENUTZER restart ausbildungsdoku-redis
```

### 12.8 Status anzeigen

```bash
SQL_BENUTZER ps
```

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml ps
```

### 12.9 App-Logs live anzeigen

```bash
SQL_BENUTZER logs -f ausbildungsdoku-app
```

### 12.10 Redis-Logs live anzeigen

```bash
SQL_BENUTZER logs -f ausbildungsdoku-redis
```

### 12.11 Letzte App-Logs anzeigen

```bash
SQL_BENUTZER logs --tail=100 ausbildungsdoku-app
```

### 12.12 Container betreten

```bash
SQL_BENUTZER exec -it ausbildungsdoku-app sh
```

### 12.13 Redis testen

```bash
SQL_BENUTZER exec -it ausbildungsdoku-redis redis-cli -a "REDIS_PASSWORT_AENDERN" ping
```

Erwartung:

```text
PONG
```

### 12.14 App-Umgebungsvariablen prüfen

```bash
SQL_BENUTZER inspect ausbildungsdoku-app --format '{{.Config.Env}}' | tr ' ' '\n' | grep -E 'NODE_ENV|REDIS|MSSQL|DB_USER|PORT'
```

### 12.15 Build ohne Cache

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml build --no-cache --progress=plain
```

### 12.16 Build-Cache löschen

```bash
SQL_BENUTZER builder prune -af
```

### 12.17 Ungenutzte Docker-Daten löschen

```bash
SQL_BENUTZER system prune
```

### 12.18 Docker-Speicher anzeigen

```bash
SQL_BENUTZER system df
```

### 12.19 Volumes anzeigen

```bash
SQL_BENUTZER volume ls
```

---

## 13. Build mit Proxy

### 13.1 Proxy ohne Login

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml build --no-cache --progress=plain \
  --build-arg HTTP_PROXY="http://proxy.example.local:PROXY_PORT" \
  --build-arg HTTPS_PROXY="http://proxy.example.local:PROXY_PORT" \
  --build-arg NO_PROXY="localhost,127.0.0.1,.wiweb.local"
```

Danach starten:

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d
```

### 13.2 Proxy mit Login

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml build --no-cache --progress=plain \
  --build-arg HTTP_PROXY="http://BENUTZER:PASSWORT@proxy.example.local:PROXY_PORT" \
  --build-arg HTTPS_PROXY="http://BENUTZER:PASSWORT@proxy.example.local:PROXY_PORT" \
  --build-arg NO_PROXY="localhost,127.0.0.1,.wiweb.local"
```

Sonderzeichen kodieren:

| Zeichen | Kodierung |
|---|---|
| `@` | `%40` |
| `!` | `%21` |
| `:` | `%3A` |
| `/` | `%2F` |
| `#` | `%23` |

---

## 14. Datenbankmigrationen

Migrationen liegen hier:

```text
data/migrations/
```

Migrationen werden beim Start ausgeführt, wenn gesetzt:

```env
APPLY_MIGRATIONS_ON_START=true
```

Migrationen prüfen:

```sql
USE DATENBANKNAME;

SELECT *
FROM knex_migrations
ORDER BY id DESC;
```

---

## 15. Dauerhafter Fix für Import-Spalten

Beim Import trat dieser Fehler auf:

```text
String or binary data would be truncated in table 'DATENBANKNAME.dbo.entries', column 'betrieb'
```

Ursache:

Die Textspalten in `entries` waren zu kurz.

Der dauerhafte Fix ist eine Migration:

```text
data/migrations/20260514193000_widen_entries_text_columns.js
```

```js
exports.up = async function up(knex) {
  await knex.raw(`
    DECLARE @sql NVARCHAR(MAX) = N'';

    SELECT @sql = @sql +
      N'ALTER TABLE dbo.entries DROP CONSTRAINT [' + dc.name + N'];' + CHAR(13)
    FROM sys.default_constraints dc
    JOIN sys.columns c
      ON dc.parent_object_id = c.object_id
     AND dc.parent_column_id = c.column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.entries')
      AND c.name IN (
        'betrieb',
        'schule',
        'themen',
        'reflection',
        'trainerComment',
        'rejectionReason'
      );

    IF LEN(@sql) > 0
      EXEC sp_executesql @sql;

    ALTER TABLE dbo.entries ALTER COLUMN betrieb NVARCHAR(MAX) NULL;
    ALTER TABLE dbo.entries ALTER COLUMN schule NVARCHAR(MAX) NULL;
    ALTER TABLE dbo.entries ALTER COLUMN themen NVARCHAR(MAX) NULL;
    ALTER TABLE dbo.entries ALTER COLUMN reflection NVARCHAR(MAX) NULL;
    ALTER TABLE dbo.entries ALTER COLUMN trainerComment NVARCHAR(MAX) NULL;
    ALTER TABLE dbo.entries ALTER COLUMN rejectionReason NVARCHAR(MAX) NULL;
  `);
};

exports.down = async function down() {
  // Keine automatische Rueckmigration:
  // Eine Verkleinerung der Spalten koennte vorhandene Daten abschneiden.
};
```

Prüfen:

```sql
USE DATENBANKNAME;

SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH,
  IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'entries'
  AND COLUMN_NAME IN ('betrieb', 'schule', 'themen', 'reflection', 'trainerComment', 'rejectionReason')
ORDER BY COLUMN_NAME;
```

Erwartung:

```text
CHARACTER_MAXIMUM_LENGTH = -1
```

`-1` bedeutet:

```text
NVARCHAR(MAX)
```

---

## 16. Admin-Passwort zurücksetzen

Hash erzeugen:

```bash
SQL_BENUTZER exec -it ausbildungsdoku-app node -e 'const bcrypt=require("bcryptjs"); bcrypt.hash("NEUES_ADMIN_PASSWORT_HIER_EINTRAGEN",10).then(console.log)'
```

Hash in SQL eintragen:

```sql
USE DATENBANKNAME;

UPDATE users
SET password_hash = 'HIER_DEN_HASH_EINFUEGEN'
WHERE username = 'admin';
```

App neu starten:

```bash
SQL_BENUTZER restart ausbildungsdoku-app
```

---

## 17. Update-Prozess

```bash
cd Ausbildungsdoku_webapp
git pull
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml down --remove-orphans
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d --build
SQL_BENUTZER logs -f ausbildungsdoku-app
```

Nach dem Update prüfen:

```bash
SQL_BENUTZER ps
SQL_BENUTZER logs --tail=100 ausbildungsdoku-app
```

Migrationen prüfen:

```sql
USE DATENBANKNAME;

SELECT *
FROM knex_migrations
ORDER BY id DESC;
```

---


## 19. Fehlerbehebung

### 19.1 App startet nicht

Logs prüfen:

```bash
SQL_BENUTZER logs -f ausbildungsdoku-app
```

---

### 19.2 Redis wird nicht gefunden

Fehler:

```text
getaddrinfo ENOTFOUND redis
```

Fix:

```bash
SQL_BENUTZER compose down --remove-orphans
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml down --remove-orphans
SQL_BENUTZER rm -f ausbildungsdoku-app ausbildungsdoku-redis 2>/dev/null
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d --build --remove-orphans
```

---

### 19.3 Redis Passwort stimmt nicht

Prüfen:

```bash
SQL_BENUTZER exec -it ausbildungsdoku-redis redis-cli -a "REDIS_PASSWORT_AENDERN" ping
```

Wenn Redis mit Passwort läuft:

```env
REDIS_PASSWORD=REDIS_PASSWORT_AENDERN
```

Wenn Redis ohne Passwort läuft:

```env
REDIS_PASSWORD=
```

---

### 19.4 MSSQL Login schlägt fehl

Fehler:

```text
Fehler bei der Anmeldung für den Benutzer "SQL_BENUTZER"
```

Prüfen:

```env
MSSQL_HOST=MSSQL_SERVER_IP_ODER_HOSTNAME
MSSQL_PORT=1433
MSSQL_DATABASE=DATENBANKNAME
DB_USER=SQL_BENUTZER
DB_PASSWORD='SQL_PASSWORT_HIER_EINTRAGEN'
```

SQL-Rechte prüfen:

```sql
USE DATENBANKNAME;

SELECT name
FROM sys.database_principals
WHERE name = 'SQL_BENUTZER';
```

Rolle setzen:

```sql
ALTER ROLE db_owner ADD MEMBER SQL_BENUTZER;
```

---

### 19.5 npm hängt beim Build

Mit vollem Log bauen:

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml build --no-cache --progress=plain
```

Mit Proxy bauen:

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml build --no-cache --progress=plain \
  --build-arg HTTP_PROXY="http://proxy.example.local:PROXY_PORT" \
  --build-arg HTTPS_PROXY="http://proxy.example.local:PROXY_PORT"
```

---

### 19.6 `Cannot find package /app/node_modules/esbuild/index.js`

Fix:

```bash
SQL_BENUTZER builder prune -af
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml build --no-cache --progress=plain
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d
```

---


### 19.7 Port 3010 ist belegt

Prüfen:

```bash
ss -tulpen | grep 3010
```

Port ändern:

```env
APP_PORT_MAPPING=8080:3010
```

Neu starten:

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d
```

---

## 20. Wartung

Regelmäßig prüfen:

```bash
SQL_BENUTZER ps
SQL_BENUTZER logs --tail=100 ausbildungsdoku-app
SQL_BENUTZER logs --tail=100 ausbildungsdoku-redis
SQL_BENUTZER system df
SQL_BENUTZER volume ls
```

Speicher bereinigen:

```bash
SQL_BENUTZER image prune
SQL_BENUTZER builder prune -af
```

Nach Wartungsfenster neu bauen:

```bash
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d --build
```

---

## 21. Sicherheitsregeln

- `.env` niemals committen.
- Keine Passwörter im Dockerfile speichern.
- Keine Secrets in Logs ausgeben.
- `SESSION_SECRET` lang und zufällig setzen.
- `RESET_DATABASE_ON_START=false` produktiv setzen.
- `ENABLE_DEMO_DATA=false` produktiv setzen.
- Redis nicht öffentlich freigeben.
- MSSQL nicht öffentlich freigeben.
- App im Container nicht als root betreiben.
- Bei HTTPS `SESSION_SECURE=true` setzen.
- Bei Reverse Proxy `TRUST_PROXY=true` setzen.
- Initiales Admin-Passwort nach der Einrichtung ändern.
- Datenbank regelmäßig sichern.
- Migrationen vor Produktivdeployment testen.

---

## 22. Produktivwerte

Empfohlen für Produktion mit HTTPS:

```env
NODE_ENV=production
SESSION_SECURE=true
TRUST_PROXY=true
RESET_DATABASE_ON_START=false
ENABLE_DEMO_DATA=false
APPLY_MIGRATIONS_ON_START=true
BOOTSTRAP_DATABASE_ON_START=true
```

Für Testbetrieb ohne HTTPS:

```env
NODE_ENV=development
SESSION_SECURE=false
TRUST_PROXY=false
```

---

## 23. Finale Deployment-Checkliste

Vor Start:

- [ ] Docker installiert
- [ ] Docker Compose funktioniert
- [ ] Repository geklont
- [ ] `.env` angelegt
- [ ] SQL Server erreichbar
- [ ] SQL Login `SQL_BENUTZER` funktioniert
- [ ] Datenbank `DATENBANKNAME` existiert
- [ ] Redis-Passwort in Compose und `.env` identisch
- [ ] `SESSION_SECRET` gesetzt
- [ ] `INITIAL_ADMIN_PASSWORD` gesetzt
- [ ] `APPLY_MIGRATIONS_ON_START=true`
- [ ] `RESET_DATABASE_ON_START=false`

Nach Start:

- [ ] `SQL_BENUTZER ps` zeigt App und Redis
- [ ] App ist erreichbar
- [ ] Login funktioniert
- [ ] Migrationen sind in `knex_migrations`
- [ ] Import funktioniert
- [ ] Logs zeigen keine Fehler
- [ ] Backup-Strategie ist bekannt

---

## 24. Befehlsübersicht kompakt

```bash
# Repository clonen
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp

# .env bearbeiten
nano .env

# Finales Deployment starten
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml up -d --build

# Status prüfen
SQL_BENUTZER ps

# Logs anzeigen
SQL_BENUTZER logs -f ausbildungsdoku-app
SQL_BENUTZER logs -f ausbildungsdoku-redis

# Redis testen
SQL_BENUTZER exec -it ausbildungsdoku-redis redis-cli -a "REDIS_PASSWORT_AENDERN" ping

# App neu starten
SQL_BENUTZER restart ausbildungsdoku-app

# Stack stoppen
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml down

# Stack sauber entfernen
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml down --remove-orphans

# Neu bauen ohne Cache
SQL_BENUTZER compose -f SQL_BENUTZER-compose.server-redis.yml -f SQL_BENUTZER-compose.yml build --no-cache --progress=plain

# Build-Cache löschen
SQL_BENUTZER builder prune -af

# Docker-Speicher prüfen
SQL_BENUTZER system df
```
