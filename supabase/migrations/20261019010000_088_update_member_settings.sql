-- Team member settings writes (cost model, template_access, role) go through a
-- column-whitelisted SECURITY DEFINER RPC. Direct profiles UPDATE still cannot
-- see another member's row (SELECT is own-profile only), so PostgREST 204s.
-- Do not add a same-company SELECT policy: that would also activate the existing
-- "Admins can update company member profiles" policy, which cannot restrict columns.
-- Reads of other members stay on get_company_members (now includes expense_cost_model_id).

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
  schedule_color text,
  expense_cost_model_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id, p.email, p.name, p.licence_number, p.role, p.template_access,
    p.created_at, u.email_confirmed_at, u.last_sign_in_at,
    p.schedule_color,
    p.expense_cost_model_id
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.company_id = p_company_id
    AND p.company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ORDER BY p.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.get_company_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_members(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_member_settings(
  member_id uuid,
  patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_company uuid;
  v_actor_role text;
  v_owner_id uuid;
  v_target_company uuid;
  v_key text;
  v_has_cost boolean := false;
  v_has_access boolean := false;
  v_has_role boolean := false;
  v_new_cost uuid;
  v_new_access text;
  v_new_role text;
  v_updated int;
  v_row jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF member_id IS NULL THEN
    RAISE EXCEPTION 'member_id is required';
  END IF;
  IF patch IS NULL OR jsonb_typeof(patch) <> 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(patch)
  LOOP
    IF v_key NOT IN ('expense_cost_model_id', 'template_access', 'role') THEN
      RAISE EXCEPTION 'Field % is not allowed', v_key USING ERRCODE = '42501';
    END IF;
  END LOOP;

  SELECT p.company_id, p.role INTO v_actor_company, v_actor_role
  FROM public.profiles p
  WHERE p.id = v_actor_id;

  SELECT p.company_id INTO v_target_company
  FROM public.profiles p
  WHERE p.id = member_id;

  IF v_actor_company IS NULL OR v_target_company IS NULL
     OR v_actor_company IS DISTINCT FROM v_target_company THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  v_owner_id := public.company_founder_id(v_actor_company);

  IF v_actor_role IS DISTINCT FROM 'admin'
     AND v_actor_id IS DISTINCT FROM v_owner_id THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  v_has_cost := patch ? 'expense_cost_model_id';
  v_has_access := patch ? 'template_access';
  v_has_role := patch ? 'role';

  IF NOT v_has_cost AND NOT v_has_access AND NOT v_has_role THEN
    RAISE EXCEPTION 'patch has no allowed fields';
  END IF;

  IF v_has_role THEN
    IF v_actor_id IS NOT DISTINCT FROM member_id THEN
      RAISE EXCEPTION 'You cannot change your own role' USING ERRCODE = '42501';
    END IF;
    IF v_actor_id IS DISTINCT FROM v_owner_id THEN
      RAISE EXCEPTION 'Only the company owner can change roles' USING ERRCODE = '42501';
    END IF;
    v_new_role := patch->>'role';
    IF v_new_role IS NULL OR v_new_role NOT IN ('admin', 'member') THEN
      RAISE EXCEPTION 'Invalid role';
    END IF;
  END IF;

  IF v_has_access THEN
    v_new_access := patch->>'template_access';
    IF v_new_access IS NULL OR v_new_access NOT IN ('view', 'edit', 'none') THEN
      RAISE EXCEPTION 'Invalid template_access';
    END IF;
  END IF;

  IF v_has_cost THEN
    IF patch->'expense_cost_model_id' = 'null'::jsonb
       OR jsonb_typeof(patch->'expense_cost_model_id') = 'null'
       OR coalesce(patch->>'expense_cost_model_id', '') = '' THEN
      v_new_cost := NULL;
    ELSE
      v_new_cost := (patch->>'expense_cost_model_id')::uuid;
      IF NOT EXISTS (
        SELECT 1
        FROM public.expense_cost_models m
        WHERE m.id = v_new_cost
          AND m.company_id = v_actor_company
      ) THEN
        RAISE EXCEPTION 'Cost model not found';
      END IF;
    END IF;
  END IF;

  UPDATE public.profiles p
  SET
    expense_cost_model_id = CASE WHEN v_has_cost THEN v_new_cost ELSE p.expense_cost_model_id END,
    template_access = CASE WHEN v_has_access THEN v_new_access ELSE p.template_access END,
    role = CASE WHEN v_has_role THEN v_new_role ELSE p.role END
  WHERE p.id = member_id
    AND p.company_id = v_actor_company;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No member settings were updated';
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'expense_cost_model_id', p.expense_cost_model_id,
    'template_access', p.template_access,
    'role', p.role
  )
  INTO v_row
  FROM public.profiles p
  WHERE p.id = member_id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_settings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_settings(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.update_member_settings(uuid, jsonb) IS
  'Owner or admin updates a same-company member cost model, template_access, or (owner only, never self) role.';
