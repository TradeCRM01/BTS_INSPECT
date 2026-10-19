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
  status text NOT NULL DEFAULT 'draft'
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

INSERT INTO public.inspections (id, inspector_id, status) VALUES
  ('daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'draft'),
  ('deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'issued');

\if :{?sec_insp2_fixture_only}
\echo fixture_only
\else

\ir ../migrations/20261019150000_sec_insp_inspector_snapshots.sql

DO $$
DECLARE
  row_n int;
  snap_n int;
  ins_name text;
  ins_lic text;
  ins_id uuid;
  del_sqlstate text;
  del_msg text;
  owner_sqlstate text;
  owner_msg text;
  kept_name text;
  kept_id uuid;
  change_name text;
  null_name text;
  null_id uuid;
  attnotnull boolean;
BEGIN
  SELECT count(*) INTO row_n FROM public.inspections;
  SELECT count(*) INTO snap_n FROM public.inspections WHERE inspector_name_snapshot IS NOT NULL;
  INSERT INTO proof_result VALUES (
    'backfill_count_equals_row_count',
    row_n = snap_n AND row_n = 2,
    'rows=' || row_n || ' snaps=' || snap_n
  );

  SELECT is_nullable = 'NO' INTO attnotnull
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'inspections' AND column_name = 'inspector_id';
  INSERT INTO proof_result VALUES (
    'inspector_id_nullable',
    attnotnull IS NOT TRUE,
    'notnull=' || coalesce(attnotnull::text, 'null')
  );

  INSERT INTO public.inspections (id, inspector_id, status) VALUES
    ('dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'draft');
  SELECT inspector_name_snapshot, inspector_licence_snapshot, inspector_id
    INTO ins_name, ins_lic, ins_id
  FROM public.inspections WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'trigger_fills_on_insert',
    ins_name = 'Pat Snapshot' AND ins_lic = 'EC-4411' AND ins_id = '22222222-2222-2222-2222-222222222222',
    coalesce(ins_name, 'null') || '|' || coalesce(ins_lic, 'null')
  );

  UPDATE public.inspections
    SET inspector_id = '33333333-3333-3333-3333-333333333333'
    WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT inspector_name_snapshot INTO change_name
  FROM public.inspections WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'trigger_fills_on_inspector_change',
    change_name = 'Sam Spark',
    coalesce(change_name, 'null')
  );

  UPDATE public.inspections
    SET inspector_id = NULL
    WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT inspector_name_snapshot, inspector_id INTO null_name, null_id
  FROM public.inspections WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'trigger_survives_set_null',
    null_name = 'Sam Spark' AND null_id IS NULL,
    coalesce(null_name, 'null') || '|' || coalesce(null_id::text, 'null')
  );

  BEGIN
    DELETE FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
    GET DIAGNOSTICS del_sqlstate = ROW_COUNT;
    del_sqlstate := '00000';
    del_msg := 'deleted';
  EXCEPTION WHEN OTHERS THEN
    del_sqlstate := SQLSTATE;
    del_msg := SQLERRM;
  END;
  SELECT inspector_id, inspector_name_snapshot INTO kept_id, kept_name
  FROM public.inspections WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'member_delete_succeeds_keeps_snapshot',
    del_sqlstate = '00000' AND kept_id IS NULL AND kept_name = 'Pat Snapshot',
    del_sqlstate || '|' || coalesce(kept_id::text, 'null') || '|' || coalesce(kept_name, 'null') || '|' || del_msg
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
    'owner_delete_blocked_p0001',
    owner_sqlstate = 'P0001' AND owner_msg LIKE '%company owner%',
    owner_sqlstate || '|' || owner_msg
  );

  INSERT INTO proof_result VALUES (
    'inspector_helper_no_public_anon_execute',
    NOT has_function_privilege('anon', 'public.inspections_fill_inspector_snapshots()', 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        WHERE n.nspname = 'public'
          AND p.proname = 'inspections_fill_inspector_snapshots'
          AND a.privilege_type = 'EXECUTE'
          AND a.grantee = 0
      ),
    'anon/public execute revoked'
  );
