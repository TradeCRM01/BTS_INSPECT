-- SEC-SMTP: write-only company SMTP secret for browser roles.
-- Status is a SECURITY DEFINER RPC for the caller's own company.
-- service_role keeps table privileges and still sends mail.

CREATE OR REPLACE FUNCTION public.email_smtp_ready()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT p.company_id
    INTO v_company
    FROM public.profiles p
   WHERE p.id = auth.uid();

  IF v_company IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.email_settings e
     WHERE e.company_id = v_company
       AND lower(coalesce(e.smtp_host, '')) LIKE '%resend%'
       AND btrim(coalesce(e.smtp_pass, '')) <> ''
       AND btrim(coalesce(e.from_email, '')) <> ''
  );
END;
$$;

REVOKE ALL ON FUNCTION public.email_smtp_ready() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_smtp_ready() FROM anon;
GRANT EXECUTE ON FUNCTION public.email_smtp_ready() TO authenticated;

REVOKE SELECT ON public.email_settings FROM anon, authenticated;
GRANT SELECT (
  id,
  company_id,
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_user,
  from_name,
  from_email,
  created_at,
  updated_at
) ON public.email_settings TO authenticated;
GRANT INSERT, UPDATE ON public.email_settings TO authenticated;
REVOKE ALL ON public.email_settings FROM anon;
