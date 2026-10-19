-- Rollback 088_ai_settings_lockdown (do not run on production without approval).

REVOKE ALL ON TABLE public.ai_settings FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_settings TO authenticated;

ALTER TABLE public.ai_settings
  ALTER COLUMN admin_tools_enabled SET DEFAULT true;
