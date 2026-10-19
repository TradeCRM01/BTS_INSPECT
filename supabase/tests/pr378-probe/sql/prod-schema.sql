-- Prod-faithful subset of ezszahvwwmbuekpedumf (read via pg_get_functiondef / pg_policies / pg_constraint, 2026-10-19 ~10:45 AEST)
DO $$BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END$$;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
-- Supabase default privileges for functions in public (prod pg_default_acl)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $f$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $f$;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz);

CREATE TABLE public.companies (id uuid PRIMARY KEY, name text NOT NULL DEFAULT 'co', created_at timestamptz DEFAULT now(), created_by uuid);
CREATE TABLE public.expense_cost_models (id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, name text NOT NULL DEFAULT 'm');
CREATE TABLE public.profiles (
  id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL, name text NOT NULL, licence_number text,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  created_at timestamptz DEFAULT now(),
  role text NOT NULL DEFAULT 'member' CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['admin','member'])),
  template_access text NOT NULL DEFAULT 'view' CONSTRAINT profiles_template_access_check CHECK (template_access = ANY (ARRAY['view','edit','none'])),
  schedule_color text, saved_signature text, dashboard_widgets_seeded boolean NOT NULL DEFAULT false,
  expense_cost_model_id uuid REFERENCES public.expense_cost_models(id) ON DELETE SET NULL);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_cost_models ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.companies, public.profiles, public.expense_cost_models TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.company_founder_id(p_company_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT created_by FROM public.companies WHERE id = p_company_id $f$;
CREATE OR REPLACE FUNCTION public.company_admin_count(p_company_id uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT COUNT(*)::int FROM public.profiles WHERE company_id = p_company_id AND role = 'admin' $f$;
CREATE OR REPLACE FUNCTION public.profile_expense_cost_model_write_allowed(p_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR EXISTS (SELECT 1 FROM public.profiles AS actor WHERE actor.id = auth.uid() AND actor.company_id = p_company_id
      AND (actor.role = 'admin' OR actor.id = public.company_founder_id(p_company_id))) $f$;
CREATE OR REPLACE FUNCTION public.profile_remove_allowed(p_id uuid, p_company_id uuid, p_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT p_id IS DISTINCT FROM public.company_founder_id(p_company_id) AND NOT (p_role = 'admin' AND public.company_admin_count(p_company_id) <= 1) $f$;
CREATE OR REPLACE FUNCTION public.profile_role_write_allowed(p_id uuid, p_company_id uuid, p_new_role text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT p_new_role IS NOT DISTINCT FROM (SELECT role FROM public.profiles WHERE id = p_id)
    OR (p_id IS DISTINCT FROM public.company_founder_id(p_company_id)
      AND NOT ((SELECT role FROM public.profiles WHERE id = p_id) = 'admin' AND p_new_role IS DISTINCT FROM 'admin' AND public.company_admin_count(p_company_id) <= 1)) $f$;
CREATE OR REPLACE FUNCTION public.prevent_profile_tenant_hop() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'company_id cannot be changed from the client';
  END IF;
  RETURN NEW;
END; $f$;
CREATE OR REPLACE FUNCTION public.protect_company_admin_locks() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_company uuid; v_founder uuid; v_admin_count int;
BEGIN
  v_company := COALESCE(NEW.company_id, OLD.company_id);
  v_founder := public.company_founder_id(v_company);
  v_admin_count := public.company_admin_count(v_company);
  IF TG_OP = 'DELETE' THEN
    IF OLD.id IS NOT DISTINCT FROM v_founder THEN RAISE EXCEPTION 'The company owner cannot be removed or have their role changed.'; END IF;
    IF OLD.role = 'admin' AND v_admin_count <= 1 THEN RAISE EXCEPTION 'A company must keep at least one admin.'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.id IS NOT DISTINCT FROM v_founder THEN RAISE EXCEPTION 'The company owner cannot be removed or have their role changed.'; END IF;
    IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM 'admin' AND v_admin_count <= 1 THEN RAISE EXCEPTION 'A company must keep at least one admin.'; END IF;
  END IF;
  RETURN NEW;
END; $f$;
CREATE OR REPLACE FUNCTION public.protect_profile_expense_cost_model() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF NEW.expense_cost_model_id IS NOT DISTINCT FROM OLD.expense_cost_model_id THEN RETURN NEW; END IF;
  IF public.profile_expense_cost_model_write_allowed(NEW.company_id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Only company owners and admins can assign employee cost models';
END; $f$;
CREATE TRIGGER trg_prevent_profile_tenant_hop BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_profile_tenant_hop();
CREATE TRIGGER trg_protect_company_admin_locks BEFORE DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_company_admin_locks();
CREATE TRIGGER trg_protect_profile_expense_cost_model BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_expense_cost_model();

-- prod get_company_members (pre-088)
CREATE OR REPLACE FUNCTION public.get_company_members(p_company_id uuid)
 RETURNS TABLE(id uuid, email text, name text, licence_number text, role text, template_access text, created_at timestamptz, email_confirmed_at timestamptz, last_sign_in_at timestamptz, schedule_color text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT p.id, p.email, p.name, p.licence_number, p.role, p.template_access, p.created_at, u.email_confirmed_at, u.last_sign_in_at, p.schedule_color
  FROM profiles p LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.company_id = p_company_id AND p.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  ORDER BY p.created_at ASC; $f$;
GRANT EXECUTE ON FUNCTION public.get_company_members(uuid) TO PUBLIC;

-- prod policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK ((auth.uid() = id) AND (company_id = (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())) AND profile_role_write_allowed(id, company_id, role));
CREATE POLICY "Admins can update company member profiles" ON public.profiles FOR UPDATE TO authenticated
  USING ((company_id = (SELECT profiles_1.company_id FROM profiles profiles_1 WHERE profiles_1.id = auth.uid())) AND (EXISTS (SELECT 1 FROM profiles profiles_1 WHERE profiles_1.id = auth.uid() AND profiles_1.role = 'admin')) AND (id <> auth.uid()))
  WITH CHECK ((company_id = (SELECT profiles_1.company_id FROM profiles profiles_1 WHERE profiles_1.id = auth.uid())) AND (EXISTS (SELECT 1 FROM profiles profiles_1 WHERE profiles_1.id = auth.uid() AND profiles_1.role = 'admin')) AND (id <> auth.uid()) AND profile_role_write_allowed(id, company_id, role));
CREATE POLICY "Admins can delete company member profiles" ON public.profiles FOR DELETE TO authenticated
  USING ((company_id = (SELECT profiles_1.company_id FROM profiles profiles_1 WHERE profiles_1.id = auth.uid())) AND (EXISTS (SELECT 1 FROM profiles profiles_1 WHERE profiles_1.id = auth.uid() AND profiles_1.role = 'admin')) AND (id <> auth.uid()) AND profile_remove_allowed(id, company_id, role));
CREATE POLICY "Company members can view their company" ON public.companies FOR SELECT TO authenticated USING (id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
CREATE POLICY "Company members can view expense_cost_models" ON public.expense_cost_models FOR SELECT TO authenticated USING (company_id = (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid()));
