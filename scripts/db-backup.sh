#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.local.yml"
SERVICE_NAME="mssql"
BACKUP_DIR="backups"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"
DATABASE_NAME="${MSSQL_DATABASE:-ausbildungsdoku}"
BACKUP_FILE="${BACKUP_DIR}/${DATABASE_NAME}-${TIMESTAMP}.bak"

cd "$(dirname "$0")/.."

mkdir -p "${BACKUP_DIR}"

if ! docker compose -f "${COMPOSE_FILE}" ps -q "${SERVICE_NAME}" >/dev/null 2>&1; then
  echo "Docker Compose ist nicht verfuegbar oder ${COMPOSE_FILE} konnte nicht gelesen werden." >&2
  exit 1
fi

if [ -z "$(docker compose -f "${COMPOSE_FILE}" ps -q "${SERVICE_NAME}")" ]; then
  echo "Der MSSQL-Container laeuft nicht. Bitte zuerst den lokalen Stack starten." >&2
  exit 1
fi

SQLCMD='SQLCMD="$(command -v sqlcmd || true)"; if [ -z "$SQLCMD" ]; then for candidate in /opt/mssql-tools18/bin/sqlcmd /opt/mssql-tools/bin/sqlcmd; do if [ -x "$candidate" ]; then SQLCMD="$candidate"; break; fi; done; fi; [ -n "$SQLCMD" ] || { echo "sqlcmd wurde im Container nicht gefunden." >&2; exit 1; }; "$SQLCMD" -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d master -Q'

echo "Erstelle Backup ${BACKUP_FILE} ..."
docker compose -f "${COMPOSE_FILE}" exec -T "${SERVICE_NAME}" /bin/sh -lc \
  "${SQLCMD} \"BACKUP DATABASE [${DATABASE_NAME}] TO DISK = N'/backups/$(basename "${BACKUP_FILE}")' WITH INIT, FORMAT, STATS = 10;\""

echo "Backup abgeschlossen: ${BACKUP_FILE}"
