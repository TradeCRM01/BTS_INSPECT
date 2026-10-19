-- Self-escalation guard on profiles + template_access RLS.
-- Does not edit 088. Recreates update_member_settings only to arm the
-- transaction-local bypass flag before the UPDATE.
-- Leave prevent_profile_tenant_hop alone.

CREATE TABLE IF NOT EXISTS public.update_member_settings_gate (
  txid bigint PRIMARY KEY
);

ALTER TABLE public.update_member_settings_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.update_member_settings_gate FROM PUBLIC, anon, authenticated;

-- BEFORE UPDATE. Keyed on auth.uid(), never current_user (a SECURITY DEFINER
-- trigger would see current_user as the function owner). Bypass is the
-- transaction-local GUC app.member_admin='on', armed only by
-- update_member_settings together with this gate so a client set_config /
-- PostgREST header cannot honour the flag outside the RPC.

CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.member_admin', true) = 'on'
     AND EXISTS (
       SELECT 1
       FROM public.update_member_settings_gate g
       WHERE g.txid = txid_current()
     ) THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.id
     AND (
       NEW.role IS DISTINCT FROM OLD.role
       OR NEW.template_access IS DISTINCT FROM OLD.template_access
       OR NEW.expense_cost_model_id IS DISTINCT FROM OLD.expense_cost_model_id
       OR NEW.company_id IS DISTINCT FROM OLD.company_id
     ) THEN
    RAISE EXCEPTION 'You can''t change your own access settings'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_self_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (
    NEW.role IS DISTINCT FROM OLD.role
    OR NEW.template_access IS DISTINCT FROM OLD.template_access
    OR NEW.expense_cost_model_id IS DISTINCT FROM OLD.expense_cost_model_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id
  )
  EXECUTE FUNCTION public.prevent_profile_self_escalation();

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

  PERFORM set_config('app.member_admin', 'on', true);
  INSERT INTO public.update_member_settings_gate (txid)
  VALUES (txid_current())
  ON CONFLICT (txid) DO NOTHING;

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

  DELETE FROM public.update_member_settings_gate WHERE txid = txid_current();

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

-- Own-row template_access for the JWT caller. Owners and admins are 'edit'
-- so /templates*, the dashboard widget, and inspection fill keep working.

CREATE OR REPLACE FUNCTION public.caller_template_access()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p.id IS NULL THEN 'none'
    WHEN p.role = 'admin' THEN 'edit'
    WHEN p.id = public.company_founder_id(p.company_id) THEN 'edit'
    WHEN p.template_access IN ('view', 'edit', 'none') THEN p.template_access
    ELSE 'none'
  END
  FROM (SELECT auth.uid() AS uid) u
  LEFT JOIN public.profiles p ON p.id = u.uid
$$;

CREATE OR REPLACE FUNCTION public.caller_can_view_templates()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.caller_template_access() IN ('view', 'edit')
$$;

CREATE OR REPLACE FUNCTION public.caller_can_edit_templates()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.caller_template_access() = 'edit'
$$;

REVOKE ALL ON FUNCTION public.caller_template_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.caller_can_view_templates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.caller_can_edit_templates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_template_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_can_view_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_can_edit_templates() TO authenticated;

-- public.templates
DROP POLICY IF EXISTS "Company members can view templates" ON public.templates;
DROP POLICY IF EXISTS "Company members can insert templates" ON public.templates;
DROP POLICY IF EXISTS "Company members can update templates" ON public.templates;
DROP POLICY IF EXISTS "Company members can delete templates" ON public.templates;
DROP POLICY IF EXISTS "templates_select_by_template_access" ON public.templates;
DROP POLICY IF EXISTS "templates_insert_by_template_access" ON public.templates;
DROP POLICY IF EXISTS "templates_update_by_template_access" ON public.templates;
DROP POLICY IF EXISTS "templates_delete_by_template_access" ON public.templates;

CREATE POLICY "templates_select_by_template_access"
  ON public.templates FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_view_templates()
  );

CREATE POLICY "templates_insert_by_template_access"
  ON public.templates FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );

CREATE POLICY "templates_update_by_template_access"
  ON public.templates FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_view_templates()
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );

CREATE POLICY "templates_delete_by_template_access"
  ON public.templates FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );

-- public.jha_templates
DROP POLICY IF EXISTS "select_jha_templates" ON public.jha_templates;
DROP POLICY IF EXISTS "insert_jha_templates" ON public.jha_templates;
DROP POLICY IF EXISTS "update_jha_templates" ON public.jha_templates;
DROP POLICY IF EXISTS "delete_jha_templates" ON public.jha_templates;
DROP POLICY IF EXISTS "jha_templates_select_by_template_access" ON public.jha_templates;
DROP POLICY IF EXISTS "jha_templates_insert_by_template_access" ON public.jha_templates;
DROP POLICY IF EXISTS "jha_templates_update_by_template_access" ON public.jha_templates;
DROP POLICY IF EXISTS "jha_templates_delete_by_template_access" ON public.jha_templates;

CREATE POLICY "jha_templates_select_by_template_access"
  ON public.jha_templates FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_view_templates()
  );

CREATE POLICY "jha_templates_insert_by_template_access"
  ON public.jha_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );

CREATE POLICY "jha_templates_update_by_template_access"
  ON public.jha_templates FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_view_templates()
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );

CREATE POLICY "jha_templates_delete_by_template_access"
  ON public.jha_templates FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );

-- public.inspection_renderers (TemplateEditorPage read/write)
DROP POLICY IF EXISTS "Company members can view renderers" ON public.inspection_renderers;
DROP POLICY IF EXISTS "Company admins can insert renderers" ON public.inspection_renderers;
DROP POLICY IF EXISTS "Company admins can update renderers" ON public.inspection_renderers;
DROP POLICY IF EXISTS "Company admins can delete renderers" ON public.inspection_renderers;
DROP POLICY IF EXISTS "inspection_renderers_select_by_template_access" ON public.inspection_renderers;
DROP POLICY IF EXISTS "inspection_renderers_insert_by_template_access" ON public.inspection_renderers;
DROP POLICY IF EXISTS "inspection_renderers_update_by_template_access" ON public.inspection_renderers;
DROP POLICY IF EXISTS "inspection_renderers_delete_by_template_access" ON public.inspection_renderers;

CREATE POLICY "inspection_renderers_select_by_template_access"
  ON public.inspection_renderers FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_view_templates()
  );

CREATE POLICY "inspection_renderers_insert_by_template_access"
  ON public.inspection_renderers FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );

CREATE POLICY "inspection_renderers_update_by_template_access"
  ON public.inspection_renderers FOR UPDATE
  TO authenticated
  USING (
    built_in = false
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_view_templates()
  )
  WITH CHECK (
    built_in = false
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );

CREATE POLICY "inspection_renderers_delete_by_template_access"
  ON public.inspection_renderers FOR DELETE
  TO authenticated
  USING (
    built_in = false
    AND company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND public.caller_can_edit_templates()
  );
