DROP POLICY IF EXISTS "Users can view company inspections" ON inspections;
CREATE POLICY "Users can view company inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    public.profile_company_id_for_caller(inspections.inspector_id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update company inspections" ON inspections;
CREATE POLICY "Users can update company inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    public.profile_company_id_for_caller(inspections.inspector_id) =
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
    public.profile_company_id_for_caller(inspections.inspector_id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
