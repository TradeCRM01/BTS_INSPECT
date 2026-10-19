BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA public TO authenticated, anon;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub',
    ''
  )::uuid
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY,
  name text,
  created_by uuid
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id),
  email text,
  name text NOT NULL,
  licence_number text,
  role text NOT NULL DEFAULT 'member'
);

ALTER TABLE public.companies
  ADD CONSTRAINT companies_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY,
  inspector_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_id uuid,
  crm_job_id uuid,
  due_on date,
  due_reminder_sent_at timestamptz,
  due_reminder_sent_for_date date,
  archived boolean NOT NULL DEFAULT false
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.protect_company_admin_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = OLD.company_id AND c.created_by = OLD.id
    ) THEN
      RAISE EXCEPTION 'The company owner cannot be removed or have their role changed.';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_company_admin_locks ON public.profiles;
CREATE TRIGGER trg_protect_company_admin_locks
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_admin_locks();

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.companies TO authenticated;

CREATE TABLE IF NOT EXISTS proof_result (
  name text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);

DELETE FROM public.inspections;
DELETE FROM public.companies;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, company_id, email, name, licence_number, role) VALUES
  ('11111111-1111-1111-1111-111111111111', NULL, 'owner@example.test', 'Owner Oak', 'OWN-1', 'admin'),
  ('22222222-2222-2222-2222-222222222222', NULL, 'pat@example.test', 'Pat Snapshot', 'EC-4411', 'member'),
  ('33333333-3333-3333-3333-333333333333', NULL, 'sam@example.test', 'Sam Spark', 'EL-1', 'member');

INSERT INTO public.companies (id, name, created_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

UPDATE public.profiles SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

INSERT INTO public.inspections (id, inspector_id, status, meta, responses) VALUES
  ('daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'draft', '{"siteName":"Draft St"}', '{}'),
  ('deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'issued', '{"siteName":"Issued St"}', '{"q":"a"}'),
  ('dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'sent', '{"siteName":"Sent St"}', '{}'),
  ('d0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'completed', '{"siteName":"Ready St"}', '{}');

\if :{?sec_insp3_fixture_only}
\echo fixture_only
\else

\ir ../migrations/20261019150000_sec_insp_inspector_snapshots.sql
\ir ../migrations/20261019160000_sec_insp_finalised_lock.sql

DO $$
DECLARE
  meta_state text;
  resp_state text;
  client_state text;
  crm_state text;
  status_ok boolean;
  due_ok boolean;
  remind_ok boolean;
  draft_ok boolean;
  del_sqlstate text;
  del_msg text;
  kept_id uuid;
  kept_name text;
  stamp timestamptz;
  who uuid;
  snap_name text;
BEGIN
  BEGIN
    UPDATE public.inspections SET meta = '{"siteName":"Nope"}'::jsonb
      WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    meta_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    meta_state := SQLSTATE;
  END;
  INSERT INTO proof_result VALUES (
    'finalised_meta_change_raises',
    meta_state = 'P0001',
    meta_state
  );

  BEGIN
    UPDATE public.inspections SET responses = '{"q":"b"}'::jsonb
      WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    resp_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    resp_state := SQLSTATE;
  END;
  INSERT INTO proof_result VALUES (
    'finalised_responses_change_raises',
    resp_state = 'P0001',
    resp_state
  );

  BEGIN
    UPDATE public.inspections SET client_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    client_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    client_state := SQLSTATE;
  END;
  INSERT INTO proof_result VALUES (
    'finalised_client_id_change_raises',
    client_state = 'P0001',
    client_state
  );

  BEGIN
    UPDATE public.inspections SET crm_job_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
      WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    crm_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    crm_state := SQLSTATE;
  END;
  INSERT INTO proof_result VALUES (
    'finalised_crm_job_id_change_raises',
    crm_state = 'P0001',
    crm_state
  );

  UPDATE public.inspections SET status = 'archived'
    WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT status = 'archived' INTO status_ok
    FROM public.inspections WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'finalised_status_transition_passes',
    status_ok,
    'sent->archived'
  );

  UPDATE public.inspections SET due_on = DATE '2026-11-02'
    WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT due_on = DATE '2026-11-02' INTO due_ok
    FROM public.inspections WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'finalised_due_on_update_passes',
    due_ok,
    'due_on'
  );

  UPDATE public.inspections
    SET due_reminder_sent_at = TIMESTAMPTZ '2026-10-19 12:00:00+00',
        due_reminder_sent_for_date = DATE '2026-11-02'
    WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT due_reminder_sent_for_date = DATE '2026-11-02' INTO remind_ok
    FROM public.inspections WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'finalised_reminder_update_passes',
    remind_ok,
    'reminder'
  );

  UPDATE public.inspections
    SET meta = '{"siteName":"Draft New"}'::jsonb,
        responses = '{"note":"ok"}'::jsonb
    WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT meta ->> 'siteName' = 'Draft New' INTO draft_ok
    FROM public.inspections WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'draft_content_update_passes',
    draft_ok,
    'draft'
  );

  SELECT updated_at, updated_by INTO stamp, who
    FROM public.inspections WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'updated_at_set_on_allowed_update',
    stamp IS NOT NULL,
    coalesce(stamp::text, 'null') || '|' || coalesce(who::text, 'null')
  );

  BEGIN
    DELETE FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333';
    del_sqlstate := '00000';
    del_msg := 'deleted';
  EXCEPTION WHEN OTHERS THEN
    del_sqlstate := SQLSTATE;
    del_msg := SQLERRM;
  END;
  SELECT inspector_id, inspector_name_snapshot INTO kept_id, kept_name
    FROM public.inspections WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'member_delete_on_finalised_passes',
    del_sqlstate = '00000' AND kept_id IS NULL AND kept_name = 'Sam Spark',
    del_sqlstate || '|' || coalesce(kept_id::text, 'null') || '|' || coalesce(kept_name, 'null') || '|' || del_msg
  );

  SELECT inspector_name_snapshot INTO snap_name
    FROM public.inspections WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'snapshot_trigger_still_filled',
    snap_name = 'Pat Snapshot',
    coalesce(snap_name, 'null')
  );
