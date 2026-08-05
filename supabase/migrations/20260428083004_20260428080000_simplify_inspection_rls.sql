/*
  # Simplify Inspection RLS Policies

  1. Changes
    - Simplify inspection visibility policies since all users are in the same company
    - All authenticated users can now view and modify inspections (company-wide access)
    - Maintains security by checking company membership via profiles table
  
  2. Policy Changes
    - SELECT: Any authenticated user can view inspections created by anyone in their company
    - INSERT: Any authenticated user can create inspections (sets inspector_id to current user)
    - UPDATE: Any authenticated user can update inspections in their company
    - DELETE: Removed (inspections should not be deleted, only archived)
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Company members can view inspections" ON inspections;
DROP POLICY IF EXISTS "Inspectors can insert inspections" ON inspections;
DROP POLICY IF EXISTS "Company members can update inspections" ON inspections;

-- CREATE new simplified policies
CREATE POLICY "Users can view company inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    -- Viewer's company matches the inspector's company
    (SELECT company_id FROM profiles WHERE id = auth.uid()) =
    (SELECT company_id FROM profiles WHERE id = inspector_id)
  );

CREATE POLICY "Users can create inspections"
  ON inspections FOR INSERT
  TO authenticated
  WITH CHECK (inspector_id = auth.uid());

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
