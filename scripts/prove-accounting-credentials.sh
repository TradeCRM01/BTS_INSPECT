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

prefer_pg_bin() {
  local d="/usr/lib/postgresql/${PGV}/bin"
  if [ -x "${d}/initdb" ]; then
    export PATH="${d}:${PATH}"
    return 0
  fi
  return 1
}

if ! prefer_pg_bin; then
  echo "initdb not found for PostgreSQL ${PGV}; install postgresql-${PGV} to run DB proofs"
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

echo "== accounting_credentials proof PG${PGV} =="
SERVER_NUM="$(psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -tAc "SHOW server_version_num")"
echo "server_version_num=${SERVER_NUM}"
case "${SERVER_NUM}" in
  "${PGV}"*) ;;
  *)
    echo "wanted PostgreSQL ${PGV}, got server_version_num=${SERVER_NUM}"
    exit 1
    ;;
esac
psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "${ROOT}/supabase/tests/accounting_credentials.sql"

echo "accounting_credentials proof and rollback round-trip passed on PG${PGV}"
