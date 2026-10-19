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
  python3 - "${ROOT}/${file}" "${find}" "${replace}" <<'PY'
import pathlib, sys
path, find, replace = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text()
if find not in text:
    raise SystemExit(f"mutant find missing in {path}")
path.with_suffix(path.suffix + ".bak").write_text(text)
path.write_text(text.replace(find, replace, 1))
PY
  echo "mutant ${label} APPLIED"
  if run_named "${test_file}" "${test_name}"; then
    mv "${ROOT}/${file}.bak" "${ROOT}/${file}"
    echo "mutant ${label} was not killed"
    exit 1
  fi
  echo "mutant ${label} KILLED by ${test_file}:${test_line} ${test_name}"
  mv "${ROOT}/${file}.bak" "${ROOT}/${file}"
  run_named "${test_file}" "${test_name}"
}

apply_and_kill \
  "effect_drops_finalised_check" \
  "src/pages/InspectionFillPage.tsx" \
  "    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;
    const skipClient = !!livingJob.client_id && !livingJob.client_name;" \
  "    const skipClient = !!livingJob.client_id && !livingJob.client_name;" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "living effect returns before persist when the inspection is finalised"

apply_and_kill \
  "saveInspection_drops_finalised_check" \
  "src/pages/InspectionFillPage.tsx" \
  "    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) {
      pendingSaveRef.current = null;
      setSaveStatus('saved');
      return true;
    }
    if (isDevFieldAuditAuth()) {" \
  "    if (isDevFieldAuditAuth()) {" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "saveInspection returns before update when the inspection is finalised"

apply_and_kill \
  "flush_retry_drops_finalised_check" \
  "src/pages/InspectionFillPage.tsx" \
  "    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);" \
  "    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "flush and retry skip saveInspection when the inspection is finalised"

apply_and_kill \
  "fanout_select_drops_finalised_filter" \
  "src/lib/persistLivingJobJha.ts" \
  "    .eq('crm_job_id', jobId)
    .not('status', 'in', FINALISED_INSPECTION_STATUS_IN)
    .eq('archived', false);" \
  "    .eq('crm_job_id', jobId);" \
  "src/lib/persistLivingJobJha.test.ts" \
  "persistLivingJobOnBoundJhas filters finalised out of the inspection select"

apply_and_kill \
  "fanout_update_drops_finalised_filter" \
  "src/lib/persistLivingJobJha.ts" \
  "      .eq('id', patch.id)
      .not('status', 'in', FINALISED_INSPECTION_STATUS_IN)
      .eq('archived', false);" \
  "      .eq('id', patch.id);" \
  "src/lib/persistLivingJobJha.test.ts" \
  "persistLivingJobOnBoundJhas filters finalised out of the inspection update"

apply_and_kill \
  "effect_drops_changed_check" \
  "src/pages/InspectionFillPage.tsx" \
  "    if (!applied.changed) return;
    setMeta(applied.meta);" \
  "    setMeta(applied.meta);" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "living effect does not persist when the living job matches stored meta"

echo "All prove-sec-insp-3-app mutants passed"
