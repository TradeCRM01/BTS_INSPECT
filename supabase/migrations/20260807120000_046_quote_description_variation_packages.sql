/*
  Quote descriptions + reusable variation packages

  - description: short summary shown on the quotes list
  - scope_of_works: detailed client-facing scope for the PDF
  - quote_variation_packages: named inclusion/exclusion sets to reuse on new quotes
*/

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS scope_of_works text;

CREATE TABLE IF NOT EXISTS quote_variation_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_variation_packages_company
  ON quote_variation_packages(company_id);

ALTER TABLE quote_variation_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view quote_variation_packages" ON quote_variation_packages;
CREATE POLICY "Company members can view quote_variation_packages"
  ON quote_variation_packages FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert quote_variation_packages" ON quote_variation_packages;
CREATE POLICY "Company members can insert quote_variation_packages"
  ON quote_variation_packages FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update quote_variation_packages" ON quote_variation_packages;
CREATE POLICY "Company members can update quote_variation_packages"
  ON quote_variation_packages FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete quote_variation_packages" ON quote_variation_packages;
CREATE POLICY "Company members can delete quote_variation_packages"
  ON quote_variation_packages FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
