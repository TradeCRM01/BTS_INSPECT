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
  company_id uuid NOT NULL REFERENCES public.companies(id),
  email text,
  name text
);

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY,
  inspector_id uuid NOT NULL REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.client_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  last_accessed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inspection_report_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_report_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Company members can view clients" ON public.clients;
CREATE POLICY "Company members can view clients"
  ON public.clients FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users can view company inspections" ON public.inspections;
CREATE POLICY "Users can view company inspections"
  ON public.inspections FOR SELECT
  TO authenticated
  USING (
    (SELECT company_id FROM public.profiles WHERE id = inspector_id)
    = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "select_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "select_company_portal_tokens" ON client_portal_tokens FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "insert_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "insert_company_portal_tokens" ON client_portal_tokens FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "update_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "update_company_portal_tokens" ON client_portal_tokens FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "delete_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "delete_company_portal_tokens" ON client_portal_tokens FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DROP POLICY IF EXISTS "inspection_report_shares_select" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_select"
  ON public.inspection_report_shares FOR SELECT
  TO authenticated
  USING (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

DROP POLICY IF EXISTS "inspection_report_shares_insert" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_insert"
  ON public.inspection_report_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

DROP POLICY IF EXISTS "inspection_report_shares_update" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_update"
  ON public.inspection_report_shares FOR UPDATE
  TO authenticated
  USING (
    company_id = (select company_id from public.profiles where id = auth.uid())
  )
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

DROP POLICY IF EXISTS "inspection_report_shares_delete" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_delete"
  ON public.inspection_report_shares FOR DELETE
  TO authenticated
  USING (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.clients TO authenticated;
GRANT SELECT ON public.inspections TO authenticated;
GRANT ALL ON public.client_portal_tokens TO anon, authenticated;
GRANT ALL ON public.inspection_report_shares TO anon, authenticated;

DELETE FROM public.inspection_report_shares;
DELETE FROM public.client_portal_tokens;
DELETE FROM public.inspections;
DELETE FROM public.clients;
DELETE FROM public.profiles;
DELETE FROM public.companies;

INSERT INTO public.companies (id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B');

INSERT INTO public.profiles (id, company_id, email, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test', 'Member A'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'y@example.test', 'Member Y'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test', 'Member B');

INSERT INTO public.clients (id, company_id, name) VALUES
  ('caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Client A'),
  ('cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Client B');

INSERT INTO public.inspections (id, inspector_id) VALUES
  ('daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333'),
  ('dbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222');

COMMIT;

\if :{?sec_portal_b_fixture_only}
\echo fixture only
\else

\ir ../migrations/20261019120000_sec_portal_b_share_fk_rls.sql

CREATE TEMP TABLE proof_result (
  check_id text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text NOT NULL
);

CREATE OR REPLACE FUNCTION public.proof_as_authenticated(p_uid uuid)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.proof_as_anon()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'anon')::text,
    false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_portal_test_portal_cross_insert()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_msg text;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.client_portal_tokens (company_id, client_id, token)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'portal-cross-insert'
    );
    v_state := '00000';
    v_msg := 'insert succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  RETURN v_state || '|' || v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_portal_test_shares_cross_insert()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_msg text;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_report_shares (company_id, inspection_id, token)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'dbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'shares-cross-insert'
    );
    v_state := '00000';
    v_msg := 'insert succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  RETURN v_state || '|' || v_msg;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_portal_test_portal_repoint()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_msg text;
  v_left uuid;
BEGIN
  INSERT INTO public.client_portal_tokens (id, company_id, client_id, token)
  VALUES (
    'ea000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'portal-repoint-seed'
  )
  ON CONFLICT (id) DO UPDATE
    SET client_id = 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.client_portal_tokens
    SET client_id = 'cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE id = 'ea000000-0000-4000-8000-000000000001';
    v_state := '00000';
    v_msg := 'update succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT client_id INTO v_left
  FROM public.client_portal_tokens
  WHERE id = 'ea000000-0000-4000-8000-000000000001';
  RETURN v_state || '|' || v_msg || '|' || v_left::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_portal_test_shares_repoint()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_state text;
  v_msg text;
  v_left uuid;
BEGIN
  INSERT INTO public.inspection_report_shares (id, company_id, inspection_id, token)
  VALUES (
    'eb000000-0000-4000-8000-000000000001',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'shares-repoint-seed'
  )
  ON CONFLICT (id) DO UPDATE
    SET inspection_id = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.inspection_report_shares
    SET inspection_id = 'dbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE id = 'eb000000-0000-4000-8000-000000000001';
    v_state := '00000';
    v_msg := 'update succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT inspection_id INTO v_left
  FROM public.inspection_report_shares
  WHERE id = 'eb000000-0000-4000-8000-000000000001';
  RETURN v_state || '|' || v_msg || '|' || v_left::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_portal_test_shares_teammate_write()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_ins text;
  v_upd text;
  v_id uuid;
  v_revoked boolean;
BEGIN
  DELETE FROM public.inspection_report_shares
  WHERE token = 'shares-teammate-write';
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_report_shares (company_id, inspection_id, token, created_by)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'deaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'shares-teammate-write',
      '11111111-1111-1111-1111-111111111111'
    )
    RETURNING id INTO v_id;
    v_ins := '00000';
  EXCEPTION WHEN OTHERS THEN
    v_ins := SQLSTATE;
  END;
  BEGIN
    UPDATE public.inspection_report_shares
    SET revoked = true
    WHERE token = 'shares-teammate-write';
    v_upd := '00000';
  EXCEPTION WHEN OTHERS THEN
    v_upd := SQLSTATE;
  END;
  RESET ROLE;
  SELECT revoked INTO v_revoked
  FROM public.inspection_report_shares
  WHERE token = 'shares-teammate-write';
  RETURN v_ins || '|' || v_upd || '|' || coalesce(v_id::text, 'null')
    || '|revoked=' || coalesce(v_revoked::text, 'null');
