-- Company owner is engraved on companies.created_by (existing table, no Owners module).
-- Last remaining admin cannot be removed or demoted. Extra admins can when there is more than one.
-- Other admins cannot delete the founder or change the founder's role.
-- Hard lock: trigger (covers service-role remove-member) + RLS (covers direct client update/delete).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS created_by uuid;

COMMENT ON COLUMN public.companies.created_by IS
  'Company founder. Durable. Other admins cannot remove this person or change their role.';

-- Oldest admin, else oldest profile. Signup sets this on insert going forward.
UPDATE public.companies c
SET created_by = (
  SELECT p.id
  FROM public.profiles p
  WHERE p.company_id = c.id
  ORDER BY (p.role = 'admin') DESC, p.created_at ASC, p.id ASC
  LIMIT 1
)
WHERE c.created_by IS NULL;

CREATE OR REPLACE FUNCTION public.company_founder_id(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT created_by FROM public.companies WHERE id = p_company_id
$$;

CREATE OR REPLACE FUNCTION public.company_admin_count(p_company_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.profiles
  WHERE company_id = p_company_id
    AND role = 'admin'
$$;

CREATE OR REPLACE FUNCTION public.profile_role_write_allowed(
  p_id uuid,
  p_company_id uuid,
  p_new_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_new_role IS NOT DISTINCT FROM (SELECT role FROM public.profiles WHERE id = p_id)
    OR (
      p_id IS DISTINCT FROM public.company_founder_id(p_company_id)
      AND NOT (
        (SELECT role FROM public.profiles WHERE id = p_id) = 'admin'
        AND p_new_role IS DISTINCT FROM 'admin'
        AND public.company_admin_count(p_company_id) <= 1
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.profile_remove_allowed(
  p_id uuid,
  p_company_id uuid,
  p_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_id IS DISTINCT FROM public.company_founder_id(p_company_id)
    AND NOT (p_role = 'admin' AND public.company_admin_count(p_company_id) <= 1)
$$;

REVOKE ALL ON FUNCTION public.company_founder_id(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.company_admin_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_role_write_allowed(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.profile_remove_allowed(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_founder_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.company_admin_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_role_write_allowed(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.profile_remove_allowed(uuid, uuid, text) TO authenticated, service_role;

-- Engrave once (null → value) from service role. Never rewrite the owner after that.
CREATE OR REPLACE FUNCTION public.protect_company_founder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    IF OLD.created_by IS NULL AND coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Company owner cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_company_founder ON public.companies;
CREATE TRIGGER trg_protect_company_founder
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_founder();

-- Last admin + founder: fires for client and service-role writes.
CREATE OR REPLACE FUNCTION public.protect_company_admin_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_founder uuid;
  v_admin_count int;
BEGIN
  v_company := COALESCE(NEW.company_id, OLD.company_id);
  v_founder := public.company_founder_id(v_company);
  v_admin_count := public.company_admin_count(v_company);

  IF TG_OP = 'DELETE' THEN
    IF OLD.id IS NOT DISTINCT FROM v_founder THEN
      RAISE EXCEPTION 'The company owner cannot be removed or have their role changed.';
    END IF;
    IF OLD.role = 'admin' AND v_admin_count <= 1 THEN
      RAISE EXCEPTION 'A company must keep at least one admin.';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.id IS NOT DISTINCT FROM v_founder THEN
      RAISE EXCEPTION 'The company owner cannot be removed or have their role changed.';
    END IF;
    IF OLD.role = 'admin' AND NEW.role IS DISTINCT FROM 'admin' AND v_admin_count <= 1 THEN
      RAISE EXCEPTION 'A company must keep at least one admin.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_company_admin_locks ON public.profiles;
CREATE TRIGGER trg_protect_company_admin_locks
  BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_admin_locks();

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    AND public.profile_role_write_allowed(id, company_id, role)
  );

DROP POLICY IF EXISTS "Admins can update company member profiles" ON public.profiles;
CREATE POLICY "Admins can update company member profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
    AND id <> auth.uid()
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
    AND id <> auth.uid()
    AND public.profile_role_write_allowed(id, company_id, role)
  );

DROP POLICY IF EXISTS "Admins can delete company member profiles" ON public.profiles;
CREATE POLICY "Admins can delete company member profiles"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
    AND id <> auth.uid()
    AND public.profile_remove_allowed(id, company_id, role)
  );
