DROP TRIGGER IF EXISTS trg_inspections_guard_finalised ON public.inspections;
DROP FUNCTION IF EXISTS public.inspections_guard_finalised();
DROP TRIGGER IF EXISTS trg_inspections_fill_print_snapshots ON public.inspections;
DROP FUNCTION IF EXISTS public.inspections_fill_print_snapshots();

ALTER TABLE public.inspections
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS updated_by,
  DROP COLUMN IF EXISTS client_name_snapshot,
  DROP COLUMN IF EXISTS job_title_snapshot,
  DROP COLUMN IF EXISTS site_name_snapshot,
  DROP COLUMN IF EXISTS site_address_snapshot;
