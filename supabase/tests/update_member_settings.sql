-- Local proof for public.update_member_settings. Run against a throwaway
-- Postgres (or local supabase start). Never against production.
--
--   psql "$PROOF_URL" -v ON_ERROR_STOP=1 -f supabase/tests/update_member_settings.sql
--
-- Creates a stub auth.uid() that reads request.jwt.claims (Supabase), companies,
-- profiles, expense_cost_models, then loads the RPC from the migration.
-- Refusal cases run as SET ROLE authenticated and assert exact SQLERRM.

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

-- Load the RPC (and get_company_members which needs auth.users). Stub auth.users.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
);

\ir ../migrations/20261019010000_088_update_member_settings.sql

-- ── Seed ──────────────────────────────────────────────────────────────────
DELETE FROM public.profiles;
DELETE FROM public.expense_cost_models;
DELETE FROM public.companies;

INSERT INTO public.companies (id, created_by, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '70000000-0000-0000-0000-000000000001', 'Company C');

INSERT INTO public.profiles (id, company_id, email, name, role, template_access) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-a@example.com', 'Owner A', 'admin', 'edit'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-a@example.com', 'Admin A', 'admin', 'edit'),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member-a@example.com', 'Member A', 'member', 'view'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner-b@example.com', 'Owner B', 'admin', 'edit'),
  ('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member-b@example.com', 'Member B', 'member', 'view');

INSERT INTO public.expense_cost_models (id, company_id, name) VALUES
  ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Crew A hourly'),
  ('77777777-7777-7777-7777-777777777777', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Crew B hourly');

INSERT INTO public.profiles (id, company_id, email, name, role, template_access, licence_number) VALUES
  ('13131313-1313-4313-8313-131313131313', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'view-a@example.com', 'View A', 'member', 'view', 'EC-VIEW'),
  ('14141414-1414-4414-8414-141414141414', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'none-a@example.com', 'None A', 'member', 'none', NULL),
  ('15151515-1515-4515-8515-151515151515', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'edit-a@example.com', 'Edit A', 'member', 'edit', NULL),
  ('16161616-1616-4616-8616-161616161616', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'invitee-a@example.com', 'Invitee A', 'member', 'none', NULL),
  ('44444444-4444-4444-4444-444444444445', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'none-tech@example.com', 'None Tech', 'member', 'none', NULL),
  ('70000000-0000-0000-0000-000000000001', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'founder-c@example.com', 'Founder C', 'member', 'edit', NULL);

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
  id uuid PRIMARY KEY,
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

CREATE POLICY "proof_inspections_select" ON public.inspections FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "proof_inspections_insert" ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "proof_jha_docs_select" ON public.jha_documents FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "proof_jha_docs_insert" ON public.jha_documents FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

INSERT INTO public.templates (id, company_id, created_by, name, schema) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A inspection',
   '{"sections":[{"id":"s1","title":"Board","questions":[{"id":"q1","label":"RCD tested?"}]}]}'),
  ('a2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B inspection', '{}');
INSERT INTO public.jha_templates (id, company_id, created_by, name, schema) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A JHA', '{"steps":[]}'),
  ('b2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B JHA', '{}');
INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'generic_inspection', 'Generic Inspection', true),
  ('c2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'generic_inspection', 'Generic Inspection', true),
  ('c3333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'custom_a', 'Custom A', false);
INSERT INTO public.inspections (id, template_id, template_snapshot, inspector_id) VALUES
  ('d1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111',
   '{"id":"a1111111-1111-4111-8111-111111111111","name":"Company A inspection","report_renderer":"generic_inspection"}',
   '44444444-4444-4444-4444-444444444445');

CREATE OR REPLACE FUNCTION public.proof_try_set_member_admin(p_value text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT set_config('app.member_admin', p_value, true)
$$;
GRANT EXECUTE ON FUNCTION public.proof_try_set_member_admin(text) TO authenticated;

-- Live body. All RPC refusal proofs below run against 089, not 088.
\ir ../migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql

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

-- (a) Company A cannot read or update company B, even with B's member id.
DO $$
DECLARE
  n int;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.get_company_members('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'a_read_cross_tenant',
    n = 0,
    'Company A get_company_members(B) returned ' || n::text || ' rows'
  );
END $$;

DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_left text;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '55555555-5555-5555-5555-555555555555',
      jsonb_build_object('template_access', 'none')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT template_access INTO v_left FROM public.profiles WHERE id = '55555555-5555-5555-5555-555555555555';
  INSERT INTO proof_result VALUES (
    'a_update_cross_tenant',
    v_failed AND v_msg = 'Not allowed' AND v_left = 'view',
    coalesce(v_msg, 'cross-tenant update did not raise')
  );
END $$;

-- S2b: admin of A updating a member of B; 0 B rows may change.
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_left text;
  v_owner_role text;
  v_owner_access text;
BEGIN
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '55555555-5555-5555-5555-555555555555',
      jsonb_build_object('template_access', 'none', 'role', 'admin')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT template_access INTO v_left FROM public.profiles WHERE id = '55555555-5555-5555-5555-555555555555';
  SELECT role, template_access INTO v_owner_role, v_owner_access
  FROM public.profiles WHERE id = '22222222-2222-2222-2222-222222222222';
  INSERT INTO proof_result VALUES (
    'a_s2b_admin_cross_company_write',
    v_failed AND v_msg = 'Not allowed' AND v_left = 'view'
      AND v_owner_role = 'admin' AND v_owner_access = 'edit'
      AND (SELECT role FROM public.profiles WHERE id = '55555555-5555-5555-5555-555555555555') = 'member',
    coalesce(v_msg, 'S2b cross-company write did not raise')
  );
END $$;

-- P0 S8: owner of A assigning company B's cost model to an A member.
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_left uuid;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '44444444-4444-4444-4444-444444444444',
      jsonb_build_object('expense_cost_model_id', '77777777-7777-7777-7777-777777777777')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT expense_cost_model_id INTO v_left FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO proof_result VALUES (
    'a_cost_model_cross_company',
    v_failed AND v_msg = 'Cost model not found' AND v_left IS NULL,
    coalesce(v_msg, 'cross-company cost model did not raise')
  );
END $$;

-- (b) A non-admin gets an error.
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
BEGIN
  PERFORM public.proof_as_authenticated('44444444-4444-4444-4444-444444444444');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '33333333-3333-3333-3333-333333333333',
      jsonb_build_object('template_access', 'none')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'b_non_admin',
    v_failed AND v_msg = 'Not allowed',
    coalesce(v_msg, 'non-admin update did not raise')
  );
END $$;

-- (c) An admin cannot change their own role or anyone's company_id.
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_left text;
BEGIN
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '33333333-3333-3333-3333-333333333333',
      jsonb_build_object('role', 'member')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT role INTO v_left FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333';
  INSERT INTO proof_result VALUES (
    'c_admin_own_role',
    v_failed AND v_msg = 'You cannot change your own role' AND v_left = 'admin',
    coalesce(v_msg, 'admin self role change did not raise')
  );
END $$;

DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_left uuid;
BEGIN
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '44444444-4444-4444-4444-444444444444',
      jsonb_build_object('company_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT company_id INTO v_left FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO proof_result VALUES (
    'c_company_id_rejected',
    v_failed AND v_msg = 'Field company_id is not allowed'
      AND v_left = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    coalesce(v_msg, 'company_id patch did not raise')
  );
END $$;

-- Admin also cannot change someone else's role (owner only).
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_left text;
BEGIN
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '44444444-4444-4444-4444-444444444444',
      jsonb_build_object('role', 'admin')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT role INTO v_left FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO proof_result VALUES (
    'c_admin_cannot_change_role',
    v_failed AND v_msg = 'Only the company owner can change roles' AND v_left = 'member',
    coalesce(v_msg, 'non-owner role change did not raise')
  );
END $$;

-- P2 S10: role 'owner' is not a valid value.
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_left text;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '44444444-4444-4444-4444-444444444444',
      jsonb_build_object('role', 'owner')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT role INTO v_left FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO proof_result VALUES (
    'c_role_owner_invalid',
    v_failed AND v_msg = 'Invalid role' AND v_left = 'member',
    coalesce(v_msg, 'role=owner did not raise')
  );
END $$;

-- P1 S1: 0-row RAISE. BEFORE UPDATE skips the row after the checks, so ROW_COUNT is 0.
CREATE OR REPLACE FUNCTION public.proof_skip_profile_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RETURN NULL;
END;
$$;

CREATE TRIGGER proof_skip_member_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.id = '44444444-4444-4444-4444-444444444444'::uuid)
  EXECUTE PROCEDURE public.proof_skip_profile_update();

DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_left text;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.update_member_settings(
      '44444444-4444-4444-4444-444444444444',
      jsonb_build_object('template_access', 'none')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT template_access INTO v_left FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444';
  INSERT INTO proof_result VALUES (
    'r_zero_row_raise',
    v_failed AND v_msg = 'No member settings were updated' AND v_left = 'view',
    coalesce(v_msg, '0-row update did not raise')
  );
END $$;

DROP TRIGGER proof_skip_member_update ON public.profiles;
DROP FUNCTION public.proof_skip_profile_update();

-- (d) Owner and admin saves persist (re-select after the update).
DO $$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  v_row := public.update_member_settings(
    '44444444-4444-4444-4444-444444444444',
    jsonb_build_object(
      'expense_cost_model_id', '66666666-6666-6666-6666-666666666666',
      'template_access', 'none'
    )
  );
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'd_owner_save',
    v_row->>'expense_cost_model_id' = '66666666-6666-6666-6666-666666666666'
      AND v_row->>'template_access' = 'none'
      AND (SELECT expense_cost_model_id FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444')
        = '66666666-6666-6666-6666-666666666666'
      AND (SELECT template_access FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444') = 'none',
    v_row::text
  );
END $$;

DO $$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  v_row := public.update_member_settings(
    '44444444-4444-4444-4444-444444444444',
    jsonb_build_object('template_access', 'edit')
  );
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'd_admin_save',
    v_row->>'template_access' = 'edit'
      AND (SELECT template_access FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444') = 'edit',
    v_row::text
  );
END $$;

-- Owner can change another member's role, not their own.
DO $$
DECLARE
  v_row jsonb;
  v_failed boolean := false;
  v_msg text;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  v_row := public.update_member_settings(
    '44444444-4444-4444-4444-444444444444',
    jsonb_build_object('role', 'admin')
  );
  BEGIN
    PERFORM public.update_member_settings(
      '11111111-1111-1111-1111-111111111111',
      jsonb_build_object('role', 'member')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'd_owner_role_other_not_self',
    v_row->>'role' = 'admin' AND v_failed AND v_msg = 'You cannot change your own role'
      AND (SELECT role FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111') = 'admin',
    coalesce(v_msg, v_row::text)
  );
END $$;

-- (e) Hand checks recorded as rows: search_path, grants, SECURITY DEFINER.
INSERT INTO proof_result
SELECT 'e_search_path',
  pg_get_functiondef('public.update_member_settings(uuid,jsonb)'::regprocedure)
    LIKE '%search_path%public%pg_temp%',
  'search_path on update_member_settings';

INSERT INTO proof_result
SELECT 'e_security_definer',
  prosecdef,
  'prosecdef=' || prosecdef::text
FROM pg_proc
WHERE oid = 'public.update_member_settings(uuid,jsonb)'::regprocedure;

INSERT INTO proof_result
SELECT 'e_execute_authenticated',
  has_function_privilege('authenticated', 'public.update_member_settings(uuid,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.update_member_settings(uuid,jsonb)', 'EXECUTE'),
  'GRANT EXECUTE to authenticated only (not anon)';

-- ── 089 behavioural proofs (RPC body already loaded above) ────────────────
INSERT INTO proof_result
SELECT 'e_trigger_execute_revoked',
  NOT has_function_privilege('authenticated', 'public.prevent_profile_self_escalation()', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.prevent_profile_self_escalation()', 'EXECUTE'),
  'trigger function EXECUTE revoked from anon/authenticated';

-- Self-edit of name or licence_number still works (prod has no phone column).
DO $$
DECLARE
  v_name text;
  v_lic text;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  UPDATE public.profiles
    SET name = 'View A renamed', licence_number = 'EC-NEW'
    WHERE id = '13131313-1313-4313-8313-131313131313';
  RESET ROLE;
  SELECT name, licence_number INTO v_name, v_lic
  FROM public.profiles WHERE id = '13131313-1313-4313-8313-131313131313';
  INSERT INTO proof_result VALUES (
    'f_self_edit_name_licence',
    v_name = 'View A renamed' AND v_lic = 'EC-NEW',
    coalesce(v_name, 'name missing') || ' / ' || coalesce(v_lic, 'licence missing')
  );
END $$;

-- Self-escalation of each of the 4 columns fails with exact TEXT.
DO $$
DECLARE
  v_col text;
  v_failed boolean;
  v_msg text;
  v_sql text;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  FOREACH v_col IN ARRAY ARRAY['role', 'template_access', 'expense_cost_model_id', 'company_id']
  LOOP
    v_failed := false;
    v_msg := NULL;
    v_sql := CASE v_col
      WHEN 'role' THEN
        'UPDATE public.profiles SET role = ''admin'' WHERE id = ''13131313-1313-4313-8313-131313131313'''
      WHEN 'template_access' THEN
        'UPDATE public.profiles SET template_access = ''edit'' WHERE id = ''13131313-1313-4313-8313-131313131313'''
      WHEN 'expense_cost_model_id' THEN
        'UPDATE public.profiles SET expense_cost_model_id = ''66666666-6666-6666-6666-666666666666'' WHERE id = ''13131313-1313-4313-8313-131313131313'''
      ELSE
        'UPDATE public.profiles SET company_id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'' WHERE id = ''13131313-1313-4313-8313-131313131313'''
    END;
    SET LOCAL ROLE authenticated;
    BEGIN
      EXECUTE v_sql;
    EXCEPTION WHEN OTHERS THEN
      v_failed := true;
      v_msg := SQLERRM;
    END;
    RESET ROLE;
    INSERT INTO proof_result VALUES (
      'f_self_esc_' || v_col,
      v_failed AND v_msg = 'You can''t change your own access settings',
      coalesce(v_msg, v_col || ' self-update did not raise')
    );
  END LOOP;
END $$;

-- A normal session cannot make the flag work (set_config RPC + jwt/header).
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
  v_role text;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  PERFORM public.proof_try_set_member_admin('on');
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', '13131313-1313-4313-8313-131313131313',
      'role', 'authenticated',
      'app.member_admin', 'on'
    )::text,
    true
  );
  PERFORM set_config('request.headers', '{"x-app-member-admin":"on"}', true);
  BEGIN
    UPDATE public.profiles
      SET role = 'admin'
      WHERE id = '13131313-1313-4313-8313-131313131313';
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT role INTO v_role FROM public.profiles WHERE id = '13131313-1313-4313-8313-131313131313';
  INSERT INTO proof_result VALUES (
    'f_flag_outside_rpc',
    v_failed AND v_msg = 'You can''t change your own access settings' AND v_role = 'member',
    coalesce(v_msg, 'flag outside RPC was honoured')
  );
END $$;

-- Service-role invite path (invite-user adminClient), not superuser.
DO $$
DECLARE
  v_name text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', false);
  SET LOCAL ROLE service_role;
  UPDATE public.profiles
    SET name = 'Invitee upserted',
        role = 'member',
        template_access = 'view',
        company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    WHERE id = '16161616-1616-4616-8616-161616161616';
  RESET ROLE;
  SELECT name INTO v_name FROM public.profiles
  WHERE id = '16161616-1616-4616-8616-161616161616';
  INSERT INTO proof_result VALUES (
    'f_service_role_invite_update',
    v_name = 'Invitee upserted'
      AND (SELECT template_access FROM public.profiles WHERE id = '16161616-1616-4616-8616-161616161616') = 'view',
    coalesce(v_name, 'invite upsert did not write')
  );
END $$;

-- Non-owner admin RPC still works on a member whose template_access is none.
DO $$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  v_row := public.update_member_settings(
    '14141414-1414-4414-8414-141414141414',
    jsonb_build_object(
      'expense_cost_model_id', '66666666-6666-6666-6666-666666666666',
      'template_access', 'none'
    )
  );
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'f_admin_rpc_on_none',
    v_row->>'template_access' = 'none'
      AND v_row->>'expense_cost_model_id' = '66666666-6666-6666-6666-666666666666'
      AND (SELECT template_access FROM public.profiles WHERE id = '14141414-1414-4414-8414-141414141414') = 'none',
    v_row::text
  );
END $$;

-- Owner RPC can set a member's template_access to edit (bypass flag + gate).
DO $$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  v_row := public.update_member_settings(
    '15151515-1515-4515-8515-151515151515',
    jsonb_build_object('template_access', 'edit')
  );
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'f_admin_rpc_still_works',
    v_row->>'template_access' = 'edit',
    v_row::text
  );
END $$;

-- 'none' member can SELECT same-company templates (field use).
DO $$
DECLARE
  n_t int;
  n_j int;
  n_r int;
BEGIN
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_t FROM public.templates;
  SELECT count(*) INTO n_j FROM public.jha_templates;
  SELECT count(*) INTO n_r FROM public.inspection_renderers;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_none_select_company',
    n_t = 1 AND n_j = 1 AND n_r = 2,
    format('templates=%s jha=%s renderers=%s', n_t, n_j, n_r)
  );
