#!/usr/bin/env bash
# Permanent gate: pin PostgREST, build, then vitest, then the Chromium dist-CSS suite.
# Vitest's known product-test failures must not skip the shell kills.
set -euo pipefail

PGRST_VERSION="v12.2.3"
PGRST_ASSET="postgrest-${PGRST_VERSION}-linux-static-x64.tar.xz"
PGRST_URL="https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/${PGRST_ASSET}"
# sha256 of the official linux-static-x64 tarball, then of the extracted binary.
PGRST_TAR_SHA256="9f71269e61ac3a940281e93ff415760f5957e430e475ba4c3889f3ede7d5527c"
PGRST_SHA256="870a77f49508479bc87c5504b6b0c3715c7220926932d916b0d73952b297c617"
PGRST_CACHE="${PGRST_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/sec-smtp-postgrest/${PGRST_VERSION}}"
PGRST_BIN_PINNED="${PGRST_CACHE}/postgrest"

ensure_postgrest() {
  mkdir -p "$PGRST_CACHE"
  if [[ -x "$PGRST_BIN_PINNED" ]]; then
    local got
    got="$(sha256sum "$PGRST_BIN_PINNED" | awk '{print $1}')"
    if [[ "$got" == "$PGRST_SHA256" ]]; then
      export PGRST_BIN="$PGRST_BIN_PINNED"
      return 0
    fi
    echo "PostgREST cache hash mismatch ($got), refetching" >&2
    rm -f "$PGRST_BIN_PINNED"
  fi
  local tmp
  tmp="$(mktemp -d)"
  if ! curl -fsSL "$PGRST_URL" -o "$tmp/$PGRST_ASSET"; then
    echo "Failed to fetch pinned PostgREST ${PGRST_VERSION} from ${PGRST_URL}" >&2
    rm -rf "$tmp"
    exit 1
  fi
  local tar_got
  tar_got="$(sha256sum "$tmp/$PGRST_ASSET" | awk '{print $1}')"
  if [[ "$tar_got" != "$PGRST_TAR_SHA256" ]]; then
    echo "PostgREST tarball sha256 ${tar_got} != pinned ${PGRST_TAR_SHA256}" >&2
    rm -rf "$tmp"
    exit 1
  fi
  tar -xJf "$tmp/$PGRST_ASSET" -C "$tmp"
  if [[ ! -f "$tmp/postgrest" ]]; then
    echo "PostgREST archive missing the postgrest binary" >&2
    rm -rf "$tmp"
    exit 1
  fi
  local got
  got="$(sha256sum "$tmp/postgrest" | awk '{print $1}')"
  if [[ "$got" != "$PGRST_SHA256" ]]; then
    echo "PostgREST sha256 ${got} != pinned ${PGRST_SHA256}" >&2
    rm -rf "$tmp"
    exit 1
  fi
  install -m 0755 "$tmp/postgrest" "$PGRST_BIN_PINNED"
  rm -rf "$tmp"
  export PGRST_BIN="$PGRST_BIN_PINNED"
}

ensure_postgrest
export GATES=1

VITE_LOOK_PROOF=1 npm run build
vitest_rc=0
npx vitest run --maxWorkers=2 "$@" || vitest_rc=$?
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts
exit "$vitest_rc"