END;
$$;

CREATE OR REPLACE FUNCTION public.sec_portal_test_anon_no_access()
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_sel text := '00000';
  v_ins text := '00000';
  v_upd text := '00000';
  v_trunc text := '00000';
  v_priv_sel boolean;
  v_priv_ins boolean;
  v_priv_trunc boolean;
BEGIN
  PERFORM public.proof_as_anon();
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM count(*) FROM public.client_portal_tokens;
  EXCEPTION WHEN OTHERS THEN
    v_sel := SQLSTATE;
  END;
  BEGIN
    INSERT INTO public.client_portal_tokens (company_id, client_id, token)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'anon-portal'
    );
  EXCEPTION WHEN OTHERS THEN
    v_ins := SQLSTATE;
  END;
  BEGIN
    UPDATE public.inspection_report_shares SET revoked = true;
  EXCEPTION WHEN OTHERS THEN
    v_upd := SQLSTATE;
  END;
  BEGIN
    TRUNCATE public.client_portal_tokens;
  EXCEPTION WHEN OTHERS THEN
    v_trunc := SQLSTATE;
  END;
  RESET ROLE;
  v_priv_sel := has_table_privilege('anon', 'public.client_portal_tokens', 'SELECT')
    OR has_table_privilege('anon', 'public.inspection_report_shares', 'SELECT');
  v_priv_ins := has_table_privilege('anon', 'public.client_portal_tokens', 'INSERT')
    OR has_table_privilege('anon', 'public.inspection_report_shares', 'INSERT');
  v_priv_trunc := has_table_privilege('anon', 'public.client_portal_tokens', 'TRUNCATE')
    OR has_table_privilege('anon', 'public.inspection_report_shares', 'TRUNCATE');
  RETURN v_sel || '|' || v_ins || '|' || v_upd || '|' || v_trunc
    || '|priv=' || v_priv_sel::text || '/' || v_priv_ins::text || '/' || v_priv_trunc::text;
END;
$$;

DO $$
DECLARE
  r text;
BEGIN
  r := public.sec_portal_test_portal_cross_insert();
  INSERT INTO proof_result VALUES (
    'portal_cross_insert_42501',
    split_part(r, '|', 1) = '42501',
    r
  );
END $$;

DO $$
DECLARE
  r text;
BEGIN
  r := public.sec_portal_test_shares_cross_insert();
  INSERT INTO proof_result VALUES (
    'shares_cross_insert_42501',
    split_part(r, '|', 1) = '42501',
    r
  );
