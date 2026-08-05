/*
  # Allow admins to change roles of any company member

  Previously the UPDATE policy on profiles only allowed admins to update non-admin
  members. This revision drops that restriction so admins can promote members to
  admin and demote other admins back to member (but not themselves, enforced in app).
*/

DROP POLICY IF EXISTS "Admins can update company member profiles" ON profiles;

CREATE POLICY "Admins can update company member profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
    AND id <> auth.uid()
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
    AND id <> auth.uid()
  );
