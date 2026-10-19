-- OPERATOR NOTE — do not run after a live member delete. Check NULL counts:
--   SELECT count(*) FROM public.templates WHERE created_by IS NULL;
--   SELECT count(*) FROM public.jha_templates WHERE created_by IS NULL;
--   SELECT count(*) FROM public.jha_documents WHERE created_by IS NULL;
-- If any count is > 0, SET NOT NULL fails and (because this file is one
-- transaction) the snapshot columns stay.

BEGIN;

ALTER TABLE public.templates ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE public.jha_templates ALTER COLUMN created_by SET NOT NULL;
ALTER TABLE public.jha_documents ALTER COLUMN created_by SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'jobs'
      AND a.attname = 'created_by'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attnotnull
  ) THEN
    RAISE EXCEPTION 'jobs.created_by must stay nullable';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_templates_fill_creator_snapshot ON public.templates;
DROP TRIGGER IF EXISTS trg_jha_templates_fill_creator_snapshot ON public.jha_templates;
DROP TRIGGER IF EXISTS trg_jha_documents_fill_creator_snapshot ON public.jha_documents;
DROP TRIGGER IF EXISTS trg_jobs_fill_creator_snapshot ON public.jobs;
DROP FUNCTION IF EXISTS public.fill_creator_name_snapshot();

ALTER TABLE public.templates DROP COLUMN IF EXISTS creator_name_snapshot;
ALTER TABLE public.jha_templates DROP COLUMN IF EXISTS creator_name_snapshot;
ALTER TABLE public.jha_documents DROP COLUMN IF EXISTS creator_name_snapshot;
ALTER TABLE public.jobs DROP COLUMN IF EXISTS creator_name_snapshot;

COMMIT;
