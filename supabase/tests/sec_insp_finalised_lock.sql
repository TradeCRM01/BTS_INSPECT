-- SEC-INSP-3 proofs on the REAL migration chain. Do not create tables here.
\ir sec_insp_finalised_lock_seed.sql

CREATE TEMP TABLE proof_result (
  name text PRIMARY KEY,
  ok boolean NOT NULL,
  detail text
);
GRANT ALL ON proof_result TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.t(sql text) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  EXECUTE sql;
  RETURN '00000';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ':' || left(SQLERRM, 80);
END
$f$;

INSERT INTO proof_result SELECT 'U0_no_backfill_existing_rows_null',
  count(*) FILTER (WHERE updated_at IS NOT NULL OR updated_by IS NOT NULL) = 0,
  count(*) || ' rows, stamped=' || count(*) FILTER (WHERE updated_at IS NOT NULL)
FROM public.inspections;

INSERT INTO proof_result SELECT 'F1_issued_meta', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET meta='{"siteName":"New St"}' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'F2_issued_responses', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET responses='{"q":"b"}' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'F3_issued_client_id_value_change', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000002' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'F4_issued_crm_job_id_value_change', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET crm_job_id='b1000000-0000-0000-0000-000000000002' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'F5_completed_meta', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET meta='{"siteName":"X"}' WHERE id='e1000000-0000-0000-0000-000000000002'$$) x;
INSERT INTO proof_result SELECT 'F6_sent_meta', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET meta='{"siteName":"X"}' WHERE id='e1000000-0000-0000-0000-000000000004'$$) x;
INSERT INTO proof_result SELECT 'F7_status_archived_meta', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET meta='{"siteName":"X"}' WHERE id='e1000000-0000-0000-0000-000000000005'$$) x;
INSERT INTO proof_result SELECT 'C1_archived_flag_draft_meta', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET meta='{"siteName":"AF2"}' WHERE id='e1000000-0000-0000-0000-000000000006'$$) x;
INSERT INTO proof_result SELECT 'A_status_issued_to_draft', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET status='draft' WHERE id='e1000000-0000-0000-0000-000000000008'$$) x;
INSERT INTO proof_result SELECT 'D_template_snapshot', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET template_snapshot='{"name":"swapped"}' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'D_completed_at', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET completed_at='2020-01-01' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'D_doc_version', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET doc_version=9 WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'D_inspector_name_snapshot', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET inspector_name_snapshot='Forged' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'D_inspector_licence_snapshot', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET inspector_licence_snapshot='FAKE' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;

INSERT INTO proof_result SELECT 'B_cross_tenant_attach', x LIKE '42501%' OR x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000004' WHERE id='e1000000-0000-0000-0000-000000000008'$$) x;
INSERT INTO proof_result SELECT 'B_same_company_attach', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000002' WHERE id='e1000000-0000-0000-0000-000000000008'$$) x;
INSERT INTO proof_result SELECT 'B_value_to_value_blocked', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000001' WHERE id='e1000000-0000-0000-0000-000000000008'$$) x;
INSERT INTO proof_result SELECT 'B_cross_tenant_attach_completed', x LIKE '42501%' OR x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000004' WHERE id='e1000000-0000-0000-0000-000000000009'$$) x;
INSERT INTO proof_result SELECT 'B_same_company_attach_completed', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000002' WHERE id='e1000000-0000-0000-0000-000000000009'$$) x;
INSERT INTO proof_result SELECT 'A_null_out_without_client_snapshot', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET client_id=NULL WHERE id='e1000000-0000-0000-0000-000000000009'$$) x;

INSERT INTO proof_result SELECT 'F10_noop_same_meta', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET meta=meta, responses=responses WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'A1_issued_to_sent', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET status='sent' WHERE id='e1000000-0000-0000-0000-000000000004'$$) x;
INSERT INTO proof_result SELECT 'A2_issued_due_on', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET due_on='2026-11-01' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'A3_issued_reminder', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET due_reminder_sent_at=now(), due_reminder_sent_for_date='2026-11-01' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'A4_issued_archive_flag', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET archived=true WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'A5_issued_position', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET position_x=10, position_y=20 WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;

