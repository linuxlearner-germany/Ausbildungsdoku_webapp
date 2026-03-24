# Berichtsheft Portal

Modernes Berichtsheft-Portal fuer Azubis, Ausbilder und Verwaltung. Die Anwendung kombiniert Tagesberichte, Freigaben, Kalender, Archiv, Profil, Export und Notenverwaltung in einem rollenbasierten Webportal.

## Funktionen

- Rollen fuer `Azubi`, `Ausbilder` und `Admin`
- Tagesberichte mit Einreichen, Freigeben und Korrekturprozess
- Kalenderansicht mit Tagesstatus
- PDF-Export fuer signierte Berichte
- Import fuer bestehende Berichte aus `.xlsx` und `.csv` mit Vorschau
- separates Noten-PDF in Tabellenform
- Admin-Verwaltung fuer Nutzer, Rollen und Ausbilder-Zuordnung
- Darkmode mit gespeicherter Nutzereinstellung pro Benutzer
- SQLite als lokale Datenbank

## Tech-Stack

- React
- React Router
- Express
- SQLite mit `better-sqlite3`
- PDFKit
- Esbuild

## Installation

### Voraussetzungen

- Node.js 20 oder neuer
- npm

### Projekt klonen

```bash
git clone <repo-url> berichtsheft_webapp
cd berichtsheft_webapp
```

### Konfiguration

1. `.env` anlegen:

```bash
cp .env.example .env
```

2. Abhaengigkeiten installieren:

```bash
npm install
```

3. Anwendung starten:

```bash
npm start
```

Die App laeuft danach standardmaessig unter `http://localhost:3000`.

## Docker

Fuer einen Testbetrieb mit Docker oder Docker Compose:

```bash
cd docker
cp .env.docker.example .env.docker
docker compose up --build -d
```

Danach ist die App standardmaessig unter `http://localhost` erreichbar.
Die SQLite-Datenbank liegt persistent im Docker-Volume `berichtsheft_data`.

### Erster Login

Standard-Logins stehen nur zur Verfuegung, wenn `ENABLE_DEMO_DATA=true` gesetzt ist.
Mit aktivierten Demo-Daten kannst du dich so anmelden:

- `azubi@example.com / azubi123`
- `trainer@example.com / trainer123`
- `admin@example.com / admin123`

## Skripte

- `npm start`: Frontend bauen und Server starten
- `npm run build`: React-Bundle und CSS erzeugen
- `npm run dev`: Server direkt starten
- `npm run check`: Syntaxcheck fuer `index.js`
- `npm test`: Integrationstests fuer Login, Freigabe und Delete-Regeln

## Standard-Logins

Nur bei aktivem `ENABLE_DEMO_DATA=true`:

- `azubi@example.com / azubi123`
- `trainer@example.com / trainer123`
- `admin@example.com / admin123`

## Umgebungsvariablen

- `PORT`: Port des Webservers
- `SESSION_SECRET`: Secret fuer Session-Cookies
- `NODE_ENV`: z. B. `development` oder `production`
- `ENABLE_DEMO_DATA`: setzt Demo-Accounts und Beispieldaten nur bei Bedarf
- `TRUST_PROXY`: in Produktion mit vorgeschaltetem Nginx auf `true` setzen
- `SESSION_COOKIE_NAME`: Name des Session-Cookies

Siehe auch: [.env.example](.env.example)

## Importformat fuer Berichte

Berichte koennen ueber den Bereich `Export` aus `.xlsx` oder `.csv` importiert werden.

Erwartete Spalten:

- `Datum`
- `Titel`
- optional `Betrieb`
- optional `Berufsschule`

Wichtige Regeln:

- importierte Berichte werden als `submitted` angelegt
- importierte Berichte werden nie automatisch `signed`
- pro Tag ist nur ein Bericht erlaubt
- vorhandene Tage werden in der Vorschau als Dublette markiert und nicht importiert

Eine einfache Vorlage liegt unter [public/report-import-template.csv](public/report-import-template.csv).

## Projektstruktur

- [index.js](index.js): Express-Server, API, SQLite, PDF-Erzeugung
- [src](src): React-App mit Routing, Layout und Seiten
- [public](public): ausgelieferte Assets und Build-Ausgabe
- [Pictures](Pictures): Branding und Bilder
- [data](data): lokale SQLite-Datenbank
- [deploy](deploy): Server-Setup, `systemd`, Nginx, Env-Vorlage und Backup-Skripte

## Hinweise fuer GitHub

- Die lokale Datenbank ist absichtlich in `.gitignore`, damit keine persoenlichen Testdaten ins Repo gelangen.
- Build-Artefakte und JetBrains-IDE-Dateien sind ebenfalls ignoriert.
- Vor einer oeffentlichen Veroeffentlichung solltest du `SESSION_SECRET` setzen und `ENABLE_DEMO_DATA=false` lassen.
