#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.local.yml"
SERVICE_NAME="mssql"
DATABASE_NAME="${MSSQL_DATABASE:-ausbildungsdoku}"

cd "$(dirname "$0")/.."

if [ "${1:-}" = "" ]; then
  echo "Verwendung: ./scripts/db-restore.sh backups/<datei>.bak" >&2
  exit 1
fi

BACKUP_PATH="$1"

if [ ! -f "${BACKUP_PATH}" ]; then
  echo "Backup-Datei nicht gefunden: ${BACKUP_PATH}" >&2
  exit 1
fi

if [ -z "$(docker compose -f "${COMPOSE_FILE}" ps -q "${SERVICE_NAME}")" ]; then
  echo "Der MSSQL-Container laeuft nicht. Bitte zuerst den lokalen Stack starten." >&2
  exit 1
fi

BACKUP_BASENAME="$(basename "${BACKUP_PATH}")"
SQLCMD='SQLCMD="$(command -v sqlcmd || true)"; if [ -z "$SQLCMD" ]; then for candidate in /opt/mssql-tools18/bin/sqlcmd /opt/mssql-tools/bin/sqlcmd; do if [ -x "$candidate" ]; then SQLCMD="$candidate"; break; fi; done; fi; [ -n "$SQLCMD" ] || { echo "sqlcmd wurde im Container nicht gefunden." >&2; exit 1; }; "$SQLCMD" -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d master -Q'

echo "Stelle Backup ${BACKUP_PATH} in Datenbank ${DATABASE_NAME} wieder her ..."
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE_NAME}" /bin/sh -lc \
  "${SQLCMD} \"ALTER DATABASE [${DATABASE_NAME}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; RESTORE DATABASE [${DATABASE_NAME}] FROM DISK = N'/backups/${BACKUP_BASENAME}' WITH REPLACE, RECOVERY, STATS = 10; ALTER DATABASE [${DATABASE_NAME}] SET MULTI_USER;\""

echo "Restore abgeschlossen: ${DATABASE_NAME}"
