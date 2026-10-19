#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${PROOF_PGDATA:-/tmp/pg-update-member-settings}"
PORT="${PROOF_PGPORT:-55432}"
LOG="${DATA_DIR}/postgres.log"
export PATH="/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin:/usr/lib/postgresql/14/bin:${PATH}"

if ! command -v initdb >/dev/null 2>&1; then
  echo "initdb not found; install local postgresql to run DB proofs"
  echo "Test SQL is at supabase/tests/update_member_settings.sql"
  exit 2
fi

rm -rf "${DATA_DIR}"
initdb -D "${DATA_DIR}" --auth-local=trust --auth-host=trust --username=postgres >/dev/null
pg_ctl -D "${DATA_DIR}" -o "-p ${PORT} -k ${DATA_DIR}" -l "${LOG}" start
cleanup() {
  pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
}
trap cleanup EXIT

until pg_isready -h "${DATA_DIR}" -p "${PORT}" -U postgres >/dev/null 2>&1; do
  sleep 0.2
done

psql "host=${DATA_DIR} port=${PORT} user=postgres dbname=postgres" -v ON_ERROR_STOP=1 \
  -f "${ROOT}/supabase/tests/update_member_settings.sql"
echo "DB proofs passed"
