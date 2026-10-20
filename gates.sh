#!/usr/bin/env bash
# Permanent gate: build, then vitest, then the Chromium dist-CSS suite.
# Vitest's known product-test failures must not skip the shell kills.
set -euo pipefail
npm run build
vitest_rc=0
npx vitest run --maxWorkers=2 "$@" || vitest_rc=$?
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts
exit "$vitest_rc"
