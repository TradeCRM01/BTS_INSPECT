/*
  Business & employee expenses + P&L building blocks

  - expenses: detailed cost ledger (overhead / COGS / employee)
  - expense_categories managed list
  - sequential expense_number per company
*/

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_number int,
  -- P&L bucket
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
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
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
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(company_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_cost_class ON expenses(company_id, cost_class);
CREATE INDEX IF NOT EXISTS idx_expenses_employee_id ON expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_expenses_job_id ON expenses(job_id);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(company_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_number ON expenses(company_id, expense_number);

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

DROP POLICY IF EXISTS "Company members can delete expenses" ON expenses;
CREATE POLICY "Company members can delete expenses"
  ON expenses FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION set_expense_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.expense_number IS NULL THEN
    SELECT COALESCE(MAX(expense_number), 0) + 1
    INTO NEW.expense_number
    FROM expenses
    WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_expense_number ON expenses;
CREATE TRIGGER trg_set_expense_number
  BEFORE INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_expense_number();

-- Managed list: expense categories
CREATE OR REPLACE FUNCTION seed_company_list_definitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO list_definitions (company_id, key, label)
  SELECT NEW.id, k.key, k.label
  FROM (VALUES
    ('storage_locations', 'Storage Locations'),
    ('work_types', 'Work Types'),
    ('stock_categories', 'Stock Categories'),
    ('asset_categories', 'Asset Categories'),
    ('units_of_measure', 'Units of Measure'),
    ('price_book_categories', 'Price Book Categories'),
    ('charge_types', 'Charge Types'),
    ('document_inclusions', 'Quote Inclusions'),
    ('document_exclusions', 'Quote Exclusions'),
    ('expense_categories', 'Expense Categories')
  ) AS k(key, label)
  WHERE NOT EXISTS (
    SELECT 1 FROM list_definitions ld
    WHERE ld.company_id = NEW.id AND ld.key = k.key
  );
  RETURN NEW;
END;
$$;

INSERT INTO list_definitions (company_id, key, label)
SELECT c.id, 'expense_categories', 'Expense Categories'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM list_definitions ld
  WHERE ld.company_id = c.id AND ld.key = 'expense_categories'
);

INSERT INTO list_items (company_id, list_definition_id, value, label, sort_order)
SELECT ld.company_id, ld.id, v.value, v.label, v.sort_order
FROM list_definitions ld
CROSS JOIN (VALUES
  ('Rent / Lease', 'Rent / Lease', 10),
  ('Insurance', 'Insurance', 20),
  ('Utilities', 'Utilities', 30),
  ('Vehicles & Fuel', 'Vehicles & Fuel', 40),
  ('Tools & Equipment', 'Tools & Equipment', 50),
  ('Software & Subscriptions', 'Software & Subscriptions', 60),
  ('Marketing & Advertising', 'Marketing & Advertising', 70),
  ('Office & Admin', 'Office & Admin', 80),
  ('Professional Fees', 'Professional Fees', 90),
  ('Training & Licences', 'Training & Licences', 100),
  ('Subcontractors', 'Subcontractors', 110),
  ('Materials (non-job)', 'Materials (non-job)', 120),
  ('Wages & Salaries', 'Wages & Salaries', 130),
  ('Superannuation', 'Superannuation', 140),
  ('Employee Allowances', 'Employee Allowances', 150),
  ('Employee Reimbursements', 'Employee Reimbursements', 160),
  ('Bank Fees & Interest', 'Bank Fees & Interest', 170),
  ('Other', 'Other', 180)
) AS v(value, label, sort_order)
WHERE ld.key = 'expense_categories'
  AND NOT EXISTS (
    SELECT 1 FROM list_items li
    WHERE li.list_definition_id = ld.id AND li.value = v.value
  );
