CREATE OR REPLACE FUNCTION public.profile_company_id_for_caller(p_profile_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.company_id
  FROM public.profiles p
  JOIN public.profiles caller ON caller.id = auth.uid()
  WHERE p.id = p_profile_id
    AND p.company_id = caller.company_id
$$;

REVOKE ALL ON FUNCTION public.profile_company_id_for_caller(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_company_id_for_caller(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view company inspections" ON inspections;
CREATE POLICY "Users can view company inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    public.inspection_inspector_company_id(inspections.id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update company inspections" ON inspections;
CREATE POLICY "Users can update company inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    public.inspection_inspector_company_id(inspections.id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    public.profile_company_id_for_caller(inspections.inspector_id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete company inspections" ON inspections;
CREATE POLICY "Admins can delete company inspections"
  ON inspections FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    AND
    public.inspection_inspector_company_id(inspections.id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
