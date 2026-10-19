#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -x /usr/lib/postgresql/16/bin/initdb ] || [ ! -x /usr/lib/postgresql/17/bin/initdb ]; then
  echo "Need /usr/lib/postgresql/16 and /usr/lib/postgresql/17 initdb to run this proof"
  exit 2
fi

npx vitest run src/lib/clientPortalSchemaGuard.pg.test.ts src/lib/clientPortalSchemaGuard.test.ts --maxWorkers=1
echo "client-portal schema guard PG16 + PG17 passed"
