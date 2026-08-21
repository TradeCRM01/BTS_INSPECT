-- Auto-fire inspection due reminders on the PR #18 Perth cron — no new module.
-- The product is send_due_inspection_reminders(), called by the existing
-- job-client-reminder-perth-morning / afternoon jobs. No tray click. No Vault.
-- Scoped: email_settings (Resend ready) → company + due_on = Perth today.

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DROP FUNCTION IF EXISTS public.send_due_inspection_reminders();
DROP FUNCTION IF EXISTS public.send_due_inspection_reminders(uuid, uuid);

CREATE OR REPLACE FUNCTION public.send_due_inspection_reminders(
  p_company_id uuid DEFAULT NULL,
  p_inspection_id uuid DEFAULT NULL
)
RETURNS TABLE(out_company_id uuid, out_inspection_id uuid, out_sent boolean, out_reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  perth_today date;
  settings record;
  insp record;
  company_row record;
  to_email text;
  greeting text;
  label text;
  when_label text;
  site text;
  company_name text;
  html text;
  payload text;
  resp http_response;
  sent_ok boolean;
  job_day date;
  due_day date;
  job_client_id uuid;
  job_number int;
  job_address text;
  client_email text;
  client_name text;
  client_person text;
  ready_settings int;
  auto_run boolean;
  saw_inspection boolean := false;
BEGIN
  perth_today := (timezone('Australia/Perth', now()))::date;
  auto_run := (p_inspection_id IS NULL);

  SELECT count(*) INTO ready_settings
  FROM email_settings es
  WHERE es.smtp_host ILIKE '%resend%'
    AND coalesce(btrim(es.smtp_pass), '') <> ''
    AND coalesce(btrim(es.from_email), '') <> ''
    AND (p_company_id IS NULL OR es.company_id = p_company_id);

  IF ready_settings = 0 THEN
    IF p_inspection_id IS NOT NULL THEN
      out_company_id := p_company_id;
      out_inspection_id := p_inspection_id;
      out_sent := false;
      out_reason := 'no_smtp';
      RETURN NEXT;
    END IF;
    RETURN;
  END IF;

  FOR settings IN
    SELECT es.company_id, es.smtp_host, es.smtp_pass, es.from_name, es.from_email
    FROM email_settings es
    WHERE es.smtp_host ILIKE '%resend%'
      AND coalesce(btrim(es.smtp_pass), '') <> ''
      AND coalesce(btrim(es.from_email), '') <> ''
      AND (p_company_id IS NULL OR es.company_id = p_company_id)
  LOOP
    SELECT c.name, c.phone INTO company_row
    FROM companies c
    WHERE c.id = settings.company_id;

    company_name := coalesce(nullif(btrim(company_row.name), ''), 'us');

    FOR insp IN
      SELECT i.id, i.inspector_id, i.client_id, i.crm_job_id, i.status, i.archived,
             i.meta, i.responses, i.template_snapshot, i.due_on,
             i.due_reminder_sent_at, i.due_reminder_sent_for_date
      FROM inspections i
      WHERE coalesce(i.archived, false) = false
        AND (p_inspection_id IS NULL OR i.id = p_inspection_id)
        AND (
          auto_run AND i.due_on = perth_today
          OR (NOT auto_run)
        )
        AND (
          EXISTS (
            SELECT 1 FROM jobs j
            WHERE j.id = i.crm_job_id
              AND j.company_id = settings.company_id
          )
          OR EXISTS (
            SELECT 1 FROM clients cl
            WHERE cl.id = i.client_id
              AND cl.company_id = settings.company_id
          )
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = i.inspector_id
              AND p.company_id = settings.company_id
          )
        )
    LOOP
      saw_inspection := true;
      job_day := NULL;
      job_client_id := NULL;
      job_number := NULL;
      job_address := NULL;
      IF insp.crm_job_id IS NOT NULL THEN
        SELECT j.scheduled_date, j.client_id, j.job_number, j.address
        INTO job_day, job_client_id, job_number, job_address
        FROM jobs j
        WHERE j.id = insp.crm_job_id
          AND j.company_id = settings.company_id;
      END IF;

      due_day := coalesce(
        insp.due_on,
        public.inspection_resolve_due_on(
          insp.template_snapshot, insp.meta, insp.responses, insp.status, job_day
        )
      );

      IF due_day IS NULL THEN
        out_company_id := settings.company_id;
        out_inspection_id := insp.id;
        out_sent := false;
        out_reason := 'no_due_date';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF auto_run AND due_day <> perth_today THEN
        out_company_id := settings.company_id;
        out_inspection_id := insp.id;
        out_sent := false;
        out_reason := 'not_due';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF (NOT auto_run) AND due_day > perth_today THEN
        out_company_id := settings.company_id;
        out_inspection_id := insp.id;
        out_sent := false;
        out_reason := 'not_due';
        RETURN NEXT;
        CONTINUE;
      END IF;

      IF auto_run
         AND insp.due_reminder_sent_at IS NOT NULL
         AND (
           insp.due_reminder_sent_for_date IS NULL
           OR insp.due_reminder_sent_for_date = due_day
         ) THEN
        out_company_id := settings.company_id;
        out_inspection_id := insp.id;
        out_sent := false;
        out_reason := 'already_sent';
        RETURN NEXT;
        CONTINUE;
      END IF;

      to_email := NULL;
      greeting := 'there';
      client_email := NULL;
      client_name := NULL;
      client_person := NULL;
      IF insp.client_id IS NOT NULL THEN
        SELECT cl.name, cl.email, cl.contact_person
        INTO client_name, client_email, client_person
        FROM clients cl
        WHERE cl.id = insp.client_id
          AND cl.company_id = settings.company_id;
      END IF;
      IF (client_email IS NULL OR btrim(client_email) = '') AND job_client_id IS NOT NULL THEN
        SELECT cl.name, cl.email, cl.contact_person
        INTO client_name, client_email, client_person
        FROM clients cl
        WHERE cl.id = job_client_id
          AND cl.company_id = settings.company_id;
      END IF;

      to_email := btrim(coalesce(client_email, ''));
      greeting := coalesce(
        nullif(btrim(client_person), ''),
        nullif(btrim(client_name), ''),
        'there'
      );

      IF to_email IS NULL OR to_email = '' OR position('@' IN to_email) = 0 THEN
        out_company_id := settings.company_id;
        out_inspection_id := insp.id;
        out_sent := false;
        out_reason := 'no_email';
        RETURN NEXT;
        CONTINUE;
      END IF;

      label := CASE
        WHEN job_number IS NOT NULL THEN
          '#' || lpad(job_number::text, 4, '0') || ' '
          || coalesce(insp.template_snapshot->>'name', 'Inspection')
        ELSE coalesce(insp.template_snapshot->>'name', 'Inspection')
      END;
      when_label := to_char(due_day, 'Dy FMDD Mon YYYY');
      site := btrim(coalesce(job_address, insp.meta->>'siteAddress', insp.meta->>'siteName', ''));

      html :=
        '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">'
        || '<p>Hi ' || replace(replace(greeting, '&', '&amp;'), '<', '&lt;') || ',</p>'
        || '<p>' || replace(replace(company_name, '&', '&amp;'), '<', '&lt;')
        || ' — your <strong>' || replace(replace(label, '&', '&amp;'), '<', '&lt;')
        || '</strong> is due today.</p>'
        || '<p><strong>Inspection:</strong> ' || replace(replace(label, '&', '&amp;'), '<', '&lt;')
        || '<br/><strong>Due:</strong> ' || replace(replace(when_label, '&', '&amp;'), '<', '&lt;')
        || CASE WHEN site <> '' THEN '<br/><strong>Site:</strong> ' || replace(replace(site, '&', '&amp;'), '<', '&lt;') ELSE '' END
        || '</p>'
        || '<p>Reply to book it in — the inspection, job, and date are already filled in.</p>'
        || '</div>';

      payload := jsonb_build_object(
        'from', settings.from_name || ' <' || settings.from_email || '>',
        'to', jsonb_build_array(to_email),
        'reply_to', settings.from_email,
        'subject', 'Reminder: ' || label || ' is due today',
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
        UPDATE inspections
        SET due_reminder_sent_at = now(),
            due_reminder_sent_for_date = due_day
        WHERE id = insp.id;
        out_company_id := settings.company_id;
        out_inspection_id := insp.id;
        out_sent := true;
        out_reason := 'sent';
        RETURN NEXT;
      ELSE
        out_company_id := settings.company_id;
        out_inspection_id := insp.id;
        out_sent := false;
        out_reason := 'send_failed';
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;

  IF p_inspection_id IS NOT NULL AND NOT saw_inspection THEN
    out_company_id := p_company_id;
    out_inspection_id := p_inspection_id;
    out_sent := false;
    out_reason := 'no_inspection';
    RETURN NEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.send_due_inspection_reminders(uuid, uuid) IS
  'pg_cron auto-fire (same job-client-reminder Perth jobs as 24h ping): due inspections via email_settings + Resend. No user JWT. Optional company/inspection args are the logged-in override.';

REVOKE ALL ON FUNCTION public.send_due_inspection_reminders(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_due_inspection_reminders(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_due_inspection_reminders(uuid, uuid) TO service_role;

-- Existing wrapper now fires both products. Same cron names as PR #18.
CREATE OR REPLACE FUNCTION public.invoke_job_client_reminders()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.send_due_job_client_reminders();
  PERFORM public.send_due_inspection_reminders();
  RETURN 0;
END;
$$;

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

-- Same names and times as the 24h job ping. Both send-due functions run.
SELECT cron.schedule(
  'job-client-reminder-perth-morning',
  '0 23 * * *',
  $$SELECT public.send_due_job_client_reminders(); SELECT public.send_due_inspection_reminders();$$
);

SELECT cron.schedule(
  'job-client-reminder-perth-afternoon',
  '0 8 * * *',
  $$SELECT public.send_due_job_client_reminders(); SELECT public.send_due_inspection_reminders();$$
);
