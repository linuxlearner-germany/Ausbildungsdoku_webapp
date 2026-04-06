# Berichtsheft Portal

<p align="center">
  <img src="./Pictures/wiweb-logo-kurz-blau_neu.png" alt="WIWEB Logo" width="120" />
</p>

<p align="center">
  Rollenbasiertes Berichtsheft-Portal für Azubis, Ausbilder und Verwaltung.
</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-2f6f57?style=for-the-badge">
  <img alt="React" src="https://img.shields.io/badge/React-19-1e4d6b?style=for-the-badge">
  <img alt="Express" src="https://img.shields.io/badge/Express-5-32454f?style=for-the-badge">
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-better--sqlite3-3d5f73?style=for-the-badge">
  <img alt="Status" src="https://img.shields.io/badge/Status-Lokal%20einsatzbereit-5c7c4f?style=for-the-badge">
</p>

## Inhaltsverzeichnis

- [Überblick](#überblick)
- [Hauptfunktionen](#hauptfunktionen)
- [Rollen und Berechtigungen](#rollen-und-berechtigungen)
- [Technischer Stack](#technischer-stack)
- [Projektstruktur](#projektstruktur)
- [Schnellstart](#schnellstart)
- [Konfiguration](#konfiguration)
- [Demo-Zugänge](#demo-zugänge)
- [Entwicklungsworkflow](#entwicklungsworkflow)
- [Architektur](#architektur)
- [Datenmodell](#datenmodell)
- [Import und Export](#import-und-export)
- [API-Überblick](#api-überblick)
- [Sicherheit und Qualität](#sicherheit-und-qualität)
- [Tests](#tests)
- [Bekannte Rahmenbedingungen](#bekannte-rahmenbedingungen)

## Überblick

Das **Berichtsheft Portal** ist eine vollständige Webanwendung für digitale Ausbildungsnachweise. Die App kombiniert:

- tägliche Berichtsführung
- rollenbasierte Freigabeprozesse
- Kalender- und Listenansichten
- PDF-Export für signierte Berichte
- Notenverwaltung mit PDF-Ausgabe
- Admin-Verwaltung für Benutzer, Rollen und Zuordnungen
- CSV-/Excel-Import für Berichte
- CSV-Import für Benutzer
- Audit-Logs für Verwaltungsaktionen

Die Anwendung besteht aus einem **Node.js/Express-Backend** mit **SQLite** sowie einer **React-Frontend-App**, die per `esbuild` in den Ordner `public/` gebündelt wird.

## Hauptfunktionen

### Für Azubis

- Tagesberichte als Entwurf anlegen
- Berichte im Kalender, in einer Liste oder im Schreibmodus bearbeiten
- Berichte einzeln oder gesammelt einreichen
- Status je Bericht sehen: `draft`, `submitted`, `signed`, `rejected`
- Rückmeldungen und Ablehnungsgründe des Ausbilders einsehen
- signierte Berichte im Archiv ansehen
- komplettes Berichtsheft als PDF exportieren
- Berichte aus `.xlsx` oder `.csv` importieren
- eigene Noten verwalten
- Notenübersicht als PDF exportieren
- Theme-Präferenz und eigenes Passwort pflegen

### Für Ausbilder

- zugeordnete Azubis im Dashboard überblicken
- eingereichte Berichte prüfen
- Berichte freigeben oder mit Kommentar zurückgeben
- Sammelaktionen für Freigaben und Ablehnungen ausführen
- Azubi-Profile pflegen
- PDF-Exports pro Azubi erzeugen
- Noten von zugeordneten Azubis lesen

### Für Admins

- Benutzer anlegen, bearbeiten und Rollen ändern
- Ausbilder mehreren Azubis zuordnen
- Benutzer per CSV importieren
- bestehende Ausbildungen als Vorschlagsliste pflegen
- Noten für alle Azubis verwalten
- Audit-Logs mit Filtern und Pagination einsehen

## Rollen und Berechtigungen

| Bereich | Azubi | Ausbilder | Admin |
|---|---:|---:|---:|
| Eigene Berichte schreiben | Ja | Nein | Nein |
| Eigene Berichte einreichen | Ja | Nein | Nein |
| Eingereichte Berichte freigeben | Nein | Ja | Ja |
| Berichte kommentieren / zurückgeben | Nein | Ja | Ja |
| Eigene Noten verwalten | Ja | Nein | Nein |
| Noten lesen | Ja | Ja, für zugewiesene Azubis | Ja |
| Noten verwalten | Nein | Nein | Ja |
| Azubi-Profile pflegen | Nein | Ja, für zugewiesene Azubis | Ja |
| Benutzerverwaltung | Nein | Nein | Ja |
| Audit-Logs einsehen | Nein | Nein | Ja |

## Technischer Stack

### Backend

- `Node.js`
- `Express 5`
- `express-session`
- `better-sqlite3`
- `bcryptjs`
- `dotenv`
- `pdfkit`
- `xlsx`

### Frontend

- `React 19`
- `react-router-dom`
- gebündelt mit `esbuild`
- eigenes CSS ohne zusätzliches UI-Framework

### Persistenz und Dateien

- lokale SQLite-Datenbank
- optionale Legacy-Migration aus `data/berichtsheft.json`
- statische Assets in `Pictures/` und `public/`

## Projektstruktur

```text
berichtsheft_webapp/
├── index.js                  # Express-Server, DB-Setup, API, PDF-Erzeugung
├── package.json              # Skripte und Abhängigkeiten
├── .env.example              # Beispielkonfiguration
├── src/
│   ├── main.jsx              # Frontend-Einstieg
│   ├── App.jsx               # Routing und geschützte Bereiche
│   ├── context/              # zentraler App-State und API-Aktionen
│   ├── components/           # wiederverwendbare UI-Bausteine
│   ├── pages/                # Seiten für Dashboard, Berichte, Export, Profil usw.
│   └── lib/                  # Datum, Theme, PDF-Logik, Noten-Utilities
├── public/
│   ├── index.html            # HTML-Shell
│   ├── report-import-template.csv
│   └── benutzer_import_vorlage.csv
├── Pictures/                 # Logos und Branding-Grafiken
├── data/                     # lokale DB-Dateien und Legacy-JSON
├── tests/                    # Node-Test-Suite
└── Anleitung/
    └── LOKAL_STARTEN.md      # kurze lokale Startanleitung
```

## Schnellstart

### Voraussetzungen

- Node.js `20+` empfohlen
- `npm`

### Installation

```bash
git clone <repo-url> berichtsheft_webapp
cd berichtsheft_webapp
npm install
cp .env.example .env
npm start
```

Danach ist die App standardmäßig unter `http://localhost:3000` erreichbar.

## Konfiguration

Die Anwendung liest ihre Konfiguration aus einer `.env`.

### Beispiel

```env
PORT=3000
SESSION_SECRET=bitte-ein-langes-zufaelliges-geheimnis-setzen
NODE_ENV=development
ENABLE_DEMO_DATA=false
TRUST_PROXY=false
SESSION_COOKIE_NAME=berichtsheft.sid
```

### Verfügbare Umgebungsvariablen

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port des Servers |
| `SESSION_SECRET` | leer | Session-Secret, in Produktion zwingend erforderlich |
| `NODE_ENV` | `development` | beeinflusst Sicherheitsverhalten und Session-Cookies |
| `ENABLE_DEMO_DATA` | `false` | legt Demo-Benutzer und Beispieldaten an |
| `TRUST_PROXY` | `false` | aktiviert `app.set("trust proxy", 1)` |
| `SESSION_COOKIE_NAME` | `berichtsheft.sid` | Name des Session-Cookies |
| `DATA_DIR` | `./data` | Basisordner für Datenhaltung |
| `DB_FILE` | `DATA_DIR/berichtsheft.db` | SQLite-Datei |
| `LEGACY_FILE` | `DATA_DIR/berichtsheft.json` | Legacy-JSON für einmalige Migration |

### Produktionsregeln im Code

- In Produktion darf `SESSION_SECRET` nicht fehlen.
- In Produktion darf `ENABLE_DEMO_DATA` nicht aktiviert sein.
- Bei `NODE_ENV=production` werden Session-Cookies als `secure` gesetzt.
- Optional kann `TRUST_PROXY=true` für Reverse-Proxy-Setups gesetzt werden.

## Demo-Zugänge

Demo-Benutzer werden **nur** angelegt, wenn `ENABLE_DEMO_DATA=true` gesetzt ist.

| Rolle | Login | Passwort |
|---|---|---|
| Azubi | `azubi` oder `azubi@example.com` | `azubi123` |
| Ausbilder | `trainer` oder `trainer@example.com` | `trainer123` |
| Admin | `admin` oder `admin@example.com` | `admin123` |

Mit Demo-Daten werden zusätzlich Beispielberichte und Beispielnoten erzeugt.

## Entwicklungsworkflow

### Skripte

| Befehl | Zweck |
|---|---|
| `npm start` | baut Frontend und startet den Server |
| `npm run dev` | aktuell ebenfalls Build + Serverstart |
| `npm run build` | erzeugt `public/app.js`, `public/app.js.map` und `public/app.css` |
| `npm run check` | Syntaxprüfung für `index.js` |
| `npm test` | führt die Node-Test-Suite aus |

### Build-Verhalten

Das Frontend wird mit folgendem Build-Prozess erzeugt:

- `src/main.jsx` wird per `esbuild` nach `public/app.js` gebündelt
- `src/styles.css` wird nach `public/app.css` kopiert
- `public/index.html` lädt das gebaute Bundle als ESM

Es gibt derzeit keinen separaten Hot-Reload-Dev-Server. Entwicklung läuft über den Express-Server.

## Architektur

### Backend

- zentrale Anwendung in [`index.js`](./index.js)
- SQLite-Initialisierung, Migrationen und Demo-Daten im selben Einstiegspunkt
- Session-basierte Authentifizierung mit `express-session`
- rollenbasierte Middleware mit `requireAuth` und `requireRole`
- PDF-Erzeugung serverseitig mit `pdfkit`
- Importe serverseitig mit `xlsx`

### Frontend

- Routing in [`src/App.jsx`](./src/App.jsx)
- globaler State und API-Aktionen in [`src/context/AppContext.jsx`](./src/context/AppContext.jsx)
- seitenbasierte UI in `src/pages/`
- wiederverwendbare UI-Komponenten in `src/components/`

### Zentrale Nutzerflüsse

### Berichtsworkflow

1. Azubi legt Entwurf an.
2. Azubi bearbeitet Titel, Datum, Betrieb und/oder Berufsschule.
3. Azubi reicht Bericht ein.
4. Ausbilder oder Admin gibt frei oder lehnt mit Begründung ab.
5. Signierte Berichte landen im Archiv und im PDF-Export.

### Notenworkflow

1. Azubi oder Admin legt Noten an.
2. Noten werden nach Fach gruppiert und gewichtet ausgewertet.
3. Trainer können Noten lesen, aber nicht ändern.
4. Notenübersicht kann als PDF exportiert werden.

### Benutzerverwaltung

1. Admin erstellt Benutzer manuell oder per CSV.
2. Azubis erhalten eine Ausbildung und optional mehrere Ausbilder.
3. Änderungen an Rollen, Profilen und Zuordnungen landen im Audit-Log.

## Datenmodell

Die SQLite-Datenbank enthält im Kern folgende Tabellen:

| Tabelle | Zweck |
|---|---|
| `users` | Benutzer, Rollen, Stammdaten, Theme-Präferenz |
| `educations` | zentrale Ausbildungsliste |
| `trainee_trainers` | Zuordnung Azubi ↔ Ausbilder |
| `entries` | Tagesberichte und Statusinformationen |
| `grades` | Noten je Azubi |
| `audit_logs` | nachvollziehbare Verwaltungs- und Fachaktionen |

### Statusmodell für Berichte

| Status | Bedeutung |
|---|---|
| `draft` | Entwurf, frei bearbeitbar |
| `submitted` | eingereicht, schreibgeschützt |
| `signed` | freigegeben und abgeschlossen |
| `rejected` | zur Nachbearbeitung zurückgegeben |

### Wichtige Fachregeln

- pro Azubi und Tag ist nur **ein** Bericht erlaubt
- signierte Berichte sind fachlich gesperrt
- eingereichte Berichte bleiben gesperrt, bis sie freigegeben oder zurückgegeben werden
- nur Entwürfe können gelöscht werden
- importierte Berichte werden als `submitted` angelegt
- PDF-Export enthält nur `signed`-Berichte

## Import und Export

### Berichtsimport für Azubis

Unter `Export` können Berichte aus `.xlsx` oder `.csv` geladen werden.

### Unterstützte Spalten

| Feld | Pflicht | Alias-Beispiele |
|---|---:|---|
| `Datum` | Ja | `datum`, `tag`, `date` |
| `Titel` | Ja | `titel`, `title`, `bericht`, `bezeichnung` |
| `Betrieb` | Nein | `betrieb`, `arbeit`, `work` |
| `Berufsschule` | Nein | `berufsschule`, `schule`, `school` |

### Regeln

- leere Zeilen werden ignoriert
- ungültige oder doppelte Tage werden in der Vorschau markiert
- bestehende Tage werden beim Import übersprungen
- mindestens eines der Felder `Betrieb` oder `Berufsschule` muss Inhalt haben

Vorlage:

- [`public/report-import-template.csv`](./public/report-import-template.csv)

### Benutzerimport für Admins

Admins können neue Benutzer per CSV importieren.

### Unterstützte Spalten

| Feld | Pflicht | Hinweis |
|---|---:|---|
| `name` | Ja | vollständiger Name |
| `username` | Ja | wird normalisiert und eindeutig benötigt |
| `email` | Ja | muss gültig und eindeutig sein |
| `role` | Ja | `trainee`, `trainer`, `admin` |
| `password` | Nein | wenn leer, wird ein Zufallspasswort erzeugt |
| `ausbildung` | Für Azubi ja | Pflicht bei `trainee` |
| `betrieb` | Nein | optional |
| `berufsschule` | Nein | optional |
| `trainer_usernames` | Nein | nur für Azubis, mehrere Werte mit `|` |

Vorlage:

- [`public/benutzer_import_vorlage.csv`](./public/benutzer_import_vorlage.csv)

### PDF-Export

Es gibt zwei PDF-Ausgaben:

- **Berichtsheft-PDF** für signierte Berichte, gruppiert nach Kalenderwochen
- **Noten-PDF** als tabellarische Übersicht

Relevante Endpunkte:

- `GET /api/report/pdf`
- `GET /api/report/pdf/:traineeId`
- `GET /api/grades/pdf`

## API-Überblick

Die folgenden Bereiche sind im Backend vorhanden:

### Session und Health

- `GET /api/session`
- `GET /api/health`
- `POST /api/login`
- `POST /api/logout`

### Dashboard und Präferenzen

- `GET /api/dashboard`
- `POST /api/preferences/theme`
- `POST /api/profile/password`

### Berichte

- `POST /api/report`
- `POST /api/report/draft`
- `POST /api/report/entry/:entryId`
- `DELETE /api/report/:entryId`
- `POST /api/report/submit`
- `POST /api/report/submit-batch`
- `POST /api/report/import-preview`
- `POST /api/report/import`
- `GET /api/report/pdf`

### Freigaben

- `POST /api/trainer/sign`
- `POST /api/trainer/reject`
- `POST /api/trainer/comment`
- `POST /api/trainer/batch`

### Benutzer und Verwaltung

- `POST /api/admin/users`
- `POST /api/admin/users/:id`
- `POST /api/admin/assign-trainer`
- `POST /api/admin/users/import-preview`
- `POST /api/admin/users/import`
- `GET /api/admin/audit-logs`

### Noten

- `GET /api/grades`
- `POST /api/grades`
- `DELETE /api/grades/:id`
- `GET /api/grades/pdf`

## Sicherheit und Qualität

Im aktuellen Stand sind bereits mehrere Schutzmechanismen eingebaut:

- Session-basierte Authentifizierung
- rollenbasierte Autorisierung auf API-Ebene
- Login-Rate-Limit pro IP und Identifier
- Security-Header wie `X-Content-Type-Options`, `X-Frame-Options` und `Referrer-Policy`
- `httpOnly`-Cookies mit `sameSite=lax`
- `secure`-Cookies in Produktion
- SQLite mit aktivierten `foreign_keys`
- Audit-Logs für fachlich relevante Verwaltungsaktionen

### Passwortregeln im Backend

Serverseitig gilt derzeit:

- Mindestlänge `10` Zeichen
- neues Passwort muss sich vom alten unterscheiden
- aktuelles Passwort muss korrekt sein

Hinweis: Die UI nennt strengere Regeln, serverseitig wird aktuell jedoch nur die Mindestlänge technisch erzwungen.

## Tests

Die Test-Suite basiert auf dem integrierten Node-Test-Runner.

Abgedeckte Bereiche:

- Login und Login-Rate-Limit
- Berichtsregeln für Löschen, Einreichen und Freigeben
- Sammelaktionen für Azubis und Ausbilder
- Audit-Log-Zugriff und Audit-Log-Erfassung
- Passwortänderung und Manipulationsschutz
- lokale Datumslogik für Kalender und Wochenberechnung
- Theme-Logik und zentrale CSS-Variablen

Start:

```bash
npm test
```

## Bekannte Rahmenbedingungen

- Das Projekt nutzt aktuell **keinen** separaten Docker- oder Compose-Ordner.
- `npm run dev` ist derzeit kein Hot-Reload-Modus, sondern faktisch ein Build-plus-Start.
- Backend, Migrationen und API-Definitionen liegen bewusst zentral in `index.js`.
- Build-Artefakte in `public/` sind in `.gitignore` eingetragen, können lokal aber vorhanden sein.
- Die Datenbank liegt standardmäßig lokal in `data/` und ist nicht für verteilte Mehrinstanz-Deployments ausgelegt.

## Lokale Zusatzdoku

- [`Anleitung/LOKAL_STARTEN.md`](./Anleitung/LOKAL_STARTEN.md)
- [`.env.example`](./.env.example)

## Lizenz

Dieses Projekt ist aktuell als `UNLICENSED` gekennzeichnet.
