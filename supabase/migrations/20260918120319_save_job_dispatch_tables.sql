-- Catalog fill (baseline r3 / #368). Prod version 20260918120319 save_job_dispatch_tables stays APPLIED.
-- Earliest prod version that created the dispatch_* tables and jobs.dispatch_* columns.
-- Recreated from read-only catalog capture. Idempotent.

CREATE TABLE IF NOT EXISTS public.dispatch_resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'available'::text,
  notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_resources'
      AND con.conname = 'dispatch_resources_name_len'
  ) THEN
    ALTER TABLE public.dispatch_resources
      ADD CONSTRAINT dispatch_resources_name_len CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)));
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_resources'
      AND con.conname = 'dispatch_resources_status_check'
  ) THEN
    ALTER TABLE public.dispatch_resources
      ADD CONSTRAINT dispatch_resources_status_check CHECK ((status = ANY (ARRAY['available'::text, 'out_of_service'::text])));
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_resources'
      AND con.conname = 'dispatch_resources_company_id_fkey'
  ) THEN
    ALTER TABLE public.dispatch_resources
      ADD CONSTRAINT dispatch_resources_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_resources'
      AND con.conname = 'dispatch_resources_pkey'
  ) THEN
    ALTER TABLE public.dispatch_resources
      ADD CONSTRAINT dispatch_resources_pkey PRIMARY KEY (id);
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_resources'
      AND con.conname = 'dispatch_resources_company_name'
  ) THEN
    ALTER TABLE public.dispatch_resources
      ADD CONSTRAINT dispatch_resources_company_name UNIQUE (company_id, name);
  END IF;
END
$guard$;

ALTER TABLE public.dispatch_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_delete_admin" ON public.dispatch_resources;
CREATE POLICY "company_delete_admin"
  ON public.dispatch_resources
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

DROP POLICY IF EXISTS "company_insert_admin" ON public.dispatch_resources;
CREATE POLICY "company_insert_admin"
  ON public.dispatch_resources
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

DROP POLICY IF EXISTS "company_select" ON public.dispatch_resources;
CREATE POLICY "company_select"
  ON public.dispatch_resources
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

DROP POLICY IF EXISTS "company_update_admin" ON public.dispatch_resources;
CREATE POLICY "company_update_admin"
  ON public.dispatch_resources
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_resources_company_name ON public.dispatch_resources USING btree (company_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_resources_pkey ON public.dispatch_resources USING btree (id);

CREATE INDEX IF NOT EXISTS idx_dispatch_resources_company ON public.dispatch_resources USING btree (company_id, status);

CREATE TABLE IF NOT EXISTS public.dispatch_skills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  requires_expiry boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_skills'
      AND con.conname = 'dispatch_skills_name_len'
  ) THEN
    ALTER TABLE public.dispatch_skills
      ADD CONSTRAINT dispatch_skills_name_len CHECK (((char_length(name) >= 1) AND (char_length(name) <= 80)));
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_skills'
      AND con.conname = 'dispatch_skills_company_id_fkey'
  ) THEN
    ALTER TABLE public.dispatch_skills
      ADD CONSTRAINT dispatch_skills_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_skills'
      AND con.conname = 'dispatch_skills_pkey'
  ) THEN
    ALTER TABLE public.dispatch_skills
      ADD CONSTRAINT dispatch_skills_pkey PRIMARY KEY (id);
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_skills'
      AND con.conname = 'dispatch_skills_company_name'
  ) THEN
    ALTER TABLE public.dispatch_skills
      ADD CONSTRAINT dispatch_skills_company_name UNIQUE (company_id, name);
  END IF;
END
$guard$;

ALTER TABLE public.dispatch_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_delete_admin" ON public.dispatch_skills;
CREATE POLICY "company_delete_admin"
  ON public.dispatch_skills
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

DROP POLICY IF EXISTS "company_insert_admin" ON public.dispatch_skills;
CREATE POLICY "company_insert_admin"
  ON public.dispatch_skills
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

DROP POLICY IF EXISTS "company_select" ON public.dispatch_skills;
CREATE POLICY "company_select"
  ON public.dispatch_skills
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

