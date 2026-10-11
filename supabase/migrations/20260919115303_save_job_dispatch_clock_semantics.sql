-- Catalog fill (baseline r3 / #368). Prod version 20260919115303 save_job_dispatch_clock_semantics stays APPLIED.
-- Earliest prod version that created dispatch_json_clock and dispatch_time_to_minutes.
-- Bodies are pg_get_functiondef verbatim from the catalog capture.

CREATE OR REPLACE FUNCTION public.dispatch_json_clock(p jsonb, key text, fallback text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p IS NULL OR key IS NULL OR NOT (p ? key) THEN fallback
    ELSE nullif(btrim(p ->> key), '')
  END;
$function$

CREATE OR REPLACE FUNCTION public.dispatch_time_to_minutes(t text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN t IS NULL OR btrim(t) = '' THEN NULL
    ELSE (split_part(t, ':', 1)::integer * 60)
      + coalesce(nullif(split_part(t, ':', 2), '')::integer, 0)
  END;
$function$
