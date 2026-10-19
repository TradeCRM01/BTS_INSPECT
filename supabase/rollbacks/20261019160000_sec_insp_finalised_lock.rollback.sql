DROP TRIGGER IF EXISTS trg_inspections_guard_finalised ON public.inspections;
DROP FUNCTION IF EXISTS public.inspections_guard_finalised();

ALTER TABLE public.inspections
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS updated_by;
