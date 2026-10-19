#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

run_named() {
  local file="$1"
  local name="$2"
  npx vitest run --maxWorkers=2 "${file}" -t "${name}"
}

test_line() {
  python3 - "${ROOT}/$1" "$2" <<'PY'
import pathlib, sys
path, name = pathlib.Path(sys.argv[1]), sys.argv[2]
for i, line in enumerate(path.read_text().splitlines(), 1):
    if name in line and ("it(" in line or "test(" in line):
        print(i)
        break
else:
    print("?")
PY
}

apply_and_kill() {
  local label="$1"
  local file="$2"
  local test_file="$3"
  local test_name="$4"
  local py="$5"
  local line
  line="$(test_line "${test_file}" "${test_name}")"
  python3 - "${ROOT}/${file}" <<PY
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
path.with_suffix(path.suffix + ".bak").write_text(text)
pairs = ${py}
for find, replace in pairs:
    if find not in text:
        raise SystemExit(f"mutant find missing in {path}: {find[:80]!r}")
    text = text.replace(find, replace, 1)
path.write_text(text)
PY
  echo "mutant ${label} APPLIED"
  if run_named "${test_file}" "${test_name}"; then
    mv "${ROOT}/${file}.bak" "${ROOT}/${file}"
    echo "mutant ${label} was not killed"
    exit 1
  fi
  echo "mutant ${label} KILLED by ${test_file}:${line} ${test_name}"
  mv "${ROOT}/${file}.bak" "${ROOT}/${file}"
  run_named "${test_file}" "${test_name}"
}

apply_and_kill \
  "retry_flush_save_persist_leak" \
  "src/pages/InspectionFillPage.tsx" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "does not write an issued inspection on retry, flush, or View PDF" \
  '[
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) {\n      pendingSaveRef.current = null;\n      setSaveStatus('\''saved'\'');\n      return true;\n    }", "    if (false) {\n      return true;\n    }"),
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);", "    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);"),
    ("      if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n      if (pendingSaveRef.current) void saveInspection(pendingSaveRef.current);", "      if (pendingSaveRef.current) void saveInspection(pendingSaveRef.current);"),
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n    const job = jobs.find(j => j.id === (nextJobId || '\'''\''));", "    const job = jobs.find(j => j.id === (nextJobId || '\'''\''));"),
  ]'

apply_and_kill \
  "effect_persist_save_leak" \
  "src/pages/InspectionFillPage.tsx" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "living effect returns before persist when the inspection is finalised" \
  '[
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n    const skipClient = !!livingJob.client_id && !livingJob.client_name;", "    const skipClient = !!livingJob.client_id && !livingJob.client_name;"),
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) {\n      pendingSaveRef.current = null;\n      setSaveStatus('\''saved'\'');\n      return true;\n    }", "    if (false) {\n      return true;\n    }"),
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n    const job = jobs.find(j => j.id === (nextJobId || '\'''\''));", "    const job = jobs.find(j => j.id === (nextJobId || '\'''\''));"),
  ]'

apply_and_kill \
  "saveInspection_drops_finalised_check" \
  "src/pages/InspectionFillPage.tsx" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "saveInspection returns before update when the inspection is finalised" \
  '[
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) {\n      pendingSaveRef.current = null;\n      setSaveStatus('\''saved'\'');\n      return true;\n    }", "    if (false) {\n      return true;\n    }"),
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n    const job = jobs.find(j => j.id === (nextJobId || '\'''\''));", "    const job = jobs.find(j => j.id === (nextJobId || '\'''\''));"),
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);", "    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);"),
    ("      if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n      if (pendingSaveRef.current) void saveInspection(pendingSaveRef.current);", "      if (pendingSaveRef.current) void saveInspection(pendingSaveRef.current);"),
  ]'

apply_and_kill \
  "flush_retry_drops_finalised_check" \
  "src/pages/InspectionFillPage.tsx" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "flush and retry skip saveInspection when the inspection is finalised" \
  '[
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);", "    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);"),
    ("      if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n      if (pendingSaveRef.current) void saveInspection(pendingSaveRef.current);", "      if (pendingSaveRef.current) void saveInspection(pendingSaveRef.current);"),
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) {\n      pendingSaveRef.current = null;\n      setSaveStatus('\''saved'\'');\n      return true;\n    }", "    if (false) {\n      return true;\n    }"),
    ("    if (isFinalisedInspection(inspection?.status, inspectionArchivedFlag(inspection as { archived?: boolean | null } | null))) return;\n    const job = jobs.find(j => j.id === (nextJobId || '\'''\''));", "    const job = jobs.find(j => j.id === (nextJobId || '\'''\''));"),
  ]'

