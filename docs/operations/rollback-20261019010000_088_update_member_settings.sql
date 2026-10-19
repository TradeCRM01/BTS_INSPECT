-- Rollback 088_update_member_settings. Do not run on production without approval.
-- Restores get_company_members to the 20260807041903 signature (no expense_cost_model_id).

DROP FUNCTION IF EXISTS public.update_member_settings(uuid, jsonb);

DROP FUNCTION IF EXISTS public.get_company_members(uuid);

CREATE FUNCTION public.get_company_members(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  licence_number text,
  role text,
  template_access text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  schedule_color text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.email, p.name, p.licence_number, p.role, p.template_access,
    p.created_at, u.email_confirmed_at, u.last_sign_in_at,
    p.schedule_color
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.company_id = p_company_id
    AND p.company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ORDER BY p.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_members(uuid) TO authenticated;
