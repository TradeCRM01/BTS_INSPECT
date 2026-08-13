/*
  Solar estimates (STC / ROI business cases)

  - solar_quotes: draft + completed estimates per company
  - inputs / outputs stored as JSONB for wizard resume
*/

CREATE TABLE IF NOT EXISTS solar_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Solar estimate',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'complete', 'archived')),
  current_step int NOT NULL DEFAULT 1 CHECK (current_step >= 1 AND current_step <= 6),
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  midscale_acknowledged boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solar_quotes_company ON solar_quotes (company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_solar_quotes_client ON solar_quotes (client_id);
CREATE INDEX IF NOT EXISTS idx_solar_quotes_status ON solar_quotes (company_id, status);

ALTER TABLE solar_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view solar_quotes" ON solar_quotes;
CREATE POLICY "Company members can view solar_quotes"
  ON solar_quotes FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert solar_quotes" ON solar_quotes;
CREATE POLICY "Company members can insert solar_quotes"
  ON solar_quotes FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update solar_quotes" ON solar_quotes;
CREATE POLICY "Company members can update solar_quotes"
  ON solar_quotes FOR UPDATE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete solar_quotes" ON solar_quotes;
CREATE POLICY "Company members can delete solar_quotes"
  ON solar_quotes FOR DELETE TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));
