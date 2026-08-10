# Änderungsprotokoll

## 1.2.0 – 2026-08-07

- Zentrale, verschlüsselt gespeicherte SMTP-Relay-Verwaltung für Administratoren ergänzt.
- Test-E-Mail und dynamische Übernahme gespeicherter Relay-Einstellungen ergänzt.

## 1.1.0 – 2026-08-06

### Neu

- Versionierte Container-Releases ueber GHCR und `docker compose pull`
- Eigener Compose-Migrationsjob vor dem Start der Webanwendung
- Versionsnummer in Live-, Health- und Ready-Endpunkten
- Notenansicht fuer Ausbilder und Verwaltung freigeschaltet

### Aktualisiert

- Einheitlichere Oberflaeche mit klarerer Seitenhierarchie, Karten, Aktionen und Statusdarstellung
- Sicherer Update-Workflow ohne Aenderung der bestehenden `.env`

### Behoben

- Pflicht-Passwortwechsel unter einem konfigurierten Basis-Pfad
- Export-Authentifizierung bei getrennter API-URL
- Parallel verarbeitete Freigaben erzeugen keine falschen Audit-Eintraege mehr

## 1.0.1 – 2026-07-23

### Neu

- Unterschriftsfeld für Erziehungsberechtigte im Berichtsheft-PDF
- Automatischer Test für die vollständigen PDF-Unterschriftsfelder
- Gruppierte Seitennavigation und barriereärmere Tastatursteuerung
- Optionaler SMTP-Relay für System-E-Mails
- Sicherer Passwort-Reset mit gehashten, zeitlich begrenzten Einmal-Tokens
- Täglich deduplizierte Berichtsheft-Erinnerungen für Azubis
- Ausbilder-Erinnerung ab konfigurierbar 50 offenen Einreichungen

### Aktualisiert

- Containerbasis von Node.js 20 auf Node.js 24 LTS aktualisiert
- Redis-Container auf Version 7.4.9 aktualisiert
- React, React Router, MSSQL-Treiber, Knex, Helmet, Zod, esbuild und weitere Abhängigkeiten aktualisiert
- SheetJS auf die gepatchte offizielle Community-Version 0.20.3 aktualisiert
- Produktions- und GitHub-Pages-Bundles minifiziert und PDF-Bibliotheken bei Bedarf nachgeladen
- Azubi-Notenansicht mit kompakter Übersicht, bedarfsgesteuerter Eingabe, Fachfiltern und mobilen Notenkarten überarbeitet

### Behoben

- Dockerfile-Groß-/Kleinschreibung für Linux-Builds korrigiert
- Fest eingetragene interne Proxy-Konfiguration aus dem Dockerfile entfernt
- Fest eingetragenes Redis-Passwort aus der Server-Konfiguration entfernt
- Lokalen HTTP-Stack auf einen mit Session-Cookies kompatiblen Entwicklungsmodus korrigiert
- Selbstsigniertes Zertifikat des mitgelieferten lokalen MSSQL-Containers korrekt konfiguriert
- Infrastrukturabhängige Tests korrekt der Integrationssuite zugeordnet
- Veraltete und nicht vorhandene Dokumentationslinks aus dem README entfernt
- Datumsdarstellung in Dashboard, Archiv, Freigaben und Export vereinheitlicht
- Login, Statusmeldungen und interaktive Tabellen für Screenreader und Tastatur verbessert
- Löschen von Noten durch eine explizite Bestätigung abgesichert
