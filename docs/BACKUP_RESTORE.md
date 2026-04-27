# Backup Restore

## Ziel

MSSQL-Backups sollen lokal in `./backups` landen und ohne Commit-Risiko vom Repository getrennt bleiben.

## Backup

```bash
./scripts/db-backup.sh
```

Verhalten:

- prüft, ob der MSSQL-Container läuft
- legt bei Bedarf `./backups` an
- erstellt eine `.bak`-Datei im Host-Ordner `backups/`

## Restore

```bash
./scripts/db-restore.sh backups/<datei>.bak
```

Verhalten:

- prüft, ob die angegebene Datei existiert
- prüft, ob der MSSQL-Container läuft
- setzt die Datenbank kurz in `SINGLE_USER`
- stellt das Backup mit `REPLACE` wieder her
- setzt die Datenbank zurück auf `MULTI_USER`

## Wichtige Hinweise

- Vor jedem Restore ein frisches Backup ziehen.
- Restore ersetzt den aktuellen Datenbankstand.
- `backups/` ist in `.gitignore` eingetragen.

## Technischer Pfad

- Host-Ordner: `./backups`
- Container-Pfad: `/backups`
- Datenbank: standardmäßig `ausbildungsdoku`

## Vor Updates empfohlen

```bash
./scripts/db-backup.sh
./scripts/update-local-docker.sh
```
