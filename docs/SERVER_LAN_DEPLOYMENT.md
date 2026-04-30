# Server Deployment im lokalen Netz

## Ziel

Diese Anleitung beschreibt den pragmatischen Serverbetrieb mit kompletter Anwendung **inklusive MSSQL und Redis** auf einem internen Server.

Zielbild:

- Zugriff nur aus dem lokalen Netz
- keine öffentliche Freigabe ins Internet
- bestehende MSSQL-Datenbank wird **vorher exportiert** und auf dem Zielserver wiederhergestellt
- Betrieb mit `docker-compose.local.yml`, weil dort App, MSSQL und Redis gemeinsam definiert sind

## Wann dieser Weg der richtige ist

Dieser Pfad ist passend, wenn:

- die App auf einem internen Firmen- oder Heimserver laufen soll
- MSSQL auf demselben Server im Docker-Stack mitlaufen darf
- kein öffentlicher Reverse Proxy und kein Internetzugriff erforderlich sind

Wenn MSSQL und Redis extern betrieben werden sollen, ist stattdessen [docs/DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/DEPLOYMENT.md) der passendere Einstieg.

## Voraussetzungen

- x86_64 Linux-Server
- Docker Engine mit Compose
- feste LAN-IP des Servers, z. B. `192.168.178.50`
- Zugriff auf die aktuelle Instanz, von der die Daten uebernommen werden

## Schritt 1: Datenbank auf dem bisherigen System exportieren

Auf dem aktuellen System im Repository ausfuehren:

```bash
./scripts/db-backup.sh
```

Ergebnis:

- die Backup-Datei liegt unter `backups/<datenbank>-<timestamp>.bak`
- dieses Backup ist die Basis fuer den Umzug auf den Server

Vor dem Export sinnvoll:

- laufende Aenderungen in der App abschliessen
- keinen gleichzeitigen Deploy oder Restore durchfuehren

## Schritt 2: Backup auf den Server kopieren

Die erzeugte `.bak`-Datei in den Ordner `backups/` auf dem Zielserver kopieren.

Beispiel:

```bash
scp backups/ausbildungsdoku-20260430-101500.bak user@192.168.178.50:/opt/Ausbildungsdoku_webapp/backups/
```

## Schritt 3: Repository auf dem Server vorbereiten

Auf dem Server:

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
cp .env.example .env
mkdir -p backups
```

Dann `.env` anpassen.

Wichtige Werte:

- `NODE_ENV=production`
- `ENABLE_DEMO_DATA=false`
- `RESET_DATABASE_ON_START=false`
- `SESSION_SECURE=false`
- `APP_BASE_URL=http://192.168.178.50:3010`
- `APP_PORT_MAPPING=192.168.178.50:3010:3010`
- `MSSQL_LOCAL_PORT=1433`
- starke Werte fuer `SESSION_SECRET`, `REDIS_PASSWORD`, `DB_PASSWORD`, `MSSQL_PASSWORD`, `INITIAL_ADMIN_PASSWORD`

Hinweis:

- `APP_PORT_MAPPING=192.168.178.50:3010:3010` bindet die App nur an die LAN-IP des Servers.
- MSSQL ist in `docker-compose.local.yml` bereits auf `127.0.0.1:${MSSQL_LOCAL_PORT}:1433` beschraenkt und damit nicht im Netz sichtbar.
- Redis wird in diesem Stack nicht nach aussen veroeffentlicht.

## Schritt 4: Firewall auf lokales Netz begrenzen

Auf dem Server sollte der Zugriff zusaetzlich per Firewall auf das lokale Netz eingeschraenkt werden.

Beispiel mit `ufw` fuer ein `/24`-Netz:

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow from 192.168.178.0/24 to any port 3010 proto tcp
sudo ufw enable
```

Damit ist die Webapp nur aus dem internen Netz erreichbar.

## Schritt 5: Stack auf dem Server starten

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Danach pruefen:

```bash
docker compose -f docker-compose.local.yml ps
curl http://192.168.178.50:3010/api/ready
```

Erwartung:

- `app`, `mssql` und `redis` sind `healthy`
- `mssql-init` ist erfolgreich beendet
- `/api/ready` liefert `200`

## Schritt 6: Datenbank auf dem Zielserver wiederherstellen

Wenn das Backup bereits in `backups/` auf dem Server liegt:

```bash
./scripts/db-restore.sh backups/<datei>.bak
```

Beispiel:

```bash
./scripts/db-restore.sh backups/ausbildungsdoku-20260430-101500.bak
```

Wichtig:

- der Restore ersetzt den aktuellen Stand der Datenbank
- vorher kein `down -v`
- keine Volumes loeschen

## Schritt 7: Admin-Zugang auf Server-ENV abgleichen

Wenn der migrierte Admin nicht mehr zum `INITIAL_ADMIN_PASSWORD` der neuen Server-`.env` passt:

```bash
docker compose -f docker-compose.local.yml exec app npm run admin:reset
```

Dieses Kommando:

- setzt das Passwort des konfigurierten Admins zurueck
- legt den Admin an, falls er fehlt
- loescht keine Fachdaten
- loescht keine Docker-Volumes

## Schritt 8: Funktionstest im LAN

Im Browser eines Clients im lokalen Netz:

```text
http://192.168.178.50:3010
```

Pruefen:

- Login mit Admin funktioniert
- Dashboard laedt
- Berichte und Benutzer sind vorhanden
- `http://192.168.178.50:3010/api/ready` ist erreichbar

## Updates ohne Datenverlust

Vor jedem Update:

```bash
./scripts/db-backup.sh
```

Dann:

```bash
git pull
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml up -d --build
```

Wichtig:

- `down` ist ok
- `down -v` ist **nicht** ok
- MSSQL-Volumes duerfen fuer normale Updates nicht geloescht werden

## Empfohlene Betriebsregeln

- nur den Web-Port `3010` fuer das LAN freigeben
- MSSQL und Redis nicht extern freigeben
- vor jedem Update ein `.bak` ziehen
- `.env` nur auf dem Server pflegen, nie committen
- Admin-Recovery nur ueber `npm run admin:reset`

## Kurzfassung

1. auf dem alten System `./scripts/db-backup.sh`
2. `.bak` nach `backups/` auf dem Server kopieren
3. Server-`.env` mit LAN-IP und starken Secrets pflegen
4. `docker compose -f docker-compose.local.yml up -d --build`
5. `./scripts/db-restore.sh backups/<datei>.bak`
6. bei Bedarf `docker compose -f docker-compose.local.yml exec app npm run admin:reset`
7. Zugriff nur aus dem LAN per Bind-IP und Firewall erlauben
