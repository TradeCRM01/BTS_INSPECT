-- TRANSACTIONAL: BEGIN/COMMIT so a failed SET NOT NULL reverts later drops.
-- SET NOT NULL runs first on templates / jha_templates / jha_documents.
-- jobs.created_by is already nullable in prod (missed-call provenance) and
-- is not touched here.
-- Snapshot columns are dropped. Names rebuild on re-apply only while
-- created_by still points at a profile.
--
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
