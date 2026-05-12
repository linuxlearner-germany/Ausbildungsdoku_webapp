# Deployment

## Zweck dieser Datei

Diese Anleitung beschreibt den produktionsnahen Betrieb der Ausbildungsdoku Webapp mit [docker-compose.yml](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docker-compose.yml).

Dabei gilt:

- nur die App selbst laeuft im Compose-Stack
- MSSQL ist extern
- Redis kann extern oder als eigener Docker-Container laufen
- der typische Zielpfad ist ein Linux-Server mit Reverse Proxy und HTTPS

Wenn die Anwendung nicht oeffentlich erreichbar sein soll, sondern nur im lokalen Netz betrieben wird, ist die speziellere Anleitung [SERVER_LAN_DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/SERVER_LAN_DEPLOYMENT.md) der passendere Pfad.

## Zielbild

Empfohlenes Setup:

```text
Browser
  -> HTTPS
Reverse Proxy
  -> HTTP im internen Netz
Docker-Container der App
  -> TCP
Externe MSSQL-Datenbank
  -> TCP
Redis-Container oder externe Redis-Instanz
```

Die App selbst hoert standardmaessig im Container auf Port `3010`.

## Was das Compose-Setup leistet

`docker-compose.yml` baut und startet genau einen Service:

- `app`

Der Container:

- nutzt das Runtime-Image aus dem `Dockerfile`
- startet die Node/Express-Anwendung auf Port `3010`
- fuehrt einen Healthcheck gegen `/api/ready` aus
- erwartet, dass Datenbank und Redis bereits ausserhalb des Compose-Stacks bereitstehen
- laeuft als Non-Root-User

Es gibt in diesem Deployment-Compose bewusst **keinen** MSSQL-Container und **keinen** Redis-Container.

## Voraussetzungen

Vor dem ersten Deployment sollten diese Punkte erfuellt sein:

- x86_64-Server oder vergleichbare Linux-Umgebung
- Docker Engine inklusive Compose
- DNS-Name oder feste IP fuer den Server
- Reverse Proxy vor der App, z. B. Nginx, Traefik, Caddy oder Apache
- gueltiges HTTPS-Zertifikat
- externe MSSQL-Instanz
- Redis-Instanz, entweder extern oder als eigener Container
- Zugriff auf die Projektdateien und auf eine gepflegte `.env`

## Technische Mindestannahmen

Die Anwendung setzt fuer einen stabilen Betrieb voraus:

- MSSQL ist erreichbar und die Ziel-Datenbank existiert
- Redis ist erreichbar und fuer Sessions nutzbar
- der App-Benutzer in MSSQL hat ausreichende Rechte auf der Ziel-Datenbank
- die gesetzten Base-URLs passen exakt zur spaeteren oeffentlichen Adresse
- der Reverse Proxy setzt die ueblichen Forwarded-Header korrekt

## Firmeninterne Zertifikate

Wenn HTTPS ueber einen Reverse Proxy mit firmeninternen Zertifikaten laeuft, gilt fuer diese App:

- das Browser-HTTPS endet am Reverse Proxy
- der App-Container selbst braucht dafuer kein eigenes Webserver-Zertifikat
- Docker interessiert sich fuer dieses Browser-Zertifikat nicht, solange der Proxy die TLS-Terminierung uebernimmt
- zwischen Proxy und App reicht intern normalerweise HTTP auf Port `3010`

Wichtig ist die Trennung:

- Zertifikat fuer Browser <-> Reverse Proxy: betrifft den App-Container normalerweise nicht
- Zertifikat fuer App <-> MSSQL: kann den App-Container sehr wohl betreffen

Falls euer MSSQL-Server TLS mit interner CA nutzt, gibt es praktisch zwei Wege:

1. sauberer Zielpfad: interne CA im Container beziehungsweise im Basisimage vertrauen und `MSSQL_TRUST_SERVER_CERTIFICATE=false` beibehalten
2. pragmatischer interner Pfad: `MSSQL_TRUST_SERVER_CERTIFICATE=true`, wenn ihr bewusst auf die strikte Zertifikatspruefung verzichtet