END $$;

INSERT INTO public.profiles (id, company_id, email, name, licence_number, role)
SELECT '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pat@example.test', 'Pat Snapshot', 'EC-4411', 'member'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222');

DROP POLICY IF EXISTS inspections_auth_all ON public.inspections;
CREATE POLICY inspections_auth_all ON public.inspections
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;

INSERT INTO public.inspections (id, inspector_id, status) VALUES
  ('d0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'draft')
ON CONFLICT (id) DO UPDATE SET inspector_id = EXCLUDED.inspector_id;

INSERT INTO public.inspections (
  id, inspector_id, inspector_name_snapshot, inspector_licence_snapshot, status
) VALUES (
  'd1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  NULL,
  'Forged Inspector',
  'FAKE-99',
  'draft'
);
DO $$
DECLARE
  forged_name text;
  forged_lic text;
  kept_name text;
BEGIN
  SELECT inspector_name_snapshot, inspector_licence_snapshot
    INTO forged_name, forged_lic
  FROM public.inspections WHERE id = 'd1aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'inspector_insert_null_overwrites_forged_snapshot',
    forged_name IS NULL AND forged_lic IS NULL,
    coalesce(forged_name, 'null') || '|' || coalesce(forged_lic, 'null')
  );

  UPDATE public.inspections
    SET inspector_name_snapshot = 'Forged Inspector',
        inspector_licence_snapshot = 'FAKE-99'
    WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT inspector_name_snapshot INTO kept_name
  FROM public.inspections WHERE id = 'dfaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'inspector_update_snapshot_only_keeps_old_name',
    kept_name = 'Sam Spark',
    coalesce(kept_name, 'null')
  );
END $$;

DO $$
DECLARE
  r text;
  s_name text;
  s_id uuid;
  rc bigint;
  cur text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    SELECT current_user INTO cur;
    UPDATE public.inspections
      SET inspector_id = '33333333-3333-3333-3333-333333333333'
      WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    GET DIAGNOSTICS rc = ROW_COUNT;
    r := '00000|' || rc || '|' || coalesce(cur, '?');
  EXCEPTION WHEN OTHERS THEN
    r := SQLSTATE || '|' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT inspector_id, inspector_name_snapshot INTO s_id, s_name
  FROM public.inspections WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'member_reassign_fills_hidden_teammate',
    coalesce(r LIKE '00000|1|%' AND s_id = '33333333-3333-3333-3333-333333333333' AND s_name = 'Sam Spark', false),
    coalesce(r, 'null') || '|' || coalesce(s_id::text, 'null') || '|' || coalesce(s_name, 'null')
  );
END $$;

ALTER FUNCTION public.inspections_fill_inspector_snapshots() SECURITY INVOKER;

DO $$
DECLARE
  r text;
  s_name text;
  s_id uuid;
  prosecdef boolean;
  reassign_ok boolean;
BEGIN
  SELECT p.prosecdef INTO prosecdef
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'inspections_fill_inspector_snapshots';

  UPDATE public.inspections
    SET inspector_id = '22222222-2222-2222-2222-222222222222',
        inspector_name_snapshot = 'Pat Snapshot'
    WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.inspections
      SET inspector_id = '33333333-3333-3333-3333-333333333333'
      WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    r := '00000';
  EXCEPTION WHEN OTHERS THEN
    r := SQLSTATE || '|' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  SELECT inspector_id, inspector_name_snapshot INTO s_id, s_name
  FROM public.inspections WHERE id = 'd0aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  reassign_ok := r LIKE '00000%' AND s_id = '33333333-3333-3333-3333-333333333333' AND s_name = 'Sam Spark';
  INSERT INTO proof_result VALUES (
    'mutant_security_invoker_applied',
    prosecdef IS NOT TRUE,
    'prosecdef=' || coalesce(prosecdef::text, 'null')
  );
  INSERT INTO proof_result VALUES (
    'mutant_security_invoker_killed',
    reassign_ok IS NOT TRUE,
    'killed by member_reassign_fills_hidden_teammate ' || coalesce(s_name, 'null')
  );
