# Ausbildungsdoku Webapp

## Überblick

Die Ausbildungsdoku Webapp ist ein digitales Berichtsheft mit getrennten Rollen für Azubis, Ausbilder und Admins. Die Anwendung deckt Berichte, Freigaben, Noten, Exporte, Benutzerverwaltung und Audit-Logs ab.

## Hauptfunktionen

- Berichtsheft mit Entwurf, Einreichung, Signatur und Nachbearbeitung
- Freigaben für Ausbilder
- Notenverwaltung
- CSV-Import und CSV-Export inklusive Ausbildungszeitraum fuer Azubis
- PDF-Export
- Adminbereich mit Benutzerverwaltung, Zuordnungen und Audit-Log
- Rollenmodell für `admin`, `trainee`, `trainer`

## Tech Stack

- Node.js / Express
- React
- Bootstrap 5
- Microsoft SQL Server
- Redis
- Docker

## Schnellstart lokal mit Docker

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
cp .env.example .env
docker compose -f docker-compose.local.yml up -d --build
```

URLs:

- App: http://localhost:3010
- Ready: http://localhost:3010/api/ready

## Standardnutzer / Initial Admin

Die App legt beim ersten Start den Initial-Admin aus `.env` an:

- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

`ENABLE_DEMO_DATA=false` ist der sichere Standard für den lokalen Dauerbetrieb. Demo-Daten sollten nur bewusst für Test-/Demo-Zwecke aktiviert werden.

## Docker Services

- `app`: Webanwendung
- `mssql`: einzige Datenbank
- `mssql-init`: erstellt Runtime- und Testdatenbank
- `redis`: Session-Speicher

## Datenpersistenz

Named Volumes:

- `mssql-data`: MSSQL-Daten unter `/var/opt/mssql`
- `redis-data`: optionaler Redis-Datenpfad unter `/data`

Verhalten:

- `docker compose -f docker-compose.local.yml stop`
  Container stoppen, Daten bleiben erhalten.
- `docker compose -f docker-compose.local.yml down`
  Container entfernen, Daten in Named Volumes bleiben erhalten.
- Volume-Loeschungen sind nicht Teil der Login-Recovery und loeschen MSSQL-Fachdaten.
- `docker compose -f docker-compose.local.yml up -d --build`
  Container neu bauen und starten, Volumes bleiben erhalten.

## Standardbefehle

Start:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Stop ohne Datenverlust:

```bash
docker compose -f docker-compose.local.yml down
```

Logs:

```bash
docker compose -f docker-compose.local.yml logs -f app
```

Status:

```bash
docker compose -f docker-compose.local.yml ps
```

Shell:

```bash
docker compose -f docker-compose.local.yml exec app sh
```

Migration manuell:

```bash
docker compose -f docker-compose.local.yml exec app npm run db:migrate
```

Tests Docker-first:

```bash
docker compose -f docker-compose.local.yml run --rm app npm test
```

Die Tests laufen dabei gegen `MSSQL_TEST_DATABASE`, nicht gegen die normale Runtime-Datenbank.

Admin-Zugang wiederherstellen:

```bash
docker compose -f docker-compose.local.yml exec app npm run admin:reset
```

Das Kommando setzt das Passwort des konfigurierten Admins aus `.env` zurueck oder legt ihn neu an, ohne Volumes oder Fachdaten zu loeschen.
Dabei werden auch nur die Redis-Zaehler fuer fehlgeschlagene Login-Versuche geloescht; Sessions und MSSQL-Daten bleiben erhalten.

Build Docker-first:

```bash
docker compose -f docker-compose.local.yml build
```

## Backup & Restore

Backup:

```bash
./scripts/db-backup.sh
```

Restore:

```bash
./scripts/db-restore.sh backups/<datei>.bak
```

Backups landen lokal in `./backups` und sind per `.gitignore` vom Repository ausgeschlossen.

## Updates ohne Datenverlust

Manuell:

```bash
git pull
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up -d --build
```

Wichtig:

- `down` ohne `-v` behält Daten.
- Volume-Loeschungen loeschen Daten und sind kein Login-Recovery-Schritt.
- Vor Updates ist ein Backup empfohlen.

Optionales Hilfsskript:

```bash
./scripts/update-local-docker.sh
```

## ENV-Konfiguration

Wichtige Variablen:

- App: `NODE_ENV`, `PORT`, `HOST`, `APP_BASE_URL`, `APP_BASE_PATH`, `API_BASE_URL`, `TRUST_PROXY`
- MSSQL: `MSSQL_HOST`, `MSSQL_PORT`, `MSSQL_DATABASE`, `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_ENCRYPT`, `MSSQL_TRUST_SERVER_CERTIFICATE`
- Redis: `REDIS_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- Sessions: `SESSION_SECRET`, `SESSION_SECURE`, `SESSION_SAME_SITE`, `SESSION_MAX_AGE_MS`
- Bootstrap: `APPLY_MIGRATIONS_ON_START`, `BOOTSTRAP_DATABASE_ON_START`, `ENABLE_DEMO_DATA`, `RESET_DATABASE_ON_START`

