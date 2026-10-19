-- Rolled-back prod-shape probe for CoS on non-prod branch 5a106e2d.
-- BEGIN ... ROLLBACK only. No writes persist. Agent never connects to prod.
BEGIN;

SELECT
  table_name,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'inspections'
  AND column_name IN (
    'updated_at',
    'updated_by',
    'client_id',
    'crm_job_id',
    'client_name_snapshot',
    'job_title_snapshot',
    'site_name_snapshot',
    'site_address_snapshot',
    'inspector_id',
    'inspector_name_snapshot',
    'inspector_licence_snapshot',
    'template_snapshot',
    'completed_at',
    'doc_version',
    'status',
    'archived'
  )
ORDER BY column_name;

SELECT
  nsp.nspname AS schema_name,
  rel.relname AS table_name,
  att.attname AS column_name,
  refrel.relname AS ref_table,
  CASE con.confdeltype
    WHEN 'n' THEN 'SET NULL'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'a' THEN 'NO ACTION'
    ELSE con.confdeltype::text
  END AS on_delete
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
JOIN pg_class refrel ON refrel.oid = con.confrelid
JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
WHERE con.contype = 'f'
  AND nsp.nspname = 'public'
  AND rel.relname = 'inspections'
  AND att.attname IN ('client_id', 'crm_job_id', 'inspector_id')
ORDER BY att.attname;

SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.inspections'::regclass
  AND NOT tgisinternal
  AND tgname IN (
    'trg_inspections_guard_finalised',
    'trg_inspections_fill_print_snapshots',
    'trg_inspections_fill_inspector_snapshots'
  )
ORDER BY tgname;

SELECT
  'inspections missing print snapshots' AS check,
  count(*)
FROM public.inspections
WHERE (archived OR status IN ('completed', 'issued', 'sent', 'archived'))
  AND client_id IS NOT NULL
  AND NULLIF(BTRIM(COALESCE(client_name_snapshot, '')), '') IS NULL;

ROLLBACK;