Fuer Redis gilt ein Zertifikatsthema nur dann, wenn Redis ebenfalls per TLS und interner CA betrieben wird. Ein normaler Redis-Container ohne TLS braucht dafuer keine Zertifikatsintegration.

## Vor dem Deployment: Datenbank und Redis verstehen

MSSQL und Redis haben unterschiedliche Aufgaben:

- MSSQL speichert die eigentlichen Fachdaten: Benutzer, Berichte, Freigaben, Noten, Zuordnungen, Audit-Logs
- Redis speichert Sessions und Login-Rate-Limit-Zustaende
- Redis darf dafuer problemlos in einem separaten Docker-Container laufen

Wichtig fuer den Betrieb:

- Redis ist kein Ersatz fuer MSSQL
- ohne Redis ist das Session-Handling nicht der vorgesehene Zielpfad
- ein Neustart des App-Containers loescht keine MSSQL-Daten
- ein neues Deployment ersetzt nur den App-Container, nicht die externen Dienste

## Schritt 1: Repository auf dem Zielserver bereitstellen

Beispiel:

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
cp .env.example .env
```

Danach die Datei `.env` fuer den Zielserver anpassen.

## Schritt 2: Pflichtvariablen sauber setzen

Diese Variablen muessen sinnvoll belegt sein:

- `SESSION_SECRET`
- `INITIAL_ADMIN_PASSWORD`
- `MSSQL_HOST`
- `MSSQL_PORT`
- `MSSQL_DATABASE`
- `DB_USER`
- `DB_PASSWORD`
- `REDIS_URL` oder alternativ `REDIS_HOST` plus `REDIS_PORT`

Wichtige Klarstellung:

- fuer die App sind `DB_USER` und `DB_PASSWORD` relevant
- `MSSQL_USER` ist **nicht** der operative Standardpfad dieser App
- `DB_USER` darf laut Konfiguration nicht `sa` sein

## Schritt 3: Empfohlene Produktionswerte setzen

Diese Werte sollten fuer einen normalen produktiven Betrieb gesetzt oder bewusst geprueft werden:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3010
APP_PORT_MAPPING=3010:3010

APP_BASE_URL=https://deine-domain.example
APP_BASE_PATH=
API_BASE_URL=
TRUST_PROXY=true

SESSION_SECRET=<langer-zufaelliger-geheimer-wert>
SESSION_SECURE=true
SESSION_SAME_SITE=lax
SESSION_COOKIE_DOMAIN=

MSSQL_HOST=<sql-host>
MSSQL_PORT=1433
MSSQL_DATABASE=<datenbankname>
DB_USER=<app-benutzer>
DB_PASSWORD=<starkes-passwort>
MSSQL_ENCRYPT=true
MSSQL_TRUST_SERVER_CERTIFICATE=false

REDIS_URL=redis://:<redis-passwort>@<redis-host>:6379

APPLY_MIGRATIONS_ON_START=true
BOOTSTRAP_DATABASE_ON_START=true
RESET_DATABASE_ON_START=false
ENABLE_DEMO_DATA=false

INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=<starkes-initialpasswort>
INITIAL_ADMIN_FORCE_PASSWORD_CHANGE=true
```

## ENV-Variablen im Detail

### App und Routing

- `NODE_ENV=production`
  Aktiviert produktionsnahes Laufzeitverhalten.
- `HOST=0.0.0.0`
  Noetig, damit der Container extern erreichbar ist.
- `PORT=3010`
  Interner App-Port. Der Compose-Healthcheck erwartet denselben Port.
- `APP_PORT_MAPPING=3010:3010`
  Veroeffentlicht den Containerport auf dem Host.
- `APP_BASE_URL`
  Die oeffentliche Basis-URL inklusive Schema und Domain, z. B. `https://berichtsheft.example.com`.
- `APP_BASE_PATH`
  Nur setzen, wenn die App unter einem Unterpfad laeuft, z. B. `/ausbildungsdoku`.
- `API_BASE_URL`
  Normalerweise leer lassen. Dann bildet die App den API-Pfad selbst korrekt aus `APP_BASE_URL` und `APP_BASE_PATH`.
- `TRUST_PROXY`
  Hinter Reverse Proxy auf `true` oder auf die passende Proxy-Anzahl setzen.

