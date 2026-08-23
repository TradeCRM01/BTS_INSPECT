-- Sent markers for the contract visit reminder. Written only after Resend 2xx.

ALTER TABLE service_contracts
  ADD COLUMN IF NOT EXISTS service_reminder_sent_at timestamptz;

ALTER TABLE service_contracts
  ADD COLUMN IF NOT EXISTS service_reminder_sent_for_date date;

COMMENT ON COLUMN service_contracts.service_reminder_sent_at IS
  'When the contract visit reminder last sent successfully. Null means it was never sent or a send failed.';

COMMENT ON COLUMN service_contracts.service_reminder_sent_for_date IS
  'next_service_date the last successful visit reminder was sent for. A later date change may send again.';

CREATE INDEX IF NOT EXISTS idx_service_contracts_next_service_date
  ON service_contracts (company_id, next_service_date)
  WHERE next_service_date IS NOT NULL AND status = 'active';
