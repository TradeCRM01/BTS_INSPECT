INSERT INTO auth.users(id, email) VALUES
  ('66666666-6666-6666-6666-666666666666', 'admin-a2@x.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles(id, email, name, licence_number, company_id, role) VALUES
  ('66666666-6666-6666-6666-666666666666', 'admin-a2@x.test', 'Admin Two', 'AD-2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates(id, company_id, created_by, name) VALUES
  ('0eeeeeee-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '55555555-5555-5555-5555-555555555555', 'T-b')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.inspections(id, template_id, template_snapshot, inspector_id, status, meta, responses, archived) VALUES
  ('e1000000-0000-0000-0000-0000000000aa', '0eeeeeee-0000-0000-0000-000000000001', '{}', NULL, 'draft', '{}', '{}', false),
  ('e1000000-0000-0000-0000-0000000000bb', '0eeeeeee-0000-0000-0000-00000000000b', '{}', '55555555-5555-5555-5555-555555555555', 'draft', '{}', '{}', false),
  ('e1000000-0000-0000-0000-0000000000d1', '0eeeeeee-0000-0000-0000-000000000001', '{}', '33333333-3333-3333-3333-333333333333', 'draft', '{}', '{}', false)
ON CONFLICT (id) DO NOTHING;
