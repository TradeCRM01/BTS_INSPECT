/*
  # AI Settings Table

  ## Summary
  Stores per-company AI configuration including the Anthropic API key (stored
  as plain text, protected by RLS so only admins of the company can read/write
  it) and model/feature preferences.

  ## New Tables
  - `ai_settings`
    - `id` (uuid, primary key)
    - `company_id` (uuid, FK → companies, unique — one row per company)
    - `anthropic_api_key` (text, nullable — the Anthropic secret key)
    - `model` (text, default 'claude-opus-4-7')
    - `admin_tools_enabled` (boolean, default true — whether admin tool use is on)
    - `created_at` / `updated_at` (timestamps)

  ## Security
  - RLS enabled
  - Only authenticated admins of the owning company can SELECT/INSERT/UPDATE
  - No DELETE policy — rows are upserted, not deleted
*/

CREATE TABLE IF NOT EXISTS ai_settings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  anthropic_api_key text DEFAULT '',
  model         text NOT NULL DEFAULT 'claude-opus-4-7',
  admin_tools_enabled boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_settings_company_id_unique UNIQUE (company_id)
);

ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;

-- Only admins of the company can read their own AI settings
CREATE POLICY "Admins can read own company ai_settings"
  ON ai_settings FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins of the company can insert
CREATE POLICY "Admins can insert own company ai_settings"
  ON ai_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins of the company can update
CREATE POLICY "Admins can update own company ai_settings"
  ON ai_settings FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
