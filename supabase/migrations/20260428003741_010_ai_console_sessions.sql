/*
  # AI Console — Conversation Sessions

  1. New Tables
    - `ai_console_sessions`
      - `id` (uuid, primary key)
      - `company_id` (uuid, foreign key → companies)
      - `user_id` (uuid, foreign key → auth.users)
      - `title` (text) — auto-derived from first message
      - `messages` (jsonb) — full message array [{role, content}]
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - RLS enabled — only admin users belonging to the same company can read/write
    - Admin check uses profiles.role = 'admin'
*/

CREATE TABLE IF NOT EXISTS ai_console_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'New conversation',
  messages    jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE ai_console_sessions ENABLE ROW LEVEL SECURITY;

-- Only admins of the same company can select their own sessions
CREATE POLICY "Admin can view own AI console sessions"
  ON ai_console_sessions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.company_id = ai_console_sessions.company_id
    )
  );

-- Only admins can insert sessions for their company
CREATE POLICY "Admin can create AI console sessions"
  ON ai_console_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.company_id = ai_console_sessions.company_id
    )
  );

-- Only admins can update their own sessions
CREATE POLICY "Admin can update own AI console sessions"
  ON ai_console_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Only admins can delete their own sessions
CREATE POLICY "Admin can delete own AI console sessions"
  ON ai_console_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Index for fast lookups by company + user
CREATE INDEX IF NOT EXISTS ai_console_sessions_user_idx
  ON ai_console_sessions (company_id, user_id, updated_at DESC);
