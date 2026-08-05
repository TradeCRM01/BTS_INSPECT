/*
  # BTS Inspect — Templates, Inspections, Photos, Reports

  1. New Tables
    - `templates`: Inspection templates with JSON schema and report renderer
    - `inspections`: Individual inspection instances with status and responses
    - `photos`: Photos linked to inspection questions
    - `reports`: Generated PDF reports with report numbers

  2. Security
    - RLS enabled on all tables
    - All access scoped to company membership via profiles
*/

-- Templates
CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  created_by uuid NOT NULL REFERENCES profiles(id),
  name text NOT NULL,
  description text,
  report_renderer text NOT NULL DEFAULT 'generic_inspection',
  schema jsonb NOT NULL DEFAULT '{"meta":{"requiresSiteName":true,"requiresSiteAddress":true,"requiresClientName":true,"requiresJobNumber":false},"sections":[]}',
  version int NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view templates"
  ON templates FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company members can insert templates"
  ON templates FOR INSERT
  TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company members can update templates"
  ON templates FOR UPDATE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Company members can delete templates"
  ON templates FOR DELETE
  TO authenticated
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Inspections
CREATE TABLE IF NOT EXISTS inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id),
  template_snapshot jsonb NOT NULL,
  inspector_id uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'draft',
  responses jsonb NOT NULL DEFAULT '{}',
  meta jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    inspector_id IN (
      SELECT p.id FROM profiles p
      WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Inspectors can insert inspections"
  ON inspections FOR INSERT
  TO authenticated
  WITH CHECK (inspector_id = auth.uid());

CREATE POLICY "Company members can update inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    inspector_id IN (
      SELECT p.id FROM profiles p
      WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    inspector_id IN (
      SELECT p.id FROM profiles p
      WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Photos
CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  instance_id text,
  storage_path text NOT NULL,
  caption text,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view photos"
  ON photos FOR SELECT
  TO authenticated
  USING (
    inspection_id IN (
      SELECT i.id FROM inspections i
      JOIN profiles p ON p.id = i.inspector_id
      WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Company members can insert photos"
  ON photos FOR INSERT
  TO authenticated
  WITH CHECK (
    inspection_id IN (
      SELECT i.id FROM inspections i
      JOIN profiles p ON p.id = i.inspector_id
      WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Company members can delete photos"
  ON photos FOR DELETE
  TO authenticated
  USING (
    inspection_id IN (
      SELECT i.id FROM inspections i
      JOIN profiles p ON p.id = i.inspector_id
      WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Reports
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id),
  report_number text UNIQUE NOT NULL,
  pdf_storage_path text NOT NULL,
  generated_at timestamptz DEFAULT now()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view reports"
  ON reports FOR SELECT
  TO authenticated
  USING (
    inspection_id IN (
      SELECT i.id FROM inspections i
      JOIN profiles p ON p.id = i.inspector_id
      WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Company members can insert reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (
    inspection_id IN (
      SELECT i.id FROM inspections i
      JOIN profiles p ON p.id = i.inspector_id
      WHERE p.company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );
