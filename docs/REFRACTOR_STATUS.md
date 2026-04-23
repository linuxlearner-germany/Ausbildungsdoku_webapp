# Refactor-Status

Der aktuelle Stand des Repositorys ist:

- zentrale, validierte Runtime-Konfiguration
- MSSQL-only ueber Knex und `mssql`
- Redis-only fuer Sessions
- Docker-Setup getrennt fuer App-only, lokale Infra und Full Local Docker
- Health-, Readiness- und Graceful-Shutdown-Pfade im Runtime-Start
- Testpfade gegen denselben MSSQL-/Redis-Stack wie lokal

Offene Arbeiten sollten direkt gegen diese Zielarchitektur erfolgen und keine alternativen Runtime-Pfade mehr einfuehren.