Mehr Details stehen in [docs/LOCAL_DOCKER.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/LOCAL_DOCKER.md).

## DB-Verwaltung

Empfohlene lokale Verwaltungswege:

- DBeaver
- Azure Data Studio

Verbindungsdaten:

- Host aus Host-Tools: `localhost`
- interner Compose-Host: `mssql`
- Port: `1433` bzw. `${MSSQL_LOCAL_PORT}`
- Database: `ausbildungsdoku`
- User: `sa`
- Passwort: Wert aus `.env`

## Redis einfach erklärt

Redis speichert ausschließlich Login-Sessions. Berichte, Benutzer, Noten, Freigaben und Audit-Logs liegen nicht in Redis, sondern in MSSQL.

Im lokalen Compose läuft Redis bewusst ohne Dateipersistenzmodus, weil der Fachdatenbestand ohnehin in MSSQL liegt und der stabile Session-Betrieb wichtiger ist als Redis-Disk-Backups.

## MSSQL einfach erklärt

MSSQL ist die Hauptdatenbank für Benutzer, Berichte, Noten, Freigaben, Zuordnungen und Audit-Logs. SQLite wird nicht verwendet.

## Rollenmodell

- `admin`: Dashboard, Benutzerverwaltung, Benutzer anlegen, Zuordnungen, Audit-Log, Profil
- `trainee`: Dashboard, Berichte, Noten, Freigaben, Export, Archiv, Profil
- `trainer`: Dashboard, Freigaben, Archiv, Profil

## Exportregeln

- PDF enthält ausschließlich signierte Berichte.
- CSV bleibt für eigene Berichte verfügbar.
- CSV wird als UTF-8 mit BOM exportiert.
- PDF nutzt DejaVu-Fonts im Container, damit Umlaute korrekt bleiben.

## Deployment

Der produktionsnahe Containerbetrieb ist in [docs/DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/DEPLOYMENT.md) beschrieben.

## Raspberry Pi

Der komplette Stack ist für Raspberry Pi nicht empfohlen:

- App und Redis können grundsätzlich auf ARM laufen.
- Das offizielle MSSQL-Docker-Image ist auf Raspberry Pi/ARM in der Regel nicht der stabile Zielpfad.
- Realistische Variante: App + Redis auf ARM, MSSQL extern auf x86_64.
- Für den kompletten lokalen Stack ist ein x86_64-PC oder Server empfohlen.

## Troubleshooting

- App nicht erreichbar: `docker compose -f docker-compose.local.yml ps` und `logs -f app`
- Ready nicht grün: `curl http://localhost:3010/api/ready`
- Port belegt: Port-Mapping in `.env` anpassen
- DB startet nicht: `logs -f mssql`
- Redis startet nicht: `logs -f redis`
- Login funktioniert nicht: Redis pruefen, Session-Secret pruefen, bei Admin-Zugang `npm run admin:reset` im App-Container ausfuehren
- Daten scheinen weg: prüfen, ob versehentlich `down -v` verwendet wurde
- Docker startet nach Rechnerneustart nicht automatisch: Docker Desktop / Docker Engine muss selbst beim Systemstart laufen

Weiterführende Doku:

- [docs/LOCAL_DOCKER.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/LOCAL_DOCKER.md)
- [docs/BACKUP_RESTORE.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/BACKUP_RESTORE.md)
- [docs/DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/DEPLOYMENT.md)
- [docs/ARCHITECTURE.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/ARCHITECTURE.md)
- [docs/SECURITY.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/SECURITY.md)
- [docs/TROUBLESHOOTING.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/TROUBLESHOOTING.md)
- [docs/FINAL_LOCAL_DOCKER_REPORT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/FINAL_LOCAL_DOCKER_REPORT.md)
