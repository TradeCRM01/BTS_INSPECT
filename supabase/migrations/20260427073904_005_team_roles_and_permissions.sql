/*
  # Team Roles and Permissions

  ## Summary
  Adds multi-user team support within a company. Each profile gets a role (admin
  or member) and a template_access level (view, edit, or none).

  ## New Columns on profiles
  - `role` (text) — 'admin' or 'member'. Defaults to 'member'. The first user
    created for a company is typically set to 'admin' via the app invite flow.
  - `template_access` (text) — 'view', 'edit', or 'none'. Controls whether a
    member can see or modify templates. Defaults to 'view'.

  ## New Function
  - `get_company_members(p_company_id uuid)` — SECURITY DEFINER function so any
    authenticated company member can list their colleagues without triggering RLS
    recursion on the profiles table.

  ## Updated RLS Policies
  - Admins can UPDATE any profile in their company (to change role/template_access).
  - The SELECT policy on profiles is widened via the security definer function
    rather than a recursive policy.

  ## Notes
  - Existing profiles default to role='member'. You should manually set your own
    account to role='admin' via the SQL editor or the app will do it if you're
    the only member.
  - template_access='view' means read-only on templates; 'edit' means full CRUD;
    'none' means templates are hidden entirely.
*/

-- 1. Add role and template_access columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'member'
      CHECK (role IN ('admin', 'member'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'template_access'
  ) THEN
    ALTER TABLE profiles ADD COLUMN template_access text NOT NULL DEFAULT 'view'
      CHECK (template_access IN ('view', 'edit', 'none'));
  END IF;
END $$;

-- 2. Security definer function — bypasses RLS to let company members list colleagues
CREATE OR REPLACE FUNCTION get_company_members(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  licence_number text,
  role text,
  template_access text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.name, p.licence_number, p.role, p.template_access, p.created_at
  FROM profiles p
  WHERE p.company_id = p_company_id
    AND p.company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ORDER BY p.created_at ASC;
$$;

-- 3. Allow admins to update any profile in their company (for role/access changes)
DROP POLICY IF EXISTS "Admins can update company member profiles" ON profiles;
CREATE POLICY "Admins can update company member profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. Allow admins to delete (remove) members from their company
DROP POLICY IF EXISTS "Admins can delete company member profiles" ON profiles;
CREATE POLICY "Admins can delete company member profiles"
  ON profiles FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
    AND id <> auth.uid()
  );

-- 5. Promote all existing single-member companies to admin
-- (any company where only one profile exists — that's the founder)
UPDATE profiles p
SET role = 'admin'
WHERE role = 'member'
  AND (
    SELECT COUNT(*) FROM profiles p2 WHERE p2.company_id = p.company_id
  ) = 1;
