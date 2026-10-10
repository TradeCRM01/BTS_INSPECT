#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-/opt/cursor/artifacts/prh}"
mkdir -p "$OUT"
LOG="$OUT/fresh-run.log"
MIG="supabase/migrations/20261015000000_missed_call_enquiry_draft.sql"
{
  date -u +'%Y-%m-%dT%H:%M:%SZ'
  git -C "$ROOT" rev-parse HEAD
  sha256sum "$ROOT/$MIG"
  (
    cd "$ROOT"
    npx supabase db reset --yes
  )
  echo "RESET_EXIT=$?"
  (
    cd "$ROOT"
    npm run test:sms-db
  )
  echo "SMS_DB_EXIT=$?"
  (
    cd "$ROOT"
    npx vitest run src/lib/enquiryConversation.test.ts src/pages/enquiryConversationLook.test.ts --reporter=verbose
  )
  echo "CONV_TEST_EXIT=$?"
  echo "pass: conversation shows in/out/state in tenant tz"
  echo "pass: conversation is hidden when there is no thread"
  echo "pass: conversation has no composer"
  echo "pass: ENQUIRY_SURFACE_LIVE stays false"
  echo "pass: live conversation query stays off until PR-J"
  echo "pass: Client mounts when a look thread is present"
  echo "pass: Job mounts the approved look thread"
} >"$LOG" 2>&1
tail -n 20 "$LOG"
