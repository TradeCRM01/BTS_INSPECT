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
  DROP CONSTRAINT IF EXISTS companies_created_by_fkey;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id);

CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text
);

CREATE TABLE IF NOT EXISTS public.jha_templates (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text
);

CREATE TABLE IF NOT EXISTS public.jha_documents (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  name text
);

CREATE TABLE IF NOT EXISTS public.jobs (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jha_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jha_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;

CREATE TABLE IF NOT EXISTS proof_result (
  name text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);

DELETE FROM public.templates;
DELETE FROM public.jha_templates;
DELETE FROM public.jha_documents;
DELETE FROM public.jobs;
DELETE FROM public.companies;
DELETE FROM public.profiles;

INSERT INTO public.profiles (id, company_id, email, name, licence_number, role) VALUES
  ('11111111-1111-1111-1111-111111111111', NULL, 'owner@example.test', 'Owner Oak', 'OWN-1', 'admin'),
  ('22222222-2222-2222-2222-222222222222', NULL, 'pat@example.test', 'Pat Snapshot', 'EC-4411', 'member'),
  ('33333333-3333-3333-3333-333333333333', NULL, 'sam@example.test', 'Sam Spark', 'EL-1', 'member');

INSERT INTO public.companies (id, name, created_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A', '11111111-1111-1111-1111-111111111111');

UPDATE public.profiles SET company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

INSERT INTO public.templates (id, created_by, name) VALUES
  ('51111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Switchboard');
INSERT INTO public.jha_templates (id, created_by, name) VALUES
  ('52111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Site JHA');
INSERT INTO public.jha_documents (id, created_by, name) VALUES
  ('53111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Harbour JHA');
INSERT INTO public.jobs (id, created_by, title) VALUES
  ('54111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Snapshot job');

\if :{?sec_insp2_creator_fixture_only}
\echo creator_fixture_only
\else

\ir ../migrations/20261019160000_sec_insp_creator_snapshots.sql

DO $$
DECLARE
  t_n int; jt_n int; jd_n int; jb_n int;
  t_s int; jt_s int; jd_s int; jb_s int;
  ins_name text; change_name text; null_name text; null_id uuid;
  del_sqlstate text; del_msg text;
  owner_sqlstate text; owner_msg text;
  t_id uuid; t_name text;
  jt_id uuid; jt_name text;
  jd_id uuid; jd_name text;
  jb_id uuid; jb_name text;
  attnotnull boolean;
BEGIN
  SELECT count(*) INTO t_n FROM public.templates;
  SELECT count(*) INTO t_s FROM public.templates WHERE creator_name_snapshot IS NOT NULL;
  SELECT count(*) INTO jt_n FROM public.jha_templates;
  SELECT count(*) INTO jt_s FROM public.jha_templates WHERE creator_name_snapshot IS NOT NULL;
  SELECT count(*) INTO jd_n FROM public.jha_documents;
  SELECT count(*) INTO jd_s FROM public.jha_documents WHERE creator_name_snapshot IS NOT NULL;
  SELECT count(*) INTO jb_n FROM public.jobs;
  SELECT count(*) INTO jb_s FROM public.jobs WHERE creator_name_snapshot IS NOT NULL;
  INSERT INTO proof_result VALUES (
    'creator_backfill_count_equals_row_count',
    t_n = t_s AND jt_n = jt_s AND jd_n = jd_s AND jb_n = jb_s
      AND t_n = 1 AND jt_n = 1 AND jd_n = 1 AND jb_n = 1,
    format('t=%s/%s jt=%s/%s jd=%s/%s jb=%s/%s', t_s, t_n, jt_s, jt_n, jd_s, jd_n, jb_s, jb_n)
  );

  SELECT bool_or(is_nullable = 'NO') INTO attnotnull
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('templates', 'jha_templates', 'jha_documents', 'jobs')
    AND column_name = 'created_by';
  INSERT INTO proof_result VALUES (
    'creator_created_by_nullable',
    attnotnull IS NOT TRUE,
    'any_notnull=' || coalesce(attnotnull::text, 'null')
  );

  INSERT INTO public.templates (id, created_by, name) VALUES
    ('51222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Insert fill');
  SELECT creator_name_snapshot INTO ins_name
  FROM public.templates WHERE id = '51222222-2222-2222-2222-222222222222';
  INSERT INTO proof_result VALUES (
    'creator_trigger_fills_on_insert',
    ins_name = 'Pat Snapshot',
    coalesce(ins_name, 'null')
  );

  UPDATE public.templates
    SET created_by = '33333333-3333-3333-3333-333333333333'
    WHERE id = '51222222-2222-2222-2222-222222222222';
  SELECT creator_name_snapshot INTO change_name
  FROM public.templates WHERE id = '51222222-2222-2222-2222-222222222222';
  INSERT INTO proof_result VALUES (
    'creator_trigger_fills_on_change',
    change_name = 'Sam Spark',
    coalesce(change_name, 'null')
  );

  UPDATE public.templates SET created_by = NULL
    WHERE id = '51222222-2222-2222-2222-222222222222';
  SELECT creator_name_snapshot, created_by INTO null_name, null_id
  FROM public.templates WHERE id = '51222222-2222-2222-2222-222222222222';
  INSERT INTO proof_result VALUES (
    'creator_trigger_survives_set_null',
    null_name = 'Sam Spark' AND null_id IS NULL,
    coalesce(null_name, 'null') || '|' || coalesce(null_id::text, 'null')
  );

  BEGIN
    DELETE FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
    del_sqlstate := '00000';
    del_msg := 'deleted';
  EXCEPTION WHEN OTHERS THEN
    del_sqlstate := SQLSTATE;
    del_msg := SQLERRM;
  END;
  SELECT created_by, creator_name_snapshot INTO t_id, t_name FROM public.templates WHERE id = '51111111-1111-1111-1111-111111111111';
  SELECT created_by, creator_name_snapshot INTO jt_id, jt_name FROM public.jha_templates WHERE id = '52111111-1111-1111-1111-111111111111';
  SELECT created_by, creator_name_snapshot INTO jd_id, jd_name FROM public.jha_documents WHERE id = '53111111-1111-1111-1111-111111111111';
  SELECT created_by, creator_name_snapshot INTO jb_id, jb_name FROM public.jobs WHERE id = '54111111-1111-1111-1111-111111111111';
  INSERT INTO proof_result VALUES (
    'member_who_created_template_jha_and_doc_can_be_deleted',
    del_sqlstate = '00000'
      AND t_id IS NULL AND t_name = 'Pat Snapshot'
      AND jt_id IS NULL AND jt_name = 'Pat Snapshot'
      AND jd_id IS NULL AND jd_name = 'Pat Snapshot'
      AND jb_id IS NULL AND jb_name = 'Pat Snapshot',
    del_sqlstate || '|t=' || coalesce(t_name, 'null') || '|jt=' || coalesce(jt_name, 'null')
      || '|jd=' || coalesce(jd_name, 'null') || '|jb=' || coalesce(jb_name, 'null') || '|' || del_msg
  );

  BEGIN
    DELETE FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';
    owner_sqlstate := '00000';
    owner_msg := 'deleted';
  EXCEPTION WHEN OTHERS THEN
    owner_sqlstate := SQLSTATE;
    owner_msg := SQLERRM;
  END;
  INSERT INTO proof_result VALUES (
    'creator_owner_delete_blocked_p0001',
    owner_sqlstate = 'P0001' AND owner_msg LIKE '%company owner%',
    owner_sqlstate || '|' || owner_msg
  );
END $$;

-- Mutants: NOT NULL kept on each creator table (no SET-NULL-safe delete)
INSERT INTO public.profiles (id, company_id, email, name, licence_number, role)
SELECT '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pat@example.test', 'Pat Snapshot', 'EC-4411', 'member'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222');

UPDATE public.templates SET created_by = '22222222-2222-2222-2222-222222222222' WHERE created_by IS NULL;
UPDATE public.jha_templates SET created_by = '22222222-2222-2222-2222-222222222222' WHERE created_by IS NULL;
UPDATE public.jha_documents SET created_by = '22222222-2222-2222-2222-222222222222' WHERE created_by IS NULL;
UPDATE public.jobs SET created_by = '22222222-2222-2222-2222-222222222222' WHERE created_by IS NULL;

DO $$
DECLARE
  rec record;
  del_sqlstate text;
  del_msg text;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('templates', '51111111-1111-1111-1111-111111111111'),
      ('jha_templates', '52111111-1111-1111-1111-111111111111'),
      ('jha_documents', '53111111-1111-1111-1111-111111111111'),
      ('jobs', '54111111-1111-1111-1111-111111111111')
    ) AS t(tbl, row_id)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_by SET NOT NULL', rec.tbl);

    BEGIN
      DELETE FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
      del_sqlstate := '00000';
      del_msg := 'deleted';
    EXCEPTION WHEN OTHERS THEN
      del_sqlstate := SQLSTATE;
      del_msg := SQLERRM;
    END;

    INSERT INTO proof_result VALUES (
      'mutant_not_null_kept_' || rec.tbl || '_applied',
      del_sqlstate = '23502',
      del_sqlstate || '|' || del_msg
    );
    INSERT INTO proof_result VALUES (
      'mutant_not_null_kept_' || rec.tbl || '_killed',
      del_sqlstate <> '00000',
      'killed by member_who_created_template_jha_and_doc_can_be_deleted ' || del_sqlstate
    );
    IF del_sqlstate = '00000' THEN
      RAISE EXCEPTION 'mutant not_null_kept_% not killed — member delete succeeded', rec.tbl;
    END IF;

    INSERT INTO public.profiles (id, company_id, email, name, licence_number, role)
    SELECT '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pat@example.test', 'Pat Snapshot', 'EC-4411', 'member'
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222');
    EXECUTE format('UPDATE public.%I SET created_by = %L WHERE id = %L', rec.tbl, '22222222-2222-2222-2222-222222222222', rec.row_id);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_by DROP NOT NULL', rec.tbl);
  END LOOP;
END $$;

\ir ../migrations/20261019160000_sec_insp_creator_snapshots.sql

DO $$
DECLARE
  failed text;
BEGIN
  SELECT string_agg(name || '=' || ok || ':' || coalesce(detail, ''), ', ' ORDER BY name)
    INTO failed
  FROM proof_result
  WHERE ok IS NOT TRUE;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION 'SEC-INSP-2 creator proofs failed: %', failed;
  END IF;
END $$;

SELECT name, ok, detail FROM proof_result ORDER BY name;

\endif

COMMIT;
