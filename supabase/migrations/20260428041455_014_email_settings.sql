/*
  # Email Settings Table

  ## Purpose
  Stores custom SMTP configuration per company so the app can send
  invitation emails via the company's own email provider instead of
  relying on Supabase's heavily rate-limited default sender.

  ## New Tables
  - `email_settings`
    - `id` (uuid, pk)
    - `company_id` (uuid, fk → companies, unique — one row per company)
    - `smtp_host` (text) — e.g. smtp.resend.com
    - `smtp_port` (int) — typically 465 or 587
    - `smtp_secure` (bool) — true = TLS/SSL, false = STARTTLS
    - `smtp_user` (text) — SMTP username / login
    - `smtp_pass` (text) — SMTP password / API key
    - `from_name` (text) — display name in From header
    - `from_email` (text) — sending address
    - `created_at`, `updated_at`

  ## Security
  - RLS enabled; only admins of the same company can read/write
*/

CREATE TABLE IF NOT EXISTS email_settings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  smtp_host   text NOT NULL DEFAULT '',
  smtp_port   integer NOT NULL DEFAULT 587,
  smtp_secure boolean NOT NULL DEFAULT false,
  smtp_user   text NOT NULL DEFAULT '',
  smtp_pass   text NOT NULL DEFAULT '',
  from_name   text NOT NULL DEFAULT '',
  from_email  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read own company email settings"
  ON email_settings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = email_settings.company_id
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert own company email settings"
  ON email_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = email_settings.company_id
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update own company email settings"
  ON email_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = email_settings.company_id
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = email_settings.company_id
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete own company email settings"
  ON email_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = email_settings.company_id
        AND profiles.role = 'admin'
    )
  );
