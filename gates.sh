#!/usr/bin/env bash
# Permanent gate: build first so dist-reading kills (overlaySearchCancel and friends) count.
set -euo pipefail
npm run build
npx vitest run --maxWorkers=2 "$@"
