/*
  # Add DELETE policy for inspections (admin only)

  1. Changes
    - Add DELETE policy to allow admins to delete inspections
    - Restricts deletion to authenticated users whose company matches the inspection's creator
    - Only admins can perform deletes (checked via profiles table)

  2. Security
    - DELETE policy checks company membership
    - Only authenticated admins can delete
    - Prevents accidental deletion by non-admin users
*/

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
