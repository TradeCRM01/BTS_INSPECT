DROP TRIGGER IF EXISTS trg_inspections_fill_inspector_snapshots ON public.inspections;
DROP FUNCTION IF EXISTS public.inspections_fill_inspector_snapshots();

ALTER TABLE public.inspections
  DROP COLUMN IF EXISTS inspector_name_snapshot,
  DROP COLUMN IF EXISTS inspector_licence_snapshot;

-- Restores migration 002 NOT NULL. Fails if any inspector_id is already NULL
-- (a member delete after this migration). Do not roll back after a live delete.
ALTER TABLE public.inspections
  ALTER COLUMN inspector_id SET NOT NULL;