END $$;

-- 'view' member can SELECT own-company templates, not company B.
DO $$
DECLARE
  n_t int;
  n_b int;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_t FROM public.templates;
  SELECT count(*) INTO n_b FROM public.templates
    WHERE id = 'a2222222-2222-4222-8222-222222222222';
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_view_select_company_scoped',
    n_t = 1 AND n_b = 0,
    format('templates=%s other_company=%s', n_t, n_b)
  );
END $$;

-- 'view' member insert/update/delete denied.
DO $$
DECLARE
  v_ins boolean := false;
  v_ins_msg text;
  v_upd boolean := false;
  v_upd_msg text;
  v_del int;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.templates (id, company_id, created_by, name)
    VALUES ('aa111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '13131313-1313-4313-8313-131313131313', 'view insert');
  EXCEPTION WHEN OTHERS THEN
    v_ins := true;
    v_ins_msg := SQLERRM;
  END;
  BEGIN
    UPDATE public.templates SET name = 'hacked'
      WHERE id = 'a1111111-1111-4111-8111-111111111111';
  EXCEPTION WHEN OTHERS THEN
    v_upd := true;
    v_upd_msg := SQLERRM;
  END;
  DELETE FROM public.templates WHERE id = 'a1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_view_write_denied',
    v_ins AND v_ins_msg ILIKE '%row-level security%'
      AND v_del = 0
      AND (SELECT name FROM public.templates WHERE id = 'a1111111-1111-4111-8111-111111111111')
        = 'Company A inspection'
      AND (
        (v_upd AND v_upd_msg ILIKE '%row-level security%')
        OR NOT v_upd
      ),
    coalesce(v_ins_msg, 'insert ok') || ' | ' || coalesce(v_upd_msg, 'update 0') || ' | del=' || v_del::text
  );
END $$;

-- Same view-write deny on jha_templates and inspection_renderers.
DO $$
DECLARE
  v_ins boolean := false;
  v_ins_msg text;
  v_upd boolean := false;
  v_upd_msg text;
  v_del int;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.jha_templates (id, company_id, created_by, name)
    VALUES ('bb111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '13131313-1313-4313-8313-131313131313', 'view jha');
  EXCEPTION WHEN OTHERS THEN
    v_ins := true;
    v_ins_msg := SQLERRM;
  END;
  BEGIN
    UPDATE public.jha_templates SET name = 'hacked'
      WHERE id = 'b1111111-1111-4111-8111-111111111111';
  EXCEPTION WHEN OTHERS THEN
    v_upd := true;
    v_upd_msg := SQLERRM;
  END;
  DELETE FROM public.jha_templates WHERE id = 'b1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_view_jha_write_denied',
    v_ins AND v_ins_msg ILIKE '%row-level security%'
      AND v_del = 0
      AND (
        (v_upd AND v_upd_msg ILIKE '%row-level security%')
        OR NOT v_upd
      ),
    coalesce(v_ins_msg, 'insert ok') || ' | ' || coalesce(v_upd_msg, 'update 0') || ' | del=' || v_del::text
  );
END $$;

DO $$
DECLARE
  v_ins boolean := false;
  v_ins_msg text;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
    VALUES ('cc111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'custom', 'Custom', false);
  EXCEPTION WHEN OTHERS THEN
    v_ins := true;
    v_ins_msg := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_view_renderer_insert_denied',
    v_ins AND v_ins_msg ILIKE '%row-level security%',
    coalesce(v_ins_msg, 'renderer insert ok')
  );
END $$;

-- Edit member and admin still SELECT and write. Dashboard/inspection-fill analogue.
DO $$
DECLARE
  n int;
  v_ok boolean := false;
BEGIN
  PERFORM public.proof_as_authenticated('15151515-1515-4515-8515-151515151515');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.templates;
  INSERT INTO public.templates (id, company_id, created_by, name)
  VALUES ('aa222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '15151515-1515-4515-8515-151515151515', 'Edit created');
  UPDATE public.templates SET name = 'Edit updated'
    WHERE id = 'aa222222-2222-4222-8222-222222222222';
  DELETE FROM public.templates WHERE id = 'aa222222-2222-4222-8222-222222222222';
  v_ok := n = 1;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_edit_full_access',
    v_ok AND NOT EXISTS (SELECT 1 FROM public.templates WHERE id = 'aa222222-2222-4222-8222-222222222222'),
    'edit member templates count=' || n::text
  );
END $$;

DO $$
DECLARE
  n int;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.templates;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_owner_select',
    n = 1,
    'owner templates count=' || n::text
  );
END $$;

