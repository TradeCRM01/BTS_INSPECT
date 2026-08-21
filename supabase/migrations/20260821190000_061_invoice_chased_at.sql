-- Overdue invoice chase rides the existing job-reminder / company SMTP pipe.
-- chased_at lives on the existing invoices row — not a new table.
-- Written only after Resend returns 2xx. A failed send stays unchased (null).
-- Does not mark the invoice paid. SMS miss does not write it.
-- Cron skipped: wiring due=overdue through the Perth helper rewrote the
-- existing job/inspection auto-fire stack. Next action is Send again.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS chased_at timestamptz;

COMMENT ON COLUMN invoices.chased_at IS
  'When the overdue invoice last emailed successfully through job-reminder. Null means it was never chased or a send failed. Written only after Resend 2xx. Does not mark the invoice paid.';