DROP POLICY IF EXISTS "company_update_admin" ON public.dispatch_skills;
CREATE POLICY "company_update_admin"
  ON public.dispatch_skills
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_skills_company_name ON public.dispatch_skills USING btree (company_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_skills_pkey ON public.dispatch_skills USING btree (id);

CREATE INDEX IF NOT EXISTS idx_dispatch_skills_company ON public.dispatch_skills USING btree (company_id);

CREATE TABLE IF NOT EXISTS public.dispatch_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  job_id uuid NOT NULL,
  actor_id uuid NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_events'
      AND con.conname = 'dispatch_events_kind_check'
  ) THEN
    ALTER TABLE public.dispatch_events
      ADD CONSTRAINT dispatch_events_kind_check CHECK ((kind = ANY (ARRAY['assign'::text, 'remove'::text, 'override'::text, 'reschedule'::text, 'requirements'::text])));
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_events'
      AND con.conname = 'dispatch_events_actor_id_fkey'
  ) THEN
    ALTER TABLE public.dispatch_events
      ADD CONSTRAINT dispatch_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_events'
      AND con.conname = 'dispatch_events_company_id_fkey'
  ) THEN
    ALTER TABLE public.dispatch_events
      ADD CONSTRAINT dispatch_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_events'
      AND con.conname = 'dispatch_events_job_id_fkey'
  ) THEN
    ALTER TABLE public.dispatch_events
      ADD CONSTRAINT dispatch_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_events'
      AND con.conname = 'dispatch_events_pkey'
  ) THEN
    ALTER TABLE public.dispatch_events
      ADD CONSTRAINT dispatch_events_pkey PRIMARY KEY (id);
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_events'
      AND con.conname = 'dispatch_events_idempotent'
  ) THEN
    ALTER TABLE public.dispatch_events
      ADD CONSTRAINT dispatch_events_idempotent UNIQUE (company_id, idempotency_key);
  END IF;
END
$guard$;

ALTER TABLE public.dispatch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_select" ON public.dispatch_events;
CREATE POLICY "company_select"
  ON public.dispatch_events
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_events_idempotent ON public.dispatch_events USING btree (company_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_events_pkey ON public.dispatch_events USING btree (id);

CREATE INDEX IF NOT EXISTS idx_dispatch_events_job ON public.dispatch_events USING btree (job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.dispatch_member_qualifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  member_id uuid NOT NULL,
  skill_id uuid NOT NULL,
  issued_on date NULL,
  expires_on date NULL,
  reference text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_member_qualifications'
      AND con.conname = 'dispatch_member_qualifications_company_id_fkey'
  ) THEN
    ALTER TABLE public.dispatch_member_qualifications
      ADD CONSTRAINT dispatch_member_qualifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_member_qualifications'
      AND con.conname = 'dispatch_member_qualifications_member_id_fkey'
  ) THEN
    ALTER TABLE public.dispatch_member_qualifications
      ADD CONSTRAINT dispatch_member_qualifications_member_id_fkey FOREIGN KEY (member_id) REFERENCES profiles(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_member_qualifications'
      AND con.conname = 'dispatch_member_qualifications_skill_id_fkey'
  ) THEN
    ALTER TABLE public.dispatch_member_qualifications
      ADD CONSTRAINT dispatch_member_qualifications_skill_id_fkey FOREIGN KEY (skill_id) REFERENCES dispatch_skills(id) ON DELETE CASCADE;
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_member_qualifications'
      AND con.conname = 'dispatch_member_qualifications_pkey'
  ) THEN
    ALTER TABLE public.dispatch_member_qualifications
      ADD CONSTRAINT dispatch_member_qualifications_pkey PRIMARY KEY (id);
  END IF;
END
$guard$;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'dispatch_member_qualifications'
      AND con.conname = 'dispatch_qual_company_member_skill'
  ) THEN
    ALTER TABLE public.dispatch_member_qualifications
      ADD CONSTRAINT dispatch_qual_company_member_skill UNIQUE (company_id, member_id, skill_id);
  END IF;
END
$guard$;

ALTER TABLE public.dispatch_member_qualifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_delete_admin" ON public.dispatch_member_qualifications;
CREATE POLICY "company_delete_admin"
  ON public.dispatch_member_qualifications
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

DROP POLICY IF EXISTS "company_insert_admin" ON public.dispatch_member_qualifications;
CREATE POLICY "company_insert_admin"
  ON public.dispatch_member_qualifications
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

DROP POLICY IF EXISTS "company_select" ON public.dispatch_member_qualifications;
CREATE POLICY "company_select"
  ON public.dispatch_member_qualifications
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

DROP POLICY IF EXISTS "company_update_admin" ON public.dispatch_member_qualifications;
CREATE POLICY "company_update_admin"
  ON public.dispatch_member_qualifications
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)))
  WITH CHECK (((company_id = ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::text)));

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_member_qualifications_pkey ON public.dispatch_member_qualifications USING btree (id);

CREATE UNIQUE INDEX IF NOT EXISTS dispatch_qual_company_member_skill ON public.dispatch_member_qualifications USING btree (company_id, member_id, skill_id);

CREATE INDEX IF NOT EXISTS idx_dispatch_qual_company ON public.dispatch_member_qualifications USING btree (company_id, member_id);

-- jobs.dispatch_* columns from catalog 2e (no dispatch constraints or indexes on jobs).
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dispatch_ready boolean NOT NULL DEFAULT false;

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dispatch_version integer NOT NULL DEFAULT 1;

