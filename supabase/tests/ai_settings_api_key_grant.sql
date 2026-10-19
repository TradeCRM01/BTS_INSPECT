-- Run after ai_settings_interim_lock and the leftover-privs revoke on a local database.
-- Expect every can_*_api_key column and leftover table privilege to be false.

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
    AS authenticated_can_update_admin_tools,
  has_table_privilege('authenticated', 'public.ai_settings', 'DELETE')
    AS authenticated_can_delete,
  has_table_privilege('authenticated', 'public.ai_settings', 'TRUNCATE')
    AS authenticated_can_truncate,
  has_table_privilege('authenticated', 'public.ai_settings', 'REFERENCES')
    AS authenticated_can_references,
  has_table_privilege('authenticated', 'public.ai_settings', 'TRIGGER')
    AS authenticated_can_trigger,
  has_table_privilege('anon', 'public.ai_settings', 'DELETE')
    AS anon_can_delete,
  has_table_privilege('authenticated', 'public.ai_settings', 'MAINTAIN')
    AS authenticated_can_maintain,
  has_table_privilege('anon', 'public.ai_settings', 'MAINTAIN')
    AS anon_can_maintain;