END $$;

DO $$
DECLARE
  r text;
BEGIN
  r := public.sec_portal_test_portal_repoint();
  INSERT INTO proof_result VALUES (
    'portal_repoint_42501',
    split_part(r, '|', 1) = '42501'
      AND split_part(r, '|', 3) = 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    r
  );
END $$;

DO $$
DECLARE
  r text;
BEGIN
  r := public.sec_portal_test_shares_repoint();
  INSERT INTO proof_result VALUES (
    'shares_repoint_42501',
    split_part(r, '|', 1) = '42501'
      AND split_part(r, '|', 3) = 'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    r
  );
END $$;

DO $$
DECLARE
  v_state text;
  v_id uuid;
  v_revoked boolean;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.client_portal_tokens (company_id, client_id, token)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'portal-same-insert'
    )
    RETURNING id INTO v_id;
    v_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'portal_same_company_insert',
    v_state = '00000' AND v_id IS NOT NULL,
    coalesce(v_state, 'ok') || ' id=' || coalesce(v_id::text, 'null')
  );

  IF v_id IS NOT NULL THEN
    PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.client_portal_tokens
      SET revoked = true
      WHERE id = v_id;
      v_state := '00000';
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE;
    END;
    RESET ROLE;
    SELECT revoked INTO v_revoked FROM public.client_portal_tokens WHERE id = v_id;
    INSERT INTO proof_result VALUES (
      'portal_same_company_update',
      v_state = '00000' AND v_revoked IS TRUE,
      coalesce(v_state, 'ok') || ' revoked=' || coalesce(v_revoked::text, 'null')
    );
  END IF;
END $$;

DO $$
DECLARE
  v_state text;
  v_id uuid;
  v_revoked boolean;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_report_shares (company_id, inspection_id, token, created_by)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'daaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'shares-same-insert',
      '11111111-1111-1111-1111-111111111111'
    )
    RETURNING id INTO v_id;
    v_state := '00000';
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'shares_same_company_insert',
    v_state = '00000' AND v_id IS NOT NULL,
    coalesce(v_state, 'ok') || ' id=' || coalesce(v_id::text, 'null')
  );

  IF v_id IS NOT NULL THEN
    PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.inspection_report_shares
      SET revoked = true
      WHERE id = v_id;
      v_state := '00000';
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE;
    END;
    RESET ROLE;
    SELECT revoked INTO v_revoked FROM public.inspection_report_shares WHERE id = v_id;
    INSERT INTO proof_result VALUES (
      'shares_same_company_update',
      v_state = '00000' AND v_revoked IS TRUE,
      coalesce(v_state, 'ok') || ' revoked=' || coalesce(v_revoked::text, 'null')
    );
  END IF;
END $$;

DO $$
DECLARE
  r text;
BEGIN
  r := public.sec_portal_test_shares_teammate_write();
  INSERT INTO proof_result VALUES (
    'shares_teammate_write',
    split_part(r, '|', 1) = '00000'
      AND split_part(r, '|', 2) = '00000'
      AND split_part(r, '|', 3) <> 'null'
      AND r LIKE '%revoked=true',
    r
  );
END $$;

DO $$
DECLARE
  r text;
  v_auth_trunc boolean;
  v_auth_trig boolean;
  v_auth_ref boolean;
BEGIN
  r := public.sec_portal_test_anon_no_access();
  INSERT INTO proof_result VALUES (
    'anon_no_access',
    split_part(r, '|', 1) = '42501'
      AND split_part(r, '|', 2) = '42501'
      AND split_part(r, '|', 3) = '42501'
      AND split_part(r, '|', 4) = '42501'
      AND r LIKE '%priv=false/false/false',
    r
  );
  v_auth_trunc := has_table_privilege('authenticated', 'public.client_portal_tokens', 'TRUNCATE')
    OR has_table_privilege('authenticated', 'public.inspection_report_shares', 'TRUNCATE');
  v_auth_trig := has_table_privilege('authenticated', 'public.client_portal_tokens', 'TRIGGER')
    OR has_table_privilege('authenticated', 'public.inspection_report_shares', 'TRIGGER');
  v_auth_ref := has_table_privilege('authenticated', 'public.client_portal_tokens', 'REFERENCES')
    OR has_table_privilege('authenticated', 'public.inspection_report_shares', 'REFERENCES');
  INSERT INTO proof_result VALUES (
    'authenticated_no_truncate_trigger_references',
    NOT v_auth_trunc AND NOT v_auth_trig AND NOT v_auth_ref,
    'trunc=' || v_auth_trunc::text || ' trig=' || v_auth_trig::text || ' ref=' || v_auth_ref::text
  );
