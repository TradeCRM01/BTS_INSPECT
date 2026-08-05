/*
  # Add invitation status to team members listing

  Extends `get_company_members` to also return whether each member has
  confirmed their email and last sign-in time. This lets the UI show a
  "Pending" badge and a "Resend invite" action for members who haven't
  yet completed signup.

  ## Changes
  1. `get_company_members(p_company_id uuid)` now also returns
     `email_confirmed_at timestamptz` and `last_sign_in_at timestamptz`
     joined from `auth.users`. SECURITY DEFINER so RLS is unaffected.

  ## Security
  Function still gates results to callers in the same company, so no
  additional auth.users data is exposed beyond colleagues you already
  see in the team list.
*/

DROP FUNCTION IF EXISTS get_company_members(uuid);

CREATE OR REPLACE FUNCTION get_company_members(p_company_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  licence_number text,
  role text,
  template_access text,
  created_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.email, p.name, p.licence_number, p.role, p.template_access,
    p.created_at, u.email_confirmed_at, u.last_sign_in_at
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.company_id = p_company_id
    AND p.company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ORDER BY p.created_at ASC;
$$;
