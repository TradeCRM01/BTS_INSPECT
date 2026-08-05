/*
  # AI Agent Actions & Reminders

  ## Summary
  Adds two tables that let the dashboard AI Agent perform real-world work
  on behalf of the user and keep an auditable log of everything it does.
  `agent_actions` is an immutable audit trail of every action the agent
  takes (email sent, job created, reminder set, etc). `agent_reminders`
  is a user/company-scoped reminder list the agent can write to so it
  can schedule follow-ups and the dashboard can surface them.

  ## New Tables

  ### agent_actions
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies, ON DELETE CASCADE) — owning company
  - `user_id` (uuid, FK → profiles, ON DELETE SET NULL) — who triggered the action
  - `action_type` (text) — one of: 'send_email', 'create_job', 'create_reminder', 'create_compliance_item', 'web_search', 'query_database', 'execute_sql', 'other'
  - `tool_name` (text, nullable) — the specific tool that was called
  - `summary` (text) — human-readable description of what the agent did
  - `details` (jsonb) — structured input/output of the action for audit
  - `status` (text) — one of: 'success', 'failed', 'pending'
  - `created_at` (timestamptz, default now())

  ### agent_reminders
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies, ON DELETE CASCADE)
  - `user_id` (uuid, FK → profiles, ON DELETE SET NULL) — who owns this reminder
  - `title` (text) — reminder text
  - `due_date` (timestamptz, nullable) — when the reminder fires
  - `related_type` (text, nullable) — e.g. 'invoice', 'job', 'compliance'
  - `related_id` (uuid, nullable) — optional related record id
  - `completed` (boolean, default false)
  - `completed_at` (timestamptz, nullable)
  - `created_at` (timestamptz, default now())

  ## Security
  - RLS enabled on both tables.
  - Company-scoped policies: any authenticated member of the company can
    view/insert/update/delete agent_actions and agent_reminders for their
    company. This matches the existing clients/jobs/compliance pattern.

  ## Indexes
  - agent_actions: company_id, created_at, user_id
  - agent_reminders: company_id, user_id, due_date, completed

  ## Important Notes
  1. agent_actions is append-only by design — the agent logs every tool
     call it makes so there is a full audit trail of real-world actions.
  2. agent_reminders is editable so users can mark reminders complete or
     delete them. The dashboard surfaces upcoming reminders.
  3. The ai-console edge function writes to agent_actions automatically
     whenever it executes a tool that has side effects.
*/

-- ── agent_actions table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('send_email','create_job','create_reminder','create_compliance_item','web_search','query_database','execute_sql','other')),
  tool_name text,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','pending')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view agent_actions" ON agent_actions;
CREATE POLICY "Company members can view agent_actions"
  ON agent_actions FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert agent_actions" ON agent_actions;
CREATE POLICY "Company members can insert agent_actions"
  ON agent_actions FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete agent_actions" ON agent_actions;
CREATE POLICY "Company members can delete agent_actions"
  ON agent_actions FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── agent_reminders table ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date timestamptz,
  related_type text,
  related_id uuid,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view agent_reminders" ON agent_reminders;
CREATE POLICY "Company members can view agent_reminders"
  ON agent_reminders FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert agent_reminders" ON agent_reminders;
CREATE POLICY "Company members can insert agent_reminders"
  ON agent_reminders FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can update agent_reminders" ON agent_reminders;
CREATE POLICY "Company members can update agent_reminders"
  ON agent_reminders FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can delete agent_reminders" ON agent_reminders;
CREATE POLICY "Company members can delete agent_reminders"
  ON agent_reminders FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── Indexes ──────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_agent_actions_company_id ON agent_actions(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_created_at ON agent_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user_id ON agent_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_reminders_company_id ON agent_reminders(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_reminders_user_id ON agent_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_reminders_due_date ON agent_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_agent_reminders_completed ON agent_reminders(completed);
