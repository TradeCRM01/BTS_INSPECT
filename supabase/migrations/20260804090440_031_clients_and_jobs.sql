/*
  # Clients and Jobs — CRM + Scheduling

  ## Summary
  Adds customer relationship management and job scheduling to the app.
  Clients are company-scoped contacts (customers). Jobs are scheduled
  work items linked to a client, optionally linked to an inspection,
  with crew assignment, status tracking, and date/time scheduling.

  ## New Tables

  ### clients
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies) — which company owns this client
  - `name` (text) — client or business name
  - `contact_person` (text, nullable) — primary contact name
  - `phone` (text, nullable)
  - `email` (text, nullable)
  - `address` (text, nullable) — street address for site visits
  - `notes` (text, nullable) — free-form notes
  - `archived` (boolean, default false)
  - `created_at` (timestamptz, default now())

  ### jobs
  - `id` (uuid, PK)
  - `company_id` (uuid, FK → companies)
  - `client_id` (uuid, FK → clients, ON DELETE SET NULL)
  - `title` (text) — short job title
  - `description` (text, nullable)
  - `status` (text) — one of: 'scheduled', 'in_progress', 'completed', 'cancelled'
  - `priority` (text) — one of: 'low', 'medium', 'high'. Default 'medium'
  - `scheduled_date` (date, nullable) — the day the job is booked for
  - `start_time` (time, nullable) — start time on that day
  - `end_time` (time, nullable) — end time on that day
  - `address` (text, nullable) — job site address if different from client
  - `assigned_team` (jsonb) — array of profile UUIDs assigned to the job
  - `inspection_id` (uuid, FK → inspections, nullable, ON DELETE SET NULL)
  - `created_by` (uuid, FK → profiles)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

  ## Security
  - RLS enabled on both tables.
  - Company-scoped policies: any authenticated member of the company can
    CRUD clients and jobs belonging to their company. This matches the
    existing inspection RLS pattern (company-wide access).
  - `company_id` on both tables has DEFAULT auth.uid() resolution via
    a subquery since company_id is not the user's own ID.

  ## Important Notes
  1. Jobs can exist without a client (walk-up work) — client_id is nullable.
  2. Jobs can be linked to an inspection — inspection_id is nullable with
     ON DELETE SET NULL so deleting an inspection doesn't lose the job record.
  3. assigned_team is a JSONB array of UUIDs — the app reads team members
     via the get_company_members() function already defined in migration 005.
*/

-- ── clients table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view clients" ON clients;
CREATE POLICY "Company members can view clients"
  ON clients FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can insert clients" ON clients;
CREATE POLICY "Company members can insert clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can update clients" ON clients;
CREATE POLICY "Company members can update clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can delete clients" ON clients;
CREATE POLICY "Company members can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── jobs table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  scheduled_date date,
  start_time time,
  end_time time,
  address text,
  assigned_team jsonb NOT NULL DEFAULT '[]'::jsonb,
  inspection_id uuid REFERENCES inspections(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view jobs" ON jobs;
CREATE POLICY "Company members can view jobs"
  ON jobs FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can insert jobs" ON jobs;
CREATE POLICY "Company members can insert jobs"
  ON jobs FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can update jobs" ON jobs;
CREATE POLICY "Company members can update jobs"
  ON jobs FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Company members can delete jobs" ON jobs;
CREATE POLICY "Company members can delete jobs"
  ON jobs FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── Indexes ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clients_company_id ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_archived ON clients(archived);
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);