-- P2(a)/G4: same-txn self-escalation after a successful RPC is refused (gate row gone).
DO $$
DECLARE
  v_row jsonb;
  v_failed boolean := false;
  v_msg text;
  v_left uuid;
  v_gate int;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  v_row := public.update_member_settings(
    '15151515-1515-4515-8515-151515151515',
    jsonb_build_object('template_access', 'edit')
  );
  BEGIN
    UPDATE public.profiles
      SET expense_cost_model_id = '66666666-6666-6666-6666-666666666666'
      WHERE id = '11111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  SELECT expense_cost_model_id INTO v_left
    FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111';
  SELECT count(*) INTO v_gate FROM public.update_member_settings_gate;
  INSERT INTO proof_result VALUES (
    'f_same_txn_after_rpc',
    v_row->>'template_access' = 'edit'
      AND v_failed AND v_msg = 'You can''t change your own access settings'
      AND v_left IS NULL AND v_gate = 0,
    coalesce(v_msg, 'same-txn self-escalation did not raise') || ' gate=' || v_gate::text
  );
END $$;

-- P2(b)/G5: authenticated cannot INSERT its own txid into the gate.
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
BEGIN
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.update_member_settings_gate (txid) VALUES (txid_current());
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'f_gate_insert_denied',
    v_failed AND v_msg ILIKE '%permission denied%update_member_settings_gate%',
    coalesce(v_msg, 'gate insert did not raise')
  );
END $$;

-- Field (1): a none tech can start a JHA from a job, start an inspection,
-- and a legacy inspection (schema not in the snapshot) still renders sections.
DO $$
DECLARE
  v_insp uuid;
  v_jha uuid;
  v_secs int;
  v_ins_msg text;
  v_jha_msg text;
BEGIN
  PERFORM public.proof_as_authenticated('44444444-4444-4444-4444-444444444445');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspections (id, template_id, template_snapshot, inspector_id)
    SELECT 'e1111111-1111-4111-8111-111111111111', t.id,
           jsonb_build_object(
             'id', t.id, 'name', t.name,
             'report_renderer', t.report_renderer, 'schema', t.schema
           ),
           auth.uid()
    FROM public.templates t
    WHERE t.id = 'a1111111-1111-4111-8111-111111111111'
    RETURNING id INTO v_insp;
  EXCEPTION WHEN OTHERS THEN
    v_ins_msg := SQLERRM;
  END;
  BEGIN
    INSERT INTO public.jha_documents (id, template_id, template_snapshot, company_id, created_by)
    SELECT 'e2222222-2222-4222-8222-222222222222', t.id,
           jsonb_build_object('name', t.name, 'schema', t.schema),
           t.company_id, auth.uid()
    FROM public.jha_templates t
    WHERE t.id = 'b1111111-1111-4111-8111-111111111111'
    RETURNING id INTO v_jha;
  EXCEPTION WHEN OTHERS THEN
    v_jha_msg := SQLERRM;
  END;
  SELECT jsonb_array_length(
           COALESCE(
             i.template_snapshot #> '{schema,sections}',
             t.schema #> '{sections}'
           )
         )
    INTO v_secs
  FROM public.inspections i
  JOIN public.templates t ON t.id = i.template_id
  WHERE i.id = 'd1111111-1111-4111-8111-111111111111';
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_none_tech_start_jha_inspection_legacy',
    v_insp IS NOT NULL AND v_jha IS NOT NULL AND v_secs = 1,
    format('insp=%s jha=%s secs=%s ins_err=%s jha_err=%s',
      v_insp, v_jha, v_secs, coalesce(v_ins_msg, '-'), coalesce(v_jha_msg, '-'))
  );
END $$;

-- Field (2): none INSERT/UPDATE/DELETE refused on all 3 tables (error TEXT on INSERT).
DO $$
DECLARE
  v_who uuid;
  v_label text;
  v_ins boolean;
  v_ins_msg text;
  v_upd int;
  v_del int;
  v_name text;
BEGIN
  FOREACH v_who IN ARRAY ARRAY[
    '14141414-1414-4414-8414-141414141414'::uuid,
    '13131313-1313-4313-8313-131313131313'::uuid
  ]
  LOOP
    v_label := CASE v_who
      WHEN '14141414-1414-4414-8414-141414141414' THEN 'none'
      ELSE 'view' END;
    PERFORM public.proof_as_authenticated(v_who);
    SET LOCAL ROLE authenticated;
    v_ins := false; v_ins_msg := NULL;
    BEGIN
      INSERT INTO public.templates (id, company_id, created_by, name)
      VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_who, 'denied');
    EXCEPTION WHEN OTHERS THEN
      v_ins := true; v_ins_msg := SQLERRM;
    END;
    UPDATE public.templates SET name = 'hacked'
      WHERE id = 'a1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    DELETE FROM public.templates WHERE id = 'a1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_del = ROW_COUNT;
    RESET ROLE;
    SELECT name INTO v_name FROM public.templates
      WHERE id = 'a1111111-1111-4111-8111-111111111111';
    INSERT INTO proof_result VALUES (
      'g_' || v_label || '_templates_iud_denied',
      v_ins AND v_ins_msg ILIKE '%row-level security%'
        AND v_upd = 0 AND v_del = 0 AND v_name = 'Company A inspection',
      coalesce(v_ins_msg, 'insert ok') || format(' upd=%s del=%s', v_upd, v_del)
    );

    PERFORM public.proof_as_authenticated(v_who);
    SET LOCAL ROLE authenticated;
    v_ins := false; v_ins_msg := NULL;
    BEGIN
      INSERT INTO public.jha_templates (id, company_id, created_by, name)
      VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_who, 'denied');
    EXCEPTION WHEN OTHERS THEN
      v_ins := true; v_ins_msg := SQLERRM;
    END;
    UPDATE public.jha_templates SET name = 'hacked'
      WHERE id = 'b1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    DELETE FROM public.jha_templates WHERE id = 'b1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_del = ROW_COUNT;
    RESET ROLE;
    SELECT name INTO v_name FROM public.jha_templates
      WHERE id = 'b1111111-1111-4111-8111-111111111111';
    INSERT INTO proof_result VALUES (
      'g_' || v_label || '_jha_iud_denied',
      v_ins AND v_ins_msg ILIKE '%row-level security%' AND v_upd = 0 AND v_del = 0
        AND v_name = 'Company A JHA',
      coalesce(v_ins_msg, 'insert ok') || format(' upd=%s del=%s', v_upd, v_del)
    );

    PERFORM public.proof_as_authenticated(v_who);
    SET LOCAL ROLE authenticated;
    v_ins := false; v_ins_msg := NULL;
    BEGIN
      INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
      VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', 'X', false);
    EXCEPTION WHEN OTHERS THEN
      v_ins := true; v_ins_msg := SQLERRM;
    END;
    UPDATE public.inspection_renderers SET label = 'hacked'
      WHERE id = 'c3333333-3333-4333-8333-333333333333';
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    DELETE FROM public.inspection_renderers
      WHERE id = 'c3333333-3333-4333-8333-333333333333';
    GET DIAGNOSTICS v_del = ROW_COUNT;
    RESET ROLE;
    INSERT INTO proof_result VALUES (
      'g_' || v_label || '_renderers_iud_denied',
      v_ins AND v_ins_msg ILIKE '%row-level security%' AND v_upd = 0 AND v_del = 0
        AND (SELECT label FROM public.inspection_renderers
               WHERE id = 'c3333333-3333-4333-8333-333333333333') = 'Custom A',
      coalesce(v_ins_msg, 'insert ok') || format(' upd=%s del=%s', v_upd, v_del)
    );
  END LOOP;