END $$;

ALTER FUNCTION public.inspections_fill_inspector_snapshots() SECURITY DEFINER;

INSERT INTO public.profiles (id, company_id, email, name, licence_number, role)
SELECT '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pat@example.test', 'Pat Snapshot', 'EC-4411', 'member'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222');
UPDATE public.inspections SET inspector_id = '33333333-3333-3333-3333-333333333333'
  WHERE inspector_id IS NULL;
UPDATE public.inspections SET inspector_id = '22222222-2222-2222-2222-222222222222'
  WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
DROP TRIGGER IF EXISTS trg_inspections_fill_inspector_snapshots ON public.inspections;
DROP FUNCTION IF EXISTS public.inspections_fill_inspector_snapshots();
ALTER TABLE public.inspections DROP COLUMN IF EXISTS inspector_name_snapshot;
ALTER TABLE public.inspections DROP COLUMN IF EXISTS inspector_licence_snapshot;
ALTER TABLE public.inspections ALTER COLUMN inspector_id SET NOT NULL;

ALTER TABLE public.inspections
  ADD COLUMN inspector_name_snapshot text,
  ADD COLUMN inspector_licence_snapshot text;
CREATE OR REPLACE FUNCTION public.inspections_fill_inspector_snapshots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_inspections_fill_inspector_snapshots
  BEFORE INSERT OR UPDATE OF inspector_id ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.inspections_fill_inspector_snapshots();
ALTER TABLE public.inspections ALTER COLUMN inspector_id DROP NOT NULL;

DO $$
DECLARE
  row_n int;
  snap_n int;
BEGIN
  SELECT count(*) INTO row_n FROM public.inspections;
  SELECT count(*) INTO snap_n FROM public.inspections WHERE inspector_name_snapshot IS NOT NULL;
  INSERT INTO proof_result VALUES (
    'mutant_no_backfill_applied',
    snap_n = 0 AND row_n > 0,
    'rows=' || row_n || ' snaps=' || snap_n
  );
  INSERT INTO proof_result VALUES (
    'mutant_no_backfill_killed',
    snap_n <> row_n,
    'killed by backfill_count_equals_row_count snaps=' || snap_n || ' rows=' || row_n
  );
END $$;

\ir ../migrations/20261019150000_sec_insp_inspector_snapshots.sql

CREATE OR REPLACE FUNCTION public.inspections_fill_inspector_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_licence text;
BEGIN
  SELECT p.name, p.licence_number INTO v_name, v_licence
  FROM public.profiles p WHERE p.id = NEW.inspector_id;
  NEW.inspector_name_snapshot := v_name;
  NEW.inspector_licence_snapshot := v_licence;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  kept text;
BEGIN
  UPDATE public.inspections
    SET inspector_name_snapshot = 'Pat Snapshot',
        inspector_licence_snapshot = 'EC-4411',
        inspector_id = '22222222-2222-2222-2222-222222222222'
    WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  UPDATE public.inspections SET inspector_id = NULL
    WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT inspector_name_snapshot INTO kept
  FROM public.inspections WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'mutant_overwrite_on_null_applied',
    kept IS DISTINCT FROM 'Pat Snapshot',
    coalesce(kept, 'null')
  );
  INSERT INTO proof_result VALUES (
    'mutant_overwrite_on_null_killed',
    kept IS DISTINCT FROM 'Pat Snapshot',
    'killed by trigger_survives_set_null ' || coalesce(kept, 'null')
  );
END $$;

\ir ../migrations/20261019150000_sec_insp_inspector_snapshots.sql

DROP TRIGGER IF EXISTS trg_inspections_fill_inspector_snapshots ON public.inspections;
CREATE TRIGGER trg_inspections_fill_inspector_snapshots
  BEFORE INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.inspections_fill_inspector_snapshots();

