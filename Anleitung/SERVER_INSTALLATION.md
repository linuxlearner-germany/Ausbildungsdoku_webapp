# Server Installation

## Ziel

Diese Anleitung beschreibt eine klassische Installation des **Berichtsheft Portals** auf einem Linux-Server mit:

- `Node.js`
- `npm`
- `systemd`
- `Nginx`
- `SQLite`

Die Anleitung ist für einen einzelnen Server gedacht, auf dem die App lokal auf einem internen Port läuft und über Nginx öffentlich erreichbar gemacht wird.

## Empfohlene Zielumgebung

- Ubuntu 24.04 LTS oder Ubuntu 22.04 LTS
- eigener Linux-Benutzer für die Anwendung
- Domain oder Subdomain, z. B. `berichtsheft.example.de`
- Reverse Proxy über Nginx
- TLS-Zertifikat über Let's Encrypt

## 1. System vorbereiten

Pakete aktualisieren:

```bash
sudo apt update
sudo apt upgrade -y
```

Benötigte Basis-Pakete installieren:

```bash
sudo apt install -y curl git nginx ufw
```

## 2. Node.js installieren

Für dieses Projekt wird Node.js `20+` empfohlen.

Beispiel mit NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Versionen prüfen:

```bash
node -v
npm -v
```

## 3. Systembenutzer anlegen

Eigener Benutzer für den Dienst:

```bash
sudo adduser --system --group --home /opt/berichtsheft berichtsheft
```

Projektverzeichnis vorbereiten:

```bash
sudo mkdir -p /opt/berichtsheft
sudo chown -R berichtsheft:berichtsheft /opt/berichtsheft
```

## 4. Projekt bereitstellen

Als App-Benutzer in das Zielverzeichnis wechseln und Repository klonen:

```bash
sudo -u berichtsheft -H bash
cd /opt/berichtsheft
git clone <repo-url> app
cd app
```

Abhängigkeiten installieren:

```bash
npm install
```

## 5. Produktionskonfiguration anlegen

Aus Vorlage eine `.env` erstellen:

```bash
cp .env.example .env
```

Beispiel für Produktion:

```env
PORT=3000
SESSION_SECRET=hiergehoerteinlangeszufaelligesgeheimnisrein
NODE_ENV=production
ENABLE_DEMO_DATA=false
TRUST_PROXY=true
SESSION_COOKIE_NAME=berichtsheft.sid
DATA_DIR=/opt/berichtsheft/data
DB_FILE=/opt/berichtsheft/data/berichtsheft.db
LEGACY_FILE=/opt/berichtsheft/data/berichtsheft.json
```

Wichtige Hinweise:

- `SESSION_SECRET` muss in Produktion gesetzt sein.
- `ENABLE_DEMO_DATA` muss in Produktion `false` sein.
- `TRUST_PROXY=true` ist sinnvoll, wenn Nginx davor sitzt.
- `DATA_DIR` sollte außerhalb des Git-Arbeitsverzeichnisses liegen.

Persistenten Datenordner anlegen:

```bash
mkdir -p /opt/berichtsheft/data
```

Rechte setzen:

```bash
sudo chown -R berichtsheft:berichtsheft /opt/berichtsheft
```

## 6. Frontend bauen

Im Projektverzeichnis:

```bash
cd /opt/berichtsheft/app
npm run build
```

Optional vor dem ersten Start prüfen:

```bash
npm run check
npm test
```

## 7. systemd-Service anlegen

Datei erstellen:

```bash
sudo nano /etc/systemd/system/berichtsheft.service
```

Inhalt:

```ini
[Unit]
Description=Berichtsheft Portal
After=network.target

[Service]
Type=simple
User=berichtsheft
Group=berichtsheft
WorkingDirectory=/opt/berichtsheft/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Service aktivieren und starten:

```bash
sudo systemctl daemon-reload
sudo systemctl enable berichtsheft
sudo systemctl start berichtsheft
```

Status prüfen:

```bash
sudo systemctl status berichtsheft
```

Logs ansehen:

```bash
sudo journalctl -u berichtsheft -f
```

## 8. Nginx als Reverse Proxy konfigurieren

Neue Site-Datei anlegen:

```bash
sudo nano /etc/nginx/sites-available/berichtsheft
```

Beispielkonfiguration:

```nginx
server {
    listen 80;
    server_name berichtsheft.example.de;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Site aktivieren:

```bash
sudo ln -s /etc/nginx/sites-available/berichtsheft /etc/nginx/sites-enabled/berichtsheft
sudo nginx -t
sudo systemctl reload nginx
```

## 9. TLS mit Let's Encrypt

Certbot installieren:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Zertifikat anfordern:

```bash
sudo certbot --nginx -d berichtsheft.example.de
```

Automatische Verlängerung testen:

```bash
sudo certbot renew --dry-run
```

## 10. Firewall freischalten

UFW aktivieren und benötigte Ports öffnen:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Status prüfen:

```bash
sudo ufw status
```

## 11. Anwendung aktualisieren

Für ein Update:

```bash
sudo -u berichtsheft -H bash
cd /opt/berichtsheft/app
git pull
npm install
npm run build
exit
sudo systemctl restart berichtsheft
```

Danach prüfen:

```bash
sudo systemctl status berichtsheft
sudo journalctl -u berichtsheft -n 50
```

## 12. Backup-Empfehlung

Wichtig für Backups:

- `/opt/berichtsheft/data/berichtsheft.db`
- `/opt/berichtsheft/app/.env`
- optional das komplette Verzeichnis `/opt/berichtsheft/data/`

Ein einfaches SQLite-Backup kann so erstellt werden:

```bash
cp /opt/berichtsheft/data/berichtsheft.db /opt/berichtsheft/data/berichtsheft-$(date +%F).db
```

Für konsistente Backups unter Last ist ein kurzer Service-Stopp sauberer:

```bash
sudo systemctl stop berichtsheft
cp /opt/berichtsheft/data/berichtsheft.db /opt/berichtsheft/data/berichtsheft-$(date +%F).db
sudo systemctl start berichtsheft
```

## 13. Häufige Fehlerquellen

### App startet nicht in Produktion

Prüfen:

- fehlt `SESSION_SECRET`?
- steht `ENABLE_DEMO_DATA` versehentlich auf `true`?
- stimmen Dateirechte im Datenordner?

### Nginx liefert `502 Bad Gateway`

Prüfen:

- läuft der Dienst mit `sudo systemctl status berichtsheft`?
- lauscht die App auf dem erwarteten Port?
- zeigt `journalctl` einen Startfehler?

### Datei-Import schlägt fehl

Prüfen:

- `client_max_body_size` in Nginx hoch genug?
- Datei ist wirklich `.csv` oder `.xlsx`?
- enthaltene Spaltennamen passen zum erwarteten Importformat?

## 14. Nach der Installation prüfen

Sinnvolle Checks:

```bash
curl http://127.0.0.1:3000/api/health
curl -I https://berichtsheft.example.de
```

Im Browser zusätzlich testen:

1. Login
2. Dashboard lädt
3. Bericht anlegen
4. PDF-Download
5. Abmeldung

## 15. Zugehörige Dateien im Projekt

- [`../README.md`](../README.md)
- [`./LOKAL_STARTEN.md`](./LOKAL_STARTEN.md)
- [`../.env.example`](../.env.example)