### Sessions und Cookies

- `SESSION_SECRET`
  Muss lang, zufaellig und geheim sein.
- `SESSION_SECURE=true`
  Fuer HTTPS-Betrieb Pflicht.
- `SESSION_SAME_SITE=lax`
  Sinnvoller Standard fuer normalen Webbetrieb.
- `SESSION_COOKIE_DOMAIN`
  Nur setzen, wenn ein konkreter Domain-Use-Case das verlangt.
- `SESSION_MAX_AGE_MS`
  Browser-Cookie-Laufzeit.
- `SESSION_TTL_SECONDS`
  Lebensdauer der Session in Redis.

### MSSQL

- `MSSQL_HOST`
  Hostname oder IP der externen SQL-Instanz.
- `MSSQL_PORT`
  Standard meist `1433`.
- `MSSQL_DATABASE`
  Ziel-Datenbank fuer die App.
- `DB_USER`
  dedizierter App-Benutzer, nicht `sa`
- `DB_PASSWORD`
  Passwort dieses App-Benutzers
- `MSSQL_ENCRYPT=true`
  fuer produktive Verbindungen empfohlen
- `MSSQL_TRUST_SERVER_CERTIFICATE=false`
  bei gueltigem Zertifikat so belassen; nur bewusst aendern

### Redis

- `REDIS_URL`
  bevorzugter kompakter Weg
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
  Alternative, wenn keine URL verwendet werden soll
- `REDIS_KEY_PREFIX`
  Namespace fuer Redis-Keys

Wenn Redis in einem separaten Docker-Container laeuft, ist relevant:

- der App-Container muss den Redis-Host per DNS oder IP erreichen
- der Redis-Port muss aus Sicht des App-Containers offen sein
- ein Passwort ist Pflicht
- Redis muss nicht im selben Compose-File liegen

### Bootstrap und Startverhalten

- `APPLY_MIGRATIONS_ON_START=true`
  fuehrt Migrationen beim Start aus
- `BOOTSTRAP_DATABASE_ON_START=true`
  erstellt Initial-Admin und Grundzustand beim Start
- `RESET_DATABASE_ON_START=false`
  im produktiven Betrieb niemals aktivieren
- `ENABLE_DEMO_DATA=false`
  in Produktion deaktiviert lassen

## Sichere Secret-Erzeugung

Beispiel fuer ein starkes Session-Secret:

```bash
openssl rand -base64 48
```

Dasselbe Prinzip gilt fuer:

- `SESSION_SECRET`
- `DB_PASSWORD`
- `REDIS_PASSWORD`
- `INITIAL_ADMIN_PASSWORD`

`.env` darf nicht ins Repository commitet werden.

## Schritt 4: Datenbank vorbereiten

Vor dem ersten Start muss die externe MSSQL-Instanz betriebsbereit sein.

Mindestens erforderlich:

- die Datenbank aus `MSSQL_DATABASE` existiert
- der Benutzer aus `DB_USER` existiert
- der Benutzer aus `DB_USER` hat Rechte auf dieser Datenbank
- Netzwerkzugriff vom App-Server zur MSSQL-Instanz ist erlaubt

Falls eine bestehende Umgebung migriert wird:

1. Backup der bisherigen Datenbank erzeugen
2. Backup auf dem Zielsystem bereitstellen
3. Restore auf der externen MSSQL-Instanz ausfuehren
4. `MSSQL_DATABASE`, `DB_USER` und `DB_PASSWORD` in der Server-`.env` damit abgleichen

Die lokalen Skripte fuer Backup/Restore in diesem Repository sind primaer fuer den lokalen Docker-MSSQL-Pfad gedacht, nicht fuer generische Remote-Restore-Prozesse.

## Schritt 5: Redis vorbereiten

Vor dem ersten Start pruefen:

- Redis ist erreichbar
- Redis akzeptiert die vorgesehenen Zugangsdaten
- nur der App-Server darf auf Redis zugreifen
- Timeouts und Firewalls blockieren die Verbindung nicht
- wenn Redis im Container laeuft: Restart-Policy und Netzwerkanbindung sind sauber konfiguriert

