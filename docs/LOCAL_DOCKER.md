# Local Docker

## Ziel

Der Standardweg für den lokalen Betrieb ist ausschließlich Docker:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Die Anwendung läuft danach unter:

- App: http://localhost:3010
- Ready: http://localhost:3010/api/ready

## Services

- `app`: Webapp im Container
- `mssql`: Microsoft SQL Server
- `mssql-init`: initiale Datenbankerstellung
- `redis`: Session-Store

## Persistenz

Named Volumes:

- `mssql-data` speichert die MSSQL-Datenbank
- `redis-data` ist für einen optionalen Redis-Datenpfad vorhanden

Zusätzlich bindet `mssql` den Host-Ordner `./backups` nach `/backups` ein, damit Datenbank-Backups lokal landen.

Hinweis zu Redis:

- Redis bleibt Pflicht für Sessions.
- Die lokale Compose-Konfiguration verwendet aus Stabilitätsgründen keinen Dateipersistenzmodus für Redis.
- Fachdaten liegen ohnehin in MSSQL, nicht in Redis.

## Start / Stop / Löschen

Start:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Stoppen ohne Datenverlust:

```bash
docker compose -f docker-compose.local.yml down
```

Komplett löschen:

```bash
docker compose -f docker-compose.local.yml down -v
```

## Unterschied zwischen `stop`, `down`, `down -v`, `rebuild`, `update`

- `stop`: Container bleiben angelegt, Volumes bleiben erhalten.
- `down`: Container und Netzwerk werden entfernt, Volumes bleiben erhalten.
- `down -v`: Container, Netzwerk und Volumes werden entfernt.
- `up -d --build`: Image neu bauen, Container starten, Daten bleiben erhalten.
- Update: zuerst Backup, dann `down`, dann `up -d --build`.

## Restart-Verhalten

`app`, `mssql` und `redis` nutzen:

```yaml
restart: unless-stopped
```

Das bedeutet:

- Docker selbst muss beim Systemstart laufen.
- Nach Docker-/Rechner-Neustart starten die Container wieder.
- Manuell gestoppte Container bleiben gestoppt, bis sie wieder gestartet werden.

## Ready / Health

Wichtiger Endpunkt:

```bash
curl http://localhost:3010/api/ready
```

Die App meldet nur `ready`, wenn:

- MSSQL erreichbar ist
- Redis erreichbar ist
- die Anwendung selbst betriebsbereit ist

Weitere Endpunkte:

- `/api/live`
- `/api/health`

## DB-Ansicht / Verwaltung

Empfohlen sind lokale Desktop-Tools:

- DBeaver
- Azure Data Studio

Verbindungsdaten:

- Host aus DBeaver / Azure Data Studio: `localhost`
- interner Compose-Host: `mssql`
- Port: `1433` bzw. `${MSSQL_LOCAL_PORT}`
- Database: `ausbildungsdoku`
- User: `sa`
- Passwort: Wert aus `.env`

Hinweis:

- Eine Browser-DB-UI wurde getestet, aber nicht in den Standard-Stack übernommen, weil sie im lokalen Verifikationslauf nicht stabil lief.
- Desktop-Tools sind für MSSQL hier der robustere Weg.

## Host-NPM

Host-NPM ist nicht mehr der normale Startweg. Vorhandene NPM-Skripte bleiben für Entwicklung und Sonderfälle erhalten, aber der erwartete lokale Betrieb ist Docker-first.

## Benutzer-CSV-Import

Die Admin-Vorlage unter `public/benutzer_import_vorlage.csv` unterstuetzt fuer Azubis jetzt optional:

- `ausbildungsbeginn`
- `ausbildungsende`

Alternativ erkennt der Import auch:

- `training_start_date`
- `training_end_date`

Erwartetes Datumsformat ist `YYYY-MM-DD`. Vor der Uebernahme zeigt die Vorschau ungueltige Werte und ungueltige Zeitraeume direkt zeilenbezogen an.

## Tests im Docker-Stack

`docker compose -f docker-compose.local.yml run --rm app npm test` nutzt die separate Testdatenbank aus `MSSQL_TEST_DATABASE`. Die lokale Runtime-Datenbank unter `MSSQL_DATABASE` bleibt dadurch vom Testlauf getrennt.

## Admin-Zugang wiederherstellen

Wenn der Admin in der bestehenden lokalen Datenbank nicht mehr mit `INITIAL_ADMIN_PASSWORD` aus `.env` zusammenpasst, kann der Zugang manuell wiederhergestellt werden:

```bash
docker compose -f docker-compose.local.yml exec app npm run admin:reset
```

Verhalten:

- setzt das Passwort fuer den konfigurierten Admin zurueck, wenn er bereits existiert
- legt den konfigurierten Admin an, wenn noch kein passender Admin vorhanden ist
- loescht keine Volumes und keine Fachdatensaetze

Der normale App-Start ueberschreibt bestehende Admins weiterhin nicht automatisch.
