# Deployment

## Zielbild

`docker-compose.yml` beschreibt den produktionsnahen App-Containerbetrieb. MSSQL und Redis werden dort als externe Dienste erwartet.

Wenn die App als interner Server nur im **lokalen Netz** laufen soll, aber MSSQL extern betrieben wird, nutze [docs/SERVER_LAN_DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/SERVER_LAN_DEPLOYMENT.md).

## Servervoraussetzungen

- Docker Engine oder Docker Desktop
- Reverse Proxy vor der App
- HTTPS für produktive Nutzung
- Externe MSSQL-Instanz
- Externe Redis-Instanz

## Produktionsnahe Compose-Nutzung

Start:

```bash
docker compose up -d --build
```

Die App veröffentlicht standardmäßig Port `3010`.

## Pflicht-ENV

- `SESSION_SECRET`
- `INITIAL_ADMIN_PASSWORD`
- `MSSQL_HOST`
- `MSSQL_PORT`
- `MSSQL_DATABASE`
- `MSSQL_USER`
- `MSSQL_PASSWORD`
- `REDIS_URL` oder `REDIS_HOST`/`REDIS_PORT`

## Produktionsrelevante Empfehlungen

- `NODE_ENV=production`
- `SESSION_SECURE=true`
- `SESSION_SAME_SITE=lax`
- `TRUST_PROXY=true` oder passende Proxy-Anzahl
- `APP_BASE_URL=https://deine-domain.example`
- `APP_BASE_PATH=` nur setzen, wenn die App hinter einem Unterpfad liegt
- `API_BASE_URL=` leer lassen oder explizit korrekt setzen
- `MSSQL_ENCRYPT=true`
- `MSSQL_TRUST_SERVER_CERTIFICATE=false`
- `ENABLE_DEMO_DATA=false`
- `RESET_DATABASE_ON_START=false`

## Reverse Proxy

Der Reverse Proxy soll:

- `/` an die App weiterleiten
- `/api` an dieselbe App weiterleiten
- HTTPS terminieren
- die Forwarded-Header korrekt setzen

Allgemeines Beispiel:

```text
Client -> HTTPS Reverse Proxy -> App:3010
```

Wichtig:

- Cookies brauchen mit HTTPS `SESSION_SECURE=true`
- `TRUST_PROXY` muss zur Proxy-Kette passen
- Base-URL und Base-Path müssen konsistent sein

## Routing / Reload

Die App ist lokal und im Deployment als SPA auf `/` ausgelegt. API-Routen liegen unter `/api`. Frontend-Reloads auf Unterseiten müssen durch den Reverse Proxy wieder auf die App geleitet werden.

## Healthchecks

Verfügbare Endpunkte:

- `/api/live`
- `/api/health`
- `/api/ready`

Für Orchestrierung und Deploy-Checks ist `/api/ready` der relevante Endpunkt.

## Update-Hinweise

Vor jedem Deployment:

1. Backup der Datenbank erstellen
2. neue Version bauen
3. Container ersetzen
4. Ready-Endpunkt prüfen

## Raspberry Pi

Der komplette Stack mit MSSQL-Container ist auf Raspberry Pi/ARM in der Regel nicht der verlässliche Standardweg. Wenn ARM nötig ist, sollte MSSQL extern auf x86_64 laufen.
