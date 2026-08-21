-- Auto-fire 24h pre-job reminders (Australia/Perth calendar).
-- pg_cron is already enabled (018). pg_net POSTs due=tomorrow with no user JWT.
-- Set Vault secrets once (not stored in this repo):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role or JOB_REMINDER_CRON_SECRET>', 'service_role_key');
--   select vault.create_secret('<anon/publishable>', 'publishable_key');

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS client_reminder_sent_for_date date;

COMMENT ON COLUMN jobs.client_reminder_sent_for_date IS
  'scheduled_date the last successful 24h reminder was sent for. A later date change may send again.';

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

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

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_job_client_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_job_client_reminders() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-client-reminder-perth-morning') THEN
    PERFORM cron.unschedule('job-client-reminder-perth-morning');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'job-client-reminder-perth-afternoon') THEN
    PERFORM cron.unschedule('job-client-reminder-perth-afternoon');
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
END $$;

-- 07:00 Australia/Perth = 23:00 UTC (day-before morning send)
SELECT cron.schedule(
  'job-client-reminder-perth-morning',
  '0 23 * * *',
  $$SELECT public.invoke_job_client_reminders()$$
);

-- 16:00 Australia/Perth = 08:00 UTC (catch jobs booked later; skip-already-sent)
SELECT cron.schedule(
  'job-client-reminder-perth-afternoon',
  '0 8 * * *',
  $$SELECT public.invoke_job_client_reminders()$$
);
