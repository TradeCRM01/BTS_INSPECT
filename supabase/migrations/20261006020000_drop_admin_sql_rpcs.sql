-- SEC-2: drop the SECURITY DEFINER SQL RPCs. Grants already revoked live.
-- Callers were only the ai-console query_database / execute_sql tools, now removed.

DROP FUNCTION IF EXISTS public.admin_execute(text);
DROP FUNCTION IF EXISTS public.admin_query(text);
