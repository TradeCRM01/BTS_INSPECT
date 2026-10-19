-- TRANSACTIONAL: BEGIN/COMMIT so a failed SET NOT NULL reverts later drops.
-- SET NOT NULL runs first. If any inspector_id is NULL the transaction aborts
-- and the snapshot columns stay.
--
-- OPERATOR NOTE — rollback cannot run once inspector_id is NULL:
--   SELECT count(*) FROM public.inspections WHERE inspector_id IS NULL;
-- If that count is > 0, SET NOT NULL fails and (because this file is one
-- transaction) inspector_name_snapshot / inspector_licence_snapshot stay.

BEGIN;

ALTER TABLE public.inspections
  ALTER COLUMN inspector_id SET NOT NULL;

DROP TRIGGER IF EXISTS trg_inspections_fill_inspector_snapshots ON public.inspections;
DROP FUNCTION IF EXISTS public.inspections_fill_inspector_snapshots();

ALTER TABLE public.inspections
  DROP COLUMN IF EXISTS inspector_name_snapshot,
  DROP COLUMN IF EXISTS inspector_licence_snapshot;

COMMIT;
