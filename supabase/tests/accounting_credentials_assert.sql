DO $strip$
DECLARE
  leftover jsonb;
BEGIN
  SELECT settings INTO leftover
  FROM public.accounting_settings
  WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF leftover ? 'access_token' OR leftover ? 'refresh_token' OR leftover ? 'expires_at' OR leftover ? 'token' THEN
    RAISE EXCEPTION 'settings still has top-level token keys: %', leftover;
  END IF;
  IF leftover -> 'xero' ? 'token' OR leftover -> 'xero' ? 'access_token' THEN
    RAISE EXCEPTION 'settings.xero still has token keys: %', leftover;
  END IF;
  IF leftover #>> '{xero,tenant_name}' IS DISTINCT FROM 'Jack''s Bar' THEN
    RAISE EXCEPTION 'tenant_name was stripped: %', leftover;
  END IF;
END
$strip$;

SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);

DO $priv$
BEGIN
  IF has_table_privilege('authenticated', 'public.accounting_credentials', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated still has SELECT on accounting_credentials';
  END IF;
END
$priv$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);

DO $select$
DECLARE
  denied boolean := false;
  n integer;
BEGIN
  BEGIN
    SELECT count(*) INTO n FROM public.accounting_credentials;
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := true;
  END;
  IF NOT denied AND n > 0 THEN
    RAISE EXCEPTION 'authenticated read % credential rows', n;
  END IF;
END
$select$;

DO $member$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.get_accounting_connection('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  IF r.connected IS NOT TRUE THEN
    RAISE EXCEPTION 'member rpc connected=%', r.connected;
  END IF;
  IF r.tenant_name IS DISTINCT FROM 'Jack''s Bar' THEN
    RAISE EXCEPTION 'member rpc tenant_name=%', r.tenant_name;
  END IF;
  IF r.last_synced_at IS NULL THEN
    RAISE EXCEPTION 'member rpc missing last_synced_at';
  END IF;
  IF to_jsonb(r) ? 'access_token' OR to_jsonb(r) ? 'refresh_token' OR to_jsonb(r) ? 'expires_at' THEN
    RAISE EXCEPTION 'member rpc leaked a token column: %', to_jsonb(r);
  END IF;
END
$member$;

DO $nonmember$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
  FROM public.get_accounting_connection('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  IF n <> 0 THEN
    RAISE EXCEPTION 'non-member rpc returned % rows', n;
  END IF;
END
$nonmember$;

RESET ROLE;

SELECT 'accounting_credentials proof passed' AS status;
