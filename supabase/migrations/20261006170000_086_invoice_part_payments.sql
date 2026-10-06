-- MONEY-4: part payments — live-safe (CoS apply only; do not run from agents).
-- Live may have: invoices.amount_paid, status check draft|sent|paid|void, legacy invoice_payments (organisation_id, paid_on).

ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'part_paid', 'void'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

UPDATE invoices
SET amount_paid = total
WHERE status = 'paid' AND COALESCE(amount_paid, 0) = 0;

-- Legacy table → rename, then port rows into MONEY-4 shape.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_payments' AND column_name = 'organisation_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_payments' AND column_name = 'company_id'
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_payments_legacy_pre_money4') THEN
    INSERT INTO invoice_payments (company_id, invoice_id, amount, paid_at, method, reference, created_at)
    SELECT
      l.organisation_id AS company_id,
      l.invoice_id,
      l.amount,
      COALESCE(l.paid_on::date, (l.created_at AT TIME ZONE 'Australia/Perth')::date),
      CASE lower(COALESCE(l.method, ''))
        WHEN 'cash' THEN 'cash'
        WHEN 'card' THEN 'card'
        WHEN 'credit_card' THEN 'card'
        WHEN 'eft' THEN 'bank'
        WHEN 'bank' THEN 'bank'
        WHEN 'bank_transfer' THEN 'bank'
        ELSE 'other'
      END,
      NULLIF(trim(l.reference), ''),
      COALESCE(l.created_at, now())
    FROM invoice_payments_legacy_pre_money4 l
    WHERE l.invoice_id IS NOT NULL
      AND l.amount > 0
      AND NOT EXISTS (
        SELECT 1 FROM invoice_payments p
        WHERE p.invoice_id = l.invoice_id
          AND p.amount = l.amount
          AND p.paid_at = COALESCE(l.paid_on::date, (l.created_at AT TIME ZONE 'Australia/Perth')::date)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_payments'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_payments' AND column_name = 'company_id'
  ) THEN
    RAISE EXCEPTION 'invoice_payments exists but is not MONEY-4 shape — fix legacy port before re-running 086';
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

DROP POLICY IF EXISTS "Company members can delete invoice payments" ON invoice_payments;
CREATE POLICY "Company members can delete invoice payments"
  ON invoice_payments FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_at date,
  p_method text,
  p_reference text DEFAULT NULL
)
RETURNS invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_inv invoices%ROWTYPE;
  v_balance numeric;
  v_apply numeric;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  SELECT company_id INTO v_company_id FROM profiles WHERE id = auth.uid();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice_id AND company_id = v_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  v_balance := GREATEST(0, COALESCE(v_inv.total, 0) - COALESCE(v_inv.amount_paid, 0));
  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'Payment exceeds balance owing (%).', v_balance;
  END IF;

  v_apply := round(p_amount::numeric, 2);
  v_new_paid := round(COALESCE(v_inv.amount_paid, 0) + v_apply, 2);

  IF v_new_paid >= COALESCE(v_inv.total, 0) AND COALESCE(v_inv.total, 0) > 0 THEN
    v_new_status := 'paid';
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'part_paid';
  ELSE
    v_new_status := v_inv.status;
  END IF;

  INSERT INTO invoice_payments (company_id, invoice_id, amount, paid_at, method, reference)
  VALUES (v_company_id, p_invoice_id, v_apply, p_paid_at, p_method, NULLIF(trim(p_reference), ''));

  UPDATE invoices
  SET amount_paid = v_new_paid, status = v_new_status, updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$$;

CREATE OR REPLACE FUNCTION remove_invoice_payment(p_payment_id uuid)
RETURNS invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_pay invoice_payments%ROWTYPE;
  v_inv invoices%ROWTYPE;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  SELECT company_id INTO v_company_id FROM profiles WHERE id = auth.uid();
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company';
  END IF;

  SELECT * INTO v_pay FROM invoice_payments WHERE id = p_payment_id AND company_id = v_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT * INTO v_inv FROM invoices WHERE id = v_pay.invoice_id AND company_id = v_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  DELETE FROM invoice_payments WHERE id = p_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_new_paid FROM invoice_payments WHERE invoice_id = v_inv.id;
  v_new_paid := round(v_new_paid, 2);

  IF v_new_paid >= COALESCE(v_inv.total, 0) AND COALESCE(v_inv.total, 0) > 0 THEN
    v_new_status := 'paid';
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'part_paid';
  ELSIF v_inv.status IN ('void', 'draft') THEN
    v_new_status := v_inv.status;
  ELSE
    v_new_status := 'sent';
  END IF;

  UPDATE invoices
  SET amount_paid = v_new_paid, status = v_new_status, updated_at = now()
  WHERE id = v_inv.id
  RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$$;

GRANT EXECUTE ON FUNCTION record_invoice_payment(uuid, numeric, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_invoice_payment(uuid) TO authenticated;
