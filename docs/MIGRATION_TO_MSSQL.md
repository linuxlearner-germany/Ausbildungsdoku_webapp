# Migration zu MSSQL

## Status

- SQLite ist aus dem Runtime-Pfad entfernt
- MSSQL ist die einzige Ziel- und Laufzeitdatenbank
- Fachlogik bleibt erhalten

## Technische Umsetzung

- Knex-Migrationen statt implizitem Tabellenaufbau
- Repositories greifen direkt ueber Knex auf MSSQL zu
- Bootstrap fuer Initial-Admin und Demo-Daten ist idempotent
- Connection-Pooling, Encrypt und Timeouts sind konfigurierbar

## Wichtige Punkte

- Constraints und Foreign Keys werden in der Migration definiert
- `entries` haben einen Unique-Index auf `(trainee_id, dateFrom)`
- Rollen, Trainer-Zuordnungen, Noten und Audit-Logs bleiben fachlich erhalten
