/*
# Add missing UPDATE policy on reports table

1. Problem
- The reports table has SELECT and INSERT RLS policies but NO UPDATE policy.
- When users drag report items on the Shared Drive canvas to reposition them,
  the frontend calls `supabase.from('reports').update({ position_x, position_y })`.
- Without an UPDATE policy, RLS silently blocks the update — positions never
  persist and items snap back to (0, 0) on next refresh.

2. Fix
- Add a company-scoped UPDATE policy on reports, mirroring the existing
  SELECT/INSERT policies that check company membership via profiles → inspections.

3. Security
- Policy scoped TO authenticated.
- USING + WITH CHECK both verify the report's inspection belongs to an
  inspector in the caller's company — identical predicate to existing policies.
*/

DROP POLICY IF EXISTS "Company members can update reports" ON reports;

CREATE POLICY "Company members can update reports"
ON reports FOR UPDATE
TO authenticated
USING (
  inspection_id IN (
    SELECT i.id
    FROM inspections i
    JOIN profiles p ON p.id = i.inspector_id
    WHERE p.company_id IN (
      SELECT profiles.company_id
      FROM profiles
      WHERE profiles.id = auth.uid()
    )
  )
)
WITH CHECK (
  inspection_id IN (
    SELECT i.id
    FROM inspections i
    JOIN profiles p ON p.id = i.inspector_id
    WHERE p.company_id IN (
      SELECT profiles.company_id
      FROM profiles
      WHERE profiles.id = auth.uid()
    )
  )
);
