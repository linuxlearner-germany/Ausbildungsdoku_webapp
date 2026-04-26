# Ausbildungsdoku Webapp

## Überblick

Die Ausbildungsdoku Webapp ist eine Webanwendung für digitale Berichtshefte in der Ausbildung.  
Sie richtet sich an Azubis, Ausbilder und Verwaltung und deckt die Pflege von Tagesberichten, Freigaben, Profilen, Noten sowie Exporte für PDF und CSV ab.

Hauptfunktionen:

- Tagesberichte erfassen, bearbeiten und einreichen
- Berichte durch Ausbilder prüfen, kommentieren und signieren
- Azubi-, Ausbilder- und Admin-Rollen mit getrennten Workflows
- Profil- und Stammdatenpflege
- Notenverwaltung
- CSV-/PDF-Exporte

## Features

- Tagesberichte mit Kalender-, Listen- und Schreibansicht
- Freigabe-Workflow mit Entwurf, Einreichung, Signatur und Nachbearbeitung
- Trainer- und Admin-Freigaben inklusive Kommentar- und Sammelaktionen
- CSV-Importe für Berichte und Benutzer mit Vorschau und Validierung
- PDF-Export ausschließlich für signierte Berichte
- CSV-Export für eigene Berichte und Verwaltungsdaten
- Theme-Umschaltung für Hell, Dunkel und System mit persistenter Speicherung
- Audit-Log für Verwaltungsaktionen

## Tech Stack

- Node.js
- Express
- React
- Bootstrap 5
- Microsoft SQL Server
- Redis
- Docker

## Architektur

Die Anwendung trennt HTTP-, Fach- und Datenzugriffsschichten bewusst:

- `routes/` registriert HTTP-Endpunkte
- `controllers/` validiert Requests und formt Responses
- `services/` und `domain-services/` enthalten Fachlogik
- `repositories/` kapseln Datenbankzugriffe
- `app/config.js` liest und validiert die komplette Runtime-Konfiguration
- Sessions werden über Redis gespeichert
- MSSQL ist die einzige Runtime-Datenbank

Wichtige Einstiegspunkte:

- [index.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/index.js): Runtime-Initialisierung und HTTP-Serverstart
- [app/create-app.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/create-app.js): Express-App und Middleware
- [app/create-db.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/app/create-db.js): Knex-/MSSQL-Setup
- [sessions/create-session-middleware.js](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/sessions/create-session-middleware.js): Session-Store mit Redis

## Betriebsmodi

### 1. Host-basiert

Die App läuft lokal auf dem Host. MSSQL und Redis laufen extern oder bereits separat lokal.

Verwendung:

- App lokal mit `npm run dev` oder `npm start`
- MSSQL und Redis über `.env` konfigurieren

### 2. Lokaler Infra-Stack

MSSQL und Redis laufen per Docker, die App selbst lokal auf dem Host.

Verwendung:

- ideal für tägliche Entwicklung
- gleiche Datenbank-/Session-Richtung wie im späteren Betrieb

### 3. Full Docker

App, MSSQL und Redis laufen gemeinsam per Docker Compose.

Verwendung:

- vollständiger lokaler Stack
- sinnvoll für reproduzierbare lokale Umgebungen
- Standardstart über `make up`

## Setup

### Schnellstart

Der klare Standard-Einstieg fuer die komplette lokale Anwendung ist:

```bash
make up
```

Das Ziel erledigt:

- `.env` bei Bedarf aus `.env.example` erzeugen
- Docker-Erreichbarkeit pruefen
- Full-Docker-Stack mit App, MSSQL und Redis bauen und starten
- auf den Healthy-Status der App warten

Wichtige Begleitbefehle:

```bash
make down
make logs
make ps
```

### Standard-Setup mit lokalem Infra-Stack

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

### Host-basiert gegen externe MSSQL-/Redis-Instanzen

1. `npm install`
2. `cp .env.example .env`
3. Verbindungsdaten in `.env` setzen
4. `npm run db:migrate`
5. `npm run db:bootstrap`
6. `npm start`

### Full Docker

```bash
make up
```

Beenden:

```bash
make down
```

## Docker

### Dockerfile

Das `Dockerfile` ist mehrstufig aufgebaut:

- `deps`: installiert Abhängigkeiten
- `build`: baut das Frontend
- `runtime`: enthält nur die Produktionslaufzeit

Ziel:

- kleines Runtime-Image
- reproduzierbarer Frontend-Build
- keine Dev-Dependencies im finalen Container

### docker-compose.yml

Produktionsnaher Modus:

- startet nur die App
- MSSQL und Redis werden extern angebunden
- geeignet für Deployment-Szenarien mit vorhandener Infrastruktur

### docker-compose.local.yml

Vollständiger lokaler Stack:

- `app`: Node-/Express-Anwendung
- `mssql`: lokale MSSQL-Instanz
- `mssql-init`: erzeugt Runtime- und Testdatenbank
- `redis`: lokaler Session-Store

Empfohlene Bedienung:

- `make up` statt direkter `docker compose`- oder `npm`-Aufrufe
- `make down` zum Stoppen
- `make logs` fuer Diagnose

## Wichtige Umgebungsvariablen

### App / Server

- `NODE_ENV`
- `HOST`
- `PORT`
- `APP_BASE_URL`
- `APP_BASE_PATH`
- `API_BASE_URL`
- `TRUST_PROXY`
- `LOG_LEVEL`

### Sessions / Cookies

- `SESSION_SECRET`
- `SESSION_COOKIE_NAME`
- `SESSION_COOKIE_DOMAIN`
- `SESSION_SECURE`
- `SESSION_SAME_SITE`
- `SESSION_MAX_AGE_MS`
- `SESSION_TTL_SECONDS`

### Redis

- `REDIS_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_KEY_PREFIX`

### MSSQL

- `MSSQL_HOST`
- `MSSQL_PORT`
- `MSSQL_DATABASE`
- `MSSQL_USER`
- `MSSQL_PASSWORD`
- `MSSQL_ENCRYPT`
- `MSSQL_TRUST_SERVER_CERTIFICATE`

### Startverhalten

- `APPLY_MIGRATIONS_ON_START`
- `BOOTSTRAP_DATABASE_ON_START`
- `RESET_DATABASE_ON_START`
- `ENABLE_DEMO_DATA`
- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

Siehe [.env.example](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/.env.example).

## Datenbank und Bootstrap

Migrationen:

```bash
npm run db:migrate
```

Initialdaten / Admin / optionale Demo-Daten:

```bash
npm run db:bootstrap
```

Testdatenbank zurücksetzen:

```bash
npm run db:reset-test
```

## Tests

Kompletter Testlauf:

```bash
npm test
```

Nur Unit-Tests:

```bash
npm run test:unit
```

Nur Integrationstests:

```bash
npm run test:integration
```

Empfohlen für lokale Integrationstests:

```bash
npm run infra:up
npm test
```

## Rollenmodell

- `trainee`: eigene Berichte, Exporte, Profilansicht und eigene Noten
- `trainer`: Freigaben, Kommentare, PDF-Export für zugeordnete Azubis, Profilpflege für zugeordnete Azubis
- `admin`: Benutzerverwaltung, Zuordnungen, Audit-Log, CSV-Import/-Export und Systempflege

Das Rollenmodell bleibt serverseitig erzwungen. Frontend-Sichten sind nur Ergänzung, nicht Sicherheitsgrenze.

## Build

Frontend-Build:

```bash
npm run build
```

## Health-Endpunkte

- `GET /api/live`: Prozess lebt
- `GET /api/health`: Prozessstatus und bekannte Abhängigkeiten
- `GET /api/ready`: echte Readiness-Prüfung gegen MSSQL und Redis

## Export

- `GET /api/report/pdf`: PDF des eigenen Berichtshefts
- `GET /api/report/pdf/:traineeId`: PDF für zugeordneten Azubi oder Admin-Sicht
- `GET /api/report/csv`: CSV der eigenen Berichte
- `GET /api/admin/users/export.csv`: Verwaltungs-CSV für Admins

Fachliche Regeln:

- PDF enthält ausschließlich signierte Berichte
- PDF nutzt UTF-8-fähige Fonts, damit Umlaute korrekt bleiben
- Leere Exporte werden mit sauberer Fehlermeldung abgewiesen

## Troubleshooting

- `ROUTE_NOT_FOUND` bei API-Aufrufen:
  `APP_BASE_PATH` und `API_BASE_URL` prüfen. Der Frontend-Client baut API-Pfade zentral aus diesen Werten.
- `503` bei `/api/ready`:
  Erreichbarkeit von MSSQL und Redis prüfen. Sessions benötigen Redis zwingend.
- Login schlägt lokal fehl:
  `SESSION_SECRET`, `INITIAL_ADMIN_PASSWORD` und die MSSQL-/Redis-Verbindung in `.env` prüfen.
- PDF leer oder nicht verfügbar:
  Es werden nur signierte Berichte exportiert. Entwürfe, eingereichte oder zurückgegebene Berichte erscheinen nicht im PDF.
- Tests schlagen gegen lokaler Infrastruktur fehl:
  `npm run infra:up` ausführen und sicherstellen, dass die Testdatenbank vorhanden ist.

## Projektstruktur

```text
app/           Laufzeitaufbau, Konfiguration, Express-Erstellung
controllers/   HTTP-Controller
data/          Migrationen und Bootstrap
middleware/    Express-Middleware
modules/       Modulgrenzen für Features
repositories/  Datenzugriff
routes/        API-Routen
services/      Fachlogik
sessions/      Session-Setup
src/           React-Frontend
tests/         Unit- und Integrationstests
utils/         Querschnittsfunktionen
```

## Weitere Dokumentation

- [docs/LOCAL_DEVELOPMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/LOCAL_DEVELOPMENT.md)
- [docs/ARCHITECTURE.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/ARCHITECTURE.md)
- [docs/DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/DEPLOYMENT.md)