Wenn `REDIS_URL` genutzt wird, ist das der einfachste Zielpfad. Wenn einzelne Variablen genutzt werden, muessen `REDIS_HOST` und `REDIS_PORT` konsistent gesetzt sein.

## Schritt 6: Reverse Proxy einrichten

Der Reverse Proxy sollte:

- HTTPS terminieren
- Requests an die App auf Port `3010` weiterleiten
- `/api` an dieselbe App weiterleiten
- Forwarded-Header sauber setzen
- SPA-Reloads nicht kaputt machen

Fuer euren Zielpfad konkret:

- Firmenzertifikat auf dem Reverse Proxy einbinden
- Proxy intern auf `http://<app-host>:3010` weiterleiten
- `APP_BASE_URL` auf die echte HTTPS-Adresse setzen
- `TRUST_PROXY=true` setzen
- `SESSION_SECURE=true` setzen

Wichtig:

- die App ist eine SPA auf `/`
- API-Routen liegen unter `/api`
- Reloads auf Unterseiten muessen wieder bei derselben App landen

Typisches Ziel:

```text
https://deine-domain.example/* -> http://127.0.0.1:3010/*
```

Wenn die App unter einem Unterpfad laufen soll, muessen drei Dinge zusammenpassen:

- `APP_BASE_URL`
- `APP_BASE_PATH`
- die Proxy-Regeln fuer diesen Unterpfad

## Reverse-Proxy-Checkliste

Vor dem Go-Live pruefen:

- `X-Forwarded-Proto` wird gesetzt
- `X-Forwarded-For` wird gesetzt
- `Host` wird korrekt weitergereicht
- HTTPS funktioniert von aussen
- Session-Cookies kommen mit den erwarteten Flags zurueck
- ein Browser-Reload auf einer Unterseite liefert weiterhin die App

## Schritt 7: Container starten

Start:

```bash
docker compose up -d --build
```

Status pruefen:

```bash
docker compose ps
```

Logs verfolgen:

```bash
docker compose logs -f app
```

## Schritt 8: Healthchecks und Erreichbarkeit pruefen

Die App stellt drei relevante Endpunkte bereit:

- `/api/live`
- `/api/health`
- `/api/ready`

Bedeutung im Betrieb:

- `/api/live` prueft den grundlegenden Prozess
- `/api/health` ist ein allgemeiner Gesundheitscheck
- `/api/ready` ist der wichtigste Endpunkt fuer Deployment, Orchestrierung und Betriebsfreigabe

Direkter Test auf dem Server:

```bash
curl http://127.0.0.1:3010/api/ready
```

Wenn `APP_BASE_PATH` gesetzt ist, muss der Pfad entsprechend erweitert werden:

```bash
curl http://127.0.0.1:3010/<base-path>/api/ready
```

Zusatzhinweis:

- auch der Docker-Healthcheck des Containers nutzt `/api/ready`
- bei abweichendem `APP_BASE_PATH` muss dieser korrekt gesetzt sein, sonst wirkt der Container ungesund

## Schritt 9: Initial-Admin pruefen

Beim Bootstrap wird der Initial-Admin anhand der ENV-Werte angelegt oder abgeglichen:

- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

Wenn der Zugang nach Migration oder Passwortabweichung nicht mehr passt:

```bash
docker compose exec app npm run admin:reset
```

Dieses Kommando:

- setzt den konfigurierten Admin zurueck oder legt ihn neu an
- loescht keine fachlichen MSSQL-Daten
- ist der vorgesehene Recovery-Weg fuer den Admin-Zugang

## Erstabnahme nach dem Deployment

Nach dem ersten erfolgreichen Start sollte mindestens dies getestet werden:

1. Login mit Admin funktioniert
2. Dashboard laedt
3. `/api/ready` liefert erfolgreich
4. Berichte, Benutzer und andere erwartete Daten sind vorhanden
5. eine Schreiboperation funktioniert
6. Logout und erneuter Login funktionieren
7. ein Browser-Reload auf einer Unterseite funktioniert

## Updates ohne Datenverlust

Der normale Update-Pfad fuer die App ist:

```bash
git pull
docker compose down
docker compose up -d --build
```

Vorher immer empfohlen:

1. Backup der MSSQL-Datenbank erzeugen
2. aktuelle `.env` sichern
3. Aenderungen an ENV-Variablen pruefen
4. nach dem Start `/api/ready` pruefen

Da MSSQL extern ist und Redis separat betrieben werden kann, ersetzt dieses Update in der Regel nur den App-Container.

## Rollback-Grundsatz

Wenn ein Deployment fehlschlaegt, braucht es einen klaren Rueckweg:

1. vorheriges Image oder vorherigen Commit kennen
2. Datenbank-Backup vor dem Update erzeugen
3. nur rueckrollen, wenn Datenbankschema und App-Version zusammenpassen
4. nach Rollback erneut `/api/ready` und Login testen

Ein unbedachter App-Rollback nach bereits ausgefuehrten Migrationen kann problematisch sein. Deshalb vor produktiven Updates immer Backup und Migrationsrisiko mitdenken.

## Firewall und Netzgrenzen

Empfehlungen:

- nur Port `80/443` fuer den Reverse Proxy oeffnen
- Port `3010` nach aussen nicht unnoetig direkt freigeben
- MSSQL nur fuer den App-Server erlauben
- Redis nur fuer den App-Server erlauben
- SSH-Zugriff separat absichern

## Sicherheitsrelevante Defaults

Fuer Deployment besonders wichtig:

- `SESSION_SECURE=true`
- `TRUST_PROXY=true` oder passend numerisch
- `ENABLE_DEMO_DATA=false`
- `RESET_DATABASE_ON_START=false`
- `MSSQL_TRUST_SERVER_CERTIFICATE=false`, wenn ein gueltiges Zertifikat vorhanden ist
- keine echten Secrets in Compose-Dateien, README oder Git

Ergaenzende Hinweise stehen in [SECURITY.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/SECURITY.md).

## Typische Fehlerbilder

### Container startet, aber App ist nicht erreichbar

Pruefen:

- `docker compose ps`
- `docker compose logs -f app`
- Reverse-Proxy-Zielport
- Firewall

### `/api/ready` bleibt rot

Hauefige Ursachen:

- MSSQL nicht erreichbar
- Redis nicht erreichbar
- falsche Zugangsdaten in `.env`
- `APP_BASE_PATH` unpassend gesetzt

### Login funktioniert nicht trotz laufender App

Pruefen:

- `SESSION_SECRET`
- Redis-Verbindung
- Cookie-Flags hinter HTTPS
- `TRUST_PROXY`

### Unterseiten funktionieren nur nach Klick, aber nicht nach Browser-Reload

Dann ist meist der Reverse Proxy fuer SPA-Routing oder Unterpfade unvollstaendig konfiguriert.

### Admin-Login stimmt nicht mehr

Recovery:

```bash
docker compose exec app npm run admin:reset
```

## Raspberry-Pi- / ARM-Hinweis

Die App kann grundsaetzlich auf ARM laufen, aber MSSQL auf Raspberry Pi beziehungsweise ARM ist nicht der verlässlichste Standardpfad. Der praktikable Weg ist meist:

- App auf dem Zielsystem
- Redis passend zur Plattform oder als separater Container
- MSSQL extern auf einer dafuer geeigneten Umgebung, typischerweise x86_64

## Kurzcheckliste

1. Repository auf dem Server bereitstellen
2. `.env` mit echten Produktionswerten pflegen
3. externe MSSQL bereitstellen und Rechte fuer `DB_USER` pruefen
4. Redis-Instanz bereitstellen, extern oder als eigener Container
5. Reverse Proxy mit HTTPS und Forwarded-Headern konfigurieren
6. `docker compose up -d --build`
7. `docker compose ps`
8. `curl http://127.0.0.1:3010/api/ready`
9. Login und Fachfunktionen pruefen
10. vor jedem Update Backup erstellen

## Verwandte Dokumente

- [README.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/README.md)
- [LOCAL_DOCKER.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/LOCAL_DOCKER.md)
- [SERVER_LAN_DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/SERVER_LAN_DEPLOYMENT.md)
- [BACKUP_RESTORE.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/BACKUP_RESTORE.md)
- [TROUBLESHOOTING.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/TROUBLESHOOTING.md)
- [SECURITY.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/SECURITY.md)
