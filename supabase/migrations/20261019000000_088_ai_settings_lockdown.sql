-- Lock ai_settings so customer REST cannot read the Anthropic key or flip
-- admin_tools_enabled. The ai-settings edge function still writes with
-- the service role. Files only. Do not apply to prod until Coach signs.

ALTER TABLE public.ai_settings
  ALTER COLUMN admin_tools_enabled SET DEFAULT false;

UPDATE public.ai_settings
  SET admin_tools_enabled = false
  WHERE admin_tools_enabled IS DISTINCT FROM false;

REVOKE ALL ON TABLE public.ai_settings FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, company_id, model, created_at, updated_at)
  ON public.ai_settings
  TO authenticated;
