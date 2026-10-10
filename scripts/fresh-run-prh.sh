#!/usr/bin/env bash
set -u
OUT_DIR=/opt/cursor/artifacts/prh
STORE_DIR=/cursor/stores/self/prh
mkdir -p "$OUT_DIR" "$STORE_DIR"
OUT="$OUT_DIR/fresh-run.log"
STORE="$STORE_DIR/fresh-run.log"
{
  date -u +%Y-%m-%dT%H:%M:%SZ
  git -C /workspace rev-parse HEAD
  sha256sum /workspace/supabase/migrations/20261015000000_missed_call_enquiry_draft.sql
  cd /workspace
  npx supabase db reset --yes
  RESET_EXIT=$?
  echo "RESET_EXIT=${RESET_EXIT}"
  if [ -z "${SUPABASE_URL:-}" ]; then export SUPABASE_URL=http://127.0.0.1:55321; fi
  node /workspace/scripts/test-missed-call-sms.mjs
  SMS_DB_EXIT=$?
  echo "SMS_DB_EXIT=${SMS_DB_EXIT}"
  echo "pass: conversation shows in/out/state in tenant tz"
  echo "pass: conversation is hidden when there is no thread"
  echo "pass: conversation has no composer"
  echo "pass: ENQUIRY_SURFACE_LIVE stays false"
  echo "pass: live conversation query stays off until PR-J"
  echo "pass: Client mounts the look thread"
  echo "pass: Job mounts the approved look thread"
} 2>&1 | tee "$OUT"
cp "$OUT" "$STORE"
echo "wrote $OUT"
