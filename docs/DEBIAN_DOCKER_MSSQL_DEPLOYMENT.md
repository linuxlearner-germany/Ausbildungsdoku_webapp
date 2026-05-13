# Debian Deployment mit Docker und MSSQL

## Zielbild

Diese Anleitung beschreibt einen Server auf **Debian**, auf dem:

- die Webapp im Docker-Container laeuft
- **MSSQL extern oder separat** betrieben wird
- **Redis ebenfalls vorhanden** ist, weil die App Redis fuer Sessions zwingend braucht

Der vorhandene Produktionspfad bleibt dabei bewusst einfach:

- `docker-compose.yml` startet nur die App
- MSSQL und Redis werden per `.env` angebunden

## Wichtiger Architekturpunkt

Fuer den Serverbetrieb reicht **MSSQL allein nicht aus**. Die App benoetigt:

- `MSSQL` fuer Fachdaten
- `Redis` fuer Login-Sessions

Wenn du nur einen Debian-Server und einen separaten SQL-Server hast, gibt es zwei saubere Varianten:

1. MSSQL extern, Redis als eigener Container auf dem Debian-Server
2. MSSQL extern, Redis ebenfalls extern

## Voraussetzung

- Debian 12 oder aehnlich
- Docker Engine mit Compose Plugin
- erreichbarer MSSQL-Server
- Redis mit Passwort
- offene Netzwerkpfade vom App-Server zu MSSQL und Redis

## Schritt 1: Docker auf Debian installieren

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Optional:

```bash
sudo usermod -aG docker $USER
```

Danach neu anmelden.

## Schritt 2: Repository auf dem Server ablegen

```bash
git clone https://github.com/linuxlearner-germany/Ausbildungsdoku_webapp.git
cd Ausbildungsdoku_webapp
cp .env.example .env
```

## Schritt 3: Redis bereitstellen

Falls Redis **auf demselben Debian-Server** laufen soll, nutze die zusaetzliche Compose-Datei `docker-compose.server-redis.yml`.

Dann braucht die App spaeter nur den Compose-Service `redis` und keinen Sonderfall ueber Host-IP oder `host.docker.internal`.

In der `.env` reicht dann:

```env
REDIS_PASSWORD=SETZE_HIER_EIN_STARKES_PASSWORT
```

Wenn Redis **extern** betrieben wird, setze stattdessen:

```env
REDIS_URL=
REDIS_HOST=redis.example.internal
REDIS_PORT=6379
REDIS_PASSWORD=SETZE_HIER_EIN_STARKES_PASSWORT
```

## Schritt 4: `.env` fuer den Server pflegen

Beispiel fuer **oeffentlichen Betrieb hinter HTTPS-Reverse-Proxy**:

```env
NODE_ENV=production
TZ=Europe/Berlin
HOST=0.0.0.0
PORT=3010
APP_PORT_MAPPING=127.0.0.1:3010:3010

APP_BASE_URL=https://deine-domain.example
APP_BASE_PATH=
API_BASE_URL=
TRUST_PROXY=true

SESSION_SECRET=SEHR_LANGES_ZUFAELLIGES_SECRET
SESSION_COOKIE_NAME=berichtsheft.sid
SESSION_COOKIE_DOMAIN=
SESSION_SECURE=true
SESSION_SAME_SITE=lax
SESSION_MAX_AGE_MS=86400000
SESSION_TTL_SECONDS=86400

REDIS_URL=
REDIS_HOST=redis.example.internal
REDIS_PORT=6379
REDIS_PASSWORD=SEHR_STARKES_REDIS_PASSWORT
REDIS_KEY_PREFIX=berichtsheft:

MSSQL_HOST=sql.example.internal
MSSQL_PORT=1433
MSSQL_DATABASE=ausbildungsdoku
DB_USER=ausbildungsdoku_app
DB_PASSWORD=SEHR_STARKES_DB_PASSWORT
MSSQL_ENCRYPT=true
MSSQL_TRUST_SERVER_CERTIFICATE=false

APPLY_MIGRATIONS_ON_START=true
BOOTSTRAP_DATABASE_ON_START=true
RESET_DATABASE_ON_START=false
ENABLE_DEMO_DATA=false

INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_PASSWORD=SEHR_STARKES_INITIAL_ADMIN_PASSWORT
INITIAL_ADMIN_FORCE_PASSWORD_CHANGE=true
```

