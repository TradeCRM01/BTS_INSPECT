-- CoS suite2 seed. DELETE preamble so re-seed cannot leak earlier cases.
-- Companies A/B/C, OA/AA/MA/MN, OB/Admin B/MB, OC/Admin C/Member C, CM1/CM2/CMB.
-- Replica around profile upserts so re-seed does not trip 089 / prod triggers.

SET session_replication_role = replica;
DELETE FROM public.jha_documents;
DELETE FROM public.inspections;
DELETE FROM public.jobs;
DELETE FROM public.inspection_renderers;
DELETE FROM public.jha_templates;
DELETE FROM public.templates;
DO $g$BEGIN IF to_regclass('public.update_member_settings_gate') IS NOT NULL THEN DELETE FROM public.update_member_settings_gate; END IF; END$g$;
DELETE FROM public.profiles;
DELETE FROM public.expense_cost_models;
DELETE FROM public.companies;
SET session_replication_role = origin;

INSERT INTO auth.users (id, email, email_confirmed_at, last_sign_in_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.com', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'admin-a@example.com', now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'member-a@example.com', now(), now()),
  ('44444444-4444-4444-4444-444444444445', 'none-tech@example.com', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.com', now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'member-b@example.com', now(), now()),
  ('55555555-5555-5555-5555-555555555556', 'admin-b@example.com', now(), now()),
  ('70000000-0000-0000-0000-000000000001', 'founder-c@example.com', now(), now()),
  ('70000000-0000-0000-0000-000000000002', 'admin-c@example.com', now(), now()),
  ('70000000-0000-0000-0000-000000000003', 'member-c@example.com', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.companies (id, created_by, name, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A', '2026-01-01 00:00:00+00'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B', '2026-01-02 00:00:00+00'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '70000000-0000-0000-0000-000000000001', 'Company C', '2026-01-03 00:00:00+00')
ON CONFLICT (id) DO UPDATE SET created_by = EXCLUDED.created_by, name = EXCLUDED.name, created_at = EXCLUDED.created_at;

INSERT INTO public.expense_cost_models (id, company_id, name) VALUES
  ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Crew A hourly'),
  ('66666666-6666-6666-6666-666666666667', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Crew A loaded'),
  ('77777777-7777-7777-7777-777777777777', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Crew B hourly')
ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, name = EXCLUDED.name;

SET session_replication_role = replica;
INSERT INTO public.profiles (
  id, email, name, licence_number, company_id, role, template_access, expense_cost_model_id, created_at
) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.com', 'Owner A', NULL,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'edit', NULL, '2026-01-01 00:00:01+00'),
  ('33333333-3333-3333-3333-333333333333', 'admin-a@example.com', 'Admin A', NULL,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'edit', NULL, '2026-01-01 00:00:02+00'),
  ('44444444-4444-4444-4444-444444444444', 'member-a@example.com', 'Member A', NULL,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'view', NULL, '2026-01-01 00:00:03+00'),
  ('44444444-4444-4444-4444-444444444445', 'none-tech@example.com', 'None Tech', NULL,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'none', NULL, '2026-01-01 00:00:04+00'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.com', 'Owner B', NULL,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin', 'edit', NULL, '2026-01-02 00:00:01+00'),
  ('55555555-5555-5555-5555-555555555556', 'admin-b@example.com', 'Admin B', NULL,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin', 'edit', NULL, '2026-01-02 00:00:02+00'),
  ('55555555-5555-5555-5555-555555555555', 'member-b@example.com', 'Member B', NULL,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'view', NULL, '2026-01-02 00:00:03+00'),
  ('70000000-0000-0000-0000-000000000001', 'founder-c@example.com', 'Founder C', NULL,
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member', 'edit', NULL, '2026-01-03 00:00:01+00'),
  ('70000000-0000-0000-0000-000000000002', 'admin-c@example.com', 'Admin C', NULL,
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin', 'edit', NULL, '2026-01-03 00:00:02+00'),
  ('70000000-0000-0000-0000-000000000003', 'member-c@example.com', 'Member C', NULL,
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member', 'view', NULL, '2026-01-03 00:00:03+00')
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  licence_number = EXCLUDED.licence_number,
  company_id = EXCLUDED.company_id,
  role = EXCLUDED.role,
  template_access = EXCLUDED.template_access,
  expense_cost_model_id = EXCLUDED.expense_cost_model_id,
  created_at = EXCLUDED.created_at;
SET session_replication_role = origin;
