# Security

## Vorhandene Schutzmaßnahmen

- Secrets liegen nicht im Repository, `.env` ist per `.gitignore` ausgeschlossen
- Sessions liegen ausschließlich in Redis
- Session-Cookies sind `httpOnly`
- `SESSION_SAME_SITE` und `SESSION_SECURE` werden validiert
- `helmet` ist aktiv
- API-Requests mit schreibenden Methoden prüfen Origin/Referer gegen erlaubte Ursprünge
- Login ist rate-limitiert
- Rollenprüfung liegt serverseitig auf den API-Routen
- PDF-Export für Berichte ist auf signierte Berichte begrenzt
- CSV-Exporte werden UTF-8 mit BOM erzeugt
- CSV-Zellen werden gegen Formel-Injektion geprefixt
- Container-Image kopiert keine `.env` ins Image
- App läuft im Docker-Image als Non-Root-User

## Lokale Sicherheitsgrenzen

- `db-ui` ist nur für lokale Nutzung gedacht
- lokale Compose-Datei ist kein öffentliches Deployment-Modell
- `SESSION_SECURE=false` ist lokal für `http://localhost` normal, im Deployment nicht

## Offene Risiken

- `npm audit --omit=dev` meldet weiterhin Advisories in `xlsx`, `path-to-regexp` und der `mssql`/`tedious`-Kette
- `xlsx` hat aktuell keinen automatischen Non-Breaking-Fix über `npm audit fix`
- Import-Funktionen sollten nur mit vertrauenswürdigen Dateien verwendet werden
- Es gibt kein separates CSRF-Token-System; Schutz erfolgt aktuell über SameSite-Cookies und Origin-Prüfung
- Login-Rate-Limit ist pro Prozess im Speicher, nicht verteilt

## Deployment-Hinweise

- immer HTTPS verwenden
- `SESSION_SECURE=true`
- `TRUST_PROXY=true` oder passend setzen
- `MSSQL_TRUST_SERVER_CERTIFICATE=false`, wenn gültiges Zertifikat vorhanden ist
- `ENABLE_DEMO_DATA=false`
- `RESET_DATABASE_ON_START=false`
- lokale Desktop-DB-Tools nur in vertrauenswürdigen Umgebungen verwenden

## Prüfpunkte

- Admin-Routen nur für `admin`
- Trainer-Zugriffe nur auf zugeordnete Azubis
- keine echten Secrets in README, Docs oder Compose-Dateien
- keine Datenlöschpfade ohne bewusste Operator-Aktion
