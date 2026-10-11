-- FILTER: count phone digits after stripping separators. Block spelled-out domains.

CREATE OR REPLACE FUNCTION public.sms_reply_has_link_or_phone(p_body text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    p_body ~* 'https?://'
    OR p_body ~* '\mwww\.'
    OR p_body ~* '[a-z0-9][a-z0-9-]*\.[a-z]{2,}'
    OR p_body ~* '\mdot[[:space:]]+(co|com|au|net)\M'
    OR regexp_replace(coalesce(p_body, ''), '[ .+\-]', '', 'g') ~ '[0-9]{6,}'
$$;

REVOKE ALL ON FUNCTION public.sms_reply_has_link_or_phone(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_has_link_or_phone(text)
  TO authenticated, service_role;
