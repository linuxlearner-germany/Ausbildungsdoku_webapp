# Berichtsheft Portal

Modernes Berichtsheft-Portal fuer Azubis, Ausbilder und Verwaltung. Die Anwendung kombiniert Tagesberichte, Freigaben, Kalender, Archiv, Profil, Export und Notenverwaltung in einem rollenbasierten Webportal.

## Funktionen

- Rollen fuer `Azubi`, `Ausbilder` und `Admin`
- Tagesberichte mit Einreichen, Freigeben und Korrekturprozess
- Kalenderansicht mit Tagesstatus
- PDF-Export fuer signierte Berichte
- separates Noten-PDF in Tabellenform
- Admin-Verwaltung fuer Nutzer, Rollen und Ausbilder-Zuordnung
- Darkmode mit gespeicherter Nutzereinstellung
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
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
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

### Erster Login

Nach dem ersten Start kannst du dich mit den Standard-Logins anmelden:

- `azubi@example.com / azubi123`
- `trainer@example.com / trainer123`
- `admin@example.com / admin123`

## Skripte

- `npm start`: Frontend bauen und Server starten
- `npm run build`: React-Bundle und CSS erzeugen
- `npm run dev`: Server direkt starten
- `npm run check`: Syntaxcheck fuer `index.js`

## Standard-Logins

- `azubi@example.com / azubi123`
- `trainer@example.com / trainer123`
- `admin@example.com / admin123`

## Umgebungsvariablen

- `PORT`: Port des Webservers
- `SESSION_SECRET`: Secret fuer Session-Cookies
- `NODE_ENV`: z. B. `development` oder `production`

Siehe auch: [.env.example](/home/paul/WIWEB_CLOUD/berichtsheft_webapp/.env.example)

## Projektstruktur

- [index.js](/home/paul/WIWEB_CLOUD/berichtsheft_webapp/index.js): Express-Server, API, SQLite, PDF-Erzeugung
- [src](/home/paul/WIWEB_CLOUD/berichtsheft_webapp/src): React-App mit Routing, Layout und Seiten
- [public](/home/paul/WIWEB_CLOUD/berichtsheft_webapp/public): ausgelieferte Assets und Build-Ausgabe
- [Pictures](/home/paul/WIWEB_CLOUD/berichtsheft_webapp/Pictures): Branding und Bilder
- [data](/home/paul/WIWEB_CLOUD/berichtsheft_webapp/data): lokale SQLite-Datenbank

## Hinweise fuer GitHub

- Die lokale Datenbank ist absichtlich in `.gitignore`, damit keine persoenlichen Testdaten ins Repo gelangen.
- Build-Artefakte und JetBrains-IDE-Dateien sind ebenfalls ignoriert.
- Vor einer oeffentlichen Veroeffentlichung solltest du `SESSION_SECRET`, Demo-Zugaenge und ggf. Markenassets pruefen.
