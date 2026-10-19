-- Rollback 090_accounting_credentials. Do not run on production without approval.
-- Drops the status RPC and the credential table. Prod had no tokens to put back.

DROP FUNCTION IF EXISTS public.get_accounting_connection(uuid);
DROP TABLE IF EXISTS public.accounting_credentials;
