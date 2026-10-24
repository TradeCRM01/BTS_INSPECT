#!/usr/bin/env bash
# Run HF-LAND-1 kills on the official Playwright 1.48.2 jammy image so WebKit launches.
set -euo pipefail
IMAGE="${HF_LAND1_WEBKIT_IMAGE:-mcr.microsoft.com/playwright:v1.48.2-jammy}"
TZ_VALUE="${TZ:-UTC}"
if ! command -v docker >/dev/null 2>&1; then
  echo "docker missing. WebKit on this host is a FAIL. Install docker and rerun." >&2
  exit 1
fi
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "docker daemon not reachable. WebKit on this host is a FAIL." >&2
    exit 1
  fi
fi
"${DOCKER[@]}" run --rm \
  -e TZ="$TZ_VALUE" \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -v "$PWD":/work \
  -w /work \
  "$IMAGE" \
  npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx "$@"
