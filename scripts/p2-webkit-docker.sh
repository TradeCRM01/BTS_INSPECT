#!/usr/bin/env bash
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.48.2-jammy"
if ! command -v docker >/dev/null 2>&1; then
  echo "WebKit gate FAIL: docker is required for ${IMAGE} (host is not ubuntu-22.04)." >&2
  exit 1
fi
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
  else
    echo "WebKit gate FAIL: docker daemon is not reachable." >&2
    exit 1
  fi
fi
if ! "${DOCKER[@]}" image inspect "$IMAGE" >/dev/null 2>&1; then
  "${DOCKER[@]}" pull "$IMAGE"
fi

"${DOCKER[@]}" run --rm \
  --ipc=host \
  -e TZ \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -v "$PWD":/work \
  -w /work \
  "$IMAGE" \
  bash -lc '
    set -euo pipefail
    node -e "
      const { webkit } = require(\"playwright\");
      webkit.launch().then(async (b) => {
        console.log(\"webkit-version \" + b.version());
        await b.close();
      }).catch((err) => {
        console.error(\"WebKit launch FAIL\", err);
        process.exit(1);
      });
    "
    npx vitest run -c vitest.p2-schedule.config.ts -t "P2-webkit:"
  '
