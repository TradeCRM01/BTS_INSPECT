/*
  # Fix profiles RLS infinite recursion

  The "Company members can view team profiles" policy caused infinite recursion
  because it queried the profiles table from within a profiles policy.

  Fix: Drop the recursive policy. The "Users can view own profile" policy is
  sufficient for auth to work. Company-scoped profile reads (e.g. for team lists)
  will use a security definer function instead.
*/

DROP POLICY IF EXISTS "Company members can view team profiles" ON profiles;
