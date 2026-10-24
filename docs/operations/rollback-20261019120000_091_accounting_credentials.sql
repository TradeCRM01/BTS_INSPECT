-- Rollback 091_accounting_credentials. Do not run on production without approval.

DROP FUNCTION IF EXISTS public.get_accounting_connection(uuid);
DROP TABLE IF EXISTS public.accounting_credentials;
