DROP POLICY IF EXISTS "Users can view company inspections" ON inspections;
CREATE POLICY "Users can view company inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    -- Viewer's company matches the inspector's company
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

DROP POLICY IF EXISTS "Users can update company inspections" ON inspections;
CREATE POLICY "Users can update company inspections"
  ON inspections FOR UPDATE
  TO authenticated
  USING (
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  )
  WITH CHECK (
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

DROP POLICY IF EXISTS "Admins can delete company inspections" ON inspections;
CREATE POLICY "Admins can delete company inspections"
  ON inspections FOR DELETE
  TO authenticated
  USING (
    -- Admin check: user must have admin role
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    AND
    -- Company check: user's company must match inspection creator's company
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );
