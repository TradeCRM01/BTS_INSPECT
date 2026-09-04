-- Member tickets / accreditations on the existing team person sheet.
-- Company-scoped, RLS, attached to the profile. File rides uploaded-pdfs
-- (same family as reports uploads). Reminders ride job-reminder due=tickets
-- on the existing Perth invoke — not a new notify product.

CREATE TABLE IF NOT EXISTS public.member_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  ticket_number text,
  expires_on date,
  notes text,
  storage_bucket text NOT NULL DEFAULT 'uploaded-pdfs'
    CHECK (storage_bucket IN ('uploaded-pdfs', 'reports')),
  storage_path text,
  file_name text,
  reminder_sent_at timestamptz,
  reminder_sent_for_date date,
  reminder_kind text
    CHECK (reminder_kind IS NULL OR reminder_kind IN ('due_soon', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_tickets_company_member
  ON public.member_tickets (company_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_member_tickets_company_expiry
  ON public.member_tickets (company_id, expires_on);

ALTER TABLE public.member_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view member tickets" ON public.member_tickets;
CREATE POLICY "Company members can view member tickets"
  ON public.member_tickets FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert member tickets" ON public.member_tickets;
CREATE POLICY "Company members can insert member tickets"
  ON public.member_tickets FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update member tickets" ON public.member_tickets;
CREATE POLICY "Company members can update member tickets"
  ON public.member_tickets FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete member tickets" ON public.member_tickets;
CREATE POLICY "Company members can delete member tickets"
  ON public.member_tickets FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

REVOKE ALL ON public.member_tickets FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_tickets TO authenticated;
GRANT ALL ON public.member_tickets TO service_role;

-- Same uploaded-pdfs bucket as reports uploads. 023 is PDF + octet-stream;
-- tickets are a PDF or a photo, so keep those PDFs and add TICKET_OK_TYPES images.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/x-pdf',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]
WHERE id = 'uploaded-pdfs';

-- Thin due=tickets hop on the existing Perth invoke.
-- Same cron names and times. No new cron stack or notify product.
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

  -- Member tickets due soon / expired — same edge, due=tickets. Not a new cron job.
  SELECT net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/job-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || auth_key,
      'apikey', coalesce(api_key, auth_key),
      'x-job-reminder-cron', auth_key
    ),
    body := '{"due":"tickets","source":"cron"}'::jsonb,
    timeout_milliseconds := 60000
  ) INTO request_id;

  RETURN request_id;
END;
$$;

COMMENT ON FUNCTION public.invoke_job_client_reminders() IS
  'pg_cron Perth auto-fire: pg_net POST job-reminder due=tomorrow (jobs), due=today (inspections), due=contract (service visits), due=overdue (unchased invoices), and due=tickets (member tickets due soon or expired). SMS rides the edge beside email.';

REVOKE ALL ON FUNCTION public.invoke_job_client_reminders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_job_client_reminders() FROM anon, authenticated;
