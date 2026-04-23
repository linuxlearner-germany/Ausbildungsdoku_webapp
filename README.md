# Ausbildungsdoku Webapp

Business-Webapp fuer digitale Ausbildungsnachweise mit `Express 5`, `React 19`, `Bootstrap 5`, `Knex`, `Microsoft SQL Server` und `Redis`.

## Architektur

- Runtime-Datenbank: Microsoft SQL Server
- Session-Store: Redis mit `express-session` und `connect-redis`
- Backend: modulare Express-Anwendung mit `repositories -> services/domain-services -> controllers -> routes`
- Frontend: React SPA, gebuendelt mit `esbuild`
- Deployment-Ziel: App im Docker-Container, MSSQL und Redis extern angebunden

Es gibt keinen SQLite-Runtime-Pfad und keinen In-Memory-Session-Store fuer den Normalbetrieb.

## Betriebsmodi

### 1. Host-based Entwicklung

Voraussetzung: MSSQL und Redis laufen lokal oder extern erreichbar.

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:bootstrap
npm run dev
```

Server ohne Watch:

```bash
npm start
```

### 2. Lokaler Infra-Stack

Startet nur MSSQL und Redis fuer Host-based Entwicklung und Tests.

```bash
npm run infra:up
```

Beenden:

```bash
npm run infra:down
```

### 3. Full Local Docker

Startet App, MSSQL und Redis komplett lokal in Docker.

```bash
npm run docker:local:up
```

Beenden:

```bash
npm run docker:local:down
```

### 4. Produktionsnah / App im Container

`docker-compose.yml` startet nur die App. MSSQL und Redis werden per ENV extern angebunden.

```bash
docker compose up --build -d
```

## Konfiguration

Die gesamte Runtime-Konfiguration wird in [app/config.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/config.js) geladen, validiert und normalisiert. Ausserhalb dieser Datei greift die Anwendung nicht verteilt auf `process.env` zu.

Wichtige Bereiche:

- App / Server: `NODE_ENV`, `HOST`, `PORT`, `APP_BASE_URL`, `APP_BASE_PATH`, `API_BASE_URL`, `TRUST_PROXY`, `LOG_LEVEL`
- Timeouts / Limits: `SERVER_REQUEST_TIMEOUT_MS`, `SERVER_HEADERS_TIMEOUT_MS`, `SERVER_KEEP_ALIVE_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`, `REQUEST_BODY_LIMIT`
- MSSQL: `MSSQL_HOST`, `MSSQL_PORT`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD`, TLS-, Pool- und Timeout-Werte
- Redis: `REDIS_URL` oder `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`, dazu Prefix- und Timeout-Werte
- Session / Cookies: `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_COOKIE_DOMAIN`, `SESSION_SECURE`, `SESSION_SAME_SITE`, `SESSION_MAX_AGE_MS`, `SESSION_TTL_SECONDS`
- Bootstrap: `APPLY_MIGRATIONS_ON_START`, `BOOTSTRAP_DATABASE_ON_START`, `RESET_DATABASE_ON_START`, `ENABLE_DEMO_DATA`
- Initial-Admin: `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`

Pflichtwerte ohne Default:

- `SESSION_SECRET`
- `INITIAL_ADMIN_PASSWORD`
- `MSSQL_HOST`
- `MSSQL_DATABASE`
- `MSSQL_USER`
- `MSSQL_PASSWORD`

Siehe [.env.example](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/.env.example).

## Datenbank und Bootstrap

Migrationen laufen ausschliesslich gegen MSSQL.

```bash
npm run db:migrate
```

Bootstrap legt den initialen Admin an und optional Demo-Daten.

```bash
npm run db:bootstrap
```

Testdatenbank hart zuruecksetzen:

```bash
npm run db:reset-test
```

## Startverhalten

Beim App-Start werden in dieser Reihenfolge ausgefuehrt:

1. Konfiguration laden und validieren
2. Redis verbinden
3. MSSQL verbinden
4. Migrationen ausfuehren
5. Initial-Admin und optionale Demo-Daten bootstrapen
6. HTTP-Server starten

## Health-Endpunkte

- `GET /api/live`: Prozess lebt
- `GET /api/health`: Prozessstatus plus bekannter Abhaengigkeitsstatus
- `GET /api/ready`: echte Readiness-Pruefung gegen MSSQL und Redis

## Tests

Unit- und Service-Tests:

```bash
npm run test:unit
```

Kompletter Testlauf gegen lokalen MSSQL/Redis-Stack:

```bash
npm run infra:up
npm test
```

Nur Integration:

```bash
npm run test:integration
```

## Wichtige Dateien

- [app/config.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/config.js)
- [index.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/index.js)
- [app/create-app.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/create-app.js)
- [data/migrations/20260421195500_initial_schema.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/data/migrations/20260421195500_initial_schema.js)
- [docker-compose.yml](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docker-compose.yml)
- [docker-compose.dev-infra.yml](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docker-compose.dev-infra.yml)
- [docker-compose.local.yml](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docker-compose.local.yml)

## Weitere Doku

- [Lokale Entwicklung](docs/LOCAL_DEVELOPMENT.md)
- [Architektur](docs/ARCHITECTURE.md)
- [Deployment](docs/DEPLOYMENT.md)
