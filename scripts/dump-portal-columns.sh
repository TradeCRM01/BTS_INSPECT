#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGV="${1:-16}"
PORT="${2:-55462}"
BIN="/usr/lib/postgresql/${PGV}/bin"
DATA="$(mktemp -d /tmp/portal-cols-${PGV}.XXXXXX)"
export PATH="${BIN}:${PATH}"
cleanup() { pg_ctl -D "${DATA}" stop -m immediate >/dev/null 2>&1 || true; rm -rf "${DATA}"; }
trap cleanup EXIT
initdb -D "${DATA}" -U grafter --no-instructions -A trust >/dev/null
cat > "${DATA}/postgresql.conf" <<EOF
listen_addresses = ''
port = ${PORT}
unix_socket_directories = '${DATA}'
EOF
pg_ctl -D "${DATA}" -l "${DATA}/pg.log" start
until pg_isready -h "${DATA}" -p "${PORT}" -U grafter >/dev/null 2>&1; do sleep 0.1; done
psql -h "${DATA}" -p "${PORT}" -U grafter -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE grafter' >/dev/null
psql -h "${DATA}" -p "${PORT}" -U grafter -d grafter -v ON_ERROR_STOP=1 -f "${ROOT}/scripts/pg-client-portal-bootstrap.sql" >/dev/null
rewrite() {
  local extra=()
  if [ "$PGV" = "16" ]; then
    extra=(-e 's/, MAINTAIN//g' -e 's/MAINTAIN, //g' -e 's/MAINTAIN//g')
  fi
  sed -e 's/CREATE EXTENSION IF NOT EXISTS pg_cron;/-- skipped pg_cron;/' \
      -e 's/CREATE EXTENSION IF NOT EXISTS pg_net;/-- skipped pg_net;/' \
      -e 's/CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;/-- skipped http;/' \
      "${extra[@]}"
}
shopt -s nullglob
for f in "${ROOT}"/supabase/migrations/*.sql; do
  name="$(basename "$f")"
  if ! rewrite < "$f" | psql -h "${DATA}" -p "${PORT}" -U grafter -d grafter -v ON_ERROR_STOP=1 -f - >/tmp/portal-mig.out 2>/tmp/portal-mig.err; then
    echo "FAIL ${name}"
    cat /tmp/portal-mig.err
    exit 1
  fi
  echo "OK ${name}"
done
psql -h "${DATA}" -p "${PORT}" -U grafter -d grafter -At -c "
SELECT table_name || ':' || string_agg(column_name, ',' ORDER BY column_name)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'reports','inspections','jobs','clients','client_portal_tokens',
    'inspection_report_shares','quotes','invoices','companies','profiles','job_costs'
  )
GROUP BY table_name
ORDER BY table_name;
"
echo DUMP_OK
