-- CoS suite2 seed (reconstructed: not in the r2 handoff tarball).
-- Companies A/B/C, OA/AA/MA/MN, OB/MB, OC + only-admin C2.
-- Replica around profile upserts so re-seed does not trip 089 / prod triggers.

INSERT INTO auth.users (id, email, email_confirmed_at, last_sign_in_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.com', now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'admin-a@example.com', now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'member-a@example.com', now(), now()),
  ('44444444-4444-4444-4444-444444444445', 'none-tech@example.com', now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.com', now(), now()),
  ('55555555-5555-5555-5555-555555555555', 'member-b@example.com', now(), now()),
  ('70000000-0000-0000-0000-000000000001', 'founder-c@example.com', now(), now()),
  ('70000000-0000-0000-0000-000000000002', 'admin-c@example.com', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.companies (id, created_by, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Company A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Company B'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '70000000-0000-0000-0000-000000000001', 'Company C')
ON CONFLICT (id) DO UPDATE SET created_by = EXCLUDED.created_by, name = EXCLUDED.name;

INSERT INTO public.expense_cost_models (id, company_id, name) VALUES
  ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Crew A hourly'),
  ('77777777-7777-7777-7777-777777777777', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Crew B hourly')
ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, name = EXCLUDED.name;

SET session_replication_role = replica;
INSERT INTO public.profiles (
  id, email, name, licence_number, company_id, role, template_access, expense_cost_model_id
) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.com', 'Owner A', NULL,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'edit', NULL),
  ('33333333-3333-3333-3333-333333333333', 'admin-a@example.com', 'Admin A', NULL,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin', 'edit', NULL),
  ('44444444-4444-4444-4444-444444444444', 'member-a@example.com', 'Member A', NULL,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'view', NULL),
  ('44444444-4444-4444-4444-444444444445', 'none-tech@example.com', 'None Tech', 'EC-NONE',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member', 'none', NULL),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.com', 'Owner B', NULL,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'admin', 'edit', NULL),
  ('55555555-5555-5555-5555-555555555555', 'member-b@example.com', 'Member B', NULL,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member', 'view', NULL),
  ('70000000-0000-0000-0000-000000000001', 'founder-c@example.com', 'Founder C', NULL,
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'member', 'view', NULL),
  ('70000000-0000-0000-0000-000000000002', 'admin-c@example.com', 'Admin C', NULL,
   'cccccccc-cccc-cccc-cccc-cccccccccccc', 'admin', 'edit', NULL)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  name = EXCLUDED.name,
  licence_number = EXCLUDED.licence_number,
  company_id = EXCLUDED.company_id,
  role = EXCLUDED.role,
  template_access = EXCLUDED.template_access,
  expense_cost_model_id = EXCLUDED.expense_cost_model_id;
SET session_replication_role = origin;
