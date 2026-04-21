# Refactor Status

Stand: 2026-04-21

## Was bisher umgesetzt wurde

- Backend von SQLite auf Microsoft SQL Server als einzigen Laufzeitpfad umgestellt
- Knex als Migrationssystem eingeführt
- Initiales MSSQL-Schema als Migration angelegt
- Redis als Session-Store integriert
- Startup-Reihenfolge aufgeräumt: Config, Infrastruktur, Verbindungscheck, Migration, Bootstrap, App-Start
- Repository-Schicht auf asynchrone Knex-Zugriffe umgebaut
- Services und Controller auf den neuen asynchronen Datenzugriff angepasst
- Alte SQLite-Bootstrap-Logik entfernt
- Dockerfile und `docker-compose.yml` für App, MSSQL, Redis und DB-Initialisierung angelegt
- `.env.example` auf produktionsnah relevante Konfiguration umgestellt
- README und ergänzende Doku unter `docs/` neu geschrieben
- Frontend auf Bootstrap-5-Basis modernisiert
- Stylesheet in mehrere Dateien unter `src/styles/` aufgeteilt
- Test-Helfer für servergestützte Integrationstests eingeführt
- Mehrere Tests an den neuen Stack angepasst

## Aktueller Status

- `npm run check`: erfolgreich
- `npm run build`: erfolgreich
- `npm run build:github-pages`: erfolgreich
- Teilmenge schneller Tests: erfolgreich
  - `tests/date-logic.test.mjs`
  - `tests/report-domain-service.test.mjs`
  - `tests/theme.test.mjs`
- `docker compose config`: erfolgreich validiert

## Noch offen bzw. noch nicht vollständig verifiziert

- Vollständigen `docker compose up --build` Lauf fertig prüfen
- Vollständige Integrationstests gegen lokal laufenden MSSQL- und Redis-Stack komplett ausführen
- Eventuelle Restfehler aus echtem Container- und Integrationstestlauf beheben
- Abschließende Sichtprüfung der überarbeiteten UI im Browser

## Wichtiger Hinweis

Der MSSQL-Compose-Start wurde bereits angestoßen, war aber beim großen Image-Download noch nicht vollständig durchgelaufen. Der Code- und Build-Stand ist weitgehend umgebaut, aber der komplette End-to-End-Nachweis über den gesamten Docker- und Integrationstestpfad steht noch aus.
