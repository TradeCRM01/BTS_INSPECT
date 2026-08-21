-- Inspection report Send rides the existing job-reminder / company SMTP pipe.
-- sent_at lives on the existing reports row — not a new table.
-- Written only after Resend returns 2xx. A failed send stays unsent (null).

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS sent_at timestamptz;

COMMENT ON COLUMN reports.sent_at IS
  'When the inspection report last emailed successfully through job-reminder. Null means it was never sent or a send failed.';
