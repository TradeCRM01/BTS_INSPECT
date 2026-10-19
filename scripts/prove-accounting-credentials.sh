#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGV="${PROOF_PGVER:-16}"
if [ -n "${PROOF_PGDATA:-}" ]; then
  DATA_DIR="${PROOF_PGDATA}"
else
  DATA_DIR="$(mktemp -d /tmp/pg-accounting-credentials.XXXXXX)"
fi
PORT="${PROOF_PGPORT:-55433}"
LOG="${DATA_DIR}/postgres.log"
MIGRATION="${ROOT}/supabase/migrations/20261019120000_090_accounting_credentials.sql"
ROLLBACK="${ROOT}/docs/operations/rollback-20261019120000_090_accounting_credentials.sql"

prefer_pg_bin() {
  if command -v initdb >/dev/null 2>&1; then
    return 0
  fi
  local d
  for d in "/usr/lib/postgresql/${PGV}/bin" /usr/lib/postgresql/16/bin; do
    if [ -x "${d}/initdb" ]; then
      export PATH="${d}:${PATH}"
      return 0
    fi
  done
  return 1
}

if ! prefer_pg_bin; then
  echo "initdb not found; install postgresql-16 to run DB proofs"
  exit 2
fi

pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
rm -rf "${DATA_DIR:?}"
initdb -D "${DATA_DIR}" --auth-local=trust --auth-host=trust --username=postgres >/dev/null
pg_ctl -D "${DATA_DIR}" -o "-p ${PORT} -k ${DATA_DIR}" -l "${LOG}" start
cleanup() {
  pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR}"
}
trap cleanup EXIT

until pg_isready -h "${DATA_DIR}" -p "${PORT}" -U postgres >/dev/null 2>&1; do
  sleep 0.2
done

export PGHOST="${DATA_DIR}"
export PGPORT="${PORT}"

echo "== accounting_credentials proof =="
psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "${ROOT}/supabase/tests/accounting_credentials.sql"

echo "== rollback then re-apply =="
psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "${ROLLBACK}"
psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "${MIGRATION}"
psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "${ROOT}/supabase/tests/accounting_credentials_seed_credentials.sql"
psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "${ROOT}/supabase/tests/accounting_credentials_assert.sql"

echo "accounting_credentials proof and rollback round-trip passed"
