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
  phone text,
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
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B');

INSERT INTO public.profiles (id, company_id, email, name, role, template_access) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner-a@example.com', 'Owner A', 'admin', 'edit'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin-a@example.com', 'Admin A', 'admin', 'edit'),
  ('44444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member-a@example.com', 'Member A', 'member', 'view'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'owner-b@example.com', 'Owner B', 'admin', 'edit'),
  ('55555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member-b@example.com', 'Member B', 'member', 'view');

INSERT INTO public.expense_cost_models (id, company_id, name) VALUES
  ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Crew A hourly'),
  ('77777777-7777-7777-7777-777777777777', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Crew B hourly');

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

-- ── 089: tables the /templates* pages read/write ──────────────────────────
CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_by uuid,
  name text NOT NULL,
  archived boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.jha_templates (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_by uuid,
  name text NOT NULL,
  archived boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.inspection_renderers (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  key text NOT NULL,
  label text NOT NULL,
  built_in boolean NOT NULL DEFAULT false
);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jha_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspection_renderers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jha_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_renderers TO authenticated;

INSERT INTO public.profiles (id, company_id, email, name, role, template_access, phone) VALUES
  ('13131313-1313-4313-8313-131313131313', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'view-a@example.com', 'View A', 'member', 'view', '0400000000'),
  ('14141414-1414-4414-8414-141414141414', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'none-a@example.com', 'None A', 'member', 'none', NULL),
  ('15151515-1515-4515-8515-151515151515', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'edit-a@example.com', 'Edit A', 'member', 'edit', NULL),
  ('16161616-1616-4616-8616-161616161616', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'invitee-a@example.com', 'Invitee A', 'member', 'none', NULL);

INSERT INTO public.templates (id, company_id, created_by, name) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A inspection'),
  ('a2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B inspection');

INSERT INTO public.jha_templates (id, company_id, created_by, name) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A JHA'),
  ('b2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B JHA');

INSERT INTO public.inspection_renderers (id, company_id, key, label, built_in) VALUES
  ('c1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'generic_inspection', 'Generic Inspection', true),
  ('c2222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'generic_inspection', 'Generic Inspection', true);

CREATE OR REPLACE FUNCTION public.proof_try_set_member_admin(p_value text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT set_config('app.member_admin', p_value, true)
$$;
GRANT EXECUTE ON FUNCTION public.proof_try_set_member_admin(text) TO authenticated;

\ir ../migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql

-- Self-edit of name or phone still works.
DO $$
DECLARE
  v_name text;
  v_phone text;
BEGIN
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  UPDATE public.profiles
    SET name = 'View A renamed', phone = '0411111111'
    WHERE id = '13131313-1313-4313-8313-131313131313';
  RESET ROLE;
  SELECT name, phone INTO v_name, v_phone
  FROM public.profiles WHERE id = '13131313-1313-4313-8313-131313131313';
  INSERT INTO proof_result VALUES (
    'f_self_edit_name_phone',
    v_name = 'View A renamed' AND v_phone = '0411111111',
    coalesce(v_name, 'name missing') || ' / ' || coalesce(v_phone, 'phone missing')
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

-- Service-role invite path: auth.uid() NULL, UPDATE of access columns still works.
DO $$
DECLARE
  v_name text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', false);
  UPDATE public.profiles
    SET name = 'Invitee upserted',
        role = 'member',
        template_access = 'view',
        company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    WHERE id = '16161616-1616-4616-8616-161616161616';
  SELECT name INTO v_name FROM public.profiles
  WHERE id = '16161616-1616-4616-8616-161616161616';
  INSERT INTO proof_result VALUES (
    'f_service_role_invite_update',
    v_name = 'Invitee upserted'
      AND (SELECT template_access FROM public.profiles WHERE id = '16161616-1616-4616-8616-161616161616') = 'view',
    coalesce(v_name, 'invite upsert did not write')
  );
END $$;

-- Admin RPC still works, including on a member whose template_access is none.
DO $$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public.proof_as_authenticated('11111111-1111-1111-1111-111111111111');
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

-- 'none' member gets 0 template rows (REST analogue: SET ROLE authenticated).
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
    'g_none_zero_rows',
    n_t = 0 AND n_j = 0 AND n_r = 0,
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
      AND v_upd AND v_upd_msg ILIKE '%row-level security%'
      AND v_del = 0
      AND (SELECT name FROM public.templates WHERE id = 'a1111111-1111-4111-8111-111111111111')
        = 'Company A inspection',
    coalesce(v_ins_msg, 'insert ok') || ' | ' || coalesce(v_upd_msg, 'update ok') || ' | del=' || v_del::text
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
      AND v_upd AND v_upd_msg ILIKE '%row-level security%'
      AND v_del = 0,
    coalesce(v_ins_msg, 'insert ok') || ' | ' || coalesce(v_upd_msg, 'update ok') || ' | del=' || v_del::text
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
  -- Put role back if the mutant wrote it.
  UPDATE public.profiles SET role = 'member'
    WHERE id = '13131313-1313-4313-8313-131313131313';
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
  DROP POLICY "templates_select_by_template_access" ON public.templates;
  CREATE POLICY "templates_select_by_template_access"
    ON public.templates FOR SELECT TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.templates;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't1_mutant_templates_select',
    n > 0,
    'none member saw ' || n::text || ' rows after dropping select branch'
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
  DROP POLICY "templates_delete_by_template_access" ON public.templates;
  CREATE POLICY "templates_delete_by_template_access"
    ON public.templates FOR DELETE TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.templates WHERE id = 'a1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO public.templates (id, company_id, created_by, name)
  VALUES ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', 'Company A inspection')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
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
  DROP POLICY "jha_templates_select_by_template_access" ON public.jha_templates;
  CREATE POLICY "jha_templates_select_by_template_access"
    ON public.jha_templates FOR SELECT TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.jha_templates;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't5_mutant_jha_select',
    n > 0,
    'none member saw jha rows=' || n::text
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
  DROP POLICY "jha_templates_delete_by_template_access" ON public.jha_templates;
  CREATE POLICY "jha_templates_delete_by_template_access"
    ON public.jha_templates FOR DELETE TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('13131313-1313-4313-8313-131313131313');
  SET LOCAL ROLE authenticated;
  DELETE FROM public.jha_templates WHERE id = 'b1111111-1111-4111-8111-111111111111';
  GET DIAGNOSTICS v_del = ROW_COUNT;
  RESET ROLE;
  INSERT INTO public.jha_templates (id, company_id, created_by, name)
  VALUES ('b1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '11111111-1111-1111-1111-111111111111', 'Company A JHA')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
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
  DROP POLICY "inspection_renderers_select_by_template_access" ON public.inspection_renderers;
  CREATE POLICY "inspection_renderers_select_by_template_access"
    ON public.inspection_renderers FOR SELECT TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
  PERFORM public.proof_as_authenticated('14141414-1414-4414-8414-141414141414');
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.inspection_renderers;
  RESET ROLE;
  INSERT INTO proof_result VALUES (
    't9_mutant_renderers_select',
    n > 0,
    'none member saw renderer rows=' || n::text
  );
END $$;

DO $$
DECLARE
  v_ok boolean := false;
BEGIN
  DROP POLICY "inspection_renderers_insert_by_template_access" ON public.inspection_renderers;
  CREATE POLICY "inspection_renderers_insert_by_template_access"
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
  DROP POLICY "inspection_renderers_update_by_template_access" ON public.inspection_renderers;
  CREATE POLICY "inspection_renderers_update_by_template_access"
    ON public.inspection_renderers FOR UPDATE TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
    WITH CHECK (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
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
  DROP POLICY "inspection_renderers_delete_by_template_access" ON public.inspection_renderers;
  CREATE POLICY "inspection_renderers_delete_by_template_access"
    ON public.inspection_renderers FOR DELETE TO authenticated
    USING (company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
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
    n = 0 AND v_failed AND v_msg ILIKE '%row-level security%',
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
