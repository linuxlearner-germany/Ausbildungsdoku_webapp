# Lokale Entwicklung

## Modus 1: Host-based Entwicklung

Voraussetzung: MSSQL und Redis sind erreichbar.

```bash
npm install
npm run dev
```

Relevante ENV-Werte:

- `MSSQL_HOST`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD`
- `REDIS_URL` oder `REDIS_HOST`/`REDIS_PORT`

## Modus 2: Lokaler Infra-Stack

Nur MSSQL und Redis in Docker:

```bash
docker compose -f docker-compose.dev-infra.yml up -d
npm run dev
```

Das ist der bevorzugte lokale Entwicklungsmodus.

## Modus 3: Full Local Docker

```bash
docker compose -f docker-compose.local.yml up --build
```

Damit laufen App, MSSQL und Redis zusammen in Docker.

## Tests lokal

```bash
docker compose -f docker-compose.dev-infra.yml up -d
npm test
```

Oder nur Integration:

```bash
npm run test:integration
```
