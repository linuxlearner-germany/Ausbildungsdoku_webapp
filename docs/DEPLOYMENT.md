# Deployment

## Zielbild

- App im Docker-Container
- MSSQL extern
- Redis extern oder separat betrieben

`docker-compose.yml` startet nur den App-Container und erwartet alle Infrastrukturwerte per ENV.

## Pflichtwerte

- `SESSION_SECRET`
- `INITIAL_ADMIN_PASSWORD`
- `MSSQL_HOST`
- `MSSQL_DATABASE`
- `MSSQL_USER`
- `MSSQL_PASSWORD`

## Produktionsrelevante Empfehlungen

- `NODE_ENV=production`
- `SESSION_SECURE=true`
- `SESSION_SAME_SITE=lax`
- `TRUST_PROXY=1` oder passend zur Proxy-Kette
- `MSSQL_ENCRYPT=true`
- `MSSQL_TRUST_SERVER_CERTIFICATE=false`
- `ENABLE_DEMO_DATA=false`
- `RESET_DATABASE_ON_START=false`

## Start

```bash
docker compose up --build -d
```

## Healthchecks

Der Container meldet Readiness ueber:

- `GET /api/ready`

Zusatzlich verfuegbar:

- `GET /api/live`
- `GET /api/health`

## Shutdown

Bei `SIGTERM` und `SIGINT` beendet die App:

1. Readiness
2. HTTP-Server
3. MSSQL-Verbindungen
4. Redis-Verbindung