END $$;

DROP POLICY IF EXISTS "insert_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "insert_company_portal_tokens" ON client_portal_tokens FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );
DROP POLICY IF EXISTS "update_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "update_company_portal_tokens" ON client_portal_tokens FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );

DO $$
DECLARE
  r text;
  has_exists boolean;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) LIKE '%clients%'
  INTO has_exists
  FROM pg_policy
  WHERE polname = 'insert_company_portal_tokens';
  r := public.sec_portal_test_portal_cross_insert();
  INSERT INTO proof_result VALUES (
    'mutant_drop_portal_exists_applied',
    has_exists IS NOT TRUE AND split_part(r, '|', 1) = '00000',
    'exists=' || coalesce(has_exists::text, 'null') || ' ' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_portal_exists_killed',
    split_part(r, '|', 1) <> '42501',
    'killed by sec_portal_test_portal_cross_insert ' || r
  );
END $$;

\ir ../migrations/20261019120000_sec_portal_b_share_fk_rls.sql

DROP POLICY IF EXISTS "inspection_report_shares_insert" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_insert"
  ON public.inspection_report_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );
DROP POLICY IF EXISTS "inspection_report_shares_update" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_update"
  ON public.inspection_report_shares FOR UPDATE
  TO authenticated
  USING (
    company_id = (select company_id from public.profiles where id = auth.uid())
  )
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

DO $$
DECLARE
  r text;
  has_exists boolean;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) LIKE '%inspections%'
  INTO has_exists
  FROM pg_policy
  WHERE polname = 'inspection_report_shares_insert';
  r := public.sec_portal_test_shares_cross_insert();
  INSERT INTO proof_result VALUES (
    'mutant_drop_shares_exists_applied',
    has_exists IS NOT TRUE AND split_part(r, '|', 1) = '00000',
    'exists=' || coalesce(has_exists::text, 'null') || ' ' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_shares_exists_killed',
    split_part(r, '|', 1) <> '42501',
    'killed by sec_portal_test_shares_cross_insert ' || r
  );
END $$;

\ir ../migrations/20261019120000_sec_portal_b_share_fk_rls.sql

DROP POLICY IF EXISTS "update_company_portal_tokens" ON client_portal_tokens;
CREATE POLICY "update_company_portal_tokens" ON client_portal_tokens FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.company_id = client_portal_tokens.company_id)
  );
DROP POLICY IF EXISTS "inspection_report_shares_update" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_update"
  ON public.inspection_report_shares FOR UPDATE
  TO authenticated
  USING (
    company_id = (select company_id from public.profiles where id = auth.uid())
  );

DO $$
DECLARE
  r_portal text;
  r_shares text;
  portal_check text;
  shares_check text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO portal_check
  FROM pg_policy
  WHERE polname = 'update_company_portal_tokens';
  SELECT pg_get_expr(polwithcheck, polrelid) INTO shares_check
  FROM pg_policy
  WHERE polname = 'inspection_report_shares_update';
  r_portal := public.sec_portal_test_portal_repoint();
  r_shares := public.sec_portal_test_shares_repoint();
  INSERT INTO proof_result VALUES (
    'mutant_drop_update_check_applied',
    (portal_check IS NULL OR portal_check NOT LIKE '%clients%')
      AND (shares_check IS NULL OR shares_check NOT LIKE '%inspections%')
      AND split_part(r_portal, '|', 1) = '00000'
      AND split_part(r_shares, '|', 1) = '00000',
    'portal_check=' || coalesce(portal_check, 'null')
      || ' shares_check=' || coalesce(shares_check, 'null')
      || ' ' || r_portal || ' ' || r_shares
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_update_check_killed',
    split_part(r_portal, '|', 1) <> '42501'
      AND split_part(r_shares, '|', 1) <> '42501',
    'killed by sec_portal_test_portal_repoint and sec_portal_test_shares_repoint'
  );
