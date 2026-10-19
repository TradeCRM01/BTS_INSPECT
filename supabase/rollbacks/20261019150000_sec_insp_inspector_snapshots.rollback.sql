-- TRANSACTIONAL: BEGIN/COMMIT so a failed SET NOT NULL reverts the snapshot drops.
-- OPERATOR NOTE — rollback cannot run once inspector_id is NULL:
--   SELECT count(*) FROM public.inspections WHERE inspector_id IS NULL;
-- If that count is > 0, SET NOT NULL fails and (because this file is one
-- transaction) inspector_name_snapshot / inspector_licence_snapshot stay.

BEGIN;

DROP TRIGGER IF EXISTS trg_inspections_fill_inspector_snapshots ON public.inspections;
DROP FUNCTION IF EXISTS public.inspections_fill_inspector_snapshots();

ALTER TABLE public.inspections
  DROP COLUMN IF EXISTS inspector_name_snapshot,
  DROP COLUMN IF EXISTS inspector_licence_snapshot;

-- Restores migration 002 NOT NULL. Fails if any inspector_id is already NULL
-- (a member delete after this migration). Do not roll back after a live delete.
ALTER TABLE public.inspections
  ALTER COLUMN inspector_id SET NOT NULL;

COMMIT;
