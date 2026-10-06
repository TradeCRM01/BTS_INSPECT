-- COST-2: only company owner or admins may change profiles.expense_cost_model_id (client writes).
-- Service role bypasses. Not applied on live by agent — CoS applies with deploy.

CREATE OR REPLACE FUNCTION public.profile_expense_cost_model_write_allowed(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS actor
      WHERE actor.id = auth.uid()
        AND actor.company_id = p_company_id
        AND (
          actor.role = 'admin'
          OR actor.id = public.company_founder_id(p_company_id)
        )
    )
$$;

REVOKE ALL ON FUNCTION public.profile_expense_cost_model_write_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_expense_cost_model_write_allowed(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_profile_expense_cost_model()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.expense_cost_model_id IS NOT DISTINCT FROM OLD.expense_cost_model_id THEN
    RETURN NEW;
  END IF;
  IF public.profile_expense_cost_model_write_allowed(NEW.company_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only company owners and admins can assign employee cost models';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_expense_cost_model ON public.profiles;
CREATE TRIGGER trg_protect_profile_expense_cost_model
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_expense_cost_model();

COMMENT ON FUNCTION public.profile_expense_cost_model_write_allowed(uuid) IS
  'True when auth caller may change profiles.expense_cost_model_id for this company.';
