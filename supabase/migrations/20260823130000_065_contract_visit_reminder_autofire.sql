-- Thin due=contract hop on the existing Perth invoke.
-- Same cron names and times. No new table. No new cron stack.
-- Tomorrow jobs, due inspections, and overdue invoices stay as signed.
-- Active contracts due today ride job-reminder (email + SMS) beside them.

CREATE OR REPLACE FUNCTION public.invoke_job_client_reminders()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id bigint;
  project_url text;
  auth_key text;
  api_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO project_url
    FROM vault.decrypted_secrets
    WHERE name = 'project_url'
    LIMIT 1;

    SELECT decrypted_secret INTO auth_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;

    IF auth_key IS NULL THEN
      SELECT decrypted_secret INTO auth_key
      FROM vault.decrypted_secrets
      WHERE name = 'job_reminder_cron_secret'
      LIMIT 1;
    END IF;

    SELECT decrypted_secret INTO api_key
    FROM vault.decrypted_secrets
    WHERE name IN ('publishable_key', 'anon_key')
    LIMIT 1;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'job reminder cron: vault is not available';
      RETURN NULL;
    WHEN undefined_object THEN
      RAISE NOTICE 'job reminder cron: vault secrets are not available';
      RETURN NULL;
  END;

  IF project_url IS NULL OR btrim(project_url) = '' THEN
    RAISE NOTICE 'job reminder cron: vault project_url is not set';
    RETURN NULL;
  END IF;

  IF auth_key IS NULL OR btrim(auth_key) = '' THEN
    RAISE NOTICE 'job reminder cron: vault service_role_key / job_reminder_cron_secret is not set';
    RETURN NULL;
  END IF;

  -- Tomorrow jobs — existing due=tomorrow hop (SMS beside email).
  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/job-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_key,
      'apikey', coalesce(api_key, auth_key),
      'x-job-reminder-cron', auth_key
    ),
    body := '{"due":"tomorrow","source":"cron"}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;

  -- Due inspections — same edge, due=today. Not a new cron job.
  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/job-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_key,
      'apikey', coalesce(api_key, auth_key),
      'x-job-reminder-cron', auth_key
    ),
    body := '{"due":"today","source":"cron"}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;

  -- Due contract visits — same edge, due=contract. Not a new cron job.
  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/job-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_key,
      'apikey', coalesce(api_key, auth_key),
      'x-job-reminder-cron', auth_key
    ),
    body := '{"due":"contract","source":"cron"}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;

  -- Overdue invoices — same edge, due=overdue. Not a new cron job.
  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/job-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_key,
      'apikey', coalesce(api_key, auth_key),
      'x-job-reminder-cron', auth_key
    ),
    body := '{"due":"overdue","source":"cron"}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

COMMENT ON FUNCTION public.invoke_job_client_reminders() IS
  'pg_cron Perth auto-fire: pg_net POST job-reminder due=tomorrow (jobs), due=today (inspections), due=contract (service visits), and due=overdue (unchased invoices). SMS rides the edge beside email.';

REVOKE ALL ON FUNCTION public.invoke_job_client_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_job_client_reminders() FROM anon, authenticated;
