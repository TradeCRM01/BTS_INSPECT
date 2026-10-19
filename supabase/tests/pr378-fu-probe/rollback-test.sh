#!/bin/bash
set -euo pipefail
V=$1
P="$(cd "$(dirname "$0")" && pwd)"
if [ -n "${REPO:-}" ]; then
  R="$REPO"
else
  R="$(cd "$P/../../.." && pwd)"
fi
PSQL_BIN="$(command -v psql || true)"
if [ -z "$PSQL_BIN" ]; then
  PSQL_BIN="/usr/lib/postgresql/$V/bin/psql"
fi
if [ -z "${PGHOST:-}" ] || [ -z "${PGPORT:-}" ]; then
  echo "PGHOST and PGPORT are required (the prove script exports them)" >&2
  exit 2
fi
PGHOST_VAL="$PGHOST"
PGPORT_VAL="$PGPORT"
PS="$PSQL_BIN -h $PGHOST_VAL -p $PGPORT_VAL -U postgres -X -q -v ON_ERROR_STOP=1"
OUT="${RB_OUT:-$P}"
$PS -d postgres -c 'DROP DATABASE IF EXISTS rb090' -c 'CREATE DATABASE rb090'
for f in \
  "$R/supabase/tests/pr378-probe/sql/prod-schema.sql" \
  "$R/supabase/migrations/20261019010000_088_update_member_settings.sql" \
  "$R/supabase/tests/pr378-probe/sql/field-schema.sql" \
  "$R/supabase/migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql"
do
  $PS -d rb090 -f "$f" >/dev/null
done
snap(){ $PS -d rb090 -At -c "
select 'pol '||tablename||' '||policyname||' '||cmd||' '||roles::text||' '||coalesce(qual,'')||' '||coalesce(with_check,'') from pg_policies where schemaname='public'
union all select 'fn '||p.oid::regprocedure::text||' '||md5(pg_get_functiondef(p.oid))||' '||coalesce(array_to_string(p.proacl,','),'') from pg_proc p where pronamespace='public'::regnamespace
union all select 'trg '||tgname from pg_trigger where not tgisinternal and tgrelid='public.profiles'::regclass
union all select 'idx '||c.relname||' '||pg_get_indexdef(c.oid) from pg_class c join pg_index i on i.indexrelid=c.oid where c.relnamespace='public'::regnamespace and c.relkind='i'
union all select 'rel '||relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by 1"; }
snap > "$OUT/rb090-pg$V-before.txt"
$PS -d rb090 -f "$R/supabase/migrations/20261019030000_090_ensure_builtin_renderers.sql" >/dev/null && echo "090 apply1 OK"
$PS -d rb090 -f "$R/supabase/migrations/20261019030000_090_ensure_builtin_renderers.sql" >/dev/null && echo "090 apply2 (re-run) OK"
snap > "$OUT/rb090-pg$V-after090.txt"
RB="${RB:-$R/docs/operations/rollback-20261019030000_090_ensure_builtin_renderers.sql}"
$PS -d rb090 -f "$RB" >/dev/null && echo "rollback1 OK"
snap > "$OUT/rb090-pg$V-afterrb.txt"
$PS -d rb090 -f "$RB" >/dev/null && echo "rollback2 OK"
$PS -d rb090 -f "$R/supabase/migrations/20261019030000_090_ensure_builtin_renderers.sql" >/dev/null && echo "090 re-apply after rollback OK"
echo "--- diff before vs after rollback (catalog):"
if diff "$OUT/rb090-pg$V-before.txt" "$OUT/rb090-pg$V-afterrb.txt"; then
  echo IDENTICAL
else
  echo "ROLLBACK CATALOG DIFF IS NOT EMPTY"
  exit 1
fi
