# Ausbildungsdoku Webapp

Produktionsnahe Webanwendung fuer digitale Ausbildungsnachweise mit Node.js, Express, React, Bootstrap 5, Microsoft SQL Server und Redis.

## Architektur auf einen Blick

- Runtime-Datenbank: Microsoft SQL Server
- Session-Store: Redis
- Migrationen: Knex
- Backend: Express 5
- Frontend: React 19 + esbuild
- Deployment-Ziel: App im Docker-Container, MSSQL extern, Redis extern oder separat

SQLite ist kein Runtime-Pfad mehr. In-Memory-Sessions ebenfalls nicht.

## Betriebsmodi

## 1. Host-based Entwicklung

Voraussetzung: MSSQL und Redis laufen lokal oder extern.

```bash
npm install
cp .env.example .env
# .env mit SESSION_SECRET und INITIAL_ADMIN_PASSWORD befuellen
npm run dev
```

Oder ohne Watch-Modus:

```bash
npm start
```

## 2. Lokaler Infra-Stack

Startet nur MSSQL und Redis fuer Host-based Entwicklung:

```bash
docker compose -f docker-compose.dev-infra.yml up -d
npm run dev
```

## 3. Full Local Docker

Startet App, MSSQL und Redis komplett in Docker:

```bash
docker compose -f docker-compose.local.yml up --build
```

## 4. Produktion / produktionsnaher Zielpfad

Die App laeuft im Container. MSSQL und Redis werden extern angebunden.

```bash
docker compose up --build
```

Dabei erwartet der App-Container alle Zielwerte rein ueber ENV.

## Zentrale Konfiguration

Alle deployment-relevanten Werte werden in [app/config.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/config.js) gelesen, validiert und normalisiert. Der Rest der App arbeitet nur mit dem fertigen Config-Objekt.

Wichtige Bereiche:

- App/Server: `NODE_ENV`, `HOST`, `PORT`, `APP_BASE_URL`, `APP_BASE_PATH`, `API_BASE_URL`, `TRUST_PROXY`, `LOG_LEVEL`
- Session/Security: `SESSION_SECRET`, `SESSION_COOKIE_NAME`, `SESSION_SECURE`, `SESSION_SAME_SITE`, `SESSION_MAX_AGE_MS`
- Redis: `REDIS_URL` oder `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`
- MSSQL: `MSSQL_HOST`, `MSSQL_PORT`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD`, TLS- und Pooling-Werte
- Bootstrap: `APPLY_MIGRATIONS_ON_START`, `BOOTSTRAP_DATABASE_ON_START`, `RESET_DATABASE_ON_START`, `ENABLE_DEMO_DATA`
- Initialer Admin: `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`

`SESSION_SECRET` und `INITIAL_ADMIN_PASSWORD` muessen explizit gesetzt werden. Es gibt dafuer keine stillen Entwicklungs-Defaults im Runtime-Code.

Siehe [.env.example](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/.env.example).

## Startverhalten des App-Containers

Beim Start macht die App:

1. Config laden und validieren
2. MSSQL-Verbindung pruefen
3. Redis-Verbindung pruefen
4. Migrationen ausfuehren
5. Initial-Admin und optional Demo-Daten bootstrapen
6. Express starten

## Betriebsendpunkte

- `GET /api/health`: Liveness des Node-/Express-Prozesses
- `GET /api/ready`: Readiness inklusive MSSQL- und Redis-Pruefung

## Tests

Schnelle Tests:

```bash
npm test
```

Integrationstests gegen MSSQL/Redis:

```bash
docker compose -f docker-compose.dev-infra.yml up -d
npm run test:integration
```

## Weitere Doku

- [Lokale Entwicklung](docs/LOCAL_DEVELOPMENT.md)
- [Architektur](docs/ARCHITECTURE.md)
- [Migration zu MSSQL](docs/MIGRATION_TO_MSSQL.md)
- [Deployment](docs/DEPLOYMENT.md)
