#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
PGV="${PROOF_PGVER:-16}"
DATA_DIR="${PROOF_PGDATA:-/tmp/pg-update-member-settings}"
PORT="${PROOF_PGPORT:-55432}"
LOG="${DATA_DIR}/postgres.log"
PROBE="${ROOT}/supabase/tests/pr378-probe"
export RB_OUT="${RB_OUT:-/tmp/pr378-rollback}"
mkdir -p "${RB_OUT}"

prefer_pg_bin() {
  if command -v initdb >/dev/null 2>&1; then
    return 0
  fi
  local d
  for d in "/usr/lib/postgresql/${PGV}/bin" /usr/lib/postgresql/16/bin /usr/lib/postgresql/15/bin /usr/lib/postgresql/14/bin; do
    if [ -x "${d}/initdb" ]; then
      export PATH="${d}:${PATH}"
      return 0
    fi
  done
  return 1
}

if ! prefer_pg_bin; then
  echo "initdb not found; install local postgresql to run DB proofs"
  echo "Test SQL is at supabase/tests/update_member_settings.sql"
  exit 2
fi

pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
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

export PGHOST="${DATA_DIR}"
export PGPORT="${PORT}"

echo "== PR proof =="
psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "${ROOT}/supabase/tests/update_member_settings.sql"
echo "DB proofs passed"

echo "== 089 rollback round-trip =="
bash "${PROBE}/rollback-test.sh" "${PGV}"

echo "== CoS suite2 VARIANT=089 =="
python3 "${PROBE}/suite2.py" "${PGV}" 089 - /tmp/suite2-pg${PGV}-089.json

echo "All prove-update-member-settings steps passed"
