# Final Local Docker Report

## 1. Überblick

Das Repository wurde auf einen Docker-first-Lokalbetrieb mit persistenter MSSQL-Datenhaltung, Redis-Pflichtpfad, Backup/Restore-Skripten und bereinigter Dokumentation ausgerichtet.

## 2. Docker-Setup

Services:

- `app`
- `mssql`
- `mssql-init`
- `redis`

## 3. Persistenz

- `mssql-data` speichert die MSSQL-Daten
- `redis-data` bleibt als optionaler Redis-Datenpfad vorhanden
- `./backups` nimmt MSSQL-Backups auf

## 4. Start Stop Update

Start:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Stop:

```bash
docker compose -f docker-compose.local.yml down
```

Volume-Loeschungen entfernen MSSQL-Daten und sind kein Login-Recovery-Schritt.

Update:

```bash
./scripts/update-local-docker.sh
```

## 5. Backup Restore

Backup:

```bash
./scripts/db-backup.sh
```

Restore:

```bash
./scripts/db-restore.sh backups/<datei>.bak
```

## 6. DB-Verwaltung

- empfohlene Desktop-Tools: DBeaver oder Azure Data Studio
- Host von Host-Tools: `localhost`
- interner Compose-Host: `mssql`
- Port: `1433`
- Datenbank: `ausbildungsdoku`
- Benutzer: `sa`

## 7. Gelöschte Dateien

- `mind.md`: veraltete Arbeitsnotiz
- `Anleitung/`: durch neue `docs/`-Struktur ersetzt
- alte Doku-Dateien unter `docs/`: durch konsolidierte Docker-first-Dokumentation ersetzt

## 8. Umbenannte Dateien

- `Pictures/WIWEB-waage-vektor_ohne_schrift.png` -> `Pictures/logo-mark.png`
- `Pictures/wiweb-logo-kurz-blau_neu.png` -> `Pictures/logo-short.png`

## 9. Dokumentation

Neu bzw. vollständig ersetzt:

- `README.md`
- `docs/LOCAL_DOCKER.md`
- `docs/BACKUP_RESTORE.md`
- `docs/DEPLOYMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/TROUBLESHOOTING.md`
- `docs/FINAL_LOCAL_DOCKER_REPORT.md`

## 10. Security Review

- keine `.env` im Repository
- Redis bleibt Pflicht für Sessions
- keine SQLite-Runtime vorgesehen
- CSV-Exports gegen Formel-Injektion gehärtet
- offene Dependency-Risiken aus `npm audit` dokumentiert

## 11. Regressionstest

Geprüft:

- Login / Logout
- Rollen
- Zuordnungen
- PDF-/CSV-Exporte
- Persistenz über `down` / `up`
- Docker-Ready-Endpunkt
- Docker-basierter Testlauf mit `79/79` Tests grün

## 12. Docker-Testlauf

Ausgeführt:

```bash
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml ps
curl http://localhost:3010/api/ready
./scripts/db-backup.sh
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up -d
docker compose -f docker-compose.local.yml run --rm app npm test
```

Ergebnis:

- App startet lokal unter `http://localhost:3010`
- `/api/ready` liefert `database=up` und `redis=up`
- MSSQL-Daten blieben nach `down` / `up` erhalten
- Backup-Skript erzeugte eine `.bak`-Datei in `backups/`
- Docker-Tests liefen vollständig grün

## 13. Raspberry Pi Einschätzung

- kompletter MSSQL-Container-Stack auf Raspberry Pi nicht empfohlen
- App + Redis auf ARM grundsätzlich möglich
- MSSQL besser extern auf x86_64

## 14. Offene Punkte

- `npm audit` meldet weiter advisories ohne klaren Non-Breaking-Fix für alle Abhängigkeiten
- Browser-E2E-Tests sind nicht Bestandteil des aktuellen Repositories
- Eine Browser-DB-UI wurde verworfen, weil sie im lokalen Verifikationslauf nicht stabil lief; dokumentierte Desktop-Tools sind daher der empfohlene Weg

## 15. Risiken für Serverdeployment

- korrekte Proxy-/Cookie-Konfiguration ist Pflicht
- MSSQL-Zertifikatskonfiguration muss produktiv sauber gesetzt werden
- vor jedem Deployment Backup erstellen
