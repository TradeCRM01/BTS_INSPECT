-- Rollback 090_accounting_credentials. Do not run on production without approval.
-- Drops the status RPC and the service_role-only credential table.
-- Does not restore tokens into accounting_settings.settings (prod had none).

DROP FUNCTION IF EXISTS public.get_accounting_connection(uuid);
DROP TABLE IF EXISTS public.accounting_credentials;
