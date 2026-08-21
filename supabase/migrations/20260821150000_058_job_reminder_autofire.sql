-- Auto-fire without Vault or a tray click.
-- pg_cron (018) calls send_due_job_client_reminders(), which mails via
-- existing email_settings + Resend. Scoped: company_id + Perth tomorrow + open.

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.send_due_job_client_reminders()
RETURNS TABLE(out_company_id uuid, out_job_id uuid, out_sent boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  perth_tomorrow date;
  settings record;
  job record;
  client_row record;
  company_row record;
  to_email text;
  greeting text;
  label text;
  when_label text;
  start_hhmm text;
  site text;
  company_name text;
  html text;
  payload text;
  resp http_response;
  sent_ok boolean;
BEGIN
  perth_tomorrow := ((timezone('Australia/Perth', now()))::date + 1);

  FOR settings IN
    SELECT es.company_id, es.smtp_host, es.smtp_pass, es.from_name, es.from_email
    FROM email_settings es
    WHERE es.smtp_host ILIKE '%resend%'
      AND coalesce(btrim(es.smtp_pass), '') <> ''
      AND coalesce(btrim(es.from_email), '') <> ''
  LOOP
    SELECT c.name, c.phone INTO company_row
    FROM companies c
    WHERE c.id = settings.company_id;

    company_name := coalesce(nullif(btrim(company_row.name), ''), 'us');

    FOR job IN
      SELECT j.id, j.company_id, j.client_id, j.title, j.status, j.scheduled_date,
             j.start_time, j.address, j.job_number,
             j.client_reminder_sent_at, j.client_reminder_sent_for_date
      FROM jobs j
      WHERE j.company_id = settings.company_id
        AND j.scheduled_date = perth_tomorrow
        AND j.status IN ('scheduled', 'in_progress')
    LOOP
      IF job.client_reminder_sent_at IS NOT NULL
         AND (
           job.client_reminder_sent_for_date IS NULL
           OR job.client_reminder_sent_for_date = job.scheduled_date
         ) THEN
        out_company_id := settings.company_id;
        out_job_id := job.id;
        out_sent := false;
        out_reason := 'already_sent';
        RETURN NEXT;
        CONTINUE;
      END IF;

      to_email := NULL;
      greeting := 'there';
      IF job.client_id IS NOT NULL THEN
        SELECT cl.name, cl.email, cl.contact_person
        INTO client_row
        FROM clients cl
        WHERE cl.id = job.client_id
          AND cl.company_id = settings.company_id;
        to_email := btrim(coalesce(client_row.email, ''));
        greeting := coalesce(
          nullif(btrim(client_row.contact_person), ''),
          nullif(btrim(client_row.name), ''),
          'there'
        );
      END IF;

      IF to_email IS NULL OR to_email = '' OR position('@' IN to_email) = 0 THEN
        out_company_id := settings.company_id;
        out_job_id := job.id;
        out_sent := false;
        out_reason := 'no_email';
        RETURN NEXT;
        CONTINUE;
      END IF;

      label := CASE
        WHEN job.job_number IS NOT NULL THEN '#' || lpad(job.job_number::text, 4, '0') || ' ' || coalesce(job.title, 'Job')
        ELSE coalesce(job.title, 'Job')
      END;
      when_label := to_char(job.scheduled_date, 'Dy FMDD Mon YYYY');
      start_hhmm := left(coalesce(job.start_time::text, ''), 5);
      IF start_hhmm <> '' THEN
        when_label := when_label || ' at ' || start_hhmm;
      END IF;
      site := btrim(coalesce(job.address, ''));

      html :=
        '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">'
        || '<p>Hi ' || replace(replace(greeting, '&', '&amp;'), '<', '&lt;') || ',</p>'
        || '<p>' || replace(replace(company_name, '&', '&amp;'), '<', '&lt;')
        || ' is booked with you <strong>tomorrow</strong>.</p>'
        || '<p><strong>Job:</strong> ' || replace(replace(label, '&', '&amp;'), '<', '&lt;')
        || '<br/><strong>When:</strong> ' || replace(replace(when_label, '&', '&amp;'), '<', '&lt;')
        || CASE WHEN site <> '' THEN '<br/><strong>Site:</strong> ' || replace(replace(site, '&', '&amp;'), '<', '&lt;') ELSE '' END
        || '</p>'
        || '<p>Need to reschedule? Reply to this email — the job and date are already filled in. '
        || 'The office will update <a href="https://bts-inspect.pages.dev/jobs/'
        || job.id::text || '#job-schedule">the job schedule</a>.</p>'
        || '</div>';

      payload := jsonb_build_object(
        'from', settings.from_name || ' <' || settings.from_email || '>',
        'to', jsonb_build_array(to_email),
        'reply_to', settings.from_email,
        'subject', 'Reminder: ' || label || ' is booked for tomorrow',
        'html', html
      )::text;

      sent_ok := false;
      BEGIN
        resp := http((
          'POST',
          'https://api.resend.com/emails',
          ARRAY[http_header('Authorization', 'Bearer ' || settings.smtp_pass)],
          'application/json',
          payload
        )::http_request);
        sent_ok := resp.status >= 200 AND resp.status < 300;
      EXCEPTION
        WHEN OTHERS THEN
          sent_ok := false;
      END;

      IF sent_ok THEN
        UPDATE jobs
        SET client_reminder_sent_at = now(),
            client_reminder_sent_for_date = job.scheduled_date,
            updated_at = now()
        WHERE id = job.id
          AND company_id = settings.company_id;
        out_company_id := settings.company_id;
        out_job_id := job.id;
        out_sent := true;
        out_reason := 'sent';
        RETURN NEXT;
      ELSE
        out_company_id := settings.company_id;
        out_job_id := job.id;
        out_sent := false;
        out_reason := 'send_failed';
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.send_due_job_client_reminders() IS
  'pg_cron auto-fire: Perth-tomorrow open jobs with client email, via email_settings + Resend. No user JWT.';

REVOKE ALL ON FUNCTION public.send_due_job_client_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_due_job_client_reminders() FROM anon, authenticated;

-- Existing cron jobs called invoke_*; make that a thin wrapper so they actually send.
CREATE OR REPLACE FUNCTION public.invoke_job_client_reminders()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.send_due_job_client_reminders();
  RETURN 0;
END;
$$;

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

SELECT cron.schedule(
  'job-client-reminder-perth-morning',
  '0 23 * * *',
  $$SELECT public.send_due_job_client_reminders()$$
);

SELECT cron.schedule(
  'job-client-reminder-perth-afternoon',
  '0 8 * * *',
  $$SELECT public.send_due_job_client_reminders()$$
);
