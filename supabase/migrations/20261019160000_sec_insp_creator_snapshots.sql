ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS creator_name_snapshot text;
ALTER TABLE public.jha_templates
  ADD COLUMN IF NOT EXISTS creator_name_snapshot text;
ALTER TABLE public.jha_documents
  ADD COLUMN IF NOT EXISTS creator_name_snapshot text;
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS creator_name_snapshot text;

UPDATE public.templates AS t
SET creator_name_snapshot = p.name
FROM public.profiles AS p
WHERE p.id = t.created_by;

UPDATE public.jha_templates AS t
SET creator_name_snapshot = p.name
FROM public.profiles AS p
WHERE p.id = t.created_by;

UPDATE public.jha_documents AS t
SET creator_name_snapshot = p.name
FROM public.profiles AS p
WHERE p.id = t.created_by;

UPDATE public.jobs AS t
SET creator_name_snapshot = p.name
FROM public.profiles AS p
WHERE p.id = t.created_by;

CREATE OR REPLACE FUNCTION public.fill_creator_name_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.creator_name_snapshot := NULL;
    IF NEW.created_by IS NOT NULL THEN
      SELECT p.name INTO v_name
      FROM public.profiles p
      WHERE p.id = NEW.created_by;
      NEW.creator_name_snapshot := v_name;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.created_by IS NOT DISTINCT FROM OLD.created_by THEN
    NEW.creator_name_snapshot := OLD.creator_name_snapshot;
    RETURN NEW;
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.creator_name_snapshot := OLD.creator_name_snapshot;
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_name
  FROM public.profiles p
  WHERE p.id = NEW.created_by;
  NEW.creator_name_snapshot := v_name;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fill_creator_name_snapshot() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_templates_fill_creator_snapshot ON public.templates;
CREATE TRIGGER trg_templates_fill_creator_snapshot
  BEFORE INSERT OR UPDATE OF created_by, creator_name_snapshot ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_creator_name_snapshot();

DROP TRIGGER IF EXISTS trg_jha_templates_fill_creator_snapshot ON public.jha_templates;
CREATE TRIGGER trg_jha_templates_fill_creator_snapshot
  BEFORE INSERT OR UPDATE OF created_by, creator_name_snapshot ON public.jha_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_creator_name_snapshot();

DROP TRIGGER IF EXISTS trg_jha_documents_fill_creator_snapshot ON public.jha_documents;
CREATE TRIGGER trg_jha_documents_fill_creator_snapshot
  BEFORE INSERT OR UPDATE OF created_by, creator_name_snapshot ON public.jha_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_creator_name_snapshot();

DROP TRIGGER IF EXISTS trg_jobs_fill_creator_snapshot ON public.jobs;
CREATE TRIGGER trg_jobs_fill_creator_snapshot
  BEFORE INSERT OR UPDATE OF created_by ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_creator_name_snapshot();

ALTER TABLE public.templates
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.jha_templates
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.jha_documents
  ALTER COLUMN created_by DROP NOT NULL;
