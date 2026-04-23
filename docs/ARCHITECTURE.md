# Architektur

## Backend

Die Runtime wird in [index.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/index.js) zusammengesetzt:

1. Konfiguration laden
2. Redis verbinden
3. MSSQL verbinden
4. Migrationen ausfuehren
5. Bootstrap ausfuehren
6. Express-App starten

Die Express-Anwendung selbst entsteht in [app/create-app.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/create-app.js).

## Schichten

- `modules/`: pro Fachbereich die verdrahtete Modulgrenze
- `repositories/`: MSSQL-Zugriff ueber Knex
- `services/`: Fachlogik und API-nahe Services
- `controllers/`: Request-Validierung und Response-Mapping
- `routes/`: Express-Routen
- `middleware/`: Core-, Security- und Fehler-Middleware

## Infrastruktur

- MSSQL ist der einzige Datenbankpfad
- Redis ist der einzige Session-Store
- Session-Middleware wird immer mit Redis-Store gebaut
- Health-Endpunkte pruefen Readiness aktiv gegen MSSQL und Redis

## Frontend

- React SPA mit Routing ueber `react-router-dom`
- Styling ueber Bootstrap 5 plus projektbezogene CSS-Dateien
- Layout mit fester Seitenleiste auf Desktop und mobilem Overlay-Menue auf kleineren Viewports

## Konfiguration

Nur [app/config.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/config.js) liest `process.env`.
Alle anderen Runtime-Pfade arbeiten mit dem normalisierten Config-Objekt.
