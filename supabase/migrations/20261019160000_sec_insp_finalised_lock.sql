ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

CREATE OR REPLACE FUNCTION public.inspections_guard_finalised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('completed', 'issued', 'sent', 'archived') THEN
    IF NEW.meta IS DISTINCT FROM OLD.meta
       OR NEW.responses IS DISTINCT FROM OLD.responses
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.crm_job_id IS DISTINCT FROM OLD.crm_job_id
    THEN
      RAISE EXCEPTION 'Finalised inspections cannot change meta, responses, client_id, or crm_job_id'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.inspections_guard_finalised() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_inspections_guard_finalised ON public.inspections;
CREATE TRIGGER trg_inspections_guard_finalised
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.inspections_guard_finalised();
