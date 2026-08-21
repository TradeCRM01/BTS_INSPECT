-- 24h pre-job client reminder. Sent only via existing email_settings + Resend.
-- client_reminder_sent_at is written only after a successful send.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS client_reminder_sent_at timestamptz;

COMMENT ON COLUMN jobs.client_reminder_sent_at IS
  'When the 24h pre-job client reminder last sent successfully. Null means it was never sent or a send failed.';

CREATE INDEX IF NOT EXISTS idx_jobs_company_scheduled_date
  ON jobs (company_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;
