DO $strip$
DECLARE
  leftover jsonb;
BEGIN
  SELECT settings INTO leftover
  FROM public.accounting_settings
  WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  IF leftover ? 'access_token'
    OR leftover ? 'refresh_token'
    OR leftover ? 'expires_at'
    OR leftover ? 'token' THEN
    RAISE EXCEPTION 'settings still has top-level token keys: %', leftover;
  END IF;
  IF leftover -> 'xero' ? 'token'
    OR leftover -> 'xero' ? 'access_token'
    OR leftover -> 'xero' ? 'refresh_token'
    OR leftover -> 'xero' ? 'expires_at' THEN
    RAISE EXCEPTION 'settings.xero still has token keys: %', leftover;
  END IF;
  IF leftover #>> '{xero,tenant_name}' IS DISTINCT FROM 'Jack''s Bar' THEN
    RAISE EXCEPTION 'tenant_name was stripped: %', leftover;
  END IF;
  IF leftover #>> '{xero,paid_invoices,inv-1}' IS DISTINCT FROM 'xero-1' THEN
    RAISE EXCEPTION 'paid_invoices was stripped: %', leftover;
  END IF;
  IF leftover -> 'other' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'unrelated settings key was stripped: %', leftover;
  END IF;
END
$strip$;

DO $svc$
DECLARE
  tok text;
BEGIN
  SET LOCAL ROLE service_role;
  SELECT access_token INTO tok
  FROM public.accounting_credentials
  WHERE company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND provider = 'xero';
  IF tok IS DISTINCT FROM 'cred-access' THEN
    RAISE EXCEPTION 'service_role read %', tok;
  END IF;
END
$svc$;

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
  IF NOT denied THEN
    RAISE EXCEPTION 'authenticated select was not permission denied (rows=%)', n;
  END IF;
END
$select$;

DO $member$
DECLARE
  r record;
  keys text[];
BEGIN
  SELECT * INTO r FROM public.get_accounting_connection('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  IF r.connected IS NOT TRUE THEN
    RAISE EXCEPTION 'member rpc connected=%', r.connected;
  END IF;
  IF r.tenant_name IS DISTINCT FROM 'Jack''s Bar' THEN
    RAISE EXCEPTION 'member rpc tenant_name=%', r.tenant_name;
  END IF;
  IF r.last_synced_at IS DISTINCT FROM '2026-10-19T00:00:00Z'::timestamptz THEN
    RAISE EXCEPTION 'member rpc last_synced_at=%', r.last_synced_at;
  END IF;
  SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(to_jsonb(r)) AS k;
  IF keys IS DISTINCT FROM ARRAY['connected', 'last_synced_at', 'tenant_name']::text[] THEN
    RAISE EXCEPTION 'member rpc columns %', keys;
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

SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', false);

DO $bare$
DECLARE
  n integer;
  r record;
BEGIN
  SELECT count(*) INTO n
  FROM public.get_accounting_connection('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  IF n <> 1 THEN
    RAISE EXCEPTION 'member without settings returned % rows', n;
  END IF;
  SELECT * INTO r FROM public.get_accounting_connection('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  IF r.connected IS DISTINCT FROM false
    OR r.tenant_name IS NOT NULL
    OR r.last_synced_at IS NOT NULL THEN
    RAISE EXCEPTION 'bare member rpc %', to_jsonb(r);
  END IF;
END
$bare$;

RESET ROLE;

SELECT 'accounting_credentials proof passed' AS status;
