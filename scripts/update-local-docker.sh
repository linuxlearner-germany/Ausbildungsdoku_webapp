#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.yml"
READY_URL="${READY_URL:-http://localhost:3010/api/ready}"

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env fehlt. Kopiere .env.example einmalig und hinterlege die produktiven Secrets." >&2
  exit 1
fi

# Compose liest .env nur ein; dieses Skript schreibt oder ersetzt sie nie.
if [ "${BACKUP_ENV:-false}" = "true" ]; then
  cp .env ".env.backup.$(date +%Y%m%d-%H%M%S)"
fi

if [ "${SKIP_BACKUP:-false}" != "true" ]; then
  ./scripts/db-backup.sh
fi

docker compose -f "${COMPOSE_FILE}" pull
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "Warte auf Ready-Endpunkt ${READY_URL} ..."
for _ in $(seq 1 60); do
  if curl -fsS "${READY_URL}" >/dev/null 2>&1; then
    echo "Update abgeschlossen. Anwendung ist bereit."
    exit 0
  fi

  sleep 2
done

echo "Ready-Endpunkt wurde nicht rechtzeitig erfolgreich." >&2
docker compose -f "${COMPOSE_FILE}" logs --tail=100 app >&2 || true
exit 1
