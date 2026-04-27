# Troubleshooting

## App nicht erreichbar

```bash
docker compose -f docker-compose.local.yml ps
docker compose -f docker-compose.local.yml logs -f app
```

## Ready-Endpunkt liefert keinen Erfolg

```bash
curl http://localhost:3010/api/ready
docker compose -f docker-compose.local.yml logs -f mssql
docker compose -f docker-compose.local.yml logs -f redis
```

## Port ist belegt

Passe in `.env` das Mapping an:

- `APP_PORT_MAPPING`
- `DB_UI_PORT_MAPPING`

## MSSQL startet nicht

- Passwort erfüllt die SQL-Server-Regeln nicht
- Volume enthält Altzustand
- Container-Logs prüfen

## Redis startet nicht

- Container-Logs prüfen
- Port-Konflikte nur relevant, wenn du Redis zusätzlich nach außen mappen würdest

## Login funktioniert nicht

- Redis muss laufen
- `SESSION_SECRET` muss gesetzt sein
- Browser-Cookies nicht blockieren

## Daten scheinen weg

- prüfen, ob versehentlich `down -v` verwendet wurde
- prüfen, ob das Volume `mssql-data` noch existiert
- Restore aus `backups/` erwägen

## Docker startet nach Rechnerneustart nicht automatisch

- Docker Desktop oder Docker Engine selbst muss beim Systemstart laufen
- `restart: unless-stopped` greift erst, wenn Docker selbst läuft

## Build oder Tests in Docker

```bash
docker compose -f docker-compose.local.yml build
docker compose -f docker-compose.local.yml run --rm app npm test
```

## Desktop-DB-Tool verbindet nicht

Verbindungsdaten:

- Host: `mssql`, wenn das Tool im Compose-Netz läuft
- sonst `localhost`
- Port: `1433` bzw. `${MSSQL_LOCAL_PORT}`
- Database: `ausbildungsdoku`
- User: `sa`
- Passwort: Wert aus `.env`
