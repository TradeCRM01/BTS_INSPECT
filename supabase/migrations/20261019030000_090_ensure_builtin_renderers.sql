CREATE UNIQUE INDEX IF NOT EXISTS inspection_renderers_company_builtin_key_uidx
  ON public.inspection_renderers (company_id, key)
  WHERE built_in IS TRUE;

DROP POLICY IF EXISTS "Company admins can insert renderers" ON public.inspection_renderers;
CREATE POLICY "Company admins can insert renderers"
  ON public.inspection_renderers FOR INSERT
  TO authenticated
  WITH CHECK (
    built_in = false AND company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR p.id = (SELECT public.company_founder_id(p.company_id))
        )
    )
  );

CREATE OR REPLACE FUNCTION public.ensure_builtin_renderers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_company uuid;
BEGIN
  SELECT p.company_id INTO v_company
  FROM public.profiles p
  WHERE p.id = v_actor_id;

  IF v_company IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.inspection_renderers (company_id, key, label, built_in)
  VALUES
    (v_company, 'generic_inspection', 'Generic Inspection', true),
    (v_company, 'electrical_3000', 'AS/NZS 3000:2018', true)
  ON CONFLICT (company_id, key) WHERE built_in IS TRUE
  DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_builtin_renderers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_builtin_renderers() TO authenticated;
