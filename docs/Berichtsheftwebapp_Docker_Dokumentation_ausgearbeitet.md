# WIWEB Berichtsheft – Docker-Dokumentation

---

In dieser Dokumentation wird beschrieben, wie **WIWEB Berichtsheft** mit **Docker**, **Docker Compose**, **Redis**, **Microsoft SQL Server** und optionalem **Proxy** deployed wird.

Die Dokumentation beschreibt ausschließlich den Docker-basierten Betrieb. Eine lokale Installation ohne Docker wird nicht behandelt.

---

## Inhaltsverzeichnis

1. [Ziel der Dokumentation](#1-ziel-der-dokumentation)
2. [Architekturübersicht](#2-architekturübersicht)
3. [Voraussetzungen](#3-voraussetzungen)
4. [Datenbank mit SQL Server Management Studio vorbereiten](#4-datenbank-mit-sql-server-management-studio-vorbereiten)
5. [Repository auf dem Server bereitstellen](#5-repository-auf-dem-server-bereitstellen)
6. [Docker-relevante Projektdateien](#6-docker-relevante-projektdateien)
7. [Dockerfile](#7-dockerfile)
8. [Dockerfile mit Proxy](#8-dockerfile-mit-proxy)
9. [docker-compose.yml für die App](#9-docker-composeyml-für-die-app)
10. [docker-compose.server-redis.yml für Redis](#10-docker-composeserver-redisyml-für-redis)
11. [.env-Datei](#11-env-datei)
12. [Container starten](#12-container-starten)
13. [Container prüfen](#13-container-prüfen)
14. [Logs anzeigen](#14-logs-anzeigen)
15. [Datenbankmigrationen](#15-datenbankmigrationen)
16. [Import-Funktion und Spaltenlängen](#16-import-funktion-und-spaltenlängen)
17. [Admin-Passwort zurücksetzen](#17-admin-passwort-zurücksetzen)
18. [Proxy-Konfiguration](#18-proxy-konfiguration)
19. [Deployment-Workflow](#19-deployment-workflow)
20. [Update-Workflow](#20-update-workflow)
21. [Backup und Restore](#21-backup-und-restore)
22. [Sicherheit](#22-sicherheit)
23. [Fehlerbehebung](#23-fehlerbehebung)
24. [Wartung](#24-wartung)
25. [Offene Punkte](#25-offene-punkte)

---

## 1. Ziel der Dokumentation

Diese Dokumentation dient dazu, WIWEB Berichtsheft reproduzierbar per Docker auf einem Server zu betreiben.

Das getestete Ziel-Setup besteht aus:

| Komponente | Beschreibung |
|---|---|
| App-Container | Node.js-Webapp |
| Redis-Container | Session-/Cache-Service |
| Microsoft SQL Server | Externe Datenbank |
| Docker Compose | Orchestrierung der Container |
| Optionaler Proxy | Für Netzwerkumgebungen hinter Firmenproxy |

Die App wird standardmäßig auf Port `3010` veröffentlicht.

---

## 2. Architekturübersicht

```text
Browser
  |
  | HTTP/HTTPS
  v
Server
  |
  +-- ausbildungsdoku-app       Node.js-Webapp, Port 3010
  |
  +-- ausbildungsdoku-redis     Redis, intern erreichbar als redis:6379
  |
  +-- externer MSSQL Server     Datenbank Berichtsheft
```

### Container

| Container | Image | Zweck |
|---|---|---|
| `ausbildungsdoku-app` | `ausbildungsdoku-webapp:latest` | Webanwendung |
| `ausbildungsdoku-redis` | `redis:7-alpine` oder `redis:7.4-alpine` | Redis für Sessions/Cache |

### Externe Dienste

| Dienst | Zweck |
|---|---|
| Microsoft SQL Server | Speichert Benutzer, Berichte, Noten, Audit-Logs und weitere Daten |
| Optionaler Proxy | Wird beim Build benötigt, wenn der Server keinen direkten Internetzugang hat |

---

## 3. Voraussetzungen

### Server-Anforderungen

| Anforderung | Beschreibung |
|---|---|
| Linux-Server | z. B. Debian oder Ubuntu |
| Docker | Muss installiert sein |
| Docker Compose Plugin | Befehl `docker compose` muss verfügbar sein |
| Git | Für das Klonen des Repositories |
| Netzwerkzugriff auf MSSQL | Port `1433` muss vom Docker-Server zum SQL Server erreichbar sein |
| Freier Port `3010` | Für den Zugriff auf die App |
| `.env`-Datei | Muss vor dem Start angelegt werden |
| Optional: Proxy | Falls Internet nur über Proxy möglich ist |

### Versionen prüfen

```bash
docker --version
docker compose version
git --version
```

### Ports

| Port | Richtung | Zweck |
|---|---|---|
| `3010` | Host -> App-Container | Webapp |
| `6379` | localhost -> Redis-Container | Redis, optional lokal gebunden |
| `1433` | App-Container -> MSSQL Server | SQL Server Verbindung |

---

## 4. Datenbank mit SQL Server Management Studio vorbereiten

Die App benötigt eine Microsoft-SQL-Datenbank.

In diesem Beispiel:

| Wert | Beispiel |
|---|---|
| Datenbankname | `Berichtsheft` |
| SQL-Benutzer | `docker` |
| SQL-Port | `1433` |
| SQL-Server | z. B. `192.168.1.168` |

---

### 4.1 Datenbank anlegen

In **SQL Server Management Studio 22**:

1. Mit dem SQL Server verbinden.
2. Rechtsklick auf **Databases / Datenbanken**.
3. **New Database / Neue Datenbank** auswählen.
4. Datenbankname setzen:

```text
Berichtsheft
```

5. Datenbank erstellen.

Optionaler Kompatibilitätsgrad aus der Testumgebung:

```text
SQL Server 2025 (170)
```

Falls eine ältere SQL-Server-Version verwendet wird, muss der passende Kompatibilitätsgrad gewählt werden.

---

### 4.2 SQL Login anlegen

Ein SQL Login wird benötigt, z. B.:

```text
docker
```

Wichtig:

- SQL Server Authentication verwenden.
- Ein sicheres Passwort vergeben.
- Die Option **Benutzer muss das Kennwort bei der nächsten Anmeldung ändern** deaktivieren.
- Login aktivieren.
- Login der Datenbank `Berichtsheft` zuordnen.
- Rolle `db_owner` vergeben.

Beispiel per SQL:

```sql
USE master;
GO

CREATE LOGIN docker WITH PASSWORD = 'SICHERES_PASSWORT_HIER_SETZEN';
GO

USE Berichtsheft;
GO

CREATE USER docker FOR LOGIN docker;
ALTER ROLE db_owner ADD MEMBER docker;
GO
```

Falls der Login bereits existiert:

```sql
ALTER LOGIN docker ENABLE;
ALTER LOGIN docker WITH PASSWORD = 'NEUES_SICHERES_PASSWORT';

USE Berichtsheft;
ALTER ROLE db_owner ADD MEMBER docker;
```

---

### 4.3 TCP/IP aktivieren

Im **SQL Server Configuration Manager**:

1. **SQL Server Network Configuration** öffnen.
2. **Protocols for MSSQLSERVER** auswählen.
3. **TCP/IP** aktivieren.
4. SQL Server Dienst neu starten.
5. Prüfen, dass Port `1433` aktiv ist.

---

### 4.4 SQL-Verbindung testen

Vom Docker-Server aus muss der SQL Server erreichbar sein.

Beispiel:

```bash
nc -vz 192.168.1.168 1433
```

Falls `nc` nicht installiert ist:

```bash
apt update
apt install -y netcat-openbsd
```

---

## 5. Repository auf dem Server bereitstellen

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
```

Prüfen:

```bash
ls
```

Erwartete wichtige Dateien:

```text
Dockerfile
docker-compose.yml
docker-compose.server-redis.yml
package.json
package-lock.json
app/
controllers/
data/
repositories/
routes/
services/
```

---

## 6. Docker-relevante Projektdateien

| Datei | Zweck |
|---|---|
| `Dockerfile` | Baut das App-Image |
| `docker-compose.yml` | Definiert App-Service, Ports, Environment und Healthcheck |
| `docker-compose.server-redis.yml` | Definiert Redis-Service |
| `.env` | Enthält produktive Konfiguration und Secrets |
| `.dockerignore` | Schließt unnötige Dateien vom Build-Kontext aus |
| `package.json` | Enthält npm-Skripte und Dependencies |
| `package-lock.json` | Fixiert npm-Dependency-Versionen |
| `data/migrations/` | Enthält Datenbankmigrationen |
| `app/run-migrations.js` | Führt Migrationen aus |
| `index.js` | Startpunkt der Anwendung |

---

## 7. Dockerfile

Das Dockerfile ist ein Multi-Stage-Build.

Ziele:

1. Dependencies installieren
2. Build ausführen
3. Runtime-Image erstellen
4. Nur notwendige Dateien übernehmen
5. Non-Root-User verwenden
6. App über `node index.js` starten

---

### 7.1 Dockerfile ohne Proxy

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-slim AS runtime-base
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
RUN npm ci --omit=dev --no-audit --fetch-retries=5 --fetch-retry-maxtimeout=120000

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

### 7.2 Erklärung wichtiger Dockerfile-Zeilen

| Zeile | Bedeutung |
|---|---|
| `FROM node:20-slim AS base` | Verwendet Node.js 20 als Basis |
| `WORKDIR /app` | Setzt Arbeitsverzeichnis |
| `COPY package*.json ./` | Kopiert Dependency-Dateien |
| `npm ci` | Installiert Dependencies reproduzierbar |
| `npm run build` | Führt Build-Skript aus |
| `apt-get install ca-certificates fonts-dejavu-core` | Zertifikate und Fonts für Runtime/PDF |
| `useradd ... appuser` | Erstellt Non-Root-User |
| `COPY --from=build ...` | Kopiert Build-Dateien in Runtime-Image |
| `EXPOSE 3010` | Dokumentiert Container-Port |
| `CMD ["node", "index.js"]` | Startet die App |

---

## 8. Dockerfile mit Proxy

Wenn der Server hinter einem Firmenproxy steht, muss npm während des Builds über den Proxy gehen.

Beispiel-Proxy:

```text
proxy.wiweb.local:3128
```

---

### 8.1 Dockerfile-Proxy-Variante

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:20-slim AS base

ARG HTTP_PROXY=http://proxy.wiweb.local:3128
ARG HTTPS_PROXY=http://proxy.wiweb.local:3128
ARG NO_PROXY=localhost,127.0.0.1,.wiweb.local

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

ARG HTTP_PROXY=http://proxy.wiweb.local:3128
ARG HTTPS_PROXY=http://proxy.wiweb.local:3128
ARG NO_PROXY=localhost,127.0.0.1,.wiweb.local

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

---

### 8.2 Proxy mit Login

Format:

```text
http://BENUTZER:PASSWORT@proxy.wiweb.local:3128
```

Beispiel mit Sonderzeichen:

```text
Benutzer: paul
Passwort: Test@123!
```

URL-kodiert:

```text
http://paul:Test%40123%21@proxy.wiweb.local:3128
```

| Zeichen | Kodierung |
|---|---|
| `@` | `%40` |
| `!` | `%21` |
| `:` | `%3A` |
| `/` | `%2F` |
| `#` | `%23` |

---

## 9. docker-compose.yml für die App

Die App wird in `docker-compose.yml` definiert.

```yaml
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

      REDIS_URL: ${REDIS_URL:-}
      REDIS_HOST: ${REDIS_HOST:-}
      REDIS_PORT: ${REDIS_PORT:-}
      REDIS_PASSWORD: ${REDIS_PASSWORD:-}
      REDIS_KEY_PREFIX: ${REDIS_KEY_PREFIX:-berichtsheft:}

      MSSQL_HOST: ${MSSQL_HOST:-}
      MSSQL_PORT: ${MSSQL_PORT:-1433}
      MSSQL_DATABASE: ${MSSQL_DATABASE:-}
      DB_USER: ${DB_USER:-}
      DB_PASSWORD: ${DB_PASSWORD:-}
      MSSQL_ENCRYPT: ${MSSQL_ENCRYPT:-true}
      MSSQL_TRUST_SERVER_CERTIFICATE: ${MSSQL_TRUST_SERVER_CERTIFICATE:-false}

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

---

### 9.1 Wichtige App-Compose-Werte

| Wert | Bedeutung |
|---|---|
| `build.context` | Projektordner für den Build |
| `dockerfile` | Zu verwendendes Dockerfile |
| `target: runtime` | Baut die Runtime-Stage |
| `image` | Name des lokalen Images |
| `container_name` | Fester Containername |
| `restart: unless-stopped` | Automatischer Neustart |
| `ports` | Host-Port zu Container-Port |
| `healthcheck` | Prüft `/api/ready` |

---

## 10. docker-compose.server-redis.yml für Redis

Empfohlene Redis-Variante mit Passwort:

```yaml
services:
  redis:
    image: redis:7.4-alpine
    container_name: ausbildungsdoku-redis
    restart: unless-stopped
    command:
      - sh
      - -c
      - redis-server --save '' --appendonly no --dir /data --requirepass "1234"
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a \"1234\" ping | grep -q PONG"]
      interval: 10s
      timeout: 5s
      retries: 10

volumes:
  redis-data:
```

### Wichtig

Wenn Redis mit Passwort startet:

```yaml
--requirepass "1234"
```

muss in `.env` stehen:

```env
REDIS_PASSWORD=1234
```

Wenn Redis ohne Passwort startet, muss in `.env` stehen:

```env
REDIS_PASSWORD=
```

---

## 11. .env-Datei

Die `.env` liegt im gleichen Ordner wie die Compose-Dateien.

### 11.1 Beispiel `.env`

```env
NODE_ENV=production
TZ=Europe/Berlin
HOST=0.0.0.0
PORT=3010
APP_PORT_MAPPING=3010:3010

APP_BASE_URL=http://SERVER-IP:3010
APP_BASE_PATH=
API_BASE_URL=
TRUST_PROXY=false
LOG_LEVEL=info

SERVER_REQUEST_TIMEOUT_MS=30000
SERVER_HEADERS_TIMEOUT_MS=35000
SERVER_KEEP_ALIVE_TIMEOUT_MS=5000
SHUTDOWN_TIMEOUT_MS=10000
REQUEST_BODY_LIMIT=15mb

SESSION_SECRET=TODO_SEHR_LANGES_SECRET_SETZEN
SESSION_COOKIE_NAME=berichtsheft.sid
SESSION_COOKIE_DOMAIN=
SESSION_SECURE=false
SESSION_SAME_SITE=lax
SESSION_MAX_AGE_MS=86400000
SESSION_TTL_SECONDS=86400

REDIS_URL=
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=1234
REDIS_KEY_PREFIX=berichtsheft:
REDIS_CONNECT_TIMEOUT_MS=10000
REDIS_COMMAND_TIMEOUT_MS=5000
REDIS_MAX_RETRIES=4
REDIS_PING_INTERVAL_MS=30000

MSSQL_HOST=192.168.1.168
MSSQL_PORT=1433
MSSQL_DATABASE=Berichtsheft
DB_USER=docker
DB_PASSWORD='TODO_SQL_PASSWORT_SETZEN'
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
INITIAL_ADMIN_PASSWORD=TODO_ADMIN_PASSWORT_SETZEN
INITIAL_ADMIN_FORCE_PASSWORD_CHANGE=true
```

---

### 11.2 Erklärung der wichtigsten Variablen

| Variable | Bedeutung | Beispiel |
|---|---|---|
| `NODE_ENV` | Laufzeitumgebung | `production` |
| `PORT` | Interner App-Port | `3010` |
| `APP_PORT_MAPPING` | Host-Port:Container-Port | `3010:3010` |
| `SESSION_SECRET` | Secret für Sessions | langer zufälliger Wert |
| `SESSION_SECURE` | Cookie nur über HTTPS | `true` bei HTTPS |
| `REDIS_HOST` | Redis-Service-Name | `redis` |
| `REDIS_PASSWORD` | Redis-Passwort | `1234` oder leer |
| `MSSQL_HOST` | SQL Server Host/IP | `192.168.1.168` |
| `MSSQL_DATABASE` | Datenbankname | `Berichtsheft` |
| `DB_USER` | SQL-Benutzer | `docker` |
| `DB_PASSWORD` | SQL-Passwort | geheim |
| `MSSQL_ENCRYPT` | SQL-TLS-Verschlüsselung | `true` |
| `MSSQL_TRUST_SERVER_CERTIFICATE` | Selbstsignierte Zertifikate erlauben | `true` |
| `APPLY_MIGRATIONS_ON_START` | Migrationen beim Start ausführen | `true` |
| `RESET_DATABASE_ON_START` | Datenbank zurücksetzen | produktiv immer `false` |
| `INITIAL_ADMIN_PASSWORD` | Initiales Adminpasswort | geheim |

---

## 12. Container starten

Empfohlener Start:

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml up -d --build
```

Erklärung:

| Teil | Bedeutung |
|---|---|
| `-f docker-compose.server-redis.yml` | Redis-Compose-Datei laden |
| `-f docker-compose.yml` | App-Compose-Datei laden |
| `up` | Services starten |
| `-d` | Im Hintergrund starten |
| `--build` | Image vorher neu bauen |

---

## 13. Container prüfen

```bash
docker ps
```

Erwartet:

```text
ausbildungsdoku-app
ausbildungsdoku-redis
```

Compose-Status:

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml ps
```

Redis prüfen:

```bash
docker exec -it ausbildungsdoku-redis redis-cli -a "1234" ping
```

Erwartet:

```text
PONG
```

App-Umgebung prüfen:

```bash
docker inspect ausbildungsdoku-app --format '{{.Config.Env}}' | tr ' ' '\n' | grep -E 'NODE_ENV|REDIS|MSSQL|DB_USER'
```

---

## 14. Logs anzeigen

App-Logs:

```bash
docker logs -f ausbildungsdoku-app
```

Redis-Logs:

```bash
docker logs -f ausbildungsdoku-redis
```

Nur letzte Zeilen:

```bash
docker logs --tail=100 ausbildungsdoku-app
```

Compose-Logs:

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml logs -f
```

---

## 15. Datenbankmigrationen

Die App verwendet Knex-Migrationen.

Migrationen liegen unter:

```text
data/migrations/
```

Bekannte Dateien:

```text
20260421195500_initial_schema.js
20260426024000_add_training_dates_to_users.js
20260429120000_add_password_change_required_to_users.js
20260514193000_widen_entries_text_columns.js
```

Migrationen werden beim Start ausgeführt, wenn gesetzt ist:

```env
APPLY_MIGRATIONS_ON_START=true
```

Migrationen prüfen:

```sql
USE Berichtsheft;

SELECT *
FROM knex_migrations
ORDER BY id DESC;
```

---

## 16. Import-Funktion und Spaltenlängen

Beim CSV-/Excel-Import können längere Texte in die Spalten geschrieben werden.

Der Fehler sah so aus:

```text
String or binary data would be truncated in table 'Berichtsheft.dbo.entries', column 'betrieb'
```

Ursache:

Die Spalten in `entries` waren zu kurz. Der Import konnte längere Texte aus der CSV nicht speichern.

Dauerhafter Fix:

```text
data/migrations/20260514193000_widen_entries_text_columns.js
```

Migration:

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
  // Eine Verkleinerung koennte vorhandene Daten abschneiden.
};
```

Prüfen:

```sql
USE Berichtsheft;

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

`-1` bedeutet bei SQL Server:

```text
NVARCHAR(MAX)
```

---

## 17. Admin-Passwort zurücksetzen

Wenn das Admin-Passwort vergessen wurde, kann ein neuer bcrypt-Hash erzeugt werden.

Hash erzeugen:

```bash
docker exec -it ausbildungsdoku-app node -e 'const bcrypt=require("bcryptjs"); bcrypt.hash("NeuesAdminPasswort123",10).then(console.log)'
```

Den ausgegebenen Hash kopieren.

SQL ausführen:

```sql
USE Berichtsheft;

UPDATE users
SET password_hash = 'HIER_DEN_HASH_EINFUEGEN'
WHERE username = 'admin';
```

Danach App neu starten:

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml restart app
```

Falls der Service-Name wegen Compose-Mix nicht erkannt wird:

```bash
docker restart ausbildungsdoku-app
```

---

## 18. Proxy-Konfiguration

### 18.1 Build über Proxy starten

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml build --no-cache --progress=plain \
  --build-arg HTTP_PROXY="http://proxy.wiweb.local:3128" \
  --build-arg HTTPS_PROXY="http://proxy.wiweb.local:3128"
```

Danach:

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml up -d
```

### 18.2 Proxy mit Login

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml build --no-cache --progress=plain \
  --build-arg HTTP_PROXY="http://BENUTZER:PASSWORT@proxy.wiweb.local:3128" \
  --build-arg HTTPS_PROXY="http://BENUTZER:PASSWORT@proxy.wiweb.local:3128"
```

Sonderzeichen im Passwort müssen URL-kodiert werden.

---

## 19. Deployment-Workflow

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
nano .env
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml up -d --build
docker ps
docker logs -f ausbildungsdoku-app
```

### Nach dem Start prüfen

1. Läuft `ausbildungsdoku-app`?
2. Läuft `ausbildungsdoku-redis`?
3. Ist die App über Port `3010` erreichbar?
4. Ist Login möglich?
5. Wurden Migrationen ausgeführt?
6. Funktioniert die Importfunktion?

---

## 20. Update-Workflow

```bash
cd Ausbildungsdoku_webapp
git pull
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml down
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml up -d --build
docker logs -f ausbildungsdoku-app
```

Wenn alte Container übrig bleiben:

```bash
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml down --remove-orphans
```

---

## 21. Backup und Restore

### 21.1 MSSQL Backup

Backup auf dem SQL Server:

```sql
BACKUP DATABASE Berichtsheft
TO DISK = 'C:\Backups\Berichtsheft.bak'
WITH FORMAT, INIT, COMPRESSION;
```

### 21.2 MSSQL Restore

```sql
RESTORE DATABASE Berichtsheft
FROM DISK = 'C:\Backups\Berichtsheft.bak'
WITH REPLACE;
```

### 21.3 Redis Volume sichern

```bash
docker run --rm \
  -v ausbildungsdoku_webapp_redis-data:/volume \
  -v "$(pwd)":/backup \
  alpine \
  tar czf /backup/redis-data-backup.tar.gz /volume
```

TODO: Finalen Backup-Pfad und Restore-Prozess für produktive Umgebung ergänzen.

---

## 22. Sicherheit

| Thema | Empfehlung |
|---|---|
| `.env` | Nicht committen |
| Passwörter | Nicht im Dockerfile speichern |
| SQL Server | Nicht öffentlich freigeben |
| Redis | Nur lokal oder intern erreichbar machen |
| App | Hinter Reverse Proxy mit HTTPS betreiben |
| Sessions | `SESSION_SECRET` lang und zufällig setzen |
| Cookies | Bei HTTPS `SESSION_SECURE=true` |
| Admin | Initialpasswort nach Erstlogin ändern |
| Migrationen | Vor Produktion in Testumgebung prüfen |
| Logs | Keine Secrets loggen |
| Container | Non-Root-User verwenden |

---

## 23. Fehlerbehebung

### 23.1 `npm` hängt beim Build

Mögliche Ursache:

- Proxy fehlt
- DNS/Internet nicht erreichbar
- npm Registry nicht erreichbar

Build mit Log:

```bash
docker compose build --no-cache --progress=plain
```

Mit Proxy:

```bash
docker compose build --no-cache --progress=plain \
  --build-arg HTTP_PROXY="http://proxy.wiweb.local:3128" \
  --build-arg HTTPS_PROXY="http://proxy.wiweb.local:3128"
```

---

### 23.2 `Cannot find package /app/node_modules/esbuild/index.js`

Ursache:

- Unvollständiges `node_modules`
- fehlerhafter npm Build-Cache
- optionale Dependencies nicht installiert

Fix:

```bash
docker builder prune -af
docker compose build --no-cache --progress=plain
docker compose up -d
```

Im Dockerfile sicherstellen:

```dockerfile
RUN npm ci --no-audit --include=optional
```

---

### 23.3 Redis wird nicht gefunden

Fehler:

```text
getaddrinfo ENOTFOUND redis
```

Ursache:

- App und Redis laufen nicht im gleichen Compose-Projekt/Netzwerk
- falsche Compose-Dateien kombiniert
- Redis-Service nicht gestartet

Fix:

```bash
docker compose down --remove-orphans
docker compose -f docker-compose.server-redis.yml down --remove-orphans
docker rm -f ausbildungsdoku-app ausbildungsdoku-redis 2>/dev/null
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml up -d --build --remove-orphans
```

---

### 23.4 Redis-Passwort stimmt nicht

Prüfen:

```bash
docker inspect ausbildungsdoku-app --format '{{.Config.Env}}' | tr ' ' '\n' | grep REDIS
docker exec -it ausbildungsdoku-redis redis-cli -a "1234" ping
```

Erwartet:

```text
PONG
```

Wenn Redis ohne Passwort läuft:

```env
REDIS_PASSWORD=
```

Wenn Redis mit Passwort läuft:

```env
REDIS_PASSWORD=1234
```

und Redis braucht:

```yaml
--requirepass "1234"
```

---

### 23.5 MSSQL Login schlägt fehl

Fehler:

```text
Fehler bei der Anmeldung für den Benutzer "docker"
```

Prüfen:

```env
MSSQL_HOST=192.168.1.168
MSSQL_PORT=1433
MSSQL_DATABASE=Berichtsheft
DB_USER=docker
DB_PASSWORD='PASSWORT'
```

SQL-Rechte prüfen:

```sql
USE Berichtsheft;

SELECT name
FROM sys.database_principals
WHERE name = 'docker';
```

Rolle setzen:

```sql
ALTER ROLE db_owner ADD MEMBER docker;
```

---

### 23.6 Import schlägt fehl

Logs prüfen:

```bash
docker logs --tail=120 ausbildungsdoku-app
```

Typischer Fehler:

```text
String or binary data would be truncated
```

Fix:

- Migration `20260514193000_widen_entries_text_columns.js` muss vorhanden sein.
- `APPLY_MIGRATIONS_ON_START=true` muss gesetzt sein.
- Migration muss in `knex_migrations` eingetragen sein.

Prüfen:

```sql
SELECT *
FROM knex_migrations
ORDER BY id DESC;
```

---

### 23.7 Port ist bereits belegt

```bash
ss -tulpen | grep 3010
```

Anderen Host-Port nutzen:

```env
APP_PORT_MAPPING=8080:3010
```

---

### 23.8 Änderungen werden nicht übernommen

```bash
docker builder prune -af
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml build --no-cache --progress=plain
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml up -d
```

---

### 23.9 Falsche Compose-Datei gestartet

Prüfen:

```bash
docker ps
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml ps
```

Sauber neu starten:

```bash
docker compose down --remove-orphans
docker compose -f docker-compose.server-redis.yml down --remove-orphans
docker rm -f ausbildungsdoku-app ausbildungsdoku-redis 2>/dev/null
docker compose -f docker-compose.server-redis.yml -f docker-compose.yml up -d --build --remove-orphans
```

---

## 24. Wartung

### 24.1 Status regelmäßig prüfen

```bash
docker ps
docker logs --tail=100 ausbildungsdoku-app
docker logs --tail=100 ausbildungsdoku-redis
```

### 24.2 Speicher prüfen

```bash
docker system df
```

### 24.3 Ungenutzte Images löschen

```bash
docker image prune
```

### 24.4 Build-Cache löschen

```bash
docker builder prune -af
```

### 24.5 Volumes anzeigen

```bash
docker volume ls
```

### 24.6 Regelmäßige Aufgaben

| Aufgabe | Häufigkeit |
|---|---|
| Logs prüfen | wöchentlich |
| MSSQL Backup prüfen | täglich/wöchentlich |
| Restore testen | regelmäßig |
| Docker Images aktualisieren | nach Wartungsfenster |
| Secrets rotieren | nach Sicherheitsvorgabe |
| Migrationen testen | vor jedem Produktivdeploy |
| Import mit Testdatei prüfen | vor Go-Live |

---

## 25. Offene Punkte

- TODO: Finale Produktionsdomain ergänzen.
- TODO: Reverse Proxy final dokumentieren.
- TODO: HTTPS-/SSL-Konfiguration ergänzen.
- TODO: Backup-Pfad für MSSQL final festlegen.
- TODO: Entscheiden, ob Redis persistent sein muss.
- TODO: `.env.example` ohne echte Secrets erstellen.
- TODO: Produktionswert für `NODE_ENV=production` sicherstellen.
- TODO: Bei HTTPS `SESSION_SECURE=true` setzen.
- TODO: Debug-Code aus Controller/Service entfernen, falls noch vorhanden.
- TODO: SQL Server nach Möglichkeit per DNS-Namen statt IP anbinden.

---

## Anhang A: Nützliche Befehle

| Befehl | Zweck |
|---|---|
| `docker ps` | Laufende Container anzeigen |
| `docker logs -f ausbildungsdoku-app` | App-Logs live anzeigen |
| `docker logs -f ausbildungsdoku-redis` | Redis-Logs live anzeigen |
| `docker restart ausbildungsdoku-app` | App neu starten |
| `docker compose up -d --build` | Neu bauen und starten |
| `docker compose down --remove-orphans` | Stack sauber entfernen |
| `docker builder prune -af` | Build-Cache entfernen |
| `docker system df` | Docker-Speichernutzung anzeigen |
| `docker volume ls` | Volumes anzeigen |

---

## Anhang B: Empfohlene Produktivwerte

```env
NODE_ENV=production
SESSION_SECURE=true
TRUST_PROXY=true
RESET_DATABASE_ON_START=false
ENABLE_DEMO_DATA=false
APPLY_MIGRATIONS_ON_START=true
BOOTSTRAP_DATABASE_ON_START=true
```

Nur für Test ohne HTTPS:

```env
NODE_ENV=development
SESSION_SECURE=false
TRUST_PROXY=false
```
