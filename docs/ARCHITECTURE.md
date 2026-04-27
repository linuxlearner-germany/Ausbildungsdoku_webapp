# Architecture

## Runtime

Die Runtime startet in [index.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/index.js):

1. Konfiguration laden
2. Redis verbinden
3. MSSQL verbinden
4. Migrationen ausführen
5. Bootstrap ausführen
6. Express-App starten

## Backend-Schichten

- `app/`: Runtime-Zusammenbau, Config, DB/Redis-Setup
- `routes/`: API-Routen
- `controllers/`: Request-Validierung und Response-Mapping
- `services/`: Fachlogik
- `repositories/`: MSSQL-Zugriffe über Knex
- `middleware/`: Core, Security, Fehlerbehandlung
- `sessions/`: Session-Middleware mit RedisStore

## Datenhaltung

- MSSQL ist die einzige Datenbank
- Redis ist der einzige Session-Store
- Es gibt keinen SQLite-Pfad
- Es gibt keinen In-Memory-Session-Fallback

## Frontend

- React SPA mit `react-router-dom`
- Bootstrap als UI-Basis
- zentrale Navigation über [src/navigation/menuConfig.mjs](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/src/navigation/menuConfig.mjs)
- gemeinsames Layout über `AppShell`, `SidebarNavigation` und `Topbar`

## Routing

- Frontend unter `/`
- API unter `/api`
- `APP_BASE_PATH` und `API_BASE_URL` werden zentral aus der Runtime-Konfiguration abgeleitet
- `/api/api`-Doppelungen werden clientseitig vermieden

## Wichtige Fachregeln

- PDF exportiert nur signierte Berichte
- Trainer sehen nur zugeordnete Azubis
- Admin-Funktionen bleiben auf Admin-Routen beschränkt
- Audit-Logs bleiben serverseitig geführt
