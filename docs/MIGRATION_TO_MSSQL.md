# MSSQL-Betrieb

Die Anwendung ist auf Microsoft SQL Server als einzigen Datenbankpfad ausgelegt.

## Technische Basis

- Knex-Client: `mssql`
- Migrationen unter `data/migrations`
- Verbindungsaufbau in `app/create-db.js`
- zentrale MSSQL-Konfiguration in `app/config.js`

## Lokal

Fuer lokale Entwicklung und Tests wird dieselbe MSSQL-Richtung genutzt:

- Host-based gegen lokale oder externe Instanz
- lokaler Infra-Stack via `docker-compose.dev-infra.yml`
- kompletter Docker-Stack via `docker-compose.local.yml`

## Wichtige ENV-Werte

- `MSSQL_HOST`
- `MSSQL_PORT`
- `MSSQL_DATABASE`
- `MSSQL_USER`
- `MSSQL_PASSWORD`
- `MSSQL_ENCRYPT`
- `MSSQL_TRUST_SERVER_CERTIFICATE`
- `MSSQL_POOL_MIN`
- `MSSQL_POOL_MAX`
- `MSSQL_CONNECTION_TIMEOUT_MS`
- `MSSQL_REQUEST_TIMEOUT_MS`
