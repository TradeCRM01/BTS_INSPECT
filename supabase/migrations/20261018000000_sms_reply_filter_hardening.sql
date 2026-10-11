-- FILTER: count phone digits after stripping separators. Block spelled-out domains.

CREATE OR REPLACE FUNCTION public.sms_reply_has_forbidden_word(p_body text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    p_body ~* '\m(booked|quote|plumber|electrician|carpenter|tomorrow|today|price|hourly)\M'
    OR position('$' IN p_body) > 0
$$;

REVOKE ALL ON FUNCTION public.sms_reply_has_forbidden_word(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_has_forbidden_word(text)
  TO authenticated, service_role;

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
    OR p_body ~* '[\(\{\[]*d[[:space:].]*[o0][[:space:].]*t[\)\}\]]*[[:space:]]*(com|co|au|net|org|c[[:space:]]*o[[:space:]]*m)\M'
    OR regexp_replace(
         regexp_replace(coalesce(p_body, ''), '(\d)\.(\d{2})([^0-9.]|$)', '\1x\2\3', 'g'),
         '[^0-9a-z]',
         '',
         'gi'
       ) ~ '[0-9]{6,}'
$$;

REVOKE ALL ON FUNCTION public.sms_reply_has_link_or_phone(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sms_reply_has_link_or_phone(text)
  TO authenticated, service_role;
