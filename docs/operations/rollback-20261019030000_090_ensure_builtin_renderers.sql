DROP FUNCTION IF EXISTS public.ensure_builtin_renderers();
DROP INDEX IF EXISTS public.inspection_renderers_company_builtin_key_uidx;

DROP POLICY IF EXISTS "Company admins can insert renderers" ON public.inspection_renderers;
CREATE POLICY "Company admins can insert renderers"
  ON public.inspection_renderers FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT p.company_id FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'admin'
          OR p.id = (SELECT public.company_founder_id(p.company_id))
        )
    )
  );
