-- ai_settings_interim_lock
-- Coach-signed interim lock, 2026-10-19 10:37 AEST. Scope: public.ai_settings only.
-- 1) New rows default to admin tools OFF.
ALTER TABLE public.ai_settings ALTER COLUMN admin_tools_enabled SET DEFAULT false;

-- 2) Force any existing rows OFF (0 rows expected at time of signing).
UPDATE public.ai_settings SET admin_tools_enabled = false WHERE admin_tools_enabled IS DISTINCT FROM false;

-- 3) Stop client roles reading anthropic_api_key. A column-level REVOKE is a no-op
--    while a table-level SELECT grant exists, so revoke table-wide and re-grant
--    only the non-secret columns to authenticated (RLS still limits rows to own-company admins).
REVOKE SELECT ON public.ai_settings FROM authenticated, anon;
GRANT SELECT (id, company_id, model, created_at, updated_at) ON public.ai_settings TO authenticated;

-- 4) Remove direct client writes. The ai-settings edge function writes with service_role and is unaffected.
REVOKE INSERT, UPDATE ON public.ai_settings FROM authenticated, anon;
