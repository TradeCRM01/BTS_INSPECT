DELETE FROM public.inspections WHERE id IN (
  'e1000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000002',
  'e1000000-0000-0000-0000-000000000003',
  'e1000000-0000-0000-0000-000000000004',
  'e1000000-0000-0000-0000-000000000005',
  'e1000000-0000-0000-0000-000000000006',
  'e1000000-0000-0000-0000-000000000007',
  'e1000000-0000-0000-0000-000000000008',
  'e1000000-0000-0000-0000-000000000009'
);
DELETE FROM public.jobs WHERE id IN (
  'b1000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000003'
);
DELETE FROM public.clients WHERE id IN (
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004'
);
DELETE FROM public.templates WHERE id = '0eeeeeee-0000-0000-0000-000000000001';
DELETE FROM public.profiles WHERE id IN (
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444'
);
DELETE FROM public.profiles WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555'
);
DELETE FROM public.companies WHERE id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
DELETE FROM auth.users WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555'
);

INSERT INTO auth.users(id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'o@x.test'),
  ('22222222-2222-2222-2222-222222222222', 'm@x.test'),
  ('33333333-3333-3333-3333-333333333333', 's@x.test'),
  ('44444444-4444-4444-4444-444444444444', 't@x.test'),
  ('55555555-5555-5555-5555-555555555555', 'other@x.test');

INSERT INTO public.companies(id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Co A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Co B');

INSERT INTO public.profiles(id, email, name, licence_number, company_id, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'o@x.test', 'Owner Oak', 'OWN-1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'm@x.test', 'Pat Snapshot', 'EC-4411', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member'),
  ('33333333-3333-3333-3333-333333333333', 's@x.test', 'Sam Spark', NULL, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member'),
  ('44444444-4444-4444-4444-444444444444', 't@x.test', 'Tess Template', 'TT-9', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member'),
  ('55555555-5555-5555-5555-555555555555', 'other@x.test', 'Other Co', 'OT-1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
UPDATE public.companies SET created_by = '11111111-1111-1111-1111-111111111111'
  WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE public.companies SET created_by = '55555555-5555-5555-5555-555555555555'
  WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT set_config('request.jwt.claims', '', false);

INSERT INTO public.templates(id, company_id, created_by, name) VALUES
  ('0eeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'T-owner');

INSERT INTO public.clients(id, company_id, name) VALUES
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Old Client'),
  ('c1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'New Client'),
  ('c1000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Doomed Client'),
  ('c1000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Other Co Client');

INSERT INTO public.jobs(id, company_id, client_id, title, address, scheduled_date, created_by) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c1000000-0000-0000-0000-000000000001', 'Job One', 'Old St', '2026-10-20', '22222222-2222-2222-2222-222222222222'),
  ('b1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 'Job Two', 'Two St', '2026-10-21', NULL),
  ('b1000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, 'Doomed Job', 'Doom St', '2026-10-22', NULL);

INSERT INTO public.inspections(id, template_id, template_snapshot, inspector_id, status, meta, responses, client_id, crm_job_id, archived) VALUES
  ('e1000000-0000-0000-0000-000000000001', '0eeeeeee-0000-0000-0000-000000000001', '{}', '22222222-2222-2222-2222-222222222222', 'issued', '{"siteName":"Old St","siteAddress":"Old St","clientName":"Old Client"}', '{"q":"a"}', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', false),
  ('e1000000-0000-0000-0000-000000000002', '0eeeeeee-0000-0000-0000-000000000001', '{}', '22222222-2222-2222-2222-222222222222', 'completed', '{"siteName":"C St"}', '{"q":"a"}', NULL, NULL, false),
  ('e1000000-0000-0000-0000-000000000003', '0eeeeeee-0000-0000-0000-000000000001', '{}', '22222222-2222-2222-2222-222222222222', 'draft', '{"siteName":"Old St"}', '{"q":"a"}', 'c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', false),
  ('e1000000-0000-0000-0000-000000000004', '0eeeeeee-0000-0000-0000-000000000001', '{}', '22222222-2222-2222-2222-222222222222', 'sent', '{"siteName":"S St"}', '{"q":"a"}', NULL, NULL, false),
  ('e1000000-0000-0000-0000-000000000005', '0eeeeeee-0000-0000-0000-000000000001', '{}', '22222222-2222-2222-2222-222222222222', 'archived', '{"siteName":"A St"}', '{"q":"a"}', NULL, NULL, false),
  ('e1000000-0000-0000-0000-000000000006', '0eeeeeee-0000-0000-0000-000000000001', '{}', '22222222-2222-2222-2222-222222222222', 'draft', '{"siteName":"AF St"}', '{"q":"a"}', NULL, NULL, true),
  ('e1000000-0000-0000-0000-000000000007', '0eeeeeee-0000-0000-0000-000000000001', '{}', '33333333-3333-3333-3333-333333333333', 'issued', '{"siteName":"Doom St","siteAddress":"Doom St","clientName":"Doomed Client"}', '{"q":"a"}', 'c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', false),
  ('e1000000-0000-0000-0000-000000000008', '0eeeeeee-0000-0000-0000-000000000001', '{}', '22222222-2222-2222-2222-222222222222', 'issued', '{"siteName":"N St"}', '{"q":"a"}', NULL, NULL, false),
  ('e1000000-0000-0000-0000-000000000009', '0eeeeeee-0000-0000-0000-000000000001', '{}', '22222222-2222-2222-2222-222222222222', 'completed', '{"siteName":"C2 St"}', '{"q":"a"}', NULL, NULL, false);
