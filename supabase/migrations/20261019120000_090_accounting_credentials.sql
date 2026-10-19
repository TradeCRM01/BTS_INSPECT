-- Xero tokens live on accounting_credentials. accounting_settings stays
-- member-readable, so settings jsonb cannot keep token keys.
-- get_accounting_connection returns connected, tenant_name, and last_synced_at.

CREATE TABLE public.accounting_credentials (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, provider)
);

ALTER TABLE public.accounting_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.accounting_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.accounting_credentials TO service_role;

UPDATE public.accounting_settings
SET settings = CASE
  WHEN jsonb_typeof(settings) = 'object'
    AND settings ? 'xero'
    AND jsonb_typeof(settings -> 'xero') = 'object' THEN
    (settings - 'access_token' - 'refresh_token' - 'expires_at' - 'token')
    || jsonb_build_object(
      'xero',
      (settings -> 'xero') - 'access_token' - 'refresh_token' - 'expires_at' - 'token'
    )
  WHEN jsonb_typeof(settings) = 'object' THEN
    settings - 'access_token' - 'refresh_token' - 'expires_at' - 'token'
  ELSE settings
END
WHERE settings IS NOT NULL
  AND jsonb_typeof(settings) = 'object';

CREATE FUNCTION public.get_accounting_connection(p_company_id uuid)
RETURNS TABLE (
  connected boolean,
  tenant_name text,
  last_synced_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (
      EXISTS (
        SELECT 1
        FROM public.accounting_credentials AS c
        WHERE c.company_id = p_company_id
          AND c.provider = 'xero'
      )
      AND EXISTS (
        SELECT 1
        FROM public.accounting_settings AS s
        WHERE s.company_id = p_company_id
          AND s.provider = 'xero'
          AND s.connection_status = 'connected'
      )
    ) AS connected,
    (
      SELECT s.settings #>> '{xero,tenant_name}'
      FROM public.accounting_settings AS s
      WHERE s.company_id = p_company_id
    ) AS tenant_name,
    (
      SELECT s.last_synced_at
      FROM public.accounting_settings AS s
      WHERE s.company_id = p_company_id
    ) AS last_synced_at
  WHERE p_company_id IS NOT DISTINCT FROM public.my_company_id();
$$;

REVOKE ALL ON FUNCTION public.get_accounting_connection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_accounting_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accounting_connection(uuid) TO service_role;
