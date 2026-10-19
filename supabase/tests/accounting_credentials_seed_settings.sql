DELETE FROM public.accounting_settings;
DELETE FROM public.profiles;
DELETE FROM public.companies;

INSERT INTO public.companies (id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Company A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Company B');

INSERT INTO public.profiles (id, company_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin');

INSERT INTO public.accounting_settings (
  company_id, provider, tenant_id, connection_status, last_synced_at, settings
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'xero',
  'tenant-a',
  'connected',
  '2026-10-19T00:00:00Z',
  jsonb_build_object(
    'access_token', 'stale-settings-token',
    'refresh_token', 'stale-settings-refresh',
    'expires_at', '2099-01-01T00:00:00Z',
    'xero', jsonb_build_object(
      'token', jsonb_build_object('iv', 'iv', 'cipher', 'cipher'),
      'access_token', 'nested-leak',
      'tenant_name', 'Jack''s Bar',
      'paid_invoices', jsonb_build_object('inv-1', 'xero-1')
    )
  )
);
