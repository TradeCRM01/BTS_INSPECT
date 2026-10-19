#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="$ROOT/src/pages/TemplateEditorPage.tsx"
SRC="$(cat "$PAGE")"
restore() { printf '%s' "$SRC" > "$PAGE"; }
trap restore EXIT

run_expect_fail() {
  local name="$1"
  local file="$2"
  local filter="$3"
  if (cd "$ROOT" && npx vitest run --maxWorkers=1 "$file" -t "$filter" >/tmp/pr378-fu-kill-$name.log 2>&1); then
    echo "$name SURVIVED (test passed on mutant)"
    tail -40 /tmp/pr378-fu-kill-$name.log
    exit 1
  fi
  echo "$name KILLED"
}

python3 - "$PAGE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = """    onError: () => {
      setValidationErrors([]);
      setDeleteError(TEMPLATE_DELETE_FAILED);
      setSaveState('error');
    },"""
new = """    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setValidationErrors([msg]);
      setSaveState('error');
    },"""
if old not in t:
    raise SystemExit('K23 mutant: onError block not found')
p.write_text(t.replace(old, new, 1))
PY
run_expect_fail k23 src/lib/templateWriteNoRow.test.tsx 'K23'

restore

python3 - "$PAGE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = """    onError: () => {
      setValidationErrors([]);
      setDeleteError(TEMPLATE_DELETE_FAILED);
      setSaveState('error');
    },"""
new = """    onError: () => {
      setValidationErrors([TEMPLATE_DELETE_FAILED]);
      setDeleteError(null);
      setSaveState('error');
    },"""
if old not in t:
    raise SystemExit('copy mutant: onError block not found')
p.write_text(t.replace(old, new, 1))
PY
run_expect_fail copy src/lib/templateWriteNoRow.test.tsx 'shows the delete-failure copy as its own message'

restore

python3 - "$PAGE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
t = p.read_text()
old = """    onSuccess: () => {
      setDeleteError(null);
      setSaveState('saved');
    },"""
new = """    onSuccess: () => {
      setSaveState('saved');
    },"""
if old not in t:
    raise SystemExit('clear mutant: onSuccess block not found')
p.write_text(t.replace(old, new, 1))
PY
run_expect_fail clear src/lib/templateWriteNoRow.test.tsx 'clears the delete-failure copy'

echo "client mutants KILLED"
