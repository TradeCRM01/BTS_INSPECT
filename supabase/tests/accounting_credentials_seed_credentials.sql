DELETE FROM public.accounting_credentials;

INSERT INTO public.accounting_credentials (
  company_id, provider, access_token, refresh_token, expires_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'xero',
  'cred-access',
  'cred-refresh',
  '2026-10-19T01:00:00Z'
);
