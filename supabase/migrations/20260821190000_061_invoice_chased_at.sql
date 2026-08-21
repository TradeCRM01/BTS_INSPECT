-- Overdue invoice chase rides the existing job-reminder / company SMTP pipe.
-- chased_at lives on the existing invoices row — not a new table.
-- Written only after Resend returns 2xx. A failed send stays unchased (null).
-- Does not mark the invoice paid. SMS miss does not write it.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS chased_at timestamptz;

COMMENT ON COLUMN invoices.chased_at IS
  'When the overdue invoice last emailed successfully through job-reminder. Null means it was never chased or a send failed. Written only after Resend 2xx. Does not mark the invoice paid.';

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Same Vault/pg_net helper and Perth cron names as the 24h ping.
-- Keep job + inspection auto-fire, and POST due=overdue on job-reminder.
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
  PERFORM public.send_due_job_client_reminders();
  PERFORM public.send_due_inspection_reminders();

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
      RETURN 0;
    WHEN undefined_object THEN
      RAISE NOTICE 'job reminder cron: vault secrets are not available';
      RETURN 0;
  END;

  IF project_url IS NULL OR btrim(project_url) = '' THEN
    RAISE NOTICE 'job reminder cron: vault project_url is not set';
    RETURN 0;
  END IF;

  IF auth_key IS NULL OR btrim(auth_key) = '' THEN
    RAISE NOTICE 'job reminder cron: vault service_role_key / job_reminder_cron_secret is not set';
    RETURN 0;
  END IF;

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

-- Same names and times. No new cron stack.
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
