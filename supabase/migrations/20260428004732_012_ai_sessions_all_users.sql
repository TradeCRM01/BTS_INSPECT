/*
  # Open AI Console Sessions to All Authenticated Users

  Previously sessions were restricted to admins only.
  Now all authenticated users can store their own help conversations.
  Admin-specific tool use is still gated at the edge function layer.

  Changes:
  - Drop admin-only RLS policies
  - Replace with policies that allow any authenticated user to manage their own sessions
*/

DROP POLICY IF EXISTS "Admin can view own AI console sessions" ON ai_console_sessions;
DROP POLICY IF EXISTS "Admin can create AI console sessions" ON ai_console_sessions;
DROP POLICY IF EXISTS "Admin can update own AI console sessions" ON ai_console_sessions;
DROP POLICY IF EXISTS "Admin can delete own AI console sessions" ON ai_console_sessions;

CREATE POLICY "Users can view own AI sessions"
  ON ai_console_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own AI sessions"
  ON ai_console_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own AI sessions"
  ON ai_console_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own AI sessions"
  ON ai_console_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
