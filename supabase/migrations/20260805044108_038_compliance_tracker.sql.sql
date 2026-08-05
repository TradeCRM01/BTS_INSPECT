/*
  # Compliance Tracker

  ## Summary
  Adds a compliance / recurring-work tracker that lets the business define
  items requiring periodic attention (e.g. fire extinguisher checks, electrical
  safety inspections, warranty renewals). Each compliance item is linked to a
  client, has a recurrence period, and tracks due dates. When a due date is
  approaching, the system can send the client a reminder email inviting them
  to book the service. Items can also be linked to jobs so completed work is
  recorded against the compliance record.

  ## New Tables

  ### compliance_items
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies, ON DELETE CASCADE) — owning company
  - `client_id` (uuid, FK → clients, ON DELETE CASCADE) — which client this applies to
  - `title` (text) — e.g. "Annual Fire Extinguisher Service"
  - `description` (text, nullable) — details / scope of work
  - `standard_or_regulation` (text, nullable) — e.g. "AS 1851", "NZ Building Code"
  - `recurrence_interval` (int) — how many units between required services
  - `recurrence_unit` (text) — one of: 'days', 'weeks', 'months', 'years'
  - `first_due_date` (date) — when the first/next service is required
  - `last_completed_date` (date, nullable) — date the last service was done
  - `next_due_date` (date) — computed next required date
  - `reminder_days_before` (int, default 30) — how many days before due date to send reminder
  - `reminder_sent_date` (timestamptz, nullable) — last reminder email sent timestamp
  - `status` (text) — one of: 'upcoming', 'due_soon', 'overdue', 'completed', 'paused'
  - `linked_job_id` (uuid, FK → jobs, nullable, ON DELETE SET NULL) — currently linked job
  - `notes` (text, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ### compliance_logs
  - `id` (uuid, PK)
  - `compliance_item_id` (uuid, FK → compliance_items, ON DELETE CASCADE)
  - `company_id` (uuid, FK → companies, ON DELETE CASCADE)
  - `action` (text) — one of: 'created', 'updated', 'completed', 'reminder_sent', 'reminder_email_failed', 'job_linked', 'paused', 'resumed'
  - `notes` (text, nullable)
  - `performed_by` (uuid, FK → profiles, nullable, ON DELETE SET NULL)
  - `created_at` (timestamptz, default now())

  ## Security
  - RLS enabled on both tables.
  - Company-scoped policies matching the existing clients/jobs pattern:
    any authenticated member of the company can CRUD compliance data
    belonging to their company.

  ## Indexes
  - compliance_items: company_id, client_id, next_due_date, status
  - compliance_logs: compliance_item_id, company_id

  ## Important Notes
  1. next_due_date is set by the app on insert/update based on
     last_completed_date + recurrence, or first_due_date if never completed.
  2. A cron-based edge function (compliance-reminder-check) can be invoked
     periodically to find items where next_due_date - reminder_days_before <= today
     and no reminder has been sent yet, then email the client.
  3. When a linked job is marked complete, the app can update last_completed_date
     and recalculate next_due_date, then log the completion.
*/

-- ── compliance_items table ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  standard_or_regulation text,
  recurrence_interval integer NOT NULL DEFAULT 12 CHECK (recurrence_interval > 0),
  recurrence_unit text NOT NULL DEFAULT 'months' CHECK (recurrence_unit IN ('days', 'weeks', 'months', 'years')),
  first_due_date date NOT NULL,
  last_completed_date date,
  next_due_date date NOT NULL,
  reminder_days_before integer NOT NULL DEFAULT 30 CHECK (reminder_days_before >= 0),
  reminder_sent_at timestamptz,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'due_soon', 'overdue', 'completed', 'paused')),
  linked_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view compliance_items" ON compliance_items;
CREATE POLICY "Company members can view compliance_items"
  ON compliance_items FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can insert compliance_items" ON compliance_items;
CREATE POLICY "Company members can insert compliance_items"
  ON compliance_items FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can update compliance_items" ON compliance_items;
CREATE POLICY "Company members can update compliance_items"
  ON compliance_items FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can delete compliance_items" ON compliance_items;
CREATE POLICY "Company members can delete compliance_items"
  ON compliance_items FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── compliance_logs table ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS compliance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_item_id uuid NOT NULL REFERENCES compliance_items(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'completed', 'reminder_sent', 'reminder_email_failed', 'job_linked', 'paused', 'resumed')),
  notes text,
  performed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE compliance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view compliance_logs" ON compliance_logs;
CREATE POLICY "Company members can view compliance_logs"
  ON compliance_logs FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can insert compliance_logs" ON compliance_logs;
CREATE POLICY "Company members can insert compliance_logs"
  ON compliance_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can update compliance_logs" ON compliance_logs;
CREATE POLICY "Company members can update compliance_logs"
  ON compliance_logs FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can delete compliance_logs" ON compliance_logs;
CREATE POLICY "Company members can delete compliance_logs"
  ON compliance_logs FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── Indexes ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_compliance_items_company_id ON compliance_items(company_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_client_id ON compliance_items(client_id);
CREATE INDEX IF NOT EXISTS idx_compliance_items_next_due_date ON compliance_items(next_due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_items_status ON compliance_items(status);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_item_id ON compliance_logs(compliance_item_id);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_company_id ON compliance_logs(company_id);