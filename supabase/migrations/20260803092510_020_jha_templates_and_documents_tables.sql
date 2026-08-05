/*
# JHA Templates and Documents Tables

## New Tables

### `jha_templates`
- id (uuid PK)
- company_id (uuid FK → companies)
- created_by (uuid FK → profiles)
- name (text, not null)
- description (text)
- schema (jsonb, default empty structure)
- version (int, default 1)
- archived (boolean, default false)
- created_at, updated_at (timestamptz)

### `jha_documents`
- id (uuid PK)
- template_id (uuid FK → jha_templates)
- template_snapshot (jsonb, not null)
- company_id (uuid FK → companies)
- created_by (uuid FK → profiles)
- status (text, default 'draft')
- meta (jsonb, default '{}')
- steps (jsonb, default '[]')
- ppe (jsonb, default '[]')
- sign_offs (jsonb, default '[]')
- report_number (text, unique)
- pdf_storage_path (text)
- created_at, completed_at (timestamptz)

## Security
- RLS enabled on both tables.
- 4 policies each (SELECT/INSERT/UPDATE/DELETE), company-scoped via profiles join.
- Matches existing templates table RLS pattern.
*/

CREATE TABLE IF NOT EXISTS jha_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  schema jsonb NOT NULL DEFAULT '{"meta":{"requiresTaskName":true,"requiresSiteName":true,"requiresDate":true,"requiresSupervisor":false,"requiresPermitNumber":false,"customFields":[]},"riskLevels":[{"id":"low","label":"Low","color":"#166534","score":1},{"id":"medium","label":"Medium","color":"#92400E","score":2},{"id":"high","label":"High","color":"#B91C1C","score":3}],"ppeOptions":[],"signOffRoles":[]}'::jsonb,
  version int NOT NULL DEFAULT 1,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jha_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_jha_templates" ON jha_templates;
CREATE POLICY "select_jha_templates" ON jha_templates FOR SELECT
  TO authenticated USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_jha_templates" ON jha_templates;
CREATE POLICY "insert_jha_templates" ON jha_templates FOR INSERT
  TO authenticated WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "update_jha_templates" ON jha_templates;
CREATE POLICY "update_jha_templates" ON jha_templates FOR UPDATE
  TO authenticated USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ) WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_jha_templates" ON jha_templates;
CREATE POLICY "delete_jha_templates" ON jha_templates FOR DELETE
  TO authenticated USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS jha_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES jha_templates(id) ON DELETE CASCADE,
  template_snapshot jsonb NOT NULL,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ppe jsonb NOT NULL DEFAULT '[]'::jsonb,
  sign_offs jsonb NOT NULL DEFAULT '[]'::jsonb,
  report_number text UNIQUE,
  pdf_storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE jha_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_jha_documents" ON jha_documents;
CREATE POLICY "select_jha_documents" ON jha_documents FOR SELECT
  TO authenticated USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_jha_documents" ON jha_documents;
CREATE POLICY "insert_jha_documents" ON jha_documents FOR INSERT
  TO authenticated WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "update_jha_documents" ON jha_documents;
CREATE POLICY "update_jha_documents" ON jha_documents FOR UPDATE
  TO authenticated USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  ) WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_jha_documents" ON jha_documents;
CREATE POLICY "delete_jha_documents" ON jha_documents FOR DELETE
  TO authenticated USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_jha_templates_company ON jha_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_jha_documents_company ON jha_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_jha_documents_template ON jha_documents(template_id);