ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS inspector_name_snapshot text,
  ADD COLUMN IF NOT EXISTS inspector_licence_snapshot text;

UPDATE public.inspections AS i
SET
  inspector_name_snapshot = p.name,
  inspector_licence_snapshot = p.licence_number
FROM public.profiles AS p
WHERE p.id = i.inspector_id;

CREATE OR REPLACE FUNCTION public.inspections_fill_inspector_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
  v_licence text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.inspector_name_snapshot := NULL;
    NEW.inspector_licence_snapshot := NULL;
    IF NEW.inspector_id IS NOT NULL THEN
      SELECT p.name, p.licence_number
        INTO v_name, v_licence
      FROM public.profiles p
      WHERE p.id = NEW.inspector_id;
      NEW.inspector_name_snapshot := v_name;
      NEW.inspector_licence_snapshot := v_licence;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.inspector_id IS NOT DISTINCT FROM OLD.inspector_id THEN
    NEW.inspector_name_snapshot := OLD.inspector_name_snapshot;
    NEW.inspector_licence_snapshot := OLD.inspector_licence_snapshot;
    RETURN NEW;
  END IF;

  IF NEW.inspector_id IS NULL THEN
    NEW.inspector_name_snapshot := OLD.inspector_name_snapshot;
    NEW.inspector_licence_snapshot := OLD.inspector_licence_snapshot;
    RETURN NEW;
  END IF;

  SELECT p.name, p.licence_number
    INTO v_name, v_licence
  FROM public.profiles p
  WHERE p.id = NEW.inspector_id;
  NEW.inspector_name_snapshot := v_name;
  NEW.inspector_licence_snapshot := v_licence;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.inspections_fill_inspector_snapshots() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_inspections_fill_inspector_snapshots ON public.inspections;
CREATE TRIGGER trg_inspections_fill_inspector_snapshots
  BEFORE INSERT OR UPDATE OF inspector_id, inspector_name_snapshot, inspector_licence_snapshot
  ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.inspections_fill_inspector_snapshots();

ALTER TABLE public.inspections
  ALTER COLUMN inspector_id DROP NOT NULL;
