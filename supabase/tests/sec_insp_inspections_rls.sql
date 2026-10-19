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
  name text
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id),
  email text,
  name text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member'))
);

CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY,
  inspector_id uuid REFERENCES public.profiles(id),
  status text NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.client_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  token text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.inspection_report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id),
  token text NOT NULL UNIQUE
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_report_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view company inspections" ON inspections;
CREATE POLICY "Users can view company inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

DROP POLICY IF EXISTS "Users can create inspections" ON inspections;
CREATE POLICY "Users can create inspections"
  ON inspections FOR INSERT
  TO authenticated
  WITH CHECK (inspector_id = auth.uid());

DROP POLICY IF EXISTS "Users can update company inspections" ON inspections;
CREATE POLICY "Users can update company inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  )
  WITH CHECK (
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

DROP POLICY IF EXISTS "Admins can delete company inspections" ON inspections;
CREATE POLICY "Admins can delete company inspections"
  ON inspections FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    AND
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;

DELETE FROM public.inspection_report_shares;
DELETE FROM public.client_portal_tokens;
DELETE FROM public.inspections;
DELETE FROM public.clients;
DELETE FROM public.profiles;
DELETE FROM public.companies;

INSERT INTO public.companies (id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B');

INSERT INTO public.profiles (id, company_id, email, name, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x@example.test', 'Member X', 'member'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'y@example.test', 'Member Y', 'member'),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-a@example.test', 'Admin A', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin-b@example.test', 'Admin B', 'admin'),
  ('55555555-5555-5555-5555-555555555555', NULL, 'n@example.test', 'NullCo', 'member');

INSERT INTO public.clients (id, company_id, name) VALUES
  ('caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Client A');

INSERT INTO public.inspections (id, inspector_id, status) VALUES
  ('daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'draft'),
  ('deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'draft'),
  ('ddaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'draft'),
  ('dbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'draft');

COMMIT;

\ir ../migrations/20261019120000_sec_portal_b_share_fk_rls.sql

CREATE OR REPLACE FUNCTION public.sec_insp_as_authenticated(p_uid uuid)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
  ELSE
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
      false
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_seed_delete_target()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.inspections (id, inspector_id, status) VALUES
    ('ddaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'draft')
  ON CONFLICT (id) DO UPDATE
    SET inspector_id = EXCLUDED.inspector_id,
        status = 'draft';
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_teammate_select()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n bigint;
BEGIN
  PERFORM public.sec_insp_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n
  FROM public.inspections
  WHERE inspector_id = '33333333-3333-3333-3333-333333333333';
  RESET ROLE;
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_teammate_update()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.inspections
    SET status = 'draft'
    WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  PERFORM public.sec_insp_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  UPDATE public.inspections
    SET status = 'in_progress'
    WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  UPDATE public.inspections
    SET status = 'draft'
    WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_admin_delete()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.sec_insp_seed_delete_target();
  PERFORM public.sec_insp_as_authenticated('44444444-4444-4444-4444-444444444444');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.inspections
  WHERE id = 'ddaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  PERFORM public.sec_insp_seed_delete_target();
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_member_delete()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.sec_insp_seed_delete_target();
  PERFORM public.sec_insp_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.inspections
  WHERE id = 'ddaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  PERFORM public.sec_insp_seed_delete_target();
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_company_b_select()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n bigint;
BEGIN
  PERFORM public.sec_insp_as_authenticated('22222222-2222-2222-2222-222222222222');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n
  FROM public.inspections
  WHERE inspector_id = '33333333-3333-3333-3333-333333333333';
  RESET ROLE;
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_company_b_update()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.sec_insp_as_authenticated('22222222-2222-2222-2222-222222222222');
  SET LOCAL ROLE authenticated;
  UPDATE public.inspections
    SET status = 'hacked'
    WHERE id = 'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_company_b_delete()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.sec_insp_seed_delete_target();
  PERFORM public.sec_insp_as_authenticated('22222222-2222-2222-2222-222222222222');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.inspections
  WHERE id = 'ddaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  PERFORM public.sec_insp_seed_delete_target();
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_insert_own()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_msg text;
BEGIN
  DELETE FROM public.inspections WHERE id = 'dccccccc-cccc-cccc-cccc-cccccccccccc';
  PERFORM public.sec_insp_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspections (id, inspector_id, status)
    VALUES (
      'dccccccc-cccc-cccc-cccc-cccccccccccc',
      '11111111-1111-1111-1111-111111111111',
      'draft'
    );
    v_state := '00000';
    v_msg := 'insert succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  DELETE FROM public.inspections WHERE id = 'dccccccc-cccc-cccc-cccc-cccccccccccc';
  RETURN v_state || '|' || v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_insert_other()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_msg text;
BEGIN
  DELETE FROM public.inspections WHERE id = 'dfffffff-ffff-ffff-ffff-ffffffffffff';
  PERFORM public.sec_insp_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspections (id, inspector_id, status)
    VALUES (
      'dfffffff-ffff-ffff-ffff-ffffffffffff',
      '33333333-3333-3333-3333-333333333333',
      'draft'
    );
    v_state := '00000';
    v_msg := 'insert succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  DELETE FROM public.inspections WHERE id = 'dfffffff-ffff-ffff-ffff-ffffffffffff';
  RETURN v_state || '|' || v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_insert_policy_expr()
RETURNS text
LANGUAGE sql AS $$
  SELECT coalesce(pg_get_expr(polwithcheck, polrelid), '')
  FROM pg_policy
  WHERE polname = 'Users can create inspections'
    AND polrelid = 'public.inspections'::regclass
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_reassign(
  p_uid uuid,
  p_insp uuid,
  p_new uuid
)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_n integer;
  v_old uuid;
BEGIN
  SELECT inspector_id INTO v_old
  FROM public.inspections
  WHERE id = p_insp;
  PERFORM public.sec_insp_as_authenticated(p_uid);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.inspections
      SET inspector_id = p_new
      WHERE id = p_insp;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_state := '00000|' || v_n::text;
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE || '|' || SQLERRM;
  END;
  RESET ROLE;
  UPDATE public.inspections
    SET inspector_id = v_old
    WHERE id = p_insp;
  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_reassign_teammate_to_b()
RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.sec_insp_test_reassign(
    '11111111-1111-1111-1111-111111111111',
    'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_reassign_own_to_b()
RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.sec_insp_test_reassign(
    '11111111-1111-1111-1111-111111111111',
    'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '22222222-2222-2222-2222-222222222222'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_reassign_null_inspector()
RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  RETURN public.sec_insp_test_reassign(
    '11111111-1111-1111-1111-111111111111',
    'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_unscoped_select(p_uid uuid)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n bigint;
BEGIN
  PERFORM public.sec_insp_as_authenticated(p_uid);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM public.inspections;
  RESET ROLE;
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_unscoped_update(p_uid uuid)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  PERFORM public.sec_insp_as_authenticated(p_uid);
  SET LOCAL ROLE authenticated;
  UPDATE public.inspections SET status = 'x';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  UPDATE public.inspections SET status = 'draft' WHERE status = 'x';
  RETURN v_n::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_insp_test_profile_helper_caller()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_same uuid;
  v_other uuid;
BEGIN
  PERFORM public.sec_insp_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  SELECT public.profile_company_id_for_caller('33333333-3333-3333-3333-333333333333')
    INTO v_same;
  RESET ROLE;
  PERFORM public.sec_insp_as_authenticated('22222222-2222-2222-2222-222222222222');
  SET LOCAL ROLE authenticated;
  SELECT public.profile_company_id_for_caller('33333333-3333-3333-3333-333333333333')
    INTO v_other;
  RESET ROLE;
  RETURN coalesce(v_same::text, 'null') || '|' || coalesce(v_other::text, 'null');
END;
$$;

\if :{?sec_insp_fixture_only}
\echo fixture only
\else

CREATE TEMP TABLE proof_result (
  check_id text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
);

DO $$
DECLARE
  r_sel text;
  r_upd text;
  r_own text;
  r_other text;
  r_own_b text;
BEGIN
  r_sel := public.sec_insp_test_teammate_select();
  r_upd := public.sec_insp_test_teammate_update();
  r_own := public.sec_insp_test_insert_own();
  r_other := public.sec_insp_test_insert_other();
  r_own_b := public.sec_insp_test_reassign_own_to_b();
  INSERT INTO proof_result VALUES (
    'repro_teammate_select_zero',
    r_sel = '0',
    r_sel
  );
  INSERT INTO proof_result VALUES (
    'repro_teammate_update_zero',
    r_upd = '0',
    r_upd
  );
  INSERT INTO proof_result VALUES (
    'baseline_insert_own',
    split_part(r_own, '|', 1) = '00000',
    r_own
  );
  INSERT INTO proof_result VALUES (
    'baseline_insert_other_42501',
    split_part(r_other, '|', 1) = '42501',
    r_other
  );
  INSERT INTO proof_result VALUES (
    'baseline_own_reassign_to_b_42501',
    split_part(r_own_b, '|', 1) = '42501',
    r_own_b
  );
END $$;

\ir ../migrations/20261019140000_sec_insp_inspections_rls.sql

DO $$
DECLARE
  r_sel text;
  r_upd text;
  r_admin_del text;
  r_member_del text;
  r_b_sel text;
  r_b_upd text;
  r_b_del text;
  r_own text;
  r_other text;
  insert_expr text;
  r_team_b text;
  r_own_b text;
  r_null_ins text;
  r_np_sel text;
  r_nu_sel text;
  r_nc_sel text;
  r_np_upd text;
  r_nu_upd text;
  r_nc_upd text;
  r_helper text;
BEGIN
  r_sel := public.sec_insp_test_teammate_select();
  r_upd := public.sec_insp_test_teammate_update();
  r_admin_del := public.sec_insp_test_admin_delete();
  r_member_del := public.sec_insp_test_member_delete();
  r_b_sel := public.sec_insp_test_company_b_select();
  r_b_upd := public.sec_insp_test_company_b_update();
  r_b_del := public.sec_insp_test_company_b_delete();
  r_own := public.sec_insp_test_insert_own();
  r_other := public.sec_insp_test_insert_other();
  insert_expr := public.sec_insp_insert_policy_expr();
  r_team_b := public.sec_insp_test_reassign_teammate_to_b();
  r_own_b := public.sec_insp_test_reassign_own_to_b();
  r_null_ins := public.sec_insp_test_reassign_null_inspector();
  r_np_sel := public.sec_insp_test_unscoped_select('99999999-9999-4999-8999-999999999999');
  r_nu_sel := public.sec_insp_test_unscoped_select(NULL);
  r_nc_sel := public.sec_insp_test_unscoped_select('55555555-5555-5555-5555-555555555555');
  r_np_upd := public.sec_insp_test_unscoped_update('99999999-9999-4999-8999-999999999999');
  r_nu_upd := public.sec_insp_test_unscoped_update(NULL);
  r_nc_upd := public.sec_insp_test_unscoped_update('55555555-5555-5555-5555-555555555555');
  r_helper := public.sec_insp_test_profile_helper_caller();
  INSERT INTO proof_result VALUES (
    'fix_teammate_select',
    r_sel = '2',
    r_sel
  );
  INSERT INTO proof_result VALUES (
    'fix_teammate_update',
    r_upd = '1',
    r_upd
  );
  INSERT INTO proof_result VALUES (
    'fix_admin_delete',
    r_admin_del = '1',
    r_admin_del
  );
  INSERT INTO proof_result VALUES (
    'fix_member_delete_blocked',
    r_member_del = '0',
    r_member_del
  );
  INSERT INTO proof_result VALUES (
    'fix_company_b_select_zero',
    r_b_sel = '0',
    r_b_sel
  );
  INSERT INTO proof_result VALUES (
    'fix_company_b_update_zero',
    r_b_upd = '0',
    r_b_upd
  );
  INSERT INTO proof_result VALUES (
    'fix_company_b_delete_zero',
    r_b_del = '0',
    r_b_del
  );
  INSERT INTO proof_result VALUES (
    'fix_insert_own',
    split_part(r_own, '|', 1) = '00000',
    r_own
  );
  INSERT INTO proof_result VALUES (
    'fix_insert_other_42501',
    split_part(r_other, '|', 1) = '42501',
    r_other
  );
  INSERT INTO proof_result VALUES (
    'fix_insert_policy_unchanged',
    insert_expr IN ('inspector_id = auth.uid()', '(inspector_id = auth.uid())'),
    insert_expr
  );
  INSERT INTO proof_result VALUES (
    'fix_teammate_reassign_to_b_42501',
    split_part(r_team_b, '|', 1) = '42501',
    r_team_b
  );
  INSERT INTO proof_result VALUES (
    'fix_own_reassign_to_b_42501',
    split_part(r_own_b, '|', 1) = '42501',
    r_own_b
  );
  INSERT INTO proof_result VALUES (
    'fix_null_inspector_denied',
    split_part(r_null_ins, '|', 1) = '42501',
    r_null_ins
  );
  INSERT INTO proof_result VALUES (
    'fix_noprofile_nulluid_nullco_select_zero',
    r_np_sel = '0' AND r_nu_sel = '0' AND r_nc_sel = '0',
    r_np_sel || ' ' || r_nu_sel || ' ' || r_nc_sel
  );
  INSERT INTO proof_result VALUES (
    'fix_noprofile_nulluid_nullco_update_zero',
    r_np_upd = '0' AND r_nu_upd = '0' AND r_nc_upd = '0',
    r_np_upd || ' ' || r_nu_upd || ' ' || r_nc_upd
  );
  INSERT INTO proof_result VALUES (
    'fix_profile_helper_caller_company',
    r_helper = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa|null',
    r_helper
  );
END $$;

DROP POLICY IF EXISTS "Users can view company inspections" ON inspections;
CREATE POLICY "Users can view company inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

DO $$
DECLARE
  r text;
  uses_helper boolean;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) LIKE '%inspection_inspector_company_id%'
    INTO uses_helper
  FROM pg_policy
  WHERE polname = 'Users can view company inspections'
    AND polrelid = 'public.inspections'::regclass;
  r := public.sec_insp_test_teammate_select();
  INSERT INTO proof_result VALUES (
    'mutant_select_old_subquery_applied',
    uses_helper IS NOT TRUE AND r = '0',
    'helper=' || coalesce(uses_helper::text, 'null') || ' count=' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_select_old_subquery_killed',
    r <> '2',
    'killed by sec_insp_test_teammate_select ' || r
  );
END $$;

\ir ../migrations/20261019140000_sec_insp_inspections_rls.sql

DROP POLICY IF EXISTS "Users can update company inspections" ON inspections;
CREATE POLICY "Users can update company inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  )
  WITH CHECK (
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

DO $$
DECLARE
  r text;
  uses_helper boolean;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) LIKE '%inspection_inspector_company_id%'
    INTO uses_helper
  FROM pg_policy
  WHERE polname = 'Users can update company inspections'
    AND polrelid = 'public.inspections'::regclass;
  r := public.sec_insp_test_teammate_update();
  INSERT INTO proof_result VALUES (
    'mutant_update_old_subquery_applied',
    uses_helper IS NOT TRUE AND r = '0',
    'helper=' || coalesce(uses_helper::text, 'null') || ' rows=' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_update_old_subquery_killed',
    r <> '1',
    'killed by sec_insp_test_teammate_update ' || r
  );
END $$;

\ir ../migrations/20261019140000_sec_insp_inspections_rls.sql

DROP POLICY IF EXISTS "Admins can delete company inspections" ON inspections;
CREATE POLICY "Admins can delete company inspections"
  ON inspections FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    AND
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

DO $$
DECLARE
  r text;
  uses_helper boolean;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) LIKE '%inspection_inspector_company_id%'
    INTO uses_helper
  FROM pg_policy
  WHERE polname = 'Admins can delete company inspections'
    AND polrelid = 'public.inspections'::regclass;
  r := public.sec_insp_test_admin_delete();
  INSERT INTO proof_result VALUES (
    'mutant_delete_old_subquery_applied',
    uses_helper IS NOT TRUE AND r = '0',
    'helper=' || coalesce(uses_helper::text, 'null') || ' rows=' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_delete_old_subquery_killed',
    r <> '1',
    'killed by sec_insp_test_admin_delete ' || r
  );
END $$;

\ir ../migrations/20261019140000_sec_insp_inspections_rls.sql

DROP POLICY IF EXISTS "Admins can delete company inspections" ON inspections;
CREATE POLICY "Admins can delete company inspections"
  ON inspections FOR DELETE
  TO authenticated
  USING (
    public.inspection_inspector_company_id(inspections.id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DO $$
DECLARE
  r text;
  has_admin boolean;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) LIKE '%role%'
    INTO has_admin
  FROM pg_policy
  WHERE polname = 'Admins can delete company inspections'
    AND polrelid = 'public.inspections'::regclass;
  r := public.sec_insp_test_member_delete();
  INSERT INTO proof_result VALUES (
    'mutant_delete_drop_admin_applied',
    has_admin IS NOT TRUE AND r = '1',
    'admin=' || coalesce(has_admin::text, 'null') || ' rows=' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_delete_drop_admin_killed',
    r <> '0',
    'killed by sec_insp_test_member_delete ' || r
  );
END $$;

\ir ../migrations/20261019140000_sec_insp_inspections_rls.sql

DROP POLICY IF EXISTS "Users can update company inspections" ON inspections;
CREATE POLICY "Users can update company inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    public.inspection_inspector_company_id(inspections.id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DO $$
DECLARE
  r text;
  has_check boolean;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) IS NOT NULL
    INTO has_check
  FROM pg_policy
  WHERE polname = 'Users can update company inspections'
    AND polrelid = 'public.inspections'::regclass;
  r := public.sec_insp_test_reassign_teammate_to_b();
  INSERT INTO proof_result VALUES (
    'mutant_update_no_with_check_applied',
    has_check IS NOT TRUE AND split_part(r, '|', 1) = '00000' AND split_part(r, '|', 2) = '1',
    'check=' || coalesce(has_check::text, 'null') || ' ' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_update_no_with_check_killed',
    split_part(r, '|', 1) <> '42501',
    'killed by sec_insp_test_reassign_teammate_to_b ' || r
  );
END $$;

\ir ../migrations/20261019140000_sec_insp_inspections_rls.sql

CREATE OR REPLACE FUNCTION public.profile_company_id_for_caller(p_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.company_id
  FROM public.profiles p
  WHERE p.id = p_profile_id
$$;

DO $$
DECLARE
  r text;
  has_caller boolean;
BEGIN
  SELECT pg_get_functiondef('public.profile_company_id_for_caller(uuid)'::regprocedure)
    LIKE '%caller.company_id%'
    INTO has_caller;
  r := public.sec_insp_test_profile_helper_caller();
  INSERT INTO proof_result VALUES (
    'mutant_drop_profile_helper_caller_applied',
    has_caller IS NOT TRUE AND split_part(r, '|', 2) <> 'null',
    'caller=' || coalesce(has_caller::text, 'null') || ' ' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_profile_helper_caller_killed',
    split_part(r, '|', 2) <> 'null',
    'killed by sec_insp_test_profile_helper_caller ' || r
  );
END $$;

\ir ../migrations/20261019140000_sec_insp_inspections_rls.sql

DO $$
DECLARE
  r_sel text;
  r_upd text;
  r_admin_del text;
  r_member_del text;
  r_b_sel text;
  r_own text;
  r_other text;
  r_team_b text;
  r_own_b text;
  r_null_ins text;
  r_helper text;
BEGIN
  r_sel := public.sec_insp_test_teammate_select();
  r_upd := public.sec_insp_test_teammate_update();
  r_admin_del := public.sec_insp_test_admin_delete();
  r_member_del := public.sec_insp_test_member_delete();
  r_b_sel := public.sec_insp_test_company_b_select();
  r_own := public.sec_insp_test_insert_own();
  r_other := public.sec_insp_test_insert_other();
  r_team_b := public.sec_insp_test_reassign_teammate_to_b();
  r_own_b := public.sec_insp_test_reassign_own_to_b();
  r_null_ins := public.sec_insp_test_reassign_null_inspector();
  r_helper := public.sec_insp_test_profile_helper_caller();
  INSERT INTO proof_result VALUES (
    'restore_teammate_select',
    r_sel = '2',
    r_sel
  );
  INSERT INTO proof_result VALUES (
    'restore_teammate_update',
    r_upd = '1',
    r_upd
  );
  INSERT INTO proof_result VALUES (
    'restore_admin_delete',
    r_admin_del = '1',
    r_admin_del
  );
  INSERT INTO proof_result VALUES (
    'restore_member_delete_blocked',
    r_member_del = '0',
    r_member_del
  );
  INSERT INTO proof_result VALUES (
    'restore_company_b_select',
    r_b_sel = '0',
    r_b_sel
  );
  INSERT INTO proof_result VALUES (
    'restore_insert_own',
    split_part(r_own, '|', 1) = '00000',
    r_own
  );
  INSERT INTO proof_result VALUES (
    'restore_insert_other_42501',
    split_part(r_other, '|', 1) = '42501',
    r_other
  );
  INSERT INTO proof_result VALUES (
    'restore_teammate_reassign_to_b_42501',
    split_part(r_team_b, '|', 1) = '42501',
    r_team_b
  );
  INSERT INTO proof_result VALUES (
    'restore_own_reassign_to_b_42501',
    split_part(r_own_b, '|', 1) = '42501',
    r_own_b
  );
  INSERT INTO proof_result VALUES (
    'restore_null_inspector_denied',
    split_part(r_null_ins, '|', 1) = '42501',
    r_null_ins
  );
  INSERT INTO proof_result VALUES (
    'restore_profile_helper_caller_company',
    r_helper = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa|null',
    r_helper
  );
END $$;

SELECT check_id, ok, detail FROM proof_result ORDER BY check_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM proof_result WHERE NOT ok) THEN
    RAISE EXCEPTION 'sec_insp proofs failed: %',
      (SELECT string_agg(check_id || '=' || detail, ', ') FROM proof_result WHERE NOT ok);
  END IF;
END $$;

\endif
