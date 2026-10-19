#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

run_named() {
  local file="$1"
  local name="$2"
  npx vitest run --maxWorkers=2 "${file}" -t "${name}"
}

apply_and_kill() {
  local label="$1"
  local file="$2"
  local find="$3"
  local replace="$4"
  local test_file="$5"
  local test_name="$6"
  local test_line
  test_line="$(python3 - "${ROOT}/${test_file}" "${test_name}" <<'PY'
import pathlib, sys
path, name = pathlib.Path(sys.argv[1]), sys.argv[2]
for i, line in enumerate(path.read_text().splitlines(), 1):
    if name in line and ("it(" in line or "test(" in line):
        print(i)
        break
else:
    print("?")
PY
)"
  python3 - "${file}" "${find}" "${replace}" <<'PY'
import pathlib, sys
path, find, replace = sys.argv[1], sys.argv[2], sys.argv[3]
src = pathlib.Path(path)
text = src.read_text()
if find not in text:
    raise SystemExit(f"mutant find missing in {path}")
src.with_suffix(src.suffix + ".bak").write_text(text)
src.write_text(text.replace(find, replace, 1))
PY
  echo "mutant ${label} APPLIED"
  if run_named "${test_file}" "${test_name}"; then
    mv "${file}.bak" "${file}"
    echo "mutant ${label} was not killed"
    exit 1
  fi
  echo "mutant ${label} KILLED by ${test_file}:${test_line} ${test_name}"
  mv "${file}.bak" "${file}"
  run_named "${test_file}" "${test_name}"
}

apply_and_kill \
  "portal_ignores_snapshot" \
  "supabase/functions/client-portal/portalTenancy.ts" \
  "if (row.inspector_id) return {};" \
  "return {};" \
  "src/lib/inspectorSnapshot.test.ts" \
  "portal card uses snapshot name when inspector_id is null"

apply_and_kill \
  "pdf_ignores_snapshot" \
  "src/reports/generic_inspection/compose.ts" \
  "inspectorName: inspector.name," \
  "inspectorName: profile.name," \
  "src/lib/inspectorSnapshot.test.ts" \
  "composeGenericReport reads inspector_name_snapshot, not the signed-in profile"

apply_and_kill \
  "electrical_pdf_ignores_snapshot" \
  "src/reports/electrical_3000/compose.ts" \
  "inspector: inspector.name," \
  "inspector: profile.name," \
  "src/lib/inspectorSnapshot.test.ts" \
  "composeElectricalReport reads inspector_name_snapshot when inspector_id is null"

apply_and_kill \
  "list_detail_ignores_snapshot" \
  "src/lib/inspectorSnapshot.ts" \
  "if (args.inspectorId) {" \
  "if (true) {" \
  "src/pages/inspectionSnapshotDisplay.test.tsx" \
  "lists Pat Snapshot when inspector_id is null"

apply_and_kill \
  "remove_member_leaks_raw_error" \
  "supabase/functions/remove-member/publicError.ts" \
  "return REMOVE_MEMBER_FAILED;" \
  "return typeof _err === 'object' && _err && 'message' in _err ? String((_err as { message: unknown }).message) : String(_err);" \
  "src/lib/inspectorSnapshot.test.ts" \
  "does not leak a raw database message"

apply_and_kill \
  "jha_list_drops_snapshot_column" \
  "src/lib/jhaList.ts" \
  "created_by, creator_name_snapshot" \
  "created_by" \
  "src/lib/jhaList.test.ts" \
  "keeps creator_name_snapshot on the JHA list select so a deleted member still names the row"

FOLDER_TEST="src/lib/inspectorSnapshot.test.ts"
FOLDER_NAME="remove-member function folder ships only index.ts and publicError.ts"
FOLDER_LINE="$(python3 - "${ROOT}/${FOLDER_TEST}" "${FOLDER_NAME}" <<'PY'
import pathlib, sys
path, name = pathlib.Path(sys.argv[1]), sys.argv[2]
for i, line in enumerate(path.read_text().splitlines(), 1):
    if name in line and ("it(" in line or "test(" in line):
        print(i)
        break
else:
    print("?")
PY
)"
cp "${ROOT}/scripts/remove-member/import_map.json" "${ROOT}/supabase/functions/remove-member/import_map.json"
cp "${ROOT}/scripts/remove-member/mock_supabase.ts" "${ROOT}/supabase/functions/remove-member/mock_supabase.ts"
cp "${ROOT}/scripts/remove-member/empty.d.ts" "${ROOT}/supabase/functions/remove-member/empty.d.ts"
echo "mutant remove_member_ships_harness APPLIED"
if run_named "${FOLDER_TEST}" "${FOLDER_NAME}"; then
  rm -f \
    "${ROOT}/supabase/functions/remove-member/import_map.json" \
    "${ROOT}/supabase/functions/remove-member/mock_supabase.ts" \
    "${ROOT}/supabase/functions/remove-member/empty.d.ts"
  echo "mutant remove_member_ships_harness was not killed"
  exit 1
fi
echo "mutant remove_member_ships_harness KILLED by ${FOLDER_TEST}:${FOLDER_LINE} ${FOLDER_NAME}"
rm -f \
  "${ROOT}/supabase/functions/remove-member/import_map.json" \
  "${ROOT}/supabase/functions/remove-member/mock_supabase.ts" \
  "${ROOT}/supabase/functions/remove-member/empty.d.ts"
run_named "${FOLDER_TEST}" "${FOLDER_NAME}"

echo "All prove-sec-insp-2-app mutants passed"
bash "${ROOT}/scripts/prove-remove-member-harness.sh"
