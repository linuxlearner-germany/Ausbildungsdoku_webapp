# Server-Installation

Diese Anwendung wird produktionsnah als Container betrieben.

## Kurzfassung

1. Container-Image bauen
2. ENV fuer App, MSSQL und Redis setzen
3. `docker compose up -d`
4. Healthcheck auf `/api/ready` pruefen

## Wichtige Punkte

- MSSQL ist die einzige Ziel-Datenbank
- Redis ist der einzige Session-Store
- `SESSION_SECRET` und `INITIAL_ADMIN_PASSWORD` muessen explizit gesetzt werden
- `TRUST_PROXY` muss zur Proxy-Kette passen
- `SESSION_SECURE=true` im produktiven Betrieb

Details stehen in [docs/DEPLOYMENT.md](/home/paul/Dokumente/GitHub/Ausbildungsdoku_webapp/docs/DEPLOYMENT.md).
