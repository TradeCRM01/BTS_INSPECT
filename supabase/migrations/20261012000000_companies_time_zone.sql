-- PR-D: tenant IANA time zone for enquiry display and today counts.
-- Default Australia/Brisbane. Reminder cron and edge stay on Perth.

CREATE OR REPLACE FUNCTION public.is_iana_time_zone(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names AS zone
    WHERE zone.name = p_name
  )
$$;

REVOKE ALL ON FUNCTION public.is_iana_time_zone(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_iana_time_zone(text)
  TO authenticated, service_role;

ALTER TABLE public.companies
  ADD COLUMN time_zone text NOT NULL DEFAULT 'Australia/Brisbane';

ALTER TABLE public.companies
  ADD CONSTRAINT companies_time_zone_iana
  CHECK (public.is_iana_time_zone(time_zone));
