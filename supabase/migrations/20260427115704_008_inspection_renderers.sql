/*
  # Inspection Renderers - Custom Report Types

  1. New Tables
    - `inspection_renderers`
      - `id` (uuid, primary key)
      - `company_id` (uuid, foreign key to companies)
      - `key` (text, unique per company) - slug identifier like "generic_inspection"
      - `label` (text) - display name like "Generic Inspection"
      - `built_in` (boolean) - true for system renderers, false for custom
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `inspection_renderers` table
    - Add policy for company members to view their company's renderers
    - Add policy for company admins to manage renderers

  3. Notes
    - Custom renderers use the generic_inspection renderer backend for now
    - Built-in renderers (generic_inspection, electrical_3000) cannot be deleted
*/

CREATE TABLE IF NOT EXISTS inspection_renderers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  built_in boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, key)
);

ALTER TABLE inspection_renderers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view renderers"
  ON inspection_renderers FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE profiles.id = auth.uid()
    )
  );

CREATE POLICY "Company admins can insert renderers"
  ON inspection_renderers FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE profiles.id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Company admins can update renderers"
  ON inspection_renderers FOR UPDATE
  TO authenticated
  USING (
    built_in = false AND company_id IN (
      SELECT company_id FROM profiles
      WHERE profiles.id = auth.uid()
      AND role = 'admin'
    )
  )
  WITH CHECK (
    built_in = false AND company_id IN (
      SELECT company_id FROM profiles
      WHERE profiles.id = auth.uid()
      AND role = 'admin'
    )
  );

CREATE POLICY "Company admins can delete renderers"
  ON inspection_renderers FOR DELETE
  TO authenticated
  USING (
    built_in = false AND company_id IN (
      SELECT company_id FROM profiles
      WHERE profiles.id = auth.uid()
      AND role = 'admin'
    )
  );
