/*
  # Per-user schedule colours

  Lets each team member have an explicit colour on the Schedule board
  (column headers, filter pills, avatars) instead of a hash-picked default.

  ## Changes
  1. profiles.schedule_color text — optional #RRGGBB
  2. get_company_members returns schedule_color
  3. set_member_schedule_color(member_id, color) — same-company members can set it
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS schedule_color text;

COMMENT ON COLUMN profiles.schedule_color IS
  'Hex colour (#RRGGBB) used on the Schedule board for this person. Null = auto from palette.';

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
  last_sign_in_at timestamptz,
  schedule_color text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.email, p.name, p.licence_number, p.role, p.template_access,
    p.created_at, u.email_confirmed_at, u.last_sign_in_at,
    p.schedule_color
  FROM profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.company_id = p_company_id
    AND p.company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ORDER BY p.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION set_member_schedule_color(
  p_member_id uuid,
  p_color text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company uuid;
  v_member_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Allow null (reset to auto) or #RRGGBB / #RGB
  IF p_color IS NOT NULL AND p_color !~* '^#([0-9A-F]{6}|[0-9A-F]{3})$' THEN
    RAISE EXCEPTION 'Invalid colour — use #RRGGBB';
  END IF;

  SELECT company_id INTO v_caller_company FROM profiles WHERE id = auth.uid();
  SELECT company_id INTO v_member_company FROM profiles WHERE id = p_member_id;

  IF v_caller_company IS NULL OR v_member_company IS NULL
     OR v_caller_company <> v_member_company THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE profiles
  SET schedule_color = CASE
    WHEN p_color IS NULL THEN NULL
    WHEN length(p_color) = 4 THEN
      -- expand #RGB → #RRGGBB
      '#' || substr(p_color, 2, 1) || substr(p_color, 2, 1)
          || substr(p_color, 3, 1) || substr(p_color, 3, 1)
          || substr(p_color, 4, 1) || substr(p_color, 4, 1)
    ELSE upper(p_color)
  END
  WHERE id = p_member_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_company_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_member_schedule_color(uuid, text) TO authenticated;
