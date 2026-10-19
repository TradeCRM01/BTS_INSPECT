#!/usr/bin/env bash
# Apply stub + every repo migration onto a running local Postgres.
# Usage: apply-supabase-chain.sh <psql-args...>
# Example: apply-supabase-chain.sh -h /tmp/pg -p 55447 -U postgres -d insp3
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STUB="${ROOT}/scripts/supabase-local-stub.sql"
MIGDIR="${ROOT}/supabase/migrations"
if [ "$#" -lt 1 ]; then
  echo "usage: $0 <psql connection args>" >&2
  exit 2
fi
PSQL=(psql -X -q -v ON_ERROR_STOP=1 "$@")
"${PSQL[@]}" -f "${STUB}"
TMP="$(mktemp /tmp/grafter-mig.XXXXXX.sql)"
cleanup() { rm -f "${TMP}"; }
trap cleanup EXIT
for f in "${MIGDIR}"/*.sql; do
  n="$(basename "${f}")"
  sed -E \
    -e 's/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net|http)[^;]*;/-- stubbed ext/I' \
    -e 's/, MAINTAIN//g' \
    "${f}" > "${TMP}"
  if ! out="$("${PSQL[@]}" -1 -f "${TMP}" 2>&1)"; then
    echo "FAIL ${n} :: $(printf '%s\n' "${out}" | grep -m1 ERROR || printf '%s\n' "${out}" | tail -3)" >&2
    exit 1
  fi
done
echo "applied $(ls -1 "${MIGDIR}"/*.sql | wc -l) migrations"
