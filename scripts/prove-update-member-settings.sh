#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
PGV="${PROOF_PGVER:-16}"
DATA_DIR="${PROOF_PGDATA:-/tmp/pg378r2-${PGV}}"
PORT="${PROOF_PGPORT:-554${PGV}}"
LOG="${DATA_DIR}/postgres.log"
export PATH="/usr/lib/postgresql/${PGV}/bin:/usr/lib/postgresql/16/bin:/usr/lib/postgresql/15/bin:/usr/lib/postgresql/14/bin:${PATH}"
PROBE="${ROOT}/supabase/tests/pr378-probe"
export RB_OUT="${RB_OUT:-/tmp/pr378-rollback}"
mkdir -p "${RB_OUT}"

if ! command -v initdb >/dev/null 2>&1; then
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

# rollback-test.sh and suite2.py look for the unix socket at /tmp/pg378r2-$PGV
if [ "${DATA_DIR}" != "/tmp/pg378r2-${PGV}" ]; then
  ln -sfn "${DATA_DIR}" "/tmp/pg378r2-${PGV}"
fi

echo "== PR proof =="
psql -h "${DATA_DIR}" -p "${PORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "${ROOT}/supabase/tests/update_member_settings.sql"
echo "DB proofs passed"

echo "== 089 rollback round-trip =="
bash "${PROBE}/rollback-test.sh" "${PGV}"

echo "== CoS suite2 VARIANT=089 =="
python3 "${PROBE}/suite2.py" "${PGV}" 089 - /tmp/suite2-pg${PGV}-089.json

echo "All prove-update-member-settings steps passed"
