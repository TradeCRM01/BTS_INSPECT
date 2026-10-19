SET session_replication_role = replica;
DELETE FROM public.jha_documents; DELETE FROM public.inspections; DELETE FROM public.jobs; DELETE FROM public.inspection_renderers; DELETE FROM public.jha_templates; DELETE FROM public.templates;
DO $g$BEGIN IF to_regclass('public.update_member_settings_gate') IS NOT NULL THEN DELETE FROM public.update_member_settings_gate; END IF; END$g$;
SET session_replication_role = origin;
INSERT INTO public.templates(id, company_id, created_by, name, report_renderer, schema) VALUES
 ('a1000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Switchboard inspection','electrical_3000','{"meta":{"requiresSiteName":true},"sections":[{"id":"s1","title":"Board","questions":[{"id":"q1","type":"yesno","label":"RCD tested?"}]}]}'),
 ('a1000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Smoke alarm check','generic_inspection','{"sections":[{"id":"s1","title":"Alarms","questions":[]}]}'),
 ('b1000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','B template','generic_inspection','{}');
INSERT INTO public.jha_templates(id, company_id, created_by, name, schema) VALUES
 ('a2000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Working at heights JHA','{"meta":{"customFields":[]},"steps":[]}'),
 ('b2000000-0000-4000-8000-000000000001','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','B JHA','{"meta":{}}');
INSERT INTO public.inspection_renderers(id, company_id, key, label, built_in) VALUES
 ('a3000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','generic_inspection','Generic',true),
 ('a3000000-0000-4000-8000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','custom_a','Custom A',false);
INSERT INTO public.jobs(id, company_id, title, assigned_team) VALUES
 ('a4000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Job 0042 switchboard', ARRAY['44444444-4444-4444-4444-444444444445','44444444-4444-4444-4444-444444444444']::uuid[]);
INSERT INTO public.inspections(id, template_id, template_snapshot, inspector_id, crm_job_id) VALUES
 ('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  '{"id":"a1000000-0000-4000-8000-000000000001","name":"Switchboard inspection","report_renderer":"electrical_3000","schema":{"sections":[{"id":"s1","questions":[{"id":"q1"}]}]}}',
  '44444444-4444-4444-4444-444444444445','a4000000-0000-4000-8000-000000000001'),
 ('a5000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',
  '{"id":"a1000000-0000-4000-8000-000000000001","name":"Switchboard inspection","report_renderer":"electrical_3000"}',
  '44444444-4444-4444-4444-444444444445','a4000000-0000-4000-8000-000000000001');
