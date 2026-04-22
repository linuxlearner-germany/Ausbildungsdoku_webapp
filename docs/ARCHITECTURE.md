# Architektur

## Konfiguration

- Zentraler Einstiegspunkt: [app/config.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/config.js)
- Dort werden ENV-Werte gelesen, validiert und normalisiert.
- Die restliche Anwendung verwendet nur das Config-Objekt.

## Backend-Schichten

- `app/`: Startup, Infrastruktur, Config
- `middleware/`: Request- und Security-Middleware
- `controllers/`: HTTP-Eingabe und Response-Mapping
- `services/`: Fachlogik
- `repositories/`: MSSQL-Zugriff ueber Knex
- `routes/`: API-Endpunkte

## Persistenz

- MSSQL ist die einzige Runtime-Datenbank.
- Migrationen liegen in `data/migrations/`.
- Bootstrap liegt in `data/bootstrap-mssql.js`.

## Sessions

- Redis-Session-Store ist der einzige Laufpfad
- Startup scheitert sofort, wenn Redis nicht erreichbar ist

## Frontend-Runtime

- Statische Assets werden durch Express ausgeliefert
- `APP_BASE_PATH` und `API_BASE_URL` werden beim HTML-Rendern injiziert
- Damit ist der Betrieb hinter Reverse Proxy oder Unterpfad ohne Codeaenderung moeglich
