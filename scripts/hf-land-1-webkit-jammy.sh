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
AAD2_DIR="$(mktemp -d)"
git show aad2eef7:src/index.css > "$AAD2_DIR/index.css"
git show aad2eef7:src/components/layout/AppShell.tsx > "$AAD2_DIR/AppShell.tsx"
cleanup() { rm -rf "$AAD2_DIR"; }
trap cleanup EXIT
"${DOCKER[@]}" run --rm \
  -e TZ="$TZ_VALUE" \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e HF_LAND1_AAD2_DIR=/aad2 \
  -e GIT_CONFIG_GLOBAL=/tmp/hf-land-1.gitconfig \
  -v "$PWD":/work \
  -v "$AAD2_DIR":/aad2:ro \
  -w /work \
  "$IMAGE" \
  bash -lc 'git config --global --add safe.directory /work; npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx "$@"' -- "$@"
