-- SEC-SMTP: write-only company SMTP secret for browser roles.
-- Status and setter are SECURITY DEFINER RPCs for the caller's own company.
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

CREATE OR REPLACE FUNCTION public.email_smtp_set_pass(p_pass text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid;
  v_admin boolean;
BEGIN
  SELECT p.company_id, (p.role = 'admin')
    INTO v_company, v_admin
    FROM public.profiles p
   WHERE p.id = auth.uid();

  IF v_company IS NULL OR NOT COALESCE(v_admin, false) THEN
    RAISE EXCEPTION 'permission denied'
      USING ERRCODE = '42501';
  END IF;

  IF btrim(coalesce(p_pass, '')) = '' THEN
    RAISE EXCEPTION 'password required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.email_settings
     SET smtp_pass = p_pass,
         updated_at = now()
   WHERE company_id = v_company;

  IF NOT FOUND THEN
    INSERT INTO public.email_settings (company_id, smtp_pass)
    VALUES (v_company, p_pass);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.email_smtp_set_pass(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_smtp_set_pass(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.email_smtp_set_pass(text) TO authenticated;

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
