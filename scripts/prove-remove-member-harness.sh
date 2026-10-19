#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FN="${ROOT}/supabase/functions/remove-member"
DENO_BIN="${DENO_BIN:-}"
if [ -z "${DENO_BIN}" ]; then
  if command -v deno >/dev/null 2>&1; then
    DENO_BIN="$(command -v deno)"
  elif [ -x "${HOME}/.deno/bin/deno" ]; then
    DENO_BIN="${HOME}/.deno/bin/deno"
  fi
fi
if [ -z "${DENO_BIN}" ]; then
  echo "deno not found"
  exit 1
fi

run_harness() {
  "${DENO_BIN}" test \
    --no-lock \
    --no-config \
    --no-check \
    --import-map "${FN}/import_map.json" \
    --allow-env \
    --allow-read \
    "${FN}/rm_harness_test.ts"
}

echo "== remove-member harness (real index.ts) =="
run_harness

apply_and_kill() {
  local label="$1"
  local find="$2"
  local replace="$3"
  local test_name="$4"
  python3 - "${FN}/index.ts" "${find}" "${replace}" <<'PY'
import pathlib, sys
path, find, replace = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text()
if find not in text:
    raise SystemExit(f"mutant find missing in {path}")
path.with_suffix(path.suffix + ".bak").write_text(text)
path.write_text(text.replace(find, replace, 1))
PY
  echo "mutant ${label} APPLIED"
  if "${DENO_BIN}" test --no-lock --no-config --no-check --import-map "${FN}/import_map.json" --allow-env --allow-read --filter "${test_name}" "${FN}/rm_harness_test.ts"; then
    mv "${FN}/index.ts.bak" "${FN}/index.ts"
    echo "mutant ${label} was not killed"
    exit 1
  fi
  local line
  line="$(python3 - "${FN}/rm_harness_test.ts" "${test_name}" <<'PY'
import pathlib, sys
path, name = pathlib.Path(sys.argv[1]), sys.argv[2]
for i, line in enumerate(path.read_text().splitlines(), 1):
    if name in line and "Deno.test" in line:
        print(i)
        break
else:
    print("?")
PY
)"
  echo "mutant ${label} KILLED by supabase/functions/remove-member/rm_harness_test.ts:${line} ${test_name}"
  mv "${FN}/index.ts.bak" "${FN}/index.ts"
}

apply_and_kill \
  "raw_error_returned" \
  'JSON.stringify({ error: publicRemoveMemberError(deleteError) })' \
  'JSON.stringify({ error: deleteError.message })' \
  "RM1 delete 23502"

apply_and_kill \
  "owner_block_removed" \
  'if (companyRow?.created_by && companyRow.created_by === memberId)' \
  'if (false && companyRow?.created_by && companyRow.created_by === memberId)' \
  "RM3 owner target"

echo "All remove-member harness mutants passed"
