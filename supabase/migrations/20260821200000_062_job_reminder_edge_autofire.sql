-- Route Perth auto-fire back through the existing job-reminder edge.
-- 058 / 060 replaced invoke_job_client_reminders() with SQL-only Resend
-- (email only, can double-send beside the edge). Restore the 057 pg_net
-- hop so tomorrow jobs and due inspections ride Twilio beside email.
-- Same cron names and times. No new table. No new cron stack.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Stop the SQL-only Resend autofire. Leftover cron commands must not mail.
CREATE OR REPLACE FUNCTION public.send_due_job_client_reminders()
RETURNS TABLE(out_company_id uuid, out_job_id uuid, out_sent boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retired: Perth tomorrow jobs go through invoke_job_client_reminders
  -- → pg_net POST job-reminder due=tomorrow (email + SMS).
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.send_due_job_client_reminders() IS
  'Retired. Perth auto-fire is invoke_job_client_reminders → job-reminder due=tomorrow. Kept as a no-op so leftover SQL cron cannot double-send.';

REVOKE ALL ON FUNCTION public.send_due_job_client_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_due_job_client_reminders() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_due_inspection_reminders(
  p_company_id uuid DEFAULT NULL,
  p_inspection_id uuid DEFAULT NULL
)
RETURNS TABLE(out_company_id uuid, out_inspection_id uuid, out_sent boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retired: due inspections go through job-reminder (inspectionId click
  -- Send, or due=today cron). SQL Resend is email-only and must not fire.
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.send_due_inspection_reminders(uuid, uuid) IS
  'Retired. Due inspections go through job-reminder (inspectionId / due=today). Kept as a no-op so leftover SQL cron cannot double-send.';

REVOKE ALL ON FUNCTION public.send_due_inspection_reminders(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_due_inspection_reminders(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_due_inspection_reminders(uuid, uuid) TO service_role;

-- Same Vault secrets as 057 (not stored in this repo):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service_role or JOB_REMINDER_CRON_SECRET>', 'service_role_key');
--   select vault.create_secret('<anon/publishable>', 'publishable_key');
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

  RETURN request_id;
END;
$$;

COMMENT ON FUNCTION public.invoke_job_client_reminders() IS
  'pg_cron Perth auto-fire: pg_net POST job-reminder due=tomorrow (jobs) and due=today (inspections). SMS rides the edge beside email.';

REVOKE ALL ON FUNCTION public.invoke_job_client_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_job_client_reminders() FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inspection-due-reminder-perth-morning') THEN
    PERFORM cron.unschedule('inspection-due-reminder-perth-morning');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'inspection-due-reminder-perth-afternoon') THEN
    PERFORM cron.unschedule('inspection-due-reminder-perth-afternoon');
  END IF;
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

-- Same names and times as 057 / 060. Command is invoke only — not send_due_*.
SELECT cron.schedule(
  'job-client-reminder-perth-morning',
  '0 23 * * *',
  $$SELECT public.invoke_job_client_reminders()$$
);

SELECT cron.schedule(
  'job-client-reminder-perth-afternoon',
  '0 8 * * *',
  $$SELECT public.invoke_job_client_reminders()$$
);
