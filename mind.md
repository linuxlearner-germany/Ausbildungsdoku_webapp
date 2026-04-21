# Ausbildungsdoku Webapp: Arbeitsstand und lokale Laufumgebung

## Ziel

Projekt lokal stabil lauffaehig machen, inklusive:
- MSSQL lokal per Docker
- Redis lokal per Docker
- App lokal per `npm start`
- Sessions funktionierend
- wichtiger Laufpfad praktisch verifiziert

## Aktueller lokaler Standardweg

1. Infrastruktur starten:

```bash
docker compose -f docker-compose.dev-infra.yml up -d
```

2. App lokal starten:

```bash
npm start
```

3. Health pruefen:

```bash
curl http://127.0.0.1:3010/api/health
```

## Aktuell funktionierende lokale Konfiguration

Die lokale `.env` ist angelegt und auf Host-Entwicklung ausgerichtet:

- `NODE_ENV=development`
- `HOST=127.0.0.1`
- `PORT=3010`
- `MSSQL_HOST=localhost`
- `MSSQL_PORT=1433`
- `MSSQL_DATABASE=berichtsheft`
- `MSSQL_USER=sa`
- `MSSQL_PASSWORD=YourStrong(!)Password`
- `MSSQL_ENCRYPT=true`
- `MSSQL_TRUST_SERVER_CERTIFICATE=true`
- `USE_REDIS_SESSIONS=true`
- `REDIS_HOST=127.0.0.1`
- `REDIS_PORT=6379`
- `SESSION_SECRET=local-development-session-secret-change-me`
- `INITIAL_ADMIN_USERNAME=admin`
- `INITIAL_ADMIN_EMAIL=admin@example.com`
- `INITIAL_ADMIN_PASSWORD=AdminInit123!`

## Wichtige technische Erkenntnisse

### 1. MSSQL auf dieser Linux-Maschine

Der Node-MSSQL/Tedious-Client konnte ueber einen normal publizierten Docker-Port zwar TCP verbinden, aber der TDS-Prelogin lief nicht durch. Ergebnis:

- `sqlcmd` aus dem Container funktionierte
- `nc 127.0.0.1 1433` funktionierte
- `mssql`/`tedious` auf dem Host lief gegen `127.0.0.1:1433` in Timeouts

Pragmatische Loesung:

- neue Datei `docker-compose.dev-infra.yml`
- MSSQL fuer Host-Development mit `network_mode: host`
- Redis dort ebenfalls lokal verfuegbar

Damit funktioniert Host-Node jetzt stabil gegen SQL Server.

### 2. MSSQL-Client-Optionen

Fuer den lokalen SQL-Server muss der Client mit TLS-Handshake laufen:

- `MSSQL_ENCRYPT=true`
- `MSSQL_TRUST_SERVER_CERTIFICATE=true`

Ausserdem lokal besser:

- `MSSQL_HOST=localhost`

statt `127.0.0.1`, damit die laestige TLS-ServerName-Warnung im Testpfad nicht mehr auftritt.

### 3. Redis-Sessions

`connect-redis@9` lief im aktuellen Setup nicht sauber mit dem bisherigen `ioredis`-Pfad. Symptom:

- Login gab `200`
- Cookie wurde gesetzt
- Session war danach trotzdem weg
- im Redis lagen keine Session-Keys

Fix:

- Redis-Client auf `redis`-Client umgestellt
- Login speichert Session jetzt explizit via `req.session.save(...)`

Danach:

- Login funktioniert
- `/api/session` stellt den Benutzer wieder her
- Redis-Key wird angelegt

### 4. SQL-Server-spezifische Schema-Fallen

Die Migration musste fuer SQL Server nachgeschaerft werden:

- `multiple cascade paths` bei `trainee_trainers`
- `multiple cascade paths` bei `audit_logs`

Fix:

- problematische FK-Cascades entfernt
- Benutzerloeschung loescht abhaengige Daten jetzt explizit

## Relevante Aenderungen

### Neue Dateien

- `docker-compose.dev-infra.yml`
- `.env`
- `mind.md`

### Wesentlich geaenderte Dateien

- `app/config.js`
- `app/create-app.js`
- `app/create-redis-client.js`
- `data/bootstrap-mssql.js`
- `data/migrations/20260421195500_initial_schema.js`
- `docker-compose.yml`
- `docker-compose.local.yml`
- `.env.example`
- `repositories/admin-repository.js`
- `repositories/shared-repository.js`
- `services/auth-service.js`
- `services/admin-domain-service.js`
- `tests/helpers/test-server.mjs`
- `utils/audit.js`
- `package.json`

## Lokal verifiziert

### App-Start

`npm start` startet lokal erfolgreich.

### Health

Erfolgreich getestet:

```json
{"ok":true,"status":"healthy","dependencies":{"database":"up","redis":"up"}}
```

### Login

Erfolgreich getestet:

```bash
curl -H 'Content-Type: application/json' \
  -d '{"identifier":"admin","password":"AdminInit123!"}' \
  http://127.0.0.1:3010/api/login
```

### Session-Wiederherstellung

Erfolgreich getestet:

1. Login mit Cookie-Jar
2. danach `GET /api/session`
3. Benutzer wurde korrekt wiederhergestellt

## Lokale Zugangsdaten

### Normale lokale Entwicklung (`.env`, Demo-Daten aus)

- Benutzer: `admin`
- Passwort: `AdminInit123!`

### Testlauf (`tests/helpers/test-server.mjs`, Demo-Daten an)

- Admin: `admin` / `admin123`
- Trainer: `trainer` / `trainer123`
- Azubi: `azubi` / `azubi123`

## Teststatus

Bereits erfolgreich verifiziert:

- `npm start`
- `GET /api/health`
- Login
- Session-Restore
- Redis-Session-Key wird angelegt
- grosser Teil der Integrationstests und Audit-Tests lief nach den Fixes bereits erfolgreich

Letzter Stand bei Tests:

- mehrere urspruengliche Blocker wurden beseitigt:
  - Session-Persistenz
  - CSV-Import im Transaktionskontext
  - Benutzerloeschung mit expliziter Bereinigung
  - Demo-Seed-Duplikate
- ein kompletter finaler `npm test`-Durchlauf nach dem letzten Bootstrap-Haertungsfix wurde noch nicht erneut komplett zu Ende verifiziert

## Wichtige Befehle

### Dev-Infra starten

```bash
docker compose -f docker-compose.dev-infra.yml up -d
```

### Dev-Infra stoppen

```bash
docker compose -f docker-compose.dev-infra.yml down -v
```

### App lokal starten

```bash
npm start
```

### Tests

```bash
npm test
```

### Nur gezielte Integration/Audit-Tests

```bash
node --test --test-concurrency=1 tests/integration.test.mjs tests/audit-log.test.mjs
```

## Noch offen

- finalen kompletten `npm test`-Lauf nach dem letzten Seed-Haertungsfix nochmals komplett durchlaufen lassen
- Dokumentation spaeter noch auf `docker-compose.dev-infra.yml` als empfohlenen Host-Dev-Weg anpassen, falls dieser Weg dauerhaft Standard bleiben soll
- optional: alten `docker-compose.local.yml`-Pfad klarer von Host-Dev und Full-Docker trennen
