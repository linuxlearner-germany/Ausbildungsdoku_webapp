#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="docker-compose.local.yml"
READY_URL="${READY_URL:-http://localhost:3010/api/ready}"

cd "$(dirname "$0")/.."

if [ "${SKIP_BACKUP:-false}" != "true" ]; then
  ./scripts/db-backup.sh
fi

docker compose -f "${COMPOSE_FILE}" down
docker compose -f "${COMPOSE_FILE}" up -d --build

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