END $$;

-- Field (3): edit NON-admin member cannot write inspection_renderers.
DO $$
DECLARE
  v_ins boolean := false;
  v_ins_msg text;
  v_upd int;
  v_del int;
BEGIN
  PERFORM public.proof_as_authenticated('15151515-1515-4515-8515-151515151515');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
    VALUES ('cc444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'edit_member', 'Edit member', false);
  EXCEPTION WHEN OTHERS THEN
    v_ins := true;
    v_ins_msg := SQLERRM;
  END;
  UPDATE public.inspection_renderers SET label = 'hacked'
    WHERE id = 'c3333333-3333-4333-8333-333333333333';
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  DELETE FROM public.inspection_renderers
    WHERE id = 'c3333333-3333-4333-8333-333333333333';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_edit_nonadmin_renderer_write_denied',
    v_ins AND v_ins_msg ILIKE '%row-level security%' AND v_upd = 0 AND v_del = 0
      AND (SELECT label FROM public.inspection_renderers
             WHERE id = 'c3333333-3333-4333-8333-333333333333') = 'Custom A',
    coalesce(v_ins_msg, 'insert ok') || format(' upd=%s del=%s', v_upd, v_del)
  );
END $$;

-- Field (4): company-B member reads 0 of company A's rows on all 3 tables and cannot write them.
DO $$
DECLARE
  n_t int;
  n_j int;
  n_r int;
  v_ins boolean := false;
  v_ins_msg text;
  v_upd int;
  v_del int;
BEGIN
  PERFORM public.proof_as_authenticated('55555555-5555-5555-5555-555555555555');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n_t FROM public.templates
    WHERE id = 'a1111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n_j FROM public.jha_templates
    WHERE id = 'b1111111-1111-4111-8111-111111111111';
  SELECT count(*) INTO n_r FROM public.inspection_renderers
    WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  BEGIN
    INSERT INTO public.templates (id, company_id, created_by, name)
    VALUES ('aa555555-5555-4555-8555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '55555555-5555-5555-5555-555555555555', 'b into a');
  EXCEPTION WHEN OTHERS THEN
    v_ins := true;
    v_ins_msg := SQLERRM;
  END;
  UPDATE public.templates SET name = 'hacked'
    WHERE id = 'a1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  DELETE FROM public.templates WHERE id = 'a1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_company_b_zero_of_a',
    n_t = 0 AND n_j = 0 AND n_r = 0
      AND v_ins AND v_ins_msg ILIKE '%row-level security%'
      AND v_upd = 0 AND v_del = 0
      AND (SELECT name FROM public.templates
             WHERE id = 'a1111111-1111-4111-8111-111111111111') = 'Company A inspection',
    format('t=%s j=%s r=%s ins=%s upd=%s del=%s',
      n_t, n_j, n_r, coalesce(v_ins_msg, 'ok'), v_upd, v_del)
  );
END $$;

-- P2(d)/A1: admin with template_access=none still reads and writes templates.
DO $$
DECLARE
  n int;
  v_ok boolean := false;
BEGIN
  SET session_replication_role = replica;
  UPDATE public.profiles
    SET template_access = 'none'
    WHERE id = '33333333-3333-3333-3333-333333333333';
  SET session_replication_role = origin;
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.templates;
  BEGIN
    INSERT INTO public.templates (id, company_id, created_by, name)
    VALUES ('aa555511-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '33333333-3333-3333-3333-333333333333', 'admin none write');
    UPDATE public.templates SET name = 'admin none updated'
      WHERE id = 'aa555511-1111-4111-8111-111111111111';
    DELETE FROM public.templates WHERE id = 'aa555511-1111-4111-8111-111111111111';
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;
  RESET ROLE;
  SET session_replication_role = replica;
  UPDATE public.profiles
    SET template_access = 'edit'
    WHERE id = '33333333-3333-3333-3333-333333333333';
  SET session_replication_role = origin;
  INSERT INTO proof_result VALUES (
    'g_admin_none_still_edits',
    n = 1 AND v_ok,
    'admin-none templates count=' || n::text || ' write=' || v_ok::text
  );
END $$;

-- Company-B OWNER (admin, edit) so the edit gate cannot mask a missing company filter.
-- WHERE true isolates UPDATE/DELETE policies from SELECT. Inner rollback restores seed.
DO $$
DECLARE
  v_ins_t text; v_ins_j text; v_ins_r text;
  v_wc_t text; v_wc_j text; v_wc_r text; v_bi_r text;
  v_snap_before text; v_snap_after text;
  v_upd_r int; v_del_r int; v_werr text := '';
BEGIN
  SELECT string_agg(x, '|' ORDER BY x) INTO v_snap_before FROM (
    SELECT 't:'||id||':'||name||':'||schema::text x FROM public.templates WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    UNION ALL SELECT 'j:'||id||':'||name||':'||schema::text FROM public.jha_templates WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    UNION ALL SELECT 'r:'||id||':'||label||':'||built_in FROM public.inspection_renderers WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') s;
  BEGIN
    PERFORM public.proof_as_authenticated('22222222-2222-2222-2222-222222222222');
    SET LOCAL ROLE authenticated;
    BEGIN INSERT INTO public.templates (id, company_id, created_by, name) VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'b->a'); EXCEPTION WHEN OTHERS THEN v_ins_t := SQLERRM; END;
    BEGIN INSERT INTO public.jha_templates (id, company_id, created_by, name) VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'b->a'); EXCEPTION WHEN OTHERS THEN v_ins_j := SQLERRM; END;
    BEGIN INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in) VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b_to_a', 'B to A', false); EXCEPTION WHEN OTHERS THEN v_ins_r := SQLERRM; END;
    BEGIN UPDATE public.templates SET name = 'pwned' WHERE true; EXCEPTION WHEN OTHERS THEN v_werr := v_werr || SQLERRM || '; '; END;
    BEGIN UPDATE public.jha_templates SET name = 'pwned' WHERE true; EXCEPTION WHEN OTHERS THEN v_werr := v_werr || SQLERRM || '; '; END;
    BEGIN UPDATE public.inspection_renderers SET label = 'pwned' WHERE true; EXCEPTION WHEN OTHERS THEN v_werr := v_werr || SQLERRM || '; '; END;
    BEGIN DELETE FROM public.templates WHERE true; EXCEPTION WHEN OTHERS THEN v_werr := v_werr || SQLERRM || '; '; END;
    BEGIN DELETE FROM public.jha_templates WHERE true; EXCEPTION WHEN OTHERS THEN v_werr := v_werr || SQLERRM || '; '; END;
    BEGIN DELETE FROM public.inspection_renderers WHERE true; EXCEPTION WHEN OTHERS THEN v_werr := v_werr || SQLERRM || '; '; END;
    RESET ROLE;
    PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
    SET LOCAL ROLE authenticated;
    BEGIN UPDATE public.templates SET company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE true; EXCEPTION WHEN OTHERS THEN v_wc_t := SQLERRM; END;
    BEGIN UPDATE public.jha_templates SET company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE true; EXCEPTION WHEN OTHERS THEN v_wc_j := SQLERRM; END;
    BEGIN UPDATE public.inspection_renderers SET company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' WHERE true; EXCEPTION WHEN OTHERS THEN v_wc_r := SQLERRM; END;
    BEGIN UPDATE public.inspection_renderers SET built_in = true WHERE id = 'c3333333-3333-4333-8333-333333333333'; EXCEPTION WHEN OTHERS THEN v_bi_r := SQLERRM; END;
    UPDATE public.inspection_renderers SET label = 'x' WHERE id = 'c1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_upd_r = ROW_COUNT;
    DELETE FROM public.inspection_renderers WHERE id = 'c1111111-1111-4111-8111-111111111111';
    GET DIAGNOSTICS v_del_r = ROW_COUNT;
    RESET ROLE;
    SELECT string_agg(x, '|' ORDER BY x) INTO v_snap_after FROM (
      SELECT 't:'||id||':'||name||':'||schema::text x FROM public.templates WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      UNION ALL SELECT 'j:'||id||':'||name||':'||schema::text FROM public.jha_templates WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      UNION ALL SELECT 'r:'||id||':'||label||':'||built_in FROM public.inspection_renderers WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') s;
    RAISE EXCEPTION 'proof_rollback';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'proof_rollback' THEN RAISE; END IF;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_company_b_owner_writes_none_of_a',
    coalesce(v_ins_t ILIKE '%row-level security%' AND v_ins_j ILIKE '%row-level security%' AND v_ins_r ILIKE '%row-level security%'
      AND v_snap_after = v_snap_before AND v_werr = '', false),
    format('ins t/j/r=%s/%s/%s A_unchanged=%s write_err=%s', v_ins_t IS NOT NULL, v_ins_j IS NOT NULL, v_ins_r IS NOT NULL, v_snap_after = v_snap_before, nullif(v_werr,'')));
  INSERT INTO proof_result VALUES (
    'g_update_with_check_and_builtin',
    coalesce(v_wc_t ILIKE '%row-level security%' AND v_wc_j ILIKE '%row-level security%' AND v_wc_r ILIKE '%row-level security%'
      AND v_bi_r ILIKE '%row-level security%' AND v_upd_r = 0 AND v_del_r = 0, false),
    format('wc t/j/r=%s/%s/%s builtin_flip=%s builtin upd=%s del=%s', v_wc_t IS NOT NULL, v_wc_j IS NOT NULL, v_wc_r IS NOT NULL, v_bi_r IS NOT NULL, v_upd_r, v_del_r));
  INSERT INTO proof_result VALUES (
    'g_renderer_cross_company_owner_denied',
    coalesce(v_ins_r = 'new row violates row-level security policy for table "inspection_renderers"', false),
    coalesce(v_ins_r, 'owner B insert into A succeeded')
  );
