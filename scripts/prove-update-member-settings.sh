#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
PGV="${PROOF_PGVER:-16}"
if [ -n "${PROOF_PGDATA:-}" ]; then
  DATA_DIR="${PROOF_PGDATA}"
else
  DATA_DIR="$(mktemp -d /tmp/pg-update-member-settings.XXXXXX)"
fi
PORT="${PROOF_PGPORT:-55432}"
LOG="${DATA_DIR}/postgres.log"
PROBE="${ROOT}/supabase/tests/pr378-probe"
if [ -z "${RB_OUT:-}" ]; then
  RB_OUT="$(mktemp -d /tmp/pr378-rollback.XXXXXX)"
fi
export RB_OUT
mkdir -p "${RB_OUT}"
SUITE2_JSON="${SUITE2_JSON:-${RB_OUT}/suite2-pg${PGV}-089.json}"

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
rm -rf "${DATA_DIR:?}"
initdb -D "${DATA_DIR}" --auth-local=trust --auth-host=trust --username=postgres >/dev/null
pg_ctl -D "${DATA_DIR}" -o "-p ${PORT} -k ${DATA_DIR}" -l "${LOG}" start
cleanup() {
  pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR}" "${RB_OUT}"
  rm -rf /tmp/pg-update-member-settings /tmp/pr378-rollback
  rm -f /tmp/suite2-pg*-089.json
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
python3 "${PROBE}/suite2.py" "${PGV}" 089 - "${SUITE2_JSON}"

echo "All prove-update-member-settings steps passed"
