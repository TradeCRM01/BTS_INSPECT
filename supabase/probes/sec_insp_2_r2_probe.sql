BEGIN;

SELECT
  nsp.nspname AS schema_name,
  rel.relname AS table_name,
  att.attname AS column_name,
  refnsp.nspname AS ref_schema,
  refrel.relname AS ref_table,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE con.confdeltype::text
  END AS on_delete,
  att.attnotnull AS not_null,
  con.conname AS constraint_name
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
JOIN pg_class refrel ON refrel.oid = con.confrelid
JOIN pg_namespace refnsp ON refnsp.oid = refrel.relnamespace
JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
WHERE con.contype = 'f'
  AND nsp.nspname = 'public'
  AND (
    (refnsp.nspname = 'public' AND refrel.relname = 'profiles' AND (
      SELECT array_agg(refatt.attname ORDER BY rord)
      FROM unnest(con.confkey) WITH ORDINALITY AS rk(attnum, rord)
      JOIN pg_attribute refatt ON refatt.attrelid = con.confrelid AND refatt.attnum = rk.attnum
    ) = ARRAY['id']::name[])
    OR
    (refnsp.nspname = 'auth' AND refrel.relname = 'users' AND (
      SELECT array_agg(refatt.attname ORDER BY rord)
      FROM unnest(con.confkey) WITH ORDINALITY AS rk(attnum, rord)
      JOIN pg_attribute refatt ON refatt.attrelid = con.confrelid AND refatt.attnum = rk.attnum
    ) = ARRAY['id']::name[])
  )
ORDER BY rel.relname, att.attname;

SELECT
  table_name,
  column_name,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name IN ('templates', 'jha_templates', 'jha_documents', 'jobs') AND column_name IN ('created_by', 'creator_name_snapshot'))
    OR (table_name = 'inspections' AND column_name IN ('inspector_id', 'inspector_name_snapshot', 'inspector_licence_snapshot'))
  )
ORDER BY table_name, column_name;

SELECT 'inspections.inspector_id NULL' AS check, count(*) FROM public.inspections WHERE inspector_id IS NULL;
SELECT 'templates.created_by NULL' AS check, count(*) FROM public.templates WHERE created_by IS NULL;
SELECT 'jha_templates.created_by NULL' AS check, count(*) FROM public.jha_templates WHERE created_by IS NULL;
SELECT 'jha_documents.created_by NULL' AS check, count(*) FROM public.jha_documents WHERE created_by IS NULL;
SELECT 'jobs.created_by NULL (informational)' AS check, count(*) FROM public.jobs WHERE created_by IS NULL;

ROLLBACK;