END $$;

-- Mutant: drop meta check
CREATE OR REPLACE FUNCTION public.inspections_guard_finalised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('completed', 'issued', 'sent', 'archived') THEN
    IF NEW.responses IS DISTINCT FROM OLD.responses
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.crm_job_id IS DISTINCT FROM OLD.crm_job_id
    THEN
      RAISE EXCEPTION 'Finalised inspections cannot change meta, responses, client_id, or crm_job_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  meta_state text;
BEGIN
  BEGIN
    UPDATE public.inspections SET meta = '{"siteName":"mutant-meta"}'::jsonb
      WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    meta_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    meta_state := SQLSTATE;
  END;
  INSERT INTO proof_result VALUES (
    'mutant_drop_meta_check_applied',
    meta_state = '00000',
    meta_state
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_meta_check_killed',
    meta_state = '00000',
    'killed by finalised_meta_change_raises ' || meta_state
  );
END $$;

\ir ../migrations/20261019160000_sec_insp_finalised_lock.sql

-- Mutant: drop responses check
CREATE OR REPLACE FUNCTION public.inspections_guard_finalised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('completed', 'issued', 'sent', 'archived') THEN
    IF NEW.meta IS DISTINCT FROM OLD.meta
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.crm_job_id IS DISTINCT FROM OLD.crm_job_id
    THEN
      RAISE EXCEPTION 'Finalised inspections cannot change meta, responses, client_id, or crm_job_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  resp_state text;
BEGIN
  BEGIN
    UPDATE public.inspections SET responses = '{"q":"mutant"}'::jsonb
      WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    resp_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    resp_state := SQLSTATE;
  END;
  INSERT INTO proof_result VALUES (
    'mutant_drop_responses_check_applied',
    resp_state = '00000',
    resp_state
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_responses_check_killed',
    resp_state = '00000',
    'killed by finalised_responses_change_raises ' || resp_state
  );
END $$;

\ir ../migrations/20261019160000_sec_insp_finalised_lock.sql

-- Mutant: drop client_id check
CREATE OR REPLACE FUNCTION public.inspections_guard_finalised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('completed', 'issued', 'sent', 'archived') THEN
    IF NEW.meta IS DISTINCT FROM OLD.meta
       OR NEW.responses IS DISTINCT FROM OLD.responses
       OR NEW.crm_job_id IS DISTINCT FROM OLD.crm_job_id
    THEN
      RAISE EXCEPTION 'Finalised inspections cannot change meta, responses, client_id, or crm_job_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  client_state text;
BEGIN
  BEGIN
    UPDATE public.inspections SET client_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    client_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    client_state := SQLSTATE;
  END;
  INSERT INTO proof_result VALUES (
    'mutant_drop_client_id_check_applied',
    client_state = '00000',
    client_state
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_client_id_check_killed',
    client_state = '00000',
    'killed by finalised_client_id_change_raises ' || client_state
  );
END $$;

\ir ../migrations/20261019160000_sec_insp_finalised_lock.sql

-- Mutant: drop crm_job_id check
CREATE OR REPLACE FUNCTION public.inspections_guard_finalised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('completed', 'issued', 'sent', 'archived') THEN
    IF NEW.meta IS DISTINCT FROM OLD.meta
       OR NEW.responses IS DISTINCT FROM OLD.responses
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
    THEN
      RAISE EXCEPTION 'Finalised inspections cannot change meta, responses, client_id, or crm_job_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  crm_state text;
BEGIN
  BEGIN
    UPDATE public.inspections SET crm_job_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    crm_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    crm_state := SQLSTATE;
  END;
  INSERT INTO proof_result VALUES (
    'mutant_drop_crm_job_id_check_applied',
    crm_state = '00000',
    crm_state
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_crm_job_id_check_killed',
    crm_state = '00000',
    'killed by finalised_crm_job_id_change_raises ' || crm_state
  );
END $$;

\ir ../migrations/20261019160000_sec_insp_finalised_lock.sql

DO $$
DECLARE
  failed text;
BEGIN
  SELECT string_agg(name || '=' || ok || ':' || coalesce(detail, ''), ', ' ORDER BY name)
    INTO failed
  FROM proof_result
  WHERE ok IS NOT TRUE;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION 'SEC-INSP-3 proofs failed: %', failed;
  END IF;
END $$;

SELECT name, ok, detail FROM proof_result ORDER BY name;

\endif

COMMIT;
