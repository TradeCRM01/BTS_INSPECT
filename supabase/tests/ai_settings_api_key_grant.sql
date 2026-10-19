-- Run after 20261019000000_088_ai_settings_lockdown.sql on a local database.
-- Expect every can_*_api_key column to be false.

SELECT
  has_column_privilege('authenticated', 'public.ai_settings', 'anthropic_api_key', 'SELECT')
    AS authenticated_can_select_api_key,
  has_column_privilege('authenticated', 'public.ai_settings', 'anthropic_api_key', 'INSERT')
    AS authenticated_can_insert_api_key,
  has_column_privilege('authenticated', 'public.ai_settings', 'anthropic_api_key', 'UPDATE')
    AS authenticated_can_update_api_key,
  has_column_privilege('anon', 'public.ai_settings', 'anthropic_api_key', 'SELECT')
    AS anon_can_select_api_key,
  has_column_privilege('authenticated', 'public.ai_settings', 'model', 'SELECT')
    AS authenticated_can_select_model,
  has_column_privilege('authenticated', 'public.ai_settings', 'admin_tools_enabled', 'UPDATE')
    AS authenticated_can_update_admin_tools;