END $$;

-- Renderer writes: owner OR admin (company_founder_id), same helper as the RPC.
-- edit/view/none refused with the INSERT error text. Owner A is demoted to
-- member+view for the owner-allowed and founder-view cases, then restored.
DO $$
DECLARE
  v_rend_err constant text := 'new row violates row-level security policy for table "inspection_renderers"';
  v_ins int; v_upd int; v_del int;
  v_ok boolean := false;
  v_msg text;
  v_who uuid;
  v_label text;
  v_t_ok boolean := false;
BEGIN
  SET session_replication_role = replica;
  UPDATE public.profiles
    SET role = 'member', template_access = 'view'
    WHERE id = '11111111-1111-1111-1111-111111111111';
  SET session_replication_role = origin;

  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
    VALUES ('cc0a0000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'owner_ok', 'Owner OK', false);
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    UPDATE public.inspection_renderers SET label = 'Owner OK upd'
      WHERE id = 'cc0a0000-0000-4000-8000-00000000000a';
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    DELETE FROM public.inspection_renderers
      WHERE id = 'cc0a0000-0000-4000-8000-00000000000a';
    GET DIAGNOSTICS v_del = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_ins := 0; v_upd := 0; v_del := 0; v_msg := SQLERRM;
  END;
  BEGIN
    INSERT INTO public.templates (id, company_id, created_by, name)
    VALUES ('aa0a0000-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '11111111-1111-1111-1111-111111111111', 'founder view write');
    v_t_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_t_ok := false;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  DELETE FROM public.templates WHERE id = 'aa0a0000-0000-4000-8000-00000000000a';
  DELETE FROM public.inspection_renderers WHERE id = 'cc0a0000-0000-4000-8000-00000000000a';
  INSERT INTO proof_result VALUES (
    'g_renderer_owner_write_allowed',
    v_ins = 1 AND v_upd = 1 AND v_del = 1,
    format('owner member ins=%s upd=%s del=%s', v_ins, v_upd, v_del)
  );
  INSERT INTO proof_result VALUES (
    'g_founder_view_templates_write',
    v_t_ok,
    coalesce(v_msg, 'founder-with-view template insert ok')
  );

  SET session_replication_role = replica;
  UPDATE public.profiles
    SET role = 'admin', template_access = 'edit'
    WHERE id = '11111111-1111-1111-1111-111111111111';
  SET session_replication_role = origin;

  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
    VALUES ('cc0b0000-0000-4000-8000-00000000000b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'admin_ok', 'Admin OK', false);
    GET DIAGNOSTICS v_ins = ROW_COUNT;
    UPDATE public.inspection_renderers SET label = 'Admin OK upd'
      WHERE id = 'cc0b0000-0000-4000-8000-00000000000b';
    GET DIAGNOSTICS v_upd = ROW_COUNT;
    DELETE FROM public.inspection_renderers
      WHERE id = 'cc0b0000-0000-4000-8000-00000000000b';
    GET DIAGNOSTICS v_del = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_ins := 0; v_upd := 0; v_del := 0; v_msg := SQLERRM;
  END;
  RESET ROLE;
  DELETE FROM public.inspection_renderers WHERE id = 'cc0b0000-0000-4000-8000-00000000000b';
  INSERT INTO proof_result VALUES (
    'g_renderer_admin_write_allowed',
    v_ins = 1 AND v_upd = 1 AND v_del = 1,
    format('admin ins=%s upd=%s del=%s', v_ins, v_upd, v_del)
  );

  FOREACH v_who IN ARRAY ARRAY[
    '15151515-1515-4515-8515-151515151515'::uuid,
    '13131313-1313-4313-8313-131313131313'::uuid,
    '14141414-1414-4414-8414-141414141414'::uuid
  ]
  LOOP
    v_label := CASE v_who
      WHEN '15151515-1515-4515-8515-151515151515' THEN 'edit'
      WHEN '13131313-1313-4313-8313-131313131313' THEN 'view'
      ELSE 'none' END;
    v_ok := false; v_msg := NULL;
    PERFORM public.proof_as_authenticated(v_who);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
      VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              'denied_' || v_label, 'Denied', false);
      v_ok := true;
    EXCEPTION WHEN OTHERS THEN
      v_ok := false;
      v_msg := SQLERRM;
    END;
    RESET ROLE;
    INSERT INTO proof_result VALUES (
      'g_renderer_' || v_label || '_write_denied',
      (NOT v_ok) AND v_msg = v_rend_err,
      coalesce(v_msg, 'insert succeeded')
    );
  END LOOP;
END $$;

-- Coach condition (1) INSERT. Member cannot insert built_in=true into their own
-- company. Admin, founder, and member cannot insert into another company,
-- built_in true or false. Each case is SQLSTATE 42501. Row count unchanged.
DO $$
DECLARE
  c record;
  v_state text;
  v_n_before int;
  v_n_after int;
  v_n_case int;
  v_all_ok boolean := true;
BEGIN
  SET session_replication_role = replica;
  UPDATE public.profiles
    SET role = 'member', template_access = 'view'
    WHERE id = '44444444-4444-4444-4444-444444444444';
  UPDATE public.profiles
    SET role = 'member', template_access = 'none'
    WHERE id = '44444444-4444-4444-4444-444444444445';
  UPDATE public.profiles
    SET role = 'admin'
    WHERE id IN (
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333'
    );
  UPDATE public.profiles
    SET role = 'member', template_access = 'edit'
    WHERE id = '70000000-0000-0000-0000-000000000001';
  SET session_replication_role = origin;

  SELECT count(*) INTO v_n_before FROM public.inspection_renderers;
  FOR c IN SELECT * FROM (VALUES
    ('g_renderer_insert_member_view_own_builtin', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
    ('g_renderer_insert_member_none_own_builtin', '44444444-4444-4444-4444-444444444445', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true),
    ('g_renderer_insert_member_view_cross_false', '44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false),
    ('g_renderer_insert_member_view_cross_true',  '44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true),
    ('g_renderer_insert_admin_cross_false',       '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false),
    ('g_renderer_insert_admin_cross_true',        '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true),
    ('g_renderer_insert_owner_cross_false',       '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false),
    ('g_renderer_insert_owner_cross_true',        '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true),
    ('g_renderer_insert_founder_c_cross_false',   '70000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false),
    ('g_renderer_insert_founder_c_cross_true',    '70000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true)
  ) t(check_id, uid, co, bi)
  LOOP
    v_state := 'ALLOWED';
    PERFORM public.proof_as_authenticated(c.uid::uuid);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
      VALUES (gen_random_uuid(), c.co::uuid, 'coach_cond1_probe', 'coach cond1 probe', c.bi);
      v_state := 'ALLOWED';
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE;
    END;
    RESET ROLE;
    SELECT count(*) INTO v_n_case FROM public.inspection_renderers;
    DELETE FROM public.inspection_renderers WHERE key = 'coach_cond1_probe';
    INSERT INTO proof_result VALUES (
      c.check_id,
      v_state = '42501' AND v_n_case = v_n_before,
      format('sqlstate=%s rows=%s', v_state, v_n_case)
    );
    IF v_state <> '42501' OR v_n_case <> v_n_before THEN
      v_all_ok := false;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n_after FROM public.inspection_renderers;
  INSERT INTO proof_result VALUES (
    'g_renderer_insert_coach_cond1',
    v_all_ok AND v_n_after = v_n_before,
    format('rows %s->%s', v_n_before, v_n_after)
  );
END $$;

-- Mutant A1: admin no longer counts as edit -> admin with none cannot write templates.
CREATE OR REPLACE FUNCTION public.caller_template_access()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p.id IS NULL THEN 'none'
    WHEN p.id = public.company_founder_id(p.company_id) THEN 'edit'
    WHEN p.template_access IN ('view', 'edit', 'none') THEN p.template_access
    ELSE 'none'
  END
  FROM (SELECT auth.uid() AS uid) u
  LEFT JOIN public.profiles p ON p.id = u.uid
$$;

DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  SET session_replication_role = replica;
  UPDATE public.profiles
    SET template_access = 'none'
    WHERE id = '33333333-3333-3333-3333-333333333333';
  SET session_replication_role = origin;
  PERFORM public.proof_as_authenticated('33333333-3333-3333-3333-333333333333');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.templates (id, company_id, created_by, name)
    VALUES ('aa666666-6666-4666-8666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '33333333-3333-3333-3333-333333333333', 'a1 mutant');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;
  RESET ROLE;
  DELETE FROM public.templates WHERE id = 'aa666666-6666-4666-8666-666666666666';
  SET session_replication_role = replica;
  UPDATE public.profiles
    SET template_access = 'edit'
    WHERE id = '33333333-3333-3333-3333-333333333333';
  SET session_replication_role = origin;
  INSERT INTO proof_result VALUES (
    'a1_mutant_admin_not_edit',
    NOT v_ok,
    CASE WHEN v_ok THEN 'admin-none insert still succeeded' ELSE 'admin-none insert denied after dropping admin=edit' END
  );
END $$;

\ir ../migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql

-- Mutant S12: removing the auth.uid() check blocks service-role invite UPDATE.
CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.member_admin', true) = 'on'
     AND EXISTS (
       SELECT 1 FROM public.update_member_settings_gate g WHERE g.txid = txid_current()
     ) THEN
    RETURN NEW;
  END IF;
  -- mutant: no auth.uid() = OLD.id
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.template_access IS DISTINCT FROM OLD.template_access
     OR NEW.expense_cost_model_id IS DISTINCT FROM OLD.expense_cost_model_id
     OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'You can''t change your own access settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', false);
  BEGIN
    UPDATE public.profiles
      SET template_access = 'edit'
      WHERE id = '16161616-1616-4616-8616-161616161616';
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  INSERT INTO proof_result VALUES (
    's12_mutant_no_uid_check',
    v_failed AND v_msg = 'You can''t change your own access settings',
    coalesce(v_msg, 'mutant did not catch missing auth.uid() check')
  );
END $$;

-- Restore production trigger function from 089 (reload migration function body).
\ir ../migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql

-- Mutant S13: honouring the flag outside the RPC (GUC only, no gate).
CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.member_admin', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.id
     AND (
       NEW.role IS DISTINCT FROM OLD.role
       OR NEW.template_access IS DISTINCT FROM OLD.template_access
       OR NEW.expense_cost_model_id IS DISTINCT FROM OLD.expense_cost_model_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
     ) THEN
    RAISE EXCEPTION 'You can''t change your own access settings' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_mutant_allowed boolean := false;
  v_role text;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  PERFORM public.proof_try_set_member_admin('on');
  BEGIN
    UPDATE public.profiles SET role = 'admin'
      WHERE id = '13131313-1313-4313-8313-131313131313';
    v_mutant_allowed := true;
  EXCEPTION WHEN OTHERS THEN
    v_mutant_allowed := false;
  END;
  RESET ROLE;
  SELECT role INTO v_role FROM public.profiles WHERE id = '13131313-1313-4313-8313-131313131313';
  -- Put role back if the mutant wrote it. Replica so jwt.sub from the
  -- authenticated session does not trip the self-escalation trigger.
  SET session_replication_role = replica;
  UPDATE public.profiles SET role = 'member'
    WHERE id = '13131313-1313-4313-8313-131313131313';
  SET session_replication_role = origin;
  INSERT INTO proof_result VALUES (
    's13_mutant_flag_without_gate',
    v_mutant_allowed AND v_role = 'admin',
    'mutant honoured client set_config, role=' || coalesce(v_role, '?')
  );
END $$;

\ir ../migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql

-- Mutants T*: dropping each templates policy branch fails open, then restore.
DO $$
DECLARE
  n int;
BEGIN
  DROP POLICY "templates_select_company_members" ON public.templates;
  CREATE POLICY "templates_select_company_members"
    ON public.templates FOR SELECT TO authenticated
    USING (true);
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.templates;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't1_mutant_templates_select',
    n >= 2,
    'none member saw ' || n::text || ' rows after dropping company filter'
  );
END $$;

DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  DROP POLICY "templates_insert_by_template_access" ON public.templates;
  CREATE POLICY "templates_insert_by_template_access"
    ON public.templates FOR INSERT TO authenticated
    WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.templates (id, company_id, created_by, name)
    VALUES ('aa333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '13131313-1313-4313-8313-131313131313', 'mutant insert');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;
  RESET ROLE;
  DELETE FROM public.templates WHERE id = 'aa333333-3333-4333-8333-333333333333';
  INSERT INTO proof_result VALUES (
    't2_mutant_templates_insert',
    v_ok,
    CASE WHEN v_ok THEN 'view insert succeeded after dropping edit branch' ELSE 'view insert still denied' END
  );
END $$;

DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  DROP POLICY "templates_update_by_template_access" ON public.templates;
  CREATE POLICY "templates_update_by_template_access"
    ON public.templates FOR UPDATE TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.templates SET name = 'mutant upd'
      WHERE id = 'a1111111-1111-4111-8111-111111111111';
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;
  RESET ROLE;
  UPDATE public.templates SET name = 'Company A inspection'
    WHERE id = 'a1111111-1111-4111-8111-111111111111';
  INSERT INTO proof_result VALUES (
    't3_mutant_templates_update',
    v_ok,
    CASE WHEN v_ok THEN 'view update succeeded after dropping edit branch' ELSE 'view update still denied' END
  );
END $$;

DO $$
DECLARE
  v_del int := 0;
BEGIN
  INSERT INTO public.templates (id, company_id, created_by, name)
  VALUES ('a9999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', 'Deletable A')
  ON CONFLICT (id) DO NOTHING;
  DROP POLICY "templates_delete_by_template_access" ON public.templates;
  CREATE POLICY "templates_delete_by_template_access"
    ON public.templates FOR DELETE TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.templates WHERE id = 'a9999999-9999-4999-8999-999999999999';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't4_mutant_templates_delete',
    v_del > 0,
    'view delete row_count=' || v_del::text
  );
END $$;

DO $$
DECLARE
  n int;
BEGIN
  DROP POLICY "jha_templates_select_company_members" ON public.jha_templates;
  CREATE POLICY "jha_templates_select_company_members"
    ON public.jha_templates FOR SELECT TO authenticated
    USING (true);
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.jha_templates;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't5_mutant_jha_select',
    n >= 2,
    'none member saw jha rows=' || n::text || ' after dropping company filter'
  );
END $$;

DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  DROP POLICY "jha_templates_insert_by_template_access" ON public.jha_templates;
  CREATE POLICY "jha_templates_insert_by_template_access"
    ON public.jha_templates FOR INSERT TO authenticated
    WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.jha_templates (id, company_id, created_by, name)
    VALUES ('bb222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '13131313-1313-4313-8313-131313131313', 'mutant jha');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;
  RESET ROLE;
  DELETE FROM public.jha_templates WHERE id = 'bb222222-2222-4222-8222-222222222222';
  INSERT INTO proof_result VALUES (
    't6_mutant_jha_insert',
    v_ok,
    CASE WHEN v_ok THEN 'view jha insert succeeded' ELSE 'view jha insert still denied' END
  );
END $$;

DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  DROP POLICY "jha_templates_update_by_template_access" ON public.jha_templates;
  CREATE POLICY "jha_templates_update_by_template_access"
    ON public.jha_templates FOR UPDATE TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.jha_templates SET name = 'mutant'
      WHERE id = 'b1111111-1111-4111-8111-111111111111';
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;
  RESET ROLE;
  UPDATE public.jha_templates SET name = 'Company A JHA'
    WHERE id = 'b1111111-1111-4111-8111-111111111111';
  INSERT INTO proof_result VALUES (
    't7_mutant_jha_update',
    v_ok,
    CASE WHEN v_ok THEN 'view jha update succeeded' ELSE 'view jha update still denied' END
  );
END $$;

DO $$
DECLARE
  v_del int := 0;
BEGIN
  INSERT INTO public.jha_templates (id, company_id, created_by, name)
  VALUES ('b9999999-9999-4999-8999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', 'Deletable JHA')
  ON CONFLICT (id) DO NOTHING;
  DROP POLICY "jha_templates_delete_by_template_access" ON public.jha_templates;
  CREATE POLICY "jha_templates_delete_by_template_access"
    ON public.jha_templates FOR DELETE TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.jha_templates WHERE id = 'b9999999-9999-4999-8999-999999999999';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't8_mutant_jha_delete',
    v_del > 0,
    'view jha delete row_count=' || v_del::text
  );
END $$;

DO $$
DECLARE
  n int;
BEGIN
  DROP POLICY "inspection_renderers_select_company_members" ON public.inspection_renderers;
  CREATE POLICY "inspection_renderers_select_company_members"
    ON public.inspection_renderers FOR SELECT TO authenticated
    USING (true);
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.inspection_renderers;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't9_mutant_renderers_select',
    n >= 3,
    'none member saw renderer rows=' || n::text
  );
END $$;

DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  DROP POLICY "Company admins can insert renderers" ON public.inspection_renderers;
  CREATE POLICY "Company admins can insert renderers"
    ON public.inspection_renderers FOR INSERT TO authenticated
    WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
    VALUES ('cc222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            'mutant', 'Mutant', false);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;
  RESET ROLE;
  DELETE FROM public.inspection_renderers WHERE id = 'cc222222-2222-4222-8222-222222222222';
  INSERT INTO proof_result VALUES (
    't10_mutant_renderers_insert',
    v_ok,
    CASE WHEN v_ok THEN 'view renderer insert succeeded' ELSE 'view renderer insert still denied' END
  );
END $$;

DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in)
  VALUES ('cc333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'custom_a', 'Custom A', false)
  ON CONFLICT (id) DO NOTHING;
  DROP POLICY "Company admins can update renderers" ON public.inspection_renderers;
  CREATE POLICY "Company admins can update renderers"
    ON public.inspection_renderers FOR UPDATE TO authenticated
    USING (built_in = false AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (built_in = false AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.inspection_renderers SET label = 'hacked'
      WHERE id = 'cc333333-3333-4333-8333-333333333333';
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN
    v_ok := false;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't11_mutant_renderers_update',
    v_ok,
    CASE WHEN v_ok THEN 'view renderer update succeeded' ELSE 'view renderer update still denied' END
  );
END $$;

DO $$
DECLARE
  v_del int := 0;
BEGIN
  DROP POLICY "Company admins can delete renderers" ON public.inspection_renderers;
  CREATE POLICY "Company admins can delete renderers"
    ON public.inspection_renderers FOR DELETE TO authenticated
    USING (built_in = false AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.inspection_renderers WHERE id = 'cc333333-3333-4333-8333-333333333333';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't12_mutant_renderers_delete',
    v_del > 0,
    'view renderer delete row_count=' || v_del::text
  );
END $$;

-- Restore production policies after mutants.
\ir ../migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql

-- Production still holds after restore.
DO $$
DECLARE
  n int;
  v_failed boolean := false;
  v_msg text;
BEGIN
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.templates;
  RESET ROLE;
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.templates (id, company_id, created_by, name)
    VALUES ('aa444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '13131313-1313-4313-8313-131313131313', 'should fail');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    'g_restore_holds',
    n = 1 AND v_failed AND v_msg ILIKE '%row-level security%',
    coalesce(v_msg, 'none rows=' || n::text)
  );
END $$;

SELECT check_id, ok, detail FROM proof_result ORDER BY check_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM proof_result WHERE NOT ok) THEN
    RAISE EXCEPTION 'update_member_settings proofs failed: %',
      (SELECT string_agg(check_id || '=' || detail, ', ') FROM proof_result WHERE NOT ok);
  END IF;
END $$;
