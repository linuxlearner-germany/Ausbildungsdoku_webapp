# Server Deployment im lokalen Netz mit externer MSSQL-Datenbank

## Ziel

Diese Anleitung beschreibt den Serverbetrieb **nur im lokalen Netz**, wenn:

- die Webapp im Docker-Container auf dem Server laeuft
- **MSSQL extern** betrieben wird
- keine oeffentliche Internet-Freigabe gewuenscht ist

Technisch ist das der vorhandene produktionsnahe Pfad mit [docker-compose.yml](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docker-compose.yml): Die App laeuft im Container, MSSQL und Redis werden extern angebunden.

## Zielbild

- Client im LAN greift auf `http://<server-ip>:3010` zu
- App laeuft auf dem Server im Docker-Container
- MSSQL laeuft **nicht** im Compose-Stack, sondern extern
- Redis laeuft ebenfalls extern und bleibt Pflicht fuer Sessions
- kein Reverse Proxy und kein Internetzugriff notwendig

## Voraussetzungen

- x86_64 Linux-Server
- Docker Engine mit Compose
- feste LAN-IP des App-Servers, z. B. `192.168.178.50`
- externe MSSQL-Instanz mit Zugriff fuer die App
- externe Redis-Instanz mit Passwort
- Zugriff auf die bisherige Datenbankquelle fuer Export und Import

## Schritt 1: Datenbank vor dem Umzug exportieren

Wenn die aktuelle Instanz noch mit dem lokalen Docker-MSSQL laeuft, kannst du das Backup direkt im Repository erzeugen:

```bash
./scripts/db-backup.sh
```

Ergebnis:

- die Backup-Datei liegt unter `backups/<datenbank>-<timestamp>.bak`

Wenn die Quelldatenbank bereits extern laeuft, erstelle das Backup direkt auf dem SQL-Server mit den dort ueblichen Mitteln.

## Schritt 2: Backup zur externen Ziel-MSSQL uebertragen

Das `.bak` muss auf dem System verfuegbar sein, auf dem die **externe** MSSQL-Instanz den Restore ausfuehrt.

Beispiel:

```bash
scp backups/ausbildungsdoku-20260430-101500.bak sqladmin@192.168.178.60:/var/opt/mssql/backups/
```

## Schritt 3: Backup in der externen MSSQL wiederherstellen

Die Wiederherstellung passiert **nicht** ueber `./scripts/db-restore.sh`, weil dieses Skript fuer den lokalen MSSQL-Container gedacht ist.

Der Restore muss auf der externen SQL-Server-Instanz erfolgen, zum Beispiel mit:

- SQL Server Management Studio
- Azure Data Studio
- `sqlcmd`
- vorhandenen DBA-Prozessen

Wichtig:

- Ziel-Datenbankname muss zu `MSSQL_DATABASE` auf dem App-Server passen
- App-Login `DB_USER` braucht Rechte auf dieser Datenbank
- bestehende Datenbankstaende werden beim Restore ersetzt

## Schritt 4: App-Repository auf dem Server vorbereiten

Auf dem App-Server:

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
cp .env.example .env
```

Dann `.env` pflegen.

Wichtige Werte:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3010`
- `APP_PORT_MAPPING=192.168.178.50:3010:3010`
- `APP_BASE_URL=http://192.168.178.50:3010`
- `SESSION_SECURE=false`
- `ENABLE_DEMO_DATA=false`
- `RESET_DATABASE_ON_START=false`
- `MSSQL_HOST=<externer-sql-host>`
- `MSSQL_PORT=1433`
- `MSSQL_DATABASE=<ziel-datenbank>`
- `DB_USER=<app-login>`
- `DB_PASSWORD=<app-passwort>`
- `REDIS_HOST=<externer-redis-host>` oder `REDIS_URL=redis://...`
- `REDIS_PASSWORD=<redis-passwort>`
- starke Werte fuer `SESSION_SECRET` und `INITIAL_ADMIN_PASSWORD`

Hinweis:

- `APP_PORT_MAPPING=192.168.178.50:3010:3010` bindet die App nur an die LAN-IP des Servers.
- `MSSQL_USER` wird nicht verwendet. Entscheidend sind `DB_USER` und `DB_PASSWORD`.

## Schritt 5: Firewall auf lokales Netz begrenzen

Auf dem App-Server den Webzugriff auf das lokale Netz einschränken.

Beispiel mit `ufw`:

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow from 192.168.178.0/24 to any port 3010 proto tcp
sudo ufw enable
```

Optional auch auf MSSQL- und Redis-Seite nur den App-Server zulassen.

## Schritt 6: App-Container auf dem Server starten

```bash
docker compose up -d --build
```

Danach pruefen:

```bash
docker compose ps
curl http://192.168.178.50:3010/api/ready
```

Erwartung:

- der Container `app` laeuft
- `/api/ready` liefert `200`
- die App erreicht MSSQL und Redis erfolgreich

## Schritt 7: Admin-Zugang mit Server-ENV abgleichen

Wenn der migrierte Admin nicht mehr zum `INITIAL_ADMIN_PASSWORD` der Server-`.env` passt:

```bash
docker compose exec app npm run admin:reset
```

Dieses Kommando:

- setzt das Passwort des konfigurierten Admins zurueck
- legt den Admin an, falls er fehlt
- loescht keine Fachdaten
- fasst die externe MSSQL-Datenbank fachlich nicht destruktiv an

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

1. Backup auf der externen MSSQL erzeugen
2. optional Redis-Konfiguration pruefen

Dann auf dem App-Server:

```bash
git pull
docker compose down
docker compose up -d --build
```

Da die Datenbank extern ist, betrifft das Compose-Update nur den App-Container.

## Empfohlene Betriebsregeln

- nur Port `3010` fuer das LAN freigeben
- keine Portweiterleitung ins Internet
- MSSQL nur fuer den App-Server freigeben
- Redis nur fuer den App-Server freigeben
- `.env` nur auf dem Server pflegen, nie committen
- Admin-Recovery nur ueber `docker compose exec app npm run admin:reset`

## Kurzfassung

1. bestehende DB vor dem Umzug sichern
2. Backup auf die externe Ziel-MSSQL bringen
3. Restore auf der externen MSSQL ausfuehren
4. Server-`.env` mit externer MSSQL und externem Redis pflegen
5. `docker compose up -d --build`
6. `curl http://<server-ip>:3010/api/ready`
7. bei Bedarf `docker compose exec app npm run admin:reset`
