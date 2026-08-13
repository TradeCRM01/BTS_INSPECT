/*
  Expense cost models + quick templates

  - expense_cost_models: reusable employee cost packages (wages, super, vehicle…)
    applied to one or many employees in one click
  - expense_templates: reusable single/multi-line overhead or COGS presets
*/

CREATE TABLE IF NOT EXISTS expense_cost_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  billing_period text NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  -- [{ employee_cost_type, category, description, amount, amount_mode: fixed|percent_of_wages, tax_rate }]
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_cost_models_company
  ON expense_cost_models(company_id);

ALTER TABLE expense_cost_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view expense_cost_models" ON expense_cost_models;
CREATE POLICY "Company members can view expense_cost_models"
  ON expense_cost_models FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert expense_cost_models" ON expense_cost_models;
CREATE POLICY "Company members can insert expense_cost_models"
  ON expense_cost_models FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update expense_cost_models" ON expense_cost_models;
CREATE POLICY "Company members can update expense_cost_models"
  ON expense_cost_models FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete expense_cost_models" ON expense_cost_models;
CREATE POLICY "Company members can delete expense_cost_models"
  ON expense_cost_models FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE TABLE IF NOT EXISTS expense_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- one or more lines to post when applying the template
  -- [{ cost_class, category, description, amount, tax_rate, vendor_name, recurrence, payment_method }]
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_templates_company
  ON expense_templates(company_id);

ALTER TABLE expense_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view expense_templates" ON expense_templates;
CREATE POLICY "Company members can view expense_templates"
  ON expense_templates FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert expense_templates" ON expense_templates;
CREATE POLICY "Company members can insert expense_templates"
  ON expense_templates FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update expense_templates" ON expense_templates;
CREATE POLICY "Company members can update expense_templates"
  ON expense_templates FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete expense_templates" ON expense_templates;
CREATE POLICY "Company members can delete expense_templates"
  ON expense_templates FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
