-- Company ways to pay, shown on invoices. Not Xero. Not expense payment_method.
-- Empty array means the invoice stays as it is today (terms only).

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN companies.payment_methods IS
  'Company ways clients can pay. Printed on invoices. Array of {id, kind, label, account_name, bsb, account_number, payid, notes}. kind is bank_transfer | payid | other.';
