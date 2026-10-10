-- PR-I: admin/operator can save on/off + SMS display name.
-- Texts cannot turn on without a GSM-7 name of 2-20 characters.
-- Caps, test mode, and the allowlist stay operator-owned on the table.

CREATE OR REPLACE FUNCTION public.sms_display_name_valid(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    p_name IS NOT NULL
    AND char_length(btrim(p_name)) BETWEEN 2 AND 20
    AND public.sms_is_gsm7(btrim(p_name))
$$;

REVOKE ALL ON FUNCTION public.sms_display_name_valid(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_display_name_valid(text)
  TO authenticated, service_role;

ALTER TABLE public.sms_automation_settings
  DROP CONSTRAINT IF EXISTS sms_automation_settings_enabled_requires_name;

ALTER TABLE public.sms_automation_settings
  ADD CONSTRAINT sms_automation_settings_enabled_requires_name
    CHECK (
      enabled IS NOT TRUE
      OR public.sms_display_name_valid(business_name)
    );

CREATE OR REPLACE FUNCTION public.save_sms_textback_settings(
  p_enabled boolean,
  p_business_name text
)
RETURNS public.sms_automation_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
  v_role text;
  v_name text;
  v_row public.sms_automation_settings%ROWTYPE;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT profiles.company_id, profiles.role
  INTO v_org, v_role
  FROM public.profiles
  WHERE profiles.id = v_uid;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_role IS DISTINCT FROM 'admin'
    AND NOT public.is_platform_operator()
  THEN
    RAISE EXCEPTION 'only an admin can change text-back settings'
      USING ERRCODE = '42501';
  END IF;

  v_name := nullif(btrim(coalesce(p_business_name, '')), '');

  IF v_name IS NOT NULL AND NOT public.sms_display_name_valid(v_name) THEN
    RAISE EXCEPTION 'sms display name invalid' USING ERRCODE = '23514';
  END IF;

  IF p_enabled IS TRUE AND NOT public.sms_display_name_valid(v_name) THEN
    RAISE EXCEPTION 'sms display name required to enable' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.sms_automation_settings (
    organisation_id,
    enabled,
    business_name
  )
  VALUES (
    v_org,
    coalesce(p_enabled, false),
    v_name
  )
  ON CONFLICT (organisation_id) DO UPDATE
  SET
    enabled = EXCLUDED.enabled,
    business_name = EXCLUDED.business_name,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_sms_textback_settings(boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sms_textback_settings(boolean, text)
  TO authenticated, service_role;
