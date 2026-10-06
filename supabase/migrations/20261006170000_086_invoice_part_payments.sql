-- MONEY-4: part payments on invoices (amount_paid + payment rows).
--
-- Live-safe apply notes (CoS — do not run from this agent):
-- - Live may already have invoices.amount_paid and status check draft|sent|paid|void (no part_paid).
-- - Live may already have a legacy invoice_payments (organisation_id, paid_on) — CREATE IF NOT EXISTS would no-op.
-- This migration: preserves void on invoices; renames legacy invoice_payments before creating the MONEY-4 table.

-- ── invoices.status + amount_paid ─────────────────────────────────
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'part_paid', 'void'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

UPDATE invoices
SET amount_paid = total
WHERE status = 'paid' AND COALESCE(amount_paid, 0) = 0;

-- ── invoice_payments (MONEY-4 shape) ───────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_payments'
      AND column_name = 'organisation_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoice_payments'
      AND column_name = 'company_id'
  ) THEN
    ALTER TABLE invoice_payments RENAME TO invoice_payments_legacy_pre_money4;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'card', 'bank', 'other')),
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- If an old invoice_payments existed without MONEY-4 columns but was not renamed (edge case), bail with a clear error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'invoice_payments'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_payments' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'invoice_payments exists but is not the MONEY-4 shape — rename or migrate legacy rows before re-running 086';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_company_id ON invoice_payments(company_id);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view invoice payments" ON invoice_payments;
CREATE POLICY "Company members can view invoice payments"
  ON invoice_payments FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert invoice payments" ON invoice_payments;
CREATE POLICY "Company members can insert invoice payments"
  ON invoice_payments FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
