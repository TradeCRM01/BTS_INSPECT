-- Local proof for public.update_member_settings. Run against a throwaway
-- Postgres (or local supabase start). Never against production.
--
--   psql "$PROOF_URL" -v ON_ERROR_STOP=1 -f supabase/tests/update_member_settings.sql
--
-- Creates a stub auth.uid(), companies, profiles, expense_cost_models, then
-- loads the RPC from the migration and checks (a)-(d).

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

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

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

-- (a) Company A cannot read or update company B, even with B's member id.
SELECT set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

INSERT INTO proof_result VALUES (
  'a_read_cross_tenant',
  NOT EXISTS (
    SELECT 1 FROM public.get_company_members('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  ),
  'Company A get_company_members(B) returned no rows'
);

DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
BEGIN
  BEGIN
    PERFORM public.update_member_settings(
      '55555555-5555-5555-5555-555555555555',
      jsonb_build_object('template_access', 'none')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  INSERT INTO proof_result VALUES (
    'a_update_cross_tenant',
    v_failed AND (SELECT template_access FROM public.profiles WHERE id = '55555555-5555-5555-5555-555555555555') = 'view',
    coalesce(v_msg, 'cross-tenant update did not raise')
  );
END $$;

-- (b) A non-admin gets an error.
SELECT set_config('test.uid', '44444444-4444-4444-4444-444444444444', false);

DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
BEGIN
  BEGIN
    PERFORM public.update_member_settings(
      '33333333-3333-3333-3333-333333333333',
      jsonb_build_object('template_access', 'none')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  INSERT INTO proof_result VALUES (
    'b_non_admin',
    v_failed,
    coalesce(v_msg, 'non-admin update did not raise')
  );
END $$;

-- (c) An admin cannot change their own role or anyone's company_id.
SELECT set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);

DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
BEGIN
  BEGIN
    PERFORM public.update_member_settings(
      '33333333-3333-3333-3333-333333333333',
      jsonb_build_object('role', 'member')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  INSERT INTO proof_result VALUES (
    'c_admin_own_role',
    v_failed AND (SELECT role FROM public.profiles WHERE id = '33333333-3333-3333-3333-333333333333') = 'admin',
    coalesce(v_msg, 'admin self role change did not raise')
  );
END $$;

DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
BEGIN
  BEGIN
    PERFORM public.update_member_settings(
      '44444444-4444-4444-4444-444444444444',
      jsonb_build_object('company_id', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  INSERT INTO proof_result VALUES (
    'c_company_id_rejected',
    v_failed AND (SELECT company_id FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444')
      = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    coalesce(v_msg, 'company_id patch did not raise')
  );
END $$;

-- Admin also cannot change someone else's role (owner only).
DO $$
DECLARE
  v_failed boolean := false;
  v_msg text;
BEGIN
  BEGIN
    PERFORM public.update_member_settings(
      '44444444-4444-4444-4444-444444444444',
      jsonb_build_object('role', 'admin')
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    v_msg := SQLERRM;
  END;
  INSERT INTO proof_result VALUES (
    'c_admin_cannot_change_role',
    v_failed AND (SELECT role FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444') = 'member',
    coalesce(v_msg, 'non-owner role change did not raise')
  );
END $$;

-- (d) Owner and admin saves persist (re-select after the update).
SELECT set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

DO $$
DECLARE
  v_row jsonb;
BEGIN
  v_row := public.update_member_settings(
    '44444444-4444-4444-4444-444444444444',
    jsonb_build_object(
      'expense_cost_model_id', '66666666-6666-6666-6666-666666666666',
      'template_access', 'none'
    )
  );
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

SELECT set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);

DO $$
DECLARE
  v_row jsonb;
BEGIN
  v_row := public.update_member_settings(
    '44444444-4444-4444-4444-444444444444',
    jsonb_build_object('template_access', 'edit')
  );
  INSERT INTO proof_result VALUES (
    'd_admin_save',
    v_row->>'template_access' = 'edit'
      AND (SELECT template_access FROM public.profiles WHERE id = '44444444-4444-4444-4444-444444444444') = 'edit',
    v_row::text
  );
END $$;

-- Owner can change another member's role, not their own.
SELECT set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

DO $$
DECLARE
  v_row jsonb;
  v_failed boolean := false;
BEGIN
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
  END;
  INSERT INTO proof_result VALUES (
    'd_owner_role_other_not_self',
    v_row->>'role' = 'admin' AND v_failed
      AND (SELECT role FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111') = 'admin',
    v_row::text
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

SELECT check_id, ok, detail FROM proof_result ORDER BY check_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM proof_result WHERE NOT ok) THEN
    RAISE EXCEPTION 'update_member_settings proofs failed: %',
      (SELECT string_agg(check_id, ', ') FROM proof_result WHERE NOT ok);
  END IF;
END $$;