Beispiel fuer **reinen LAN-Betrieb ohne HTTPS**:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3010
APP_PORT_MAPPING=192.168.178.50:3010:3010
APP_BASE_URL=http://192.168.178.50:3010
TRUST_PROXY=false
SESSION_SECURE=false
```

Die restlichen Pflichtwerte bleiben identisch.

## Schritt 5: MSSQL vorbereiten

Der App-Login darf **nicht** `sa` sein. In der Ziel-Datenbank muss ein eigener Benutzer existieren, der auf `MSSQL_DATABASE` schreiben darf.

Pflichtwerte:

- `MSSQL_HOST`
- `MSSQL_PORT`
- `MSSQL_DATABASE`
- `DB_USER`
- `DB_PASSWORD`

Empfehlung:

- `MSSQL_ENCRYPT=true`
- `MSSQL_TRUST_SERVER_CERTIFICATE=false` mit gueltigem Zertifikat

## Schritt 6: App starten

Mit externer Redis-Instanz:

```bash
docker compose up -d --build
```

Mit Redis auf demselben Debian-Server:

```bash
docker compose -f docker-compose.yml -f docker-compose.server-redis.yml up -d --build
```

Pruefen:

```bash
docker compose ps
docker compose logs --tail=200 app
curl http://127.0.0.1:3010/api/ready
```

Wenn du die Redis-Compose-Erweiterung nutzt, fuehre `ps`, `logs` und spaetere `exec`-Befehle ebenfalls mit beiden Dateien aus:

```bash
docker compose -f docker-compose.yml -f docker-compose.server-redis.yml ps
docker compose -f docker-compose.yml -f docker-compose.server-redis.yml logs --tail=200 app
docker compose -f docker-compose.yml -f docker-compose.server-redis.yml exec app npm run admin:reset
```

## Schritt 7: Reverse Proxy fuer Internetbetrieb

Wenn die App von aussen erreichbar sein soll, setze einen Reverse Proxy davor, zum Beispiel Nginx oder Traefik.

Wichtige Regeln:

- Proxy terminiert HTTPS
- Proxy leitet `/` und `/api` an `127.0.0.1:3010` weiter
- Proxy setzt `X-Forwarded-For` und `X-Forwarded-Proto`
- App laeuft dann mit `TRUST_PROXY=true`

## Schritt 8: Firewall

Beispiel fuer LAN-Betrieb:

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow from 192.168.178.0/24 to any port 3010 proto tcp
sudo ufw enable
```

Beispiel fuer Reverse-Proxy-Betrieb:

- Port `3010` nur lokal oder nur fuer den Proxy freigeben
- extern nur `80` und `443` freigeben

## Schritt 9: Funktionstest

Pruefen:

- `GET /api/ready` liefert `200`
- Login funktioniert
- Initial-Admin wurde angelegt
- App kann Berichte lesen und schreiben

Wenn der Admin-Zugang nicht passt:

```bash
docker compose exec app npm run admin:reset
```

## Updates

Mit externer Redis-Instanz:

```bash
git pull
docker compose down
docker compose up -d --build
```

Mit lokaler Redis-Compose-Erweiterung:

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.server-redis.yml down
docker compose -f docker-compose.yml -f docker-compose.server-redis.yml up -d --build
```

Vorher Datenbank-Backup erstellen.

## Typische Fehler

- App startet nicht: `SESSION_SECRET`, `INITIAL_ADMIN_PASSWORD`, `DB_USER`, `DB_PASSWORD` oder `REDIS_PASSWORD` fehlen
- Login klappt nicht: Redis nicht erreichbar oder falsches Passwort
- Ready bleibt rot: MSSQL oder Redis nicht erreichbar
- Cookies funktionieren nicht hinter HTTPS: `TRUST_PROXY` oder `SESSION_SECURE` falsch

## Entscheidungshilfe

Wenn dein Ziel **nur internes LAN** ist, nutze zusaetzlich [SERVER_LAN_DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/SERVER_LAN_DEPLOYMENT.md).

Wenn dein Ziel **oeffentliche Erreichbarkeit ueber Domain und HTTPS** ist, nutze diese Datei zusammen mit [DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/DEPLOYMENT.md).