INSERT INTO proof_result SELECT 'D1_draft_content', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET meta='{"siteName":"New St"}', responses='{"q":"z"}' WHERE id='e1000000-0000-0000-0000-000000000003'$$) x;

SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
SET ROLE authenticated;
INSERT INTO proof_result SELECT 'D3_auth_draft_edit', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET meta='{"siteName":"Auth St"}' WHERE id='e1000000-0000-0000-0000-000000000003'$$) x;
INSERT INTO proof_result SELECT 'F11_auth_issued_meta', x LIKE 'P0001%', x
FROM pg_temp.t($$UPDATE public.inspections SET meta='{"siteName":"Auth St"}' WHERE id='e1000000-0000-0000-0000-000000000001'$$) x;
INSERT INTO proof_result SELECT 'F12_auth_forge_updated_by', x = '00000', x
FROM pg_temp.t($$UPDATE public.inspections SET updated_by='33333333-3333-3333-3333-333333333333', updated_at='2000-01-01' WHERE id='e1000000-0000-0000-0000-000000000003'$$) x;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
INSERT INTO proof_result SELECT 'D4_updated_by_is_caller',
  updated_by = '22222222-2222-2222-2222-222222222222' AND updated_at > '2001-01-01',
  coalesce(updated_by::text, 'null') || ' ' || coalesce(updated_at::date::text, 'null')
FROM public.inspections WHERE id = 'e1000000-0000-0000-0000-000000000003';

INSERT INTO proof_result SELECT 'K1_delete_client_bound_to_issued', x = '00000', x
FROM pg_temp.t($$DELETE FROM public.clients WHERE id='c1000000-0000-0000-0000-000000000003'$$) x;
INSERT INTO proof_result SELECT 'K1b_client_snapshot_kept',
  client_id IS NULL AND client_name_snapshot = 'Doomed Client',
  coalesce(client_id::text, 'null') || '|' || coalesce(client_name_snapshot, 'null')
FROM public.inspections WHERE id = 'e1000000-0000-0000-0000-000000000007';
INSERT INTO proof_result SELECT 'K2_delete_job_bound_to_issued', x = '00000', x
FROM pg_temp.t($$DELETE FROM public.jobs WHERE id='b1000000-0000-0000-0000-000000000003'$$) x;
INSERT INTO proof_result SELECT 'K2b_job_snapshot_kept',
  crm_job_id IS NULL
    AND site_address_snapshot = 'Doom St'
    AND job_title_snapshot = 'Doomed Job',
  coalesce(crm_job_id::text, 'null') || '|' || coalesce(site_address_snapshot, 'null') || '|' || coalesce(job_title_snapshot, 'null')
FROM public.inspections WHERE id = 'e1000000-0000-0000-0000-000000000007';

INSERT INTO proof_result SELECT 'M1_member_delete_on_finalised', x = '00000', x
FROM pg_temp.t($$DELETE FROM public.profiles WHERE id='33333333-3333-3333-3333-333333333333'$$) x;
INSERT INTO proof_result SELECT 'M2_inspector_snapshot_kept',
  inspector_id IS NULL AND inspector_name_snapshot = 'Sam Spark',
  coalesce(inspector_id::text, 'null') || '|' || coalesce(inspector_name_snapshot, 'null')
FROM public.inspections WHERE id = 'e1000000-0000-0000-0000-000000000007';

DO $$
DECLARE
  failed text;
BEGIN
  SELECT string_agg(name || '=' || ok || ':' || coalesce(detail, ''), ', ' ORDER BY name)
    INTO failed
  FROM proof_result
  WHERE ok IS NOT TRUE;
  IF failed IS NOT NULL THEN
    RAISE EXCEPTION 'SEC-INSP-3 proofs failed: %', failed;
  END IF;
END $$;

SELECT name, ok, detail FROM proof_result ORDER BY name;