apply_and_kill \
  "fanout_select_drops_finalised_filter" \
  "src/lib/persistLivingJobJha.ts" \
  "src/lib/persistLivingJobJha.test.ts" \
  "does not update an issued linked inspection" \
  '[
    (".eq('\''crm_job_id'\'', jobId)\n    .not('\''status'\'', '\''in'\'', FINALISED_INSPECTION_STATUS_IN)\n    .eq('\''archived'\'', false);", ".eq('\''crm_job_id'\'', jobId);"),
    ("  const bound = [...(inspections ?? [])].filter(row => !isFinalisedInspection(row.status, row.archived));", "  const bound = [...(inspections ?? [])];"),
  ]'

apply_and_kill \
  "fanout_update_drops_finalised_filter" \
  "src/lib/persistLivingJobJha.ts" \
  "src/lib/persistLivingJobJha.test.ts" \
  "updates a draft and keeps the finalised filter on the update" \
  '[
    (".eq('\''id'\'', patch.id)\n      .not('\''status'\'', '\''in'\'', FINALISED_INSPECTION_STATUS_IN)\n      .eq('\''archived'\'', false);", ".eq('\''id'\'', patch.id);"),
  ]'

apply_and_kill \
  "effect_drops_changed_check" \
  "src/pages/InspectionFillPage.tsx" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "living effect does not persist when the living job matches stored meta" \
  '[
    ("    if (!applied.changed) return;\n    setMeta(applied.meta);", "    setMeta(applied.meta);"),
  ]'

apply_and_kill \
  "review_drops_completed_guard" \
  "src/pages/InspectionReviewPage.tsx" \
  "src/pages/inspectionReviewPageComplete.test.tsx" \
  "does not re-complete an already completed inspection" \
  '[
    ("  const alreadyFinalised = isFinalisedInspection(", "  const alreadyFinalised = false && isFinalisedInspection("),
  ]'

apply_and_kill \
  "review_uses_living_when_finalised" \
  "src/pages/InspectionReviewPage.tsx" \
  "src/pages/inspectionReviewPageComplete.test.tsx" \
  "does not re-complete an already completed inspection" \
  '[
    ("            {alreadyFinalised\n              ? (resolveInspectionPrintFields({", "            {false\n              ? (resolveInspectionPrintFields({"),
  ]'

apply_and_kill \
  "print_drops_snapshot_fallback" \
  "src/lib/inspectionPrintSnapshot.ts" \
  "src/lib/inspectionPrintSnapshot.test.ts" \
  "composeGenericReport still shows name and address after a client and job null-out" \
  '[
    ("    clientName: firstText(meta.clientName, snapshots.clientName, live.clientName),", "    clientName: firstText(meta.clientName, live.clientName),"),
    ("    jobTitle: firstText(meta.jobDescription, snapshots.jobTitle, live.jobTitle),", "    jobTitle: firstText(meta.jobDescription, live.jobTitle),"),
    ("    siteName: firstText(meta.siteName, snapshots.siteName, live.siteName),", "    siteName: firstText(meta.siteName, live.siteName),"),
    ("    siteAddress: firstText(meta.siteAddress, snapshots.siteAddress, live.siteAddress),", "    siteAddress: firstText(meta.siteAddress, live.siteAddress),"),
  ]'

apply_and_kill \
  "portal_drops_snapshot_fallback" \
  "supabase/functions/client-portal/portalTenancy.ts" \
  "src/lib/inspectionPrintSnapshot.test.ts" \
  "portal print fields fall back to snapshots when meta is empty" \
  '[
    ("    siteName: meta.siteName || row.site_name_snapshot || null,", "    siteName: meta.siteName || null,"),
    ("    siteAddress: meta.siteAddress || row.site_address_snapshot || null,", "    siteAddress: meta.siteAddress || null,"),
    ("    clientName: meta.clientName || row.client_name_snapshot || null,", "    clientName: meta.clientName || null,"),
  ]'

apply_and_kill \
  "is_finalised_drops_completed" \
  "src/lib/isFinalisedInspection.ts" \
  "src/pages/inspectionFillPageSave.test.tsx" \
  "saveInspection returns before update when the inspection is finalised" \
  '[
    ("  return status === '\''completed'\''\n    || status === '\''issued'\''\n    || status === '\''sent'\''\n    || status === '\''archived'\'';", "  return status === '\''issued'\''\n    || status === '\''sent'\''\n    || status === '\''archived'\'';"),
  ]'

echo "All prove-sec-insp-3-app mutants passed"