DO $$
DECLARE
  changed text;
BEGIN
  UPDATE public.inspections
    SET inspector_id = '22222222-2222-2222-2222-222222222222',
        inspector_name_snapshot = 'Pat Snapshot'
    WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  UPDATE public.inspections
    SET inspector_id = '33333333-3333-3333-3333-333333333333'
    WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT inspector_name_snapshot INTO changed
  FROM public.inspections WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  INSERT INTO proof_result VALUES (
    'mutant_trigger_missing_update_applied',
    changed = 'Pat Snapshot',
    coalesce(changed, 'null')
  );
  INSERT INTO proof_result VALUES (
    'mutant_trigger_missing_update_killed',
    changed IS DISTINCT FROM 'Sam Spark',
    'killed by trigger_fills_on_inspector_change ' || coalesce(changed, 'null')
  );
END $$;

\ir ../migrations/20261019150000_sec_insp_inspector_snapshots.sql

DROP TRIGGER IF EXISTS trg_inspections_fill_inspector_snapshots ON public.inspections;
DROP FUNCTION IF EXISTS public.inspections_fill_inspector_snapshots();
ALTER TABLE public.inspections DROP COLUMN IF EXISTS inspector_name_snapshot;
ALTER TABLE public.inspections DROP COLUMN IF EXISTS inspector_licence_snapshot;
UPDATE public.inspections SET inspector_id = '33333333-3333-3333-3333-333333333333'
  WHERE inspector_id IS NULL;
ALTER TABLE public.inspections ALTER COLUMN inspector_id SET NOT NULL;
INSERT INTO public.profiles (id, company_id, email, name, licence_number, role)
SELECT '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pat@example.test', 'Pat Snapshot', 'EC-4411', 'member'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222');
UPDATE public.inspections SET inspector_id = '22222222-2222-2222-2222-222222222222'
  WHERE id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
ALTER TABLE public.inspections
  ADD COLUMN inspector_name_snapshot text,
  ADD COLUMN inspector_licence_snapshot text;
UPDATE public.inspections AS i
SET inspector_name_snapshot = p.name, inspector_licence_snapshot = p.licence_number
FROM public.profiles AS p WHERE p.id = i.inspector_id;
CREATE OR REPLACE FUNCTION public.inspections_fill_inspector_snapshots()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.inspector_id IS NULL THEN RETURN NEW; END IF;
  SELECT p.name, p.licence_number INTO NEW.inspector_name_snapshot, NEW.inspector_licence_snapshot
  FROM public.profiles p WHERE p.id = NEW.inspector_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_inspections_fill_inspector_snapshots
  BEFORE INSERT OR UPDATE OF inspector_id ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.inspections_fill_inspector_snapshots();

DO $$
DECLARE
  del_sqlstate text;
  del_msg text;
BEGIN
  BEGIN
    DELETE FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
    del_sqlstate := '00000';
    del_msg := 'deleted';
  EXCEPTION WHEN OTHERS THEN
    del_sqlstate := SQLSTATE;
    del_msg := SQLERRM;
  END;
  INSERT INTO proof_result VALUES (
    'mutant_not_null_kept_applied',
    del_sqlstate = '23502',
    del_sqlstate || '|' || del_msg
  );
  INSERT INTO proof_result VALUES (
    'mutant_not_null_kept_killed',
    del_sqlstate <> '00000',
    'killed by member_delete_succeeds_keeps_snapshot ' || del_sqlstate
  );
END $$;

\ir ../migrations/20261019150000_sec_insp_inspector_snapshots.sql

DO $$
DECLARE
  failed text;
BEGIN
  SELECT string_agg(name || '=' || ok || ':' || coalesce(detail, ''), ', ' ORDER BY name)
    INTO failed
  FROM proof_result
  WHERE ok IS NOT TRUE;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION 'SEC-INSP-2 proofs failed: %', failed;
  END IF;
END $$;

SELECT name, ok, detail FROM proof_result ORDER BY name;

\endif

COMMIT;
