#!/usr/bin/env bash
# Dump diário do Postgres em deploy/backups/. Mantém os últimos 7 dias.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p backups
docker compose exec -T postgres pg_dump -U dayup -d dayup | gzip > "backups/dayup-$(date +%F).sql.gz"
find backups -name 'dayup-*.sql.gz' -mtime +7 -delete
