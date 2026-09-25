#!/usr/bin/env bash
# Dump diário do Postgres em deploy/backups/. Mantém os últimos 7 dias.
set -euo pipefail
umask 077   # dump tem dados de usuário — só o dono da VM pode ler
cd "$(dirname "$0")"

mkdir -p backups
target="backups/dayup-$(date +%F).sql.gz"
tmp="$target.tmp"

# Escreve num arquivo temporário e só promove pro nome final se o pipeline
# inteiro (pg_dump | gzip) terminou sem erro — nunca deixa um dump pela metade
# com o nome "de verdade" (o -o pipefail garante que um pg_dump que falhar
# derruba o `if`, mesmo com o gzip do lado saindo com sucesso).
if docker compose exec -T postgres pg_dump -U dayup -d dayup | gzip > "$tmp"; then
  mv "$tmp" "$target"
else
  rm -f "$tmp"
  echo "backup falhou — dump descartado" >&2
  exit 1
fi

find backups -name 'dayup-*.sql.gz' -mtime +7 -delete
