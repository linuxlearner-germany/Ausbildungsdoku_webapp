# Deployment

## Zielmodell

- Webapp im Docker-Container
- Microsoft SQL Server extern
- Redis extern oder separat
- Konfiguration nur ueber ENV

## Pflichtvariablen fuer Produktion

- `SESSION_SECRET`
- `MSSQL_HOST`
- `MSSQL_DATABASE`
- `MSSQL_USER`
- `MSSQL_PASSWORD`
- `INITIAL_ADMIN_PASSWORD`

Zusaetzlich:

- `REDIS_URL` oder `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`

## Empfohlene Produktionswerte

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3010`
- `TRUST_PROXY=true`
- `SESSION_SECURE=true`
- `SESSION_SAME_SITE=lax`
- `MSSQL_ENCRYPT=true`
- `MSSQL_TRUST_SERVER_CERTIFICATE=false`
- `ENABLE_DEMO_DATA=false`

## Container-Build

```bash
docker build -t ausbildungsdoku-webapp:latest .
```

## App-Container mit externer Infrastruktur starten

```bash
docker run --rm -p 3010:3010 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=3010 \
  -e TRUST_PROXY=true \
  -e SESSION_SECRET=super-secret \
  -e SESSION_SECURE=true \
  -e REDIS_URL=redis://redis.example.internal:6379 \
  -e MSSQL_HOST=sql.example.internal \
  -e MSSQL_PORT=1433 \
  -e MSSQL_DATABASE=berichtsheft \
  -e MSSQL_USER=berichtsheft_app \
  -e MSSQL_PASSWORD=super-db-secret \
  -e MSSQL_ENCRYPT=true \
  -e MSSQL_TRUST_SERVER_CERTIFICATE=false \
  -e INITIAL_ADMIN_PASSWORD=super-admin-secret \
  ausbildungsdoku-webapp:latest
```

## Reverse Proxy / Unterpfad

Wenn die App hinter einem Reverse Proxy unter einem Unterpfad liegt:

- `APP_BASE_PATH=/berichtsheft`
- optional `APP_BASE_URL=https://portal.example.de`
- optional `API_BASE_URL=https://portal.example.de/berichtsheft/api`

Die HTML-Auslieferung und Frontend-Runtime beruecksichtigen diese Werte.

## Betriebschecks

- `GET /api/health` prueft nur die Prozess-Liveness
- `GET /api/ready` prueft MSSQL, Redis und den Ready-Zustand der App
- Docker-Healthchecks verwenden `GET /api/ready`