END $$;

\ir ../migrations/20261019120000_sec_portal_b_share_fk_rls.sql

DROP POLICY IF EXISTS "inspection_report_shares_insert" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_insert"
  ON public.inspection_report_shares FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
    AND EXISTS (select 1 from public.inspections i join public.profiles p on p.id = i.inspector_id where i.id = inspection_report_shares.inspection_id and p.company_id = inspection_report_shares.company_id)
  );
DROP POLICY IF EXISTS "inspection_report_shares_update" ON public.inspection_report_shares;
CREATE POLICY "inspection_report_shares_update"
  ON public.inspection_report_shares FOR UPDATE
  TO authenticated
  USING (
    company_id = (select company_id from public.profiles where id = auth.uid())
  )
  WITH CHECK (
    company_id = (select company_id from public.profiles where id = auth.uid())
    AND EXISTS (select 1 from public.inspections i join public.profiles p on p.id = i.inspector_id where i.id = inspection_report_shares.inspection_id and p.company_id = inspection_report_shares.company_id)
  );

DO $$
DECLARE
  r text;
  uses_helper boolean;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) LIKE '%inspection_inspector_company_id%'
  INTO uses_helper
  FROM pg_policy
  WHERE polname = 'inspection_report_shares_insert';
  r := public.sec_portal_test_shares_teammate_write();
  INSERT INTO proof_result VALUES (
    'mutant_join_profiles_teammate_applied',
    uses_helper IS NOT TRUE AND split_part(r, '|', 1) = '42501',
    'helper=' || coalesce(uses_helper::text, 'null') || ' ' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_join_profiles_teammate_killed',
    split_part(r, '|', 1) <> '00000',
    'killed by sec_portal_test_shares_teammate_write ' || r
  );
END $$;

\ir ../migrations/20261019120000_sec_portal_b_share_fk_rls.sql

GRANT ALL ON public.client_portal_tokens TO anon;
GRANT ALL ON public.inspection_report_shares TO anon;

DO $$
DECLARE
  r text;
  v_priv boolean;
BEGIN
  v_priv := has_table_privilege('anon', 'public.client_portal_tokens', 'SELECT')
    AND has_table_privilege('anon', 'public.inspection_report_shares', 'TRUNCATE');
  r := public.sec_portal_test_anon_no_access();
  INSERT INTO proof_result VALUES (
    'mutant_drop_anon_revoke_applied',
    v_priv IS TRUE,
    'priv=' || v_priv::text || ' ' || r
  );
  INSERT INTO proof_result VALUES (
    'mutant_drop_anon_revoke_killed',
    r NOT LIKE '%priv=false/false/false'
      OR split_part(r, '|', 1) <> '42501'
      OR split_part(r, '|', 4) <> '42501',
    'killed by sec_portal_test_anon_no_access ' || r
  );
END $$;

\ir ../migrations/20261019120000_sec_portal_b_share_fk_rls.sql

DO $$
DECLARE
  r text;
BEGIN
  r := public.sec_portal_test_portal_cross_insert();
  INSERT INTO proof_result VALUES (
    'restore_portal_cross_insert_42501',
    split_part(r, '|', 1) = '42501',
    r
  );
  r := public.sec_portal_test_shares_teammate_write();
  INSERT INTO proof_result VALUES (
    'restore_shares_teammate_write',
    split_part(r, '|', 1) = '00000' AND split_part(r, '|', 2) = '00000',
    r
  );
  r := public.sec_portal_test_anon_no_access();
  INSERT INTO proof_result VALUES (
    'restore_anon_no_access',
    r LIKE '%priv=false/false/false' AND split_part(r, '|', 1) = '42501',
    r
  );
END $$;

SELECT check_id, ok, detail FROM proof_result ORDER BY check_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM proof_result WHERE NOT ok) THEN
    RAISE EXCEPTION 'sec_portal_b proofs failed: %',
      (SELECT string_agg(check_id || '=' || detail, ', ') FROM proof_result WHERE NOT ok);
  END IF;
END $$;

\endif
