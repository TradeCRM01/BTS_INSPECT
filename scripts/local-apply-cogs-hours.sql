-- LOCAL SANDBOX ONLY (127.0.0.1:55322).
-- Not a production migration. Never apply to ezszahv / grafter.com.au.
-- Creates expenses + staff_hours if missing, then seeds idempotent fixtures.
-- Least privilege: authenticated + service_role only. anon and PUBLIC get no DML.

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_number int,
  cost_class text NOT NULL DEFAULT 'overhead'
    CHECK (cost_class IN ('overhead', 'cogs', 'employee')),
  category text NOT NULL,
  employee_cost_type text
    CHECK (employee_cost_type IS NULL OR employee_cost_type IN (
      'wages', 'super', 'allowance', 'reimbursement', 'vehicle', 'tools', 'training', 'other'
    )),
  description text NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(8,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  period_start date,
  period_end date,
  vendor_name text,
  supplier_id uuid,
  employee_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  payment_method text
    CHECK (payment_method IS NULL OR payment_method IN (
      'cash', 'card', 'bank_transfer', 'direct_debit', 'cheque', 'other'
    )),
  reference text,
  is_reimbursable boolean NOT NULL DEFAULT false,
  reimbursed boolean NOT NULL DEFAULT false,
  recurrence text NOT NULL DEFAULT 'one_off'
    CHECK (recurrence IN ('one_off', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  status text NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('draft', 'recorded', 'paid', 'void')),
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_company_id ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_job_id ON expenses(job_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(company_id, status);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view expenses" ON expenses;
CREATE POLICY "Company members can view expenses"
  ON expenses FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert expenses" ON expenses;
CREATE POLICY "Company members can insert expenses"
  ON expenses FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update expenses" ON expenses;
CREATE POLICY "Company members can update expenses"
  ON expenses FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS staff_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date date NOT NULL,
  working boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_hours_reason_len CHECK (reason IS NULL OR char_length(reason) <= 200),
  CONSTRAINT staff_hours_hours_shape CHECK (
    (working = false AND start_time IS NULL AND end_time IS NULL)
    OR (working = true AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  ),
  CONSTRAINT staff_hours_member_date UNIQUE (company_id, member_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_hours_company_date ON staff_hours (company_id, date);

ALTER TABLE staff_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view staff hours" ON staff_hours;
CREATE POLICY "Company members can view staff hours"
  ON staff_hours FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert staff hours" ON staff_hours;
CREATE POLICY "Company members can insert staff hours"
  ON staff_hours FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update staff hours" ON staff_hours;
CREATE POLICY "Company members can update staff hours"
  ON staff_hours FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

REVOKE ALL ON TABLE expenses FROM PUBLIC;
REVOKE ALL ON TABLE expenses FROM anon;
REVOKE ALL ON TABLE staff_hours FROM PUBLIC;
REVOKE ALL ON TABLE staff_hours FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expenses TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE staff_hours TO authenticated, service_role;

INSERT INTO expenses (
  company_id, cost_class, category, description, amount, tax_rate, tax_amount, total,
  expense_date, job_id, status, created_by
)
SELECT
  c.id,
  'cogs',
  'Materials (non-job)',
  'LOCAL FIXTURE — COGS on job (do not copy to production)',
  88.00,
  10,
  8.80,
  96.80,
  CURRENT_DATE,
  j.id,
  'recorded',
  p.id
FROM companies c
JOIN jobs j ON j.company_id = c.id
JOIN profiles p ON p.company_id = c.id
WHERE j.title ILIKE '%boarded%'
  AND NOT EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.description = 'LOCAL FIXTURE — COGS on job (do not copy to production)'
  )
ORDER BY j.created_at DESC NULLS LAST
LIMIT 1;

INSERT INTO staff_hours (company_id, member_id, date, working, start_time, end_time, reason)
SELECT
  p.company_id,
  p.id,
  CURRENT_DATE,
  true,
  '07:00',
  '16:00',
  'LOCAL FIXTURE — dated hours'
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM staff_hours h
  WHERE h.member_id = p.id AND h.date = CURRENT_DATE
)
LIMIT 1;
