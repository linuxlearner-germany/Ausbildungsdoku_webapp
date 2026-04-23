# Lokale Entwicklung

## Zielbild

Lokal soll dieselbe technische Richtung wie spaeter im Betrieb nutzbar sein:

- App mit Node.js auf dem Host oder im Container
- MSSQL als einzige Datenbank
- Redis als einziger Session-Store

## Variante A: Host-based gegen lokale Infra

```bash
npm install
cp .env.example .env
npm run infra:up
npm run db:migrate
npm run db:bootstrap
npm run dev
```

Standardports:

- App: `3010`
- MSSQL: `1433`
- Redis: `6379`

## Variante B: Host-based gegen externe MSSQL/Redis

In `.env` nur die externen Verbindungsdaten eintragen, dann:

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run db:bootstrap
npm start
```

## Variante C: Full Local Docker

```bash
npm run docker:local:up
```

Die Compose-Datei startet:

- App
- MSSQL
- Redis
- Datenbankinitialisierung fuer Runtime- und Testdatenbank

## Datenbank- und Testablauf

Runtime-Datenbank migrieren:

```bash
npm run db:migrate
```

Initialdaten anlegen:

```bash
npm run db:bootstrap
```

Testdatenbank zuruecksetzen:

```bash
npm run db:reset-test
```

Kompletter Testlauf:

```bash
npm test
```
