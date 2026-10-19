-- Local proof for public.ensure_builtin_renderers and the 090 INSERT policy.
-- Throwaway Postgres only. Never against production.
--
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/ensure_builtin_renderers.sql

BEGIN;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;

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

GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, service_role;

CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY,
  created_by uuid,
  name text
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  email text,
  name text,
  licence_number text,
  schedule_color text,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  template_access text NOT NULL DEFAULT 'view' CHECK (template_access IN ('view', 'edit', 'none')),
  expense_cost_model_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expense_cost_models (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  name text
);

CREATE OR REPLACE FUNCTION public.company_founder_id(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT created_by FROM public.companies WHERE id = p_company_id
$$;

COMMIT;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
);

\ir ../migrations/20261019010000_088_update_member_settings.sql

DELETE FROM public.profiles;
DELETE FROM public.expense_cost_models;
DELETE FROM public.companies;

INSERT INTO public.companies (id, created_by, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '70000000-0000-0000-0000-000000000001', 'Company C'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', '80000000-0000-0000-0000-000000000001', 'Company D');

INSERT INTO public.profiles (id, company_id, email, name, role, template_access) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-a@example.com', 'Owner A', 'admin', 'edit'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-a@example.com', 'Admin A', 'admin', 'edit'),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member-a@example.com', 'Member A', 'member', 'view'),
  ('44444444-4444-4444-4444-444444444445', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'none-tech@example.com', 'None Tech', 'member', 'none'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner-b@example.com', 'Owner B', 'admin', 'edit'),
  ('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member-b@example.com', 'Member B', 'member', 'view'),
  ('70000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'founder-c@example.com', 'Founder C', 'member', 'edit'),
  ('80000000-0000-0000-0000-000000000001', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'owner-d@example.com', 'Owner D', 'admin', 'edit'),
  ('80000000-0000-0000-0000-000000000002', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'member-d@example.com', 'Member D', 'member', 'view');

CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_by uuid,
  name text NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_renderer text NOT NULL DEFAULT 'generic_inspection'
);
CREATE TABLE IF NOT EXISTS public.jha_templates (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_by uuid,
  name text NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  schema jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.inspection_renderers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  key text NOT NULL,
  label text NOT NULL,
  built_in boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.templates(id),
  template_snapshot jsonb NOT NULL,
  inspector_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  crm_job_id uuid
);
CREATE TABLE IF NOT EXISTS public.jha_documents (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.jha_templates(id),
  template_snapshot jsonb NOT NULL,
  company_id uuid NOT NULL,
  created_by uuid NOT NULL,
  job_id uuid
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jha_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_renderers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jha_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jha_templates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_renderers TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jha_documents TO authenticated;

INSERT INTO public.templates (id, company_id, created_by, name, schema) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A inspection', '{}'),
  ('a2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B inspection', '{}');
INSERT INTO public.jha_templates (id, company_id, created_by, name, schema) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A JHA', '{}'),
  ('b2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B JHA', '{}');
INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'generic_inspection', 'Generic Inspection', true),
  ('c2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'generic_inspection', 'Generic Inspection', true),
  ('c3333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'custom_a', 'Custom A', false);

\ir ../migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql
\ir ../migrations/20261019030000_090_ensure_builtin_renderers.sql

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

INSERT INTO proof_result
SELECT 'fn_no_params',
  p.pronargs = 0,
  'pronargs=' || p.pronargs::text
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'ensure_builtin_renderers';

INSERT INTO proof_result
SELECT 'fn_search_path',
  pg_get_functiondef(p.oid) ILIKE '%SET search_path TO ''public'', ''pg_temp''%'
    OR pg_get_functiondef(p.oid) ILIKE '%SET search_path = public, pg_temp%',
  left(pg_get_functiondef(p.oid), 400)
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'ensure_builtin_renderers';

INSERT INTO proof_result
SELECT 'fn_acl_authenticated',
  has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND NOT has_function_privilege('anon', p.oid, 'EXECUTE'),
  coalesce(p.proacl::text, '<null>')
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname = 'ensure_builtin_renderers';

DO $$
DECLARE
  v_state text := 'ALLOWED';
BEGIN
  PERFORM public.proof_as_authenticated('44444444-4444-4444-4444-444444444444');
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.ensure_builtin_renderers();
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'fn_anon_execute_denied',
    v_state = '42501',
    'sqlstate=' || v_state
  );
END $$;

DO $$
DECLARE
  v_n_a_before int;
  v_n_b_before int;
  v_n_d_before int;
  v_n_a_after int;
  v_n_b_after int;
  v_n_d_after int;
  v_keys text;
BEGIN
  SELECT count(*) INTO v_n_a_before FROM public.inspection_renderers
    WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT count(*) INTO v_n_b_before FROM public.inspection_renderers
    WHERE company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  SELECT count(*) INTO v_n_d_before FROM public.inspection_renderers
    WHERE company_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  PERFORM public.proof_as_authenticated('80000000-0000-0000-0000-000000000002');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.ensure_builtin_renderers();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE;

  SELECT count(*) INTO v_n_a_after FROM public.inspection_renderers
    WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT count(*) INTO v_n_b_after FROM public.inspection_renderers
    WHERE company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  SELECT count(*) INTO v_n_d_after FROM public.inspection_renderers
    WHERE company_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  SELECT string_agg(key, ',' ORDER BY key) INTO v_keys FROM public.inspection_renderers
    WHERE company_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' AND built_in IS TRUE;

  INSERT INTO proof_result VALUES (
    'member_seeds_own_company_only',
    v_n_d_before = 0
      AND v_n_d_after = 2
      AND v_n_a_after = v_n_a_before
      AND v_n_b_after = v_n_b_before
      AND v_keys = 'electrical_3000,generic_inspection',
    format('D %s->%s A %s->%s B %s->%s keys=%s',
      v_n_d_before, v_n_d_after, v_n_a_before, v_n_a_after, v_n_b_before, v_n_b_after, coalesce(v_keys, ''))
  );
END $$;

DO $$
DECLARE
  v_n_a int;
  v_n_b int;
  v_n_c int;
  v_n_d int;
BEGIN
  SELECT count(*) INTO v_n_a FROM public.inspection_renderers
    WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  SELECT count(*) INTO v_n_b FROM public.inspection_renderers
    WHERE company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  SELECT count(*) INTO v_n_c FROM public.inspection_renderers
    WHERE company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  SELECT count(*) INTO v_n_d FROM public.inspection_renderers
    WHERE company_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  PERFORM public.proof_as_authenticated('44444444-4444-4444-4444-444444444444');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.ensure_builtin_renderers();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE;

  INSERT INTO proof_result VALUES (
    'cross_company_seed_impossible',
    (SELECT count(*) FROM public.inspection_renderers WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') >= v_n_a
      AND (SELECT count(*) FROM public.inspection_renderers WHERE company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') = v_n_b
      AND (SELECT count(*) FROM public.inspection_renderers WHERE company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') = v_n_c
      AND (SELECT count(*) FROM public.inspection_renderers WHERE company_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd') = v_n_d,
    format('A %s B %s C %s D %s', v_n_a, v_n_b, v_n_c, v_n_d)
  );
END $$;

DO $$
DECLARE
  v_state text := 'ALLOWED';
  v_n_before int;
  v_n_after int;
BEGIN
  SELECT count(*) INTO v_n_before FROM public.inspection_renderers;
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_renderers (company_id, key, label, built_in)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin_mint_builtin', 'Admin mint', true);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_n_after FROM public.inspection_renderers;
  INSERT INTO proof_result VALUES (
    'admin_direct_builtin_insert_42501',
    v_state = '42501' AND v_n_after = v_n_before,
    format('sqlstate=%s rows %s->%s', v_state, v_n_before, v_n_after)
  );
END $$;

DO $$
DECLARE
  v_n_before int;
  v_n_after int;
  v_state text := 'ok';
BEGIN
  SELECT count(*) INTO v_n_before FROM public.inspection_renderers
    WHERE company_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  PERFORM public.proof_as_authenticated('80000000-0000-0000-0000-000000000002');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.ensure_builtin_renderers();
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_n_after FROM public.inspection_renderers
    WHERE company_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  INSERT INTO proof_result VALUES (
    'idempotent_second_call_inserts_0',
    v_state = 'ok' AND v_n_before = 2 AND v_n_after = 2,
    format('sqlstate=%s rows %s->%s', v_state, v_n_before, v_n_after)
  );
END $$;

DO $$
DECLARE
  v_label text;
  v_n int;
BEGIN
  UPDATE public.inspection_renderers
    SET label = 'HACKED'
    WHERE id = 'c1111111-1111-4111-8111-111111111111';
  PERFORM public.proof_as_authenticated('44444444-4444-4444-4444-444444444444');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.ensure_builtin_renderers();
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RESET ROLE;
  SELECT label INTO v_label FROM public.inspection_renderers
    WHERE id = 'c1111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO v_n FROM public.inspection_renderers
    WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND key = 'generic_inspection' AND built_in IS TRUE;
  INSERT INTO proof_result VALUES (
    'never_overwrites_existing_builtin',
    v_label = 'HACKED' AND v_n = 1,
    format('label=%s n=%s', coalesce(v_label, ''), v_n)
  );
END $$;

DO $$
DECLARE
  v_n_before int;
  v_n_after int;
BEGIN
  SELECT count(*) INTO v_n_before FROM public.inspection_renderers;
  PERFORM public.proof_as_authenticated('99999999-9999-4999-8999-999999999999');
  SET LOCAL ROLE authenticated;
  PERFORM public.ensure_builtin_renderers();
  RESET ROLE;
  SELECT count(*) INTO v_n_after FROM public.inspection_renderers;
  INSERT INTO proof_result VALUES (
    'no_company_is_noop',
    v_n_after = v_n_before,
    format('rows %s->%s', v_n_before, v_n_after)
  );
END $$;

DO $$
DECLARE
  v_state text := 'ALLOWED';
BEGIN
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_renderers (company_id, key, label, built_in)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin_custom_ok', 'Custom', false);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'admin_custom_insert_still_allowed',
    v_state = 'ALLOWED'
      AND EXISTS (
        SELECT 1 FROM public.inspection_renderers
        WHERE key = 'admin_custom_ok' AND built_in IS NOT TRUE
      ),
    'sqlstate=' || v_state
  );
  DELETE FROM public.inspection_renderers WHERE key = 'admin_custom_ok';
END $$;

SELECT check_id, ok, detail FROM proof_result ORDER BY check_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM proof_result WHERE NOT ok) THEN
    RAISE EXCEPTION 'ensure_builtin_renderers proofs failed: %',
      (SELECT string_agg(check_id || '=' || detail, ', ') FROM proof_result WHERE NOT ok);
  END IF;
END $$;
