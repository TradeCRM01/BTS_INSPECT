ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS client_name_snapshot text,
  ADD COLUMN IF NOT EXISTS job_title_snapshot text,
  ADD COLUMN IF NOT EXISTS site_name_snapshot text,
  ADD COLUMN IF NOT EXISTS site_address_snapshot text;

UPDATE public.inspections AS i
SET
  client_name_snapshot = COALESCE(
    NULLIF(BTRIM(i.client_name_snapshot), ''),
    NULLIF(BTRIM(c.name), ''),
    NULLIF(BTRIM(i.meta ->> 'clientName'), '')
  ),
  job_title_snapshot = COALESCE(
    NULLIF(BTRIM(i.job_title_snapshot), ''),
    NULLIF(BTRIM(j.title), ''),
    NULLIF(BTRIM(i.meta ->> 'jobDescription'), '')
  ),
  site_name_snapshot = COALESCE(
    NULLIF(BTRIM(i.site_name_snapshot), ''),
    NULLIF(BTRIM(j.address), ''),
    NULLIF(BTRIM(j.title), ''),
    NULLIF(BTRIM(i.meta ->> 'siteName'), '')
  ),
  site_address_snapshot = COALESCE(
    NULLIF(BTRIM(i.site_address_snapshot), ''),
    NULLIF(BTRIM(j.address), ''),
    NULLIF(BTRIM(i.meta ->> 'siteAddress'), '')
  )
FROM public.inspections AS src
LEFT JOIN public.clients AS c ON c.id = src.client_id
LEFT JOIN public.jobs AS j ON j.id = src.crm_job_id
WHERE i.id = src.id;

CREATE OR REPLACE FUNCTION public.inspections_fill_print_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client text;
  v_title text;
  v_addr text;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.archived
    OR OLD.status IN ('completed', 'issued', 'sent', 'archived')
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.client_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.client_id IS DISTINCT FROM OLD.client_id)
  THEN
    SELECT c.name INTO v_client
    FROM public.clients c
    WHERE c.id = NEW.client_id;
    IF NULLIF(BTRIM(COALESCE(NEW.client_name_snapshot, '')), '') IS NULL THEN
      NEW.client_name_snapshot := COALESCE(
        NULLIF(BTRIM(COALESCE(v_client, '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.meta ->> 'clientName', '')), '')
      );
    END IF;
  ELSIF TG_OP = 'INSERT' AND NULLIF(BTRIM(COALESCE(NEW.client_name_snapshot, '')), '') IS NULL THEN
    NEW.client_name_snapshot := NULLIF(BTRIM(COALESCE(NEW.meta ->> 'clientName', '')), '');
  END IF;

  IF NEW.crm_job_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.crm_job_id IS DISTINCT FROM OLD.crm_job_id)
  THEN
    SELECT j.title, j.address INTO v_title, v_addr
    FROM public.jobs j
    WHERE j.id = NEW.crm_job_id;
    IF NULLIF(BTRIM(COALESCE(NEW.job_title_snapshot, '')), '') IS NULL THEN
      NEW.job_title_snapshot := COALESCE(
        NULLIF(BTRIM(COALESCE(v_title, '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.meta ->> 'jobDescription', '')), '')
      );
    END IF;
    IF NULLIF(BTRIM(COALESCE(NEW.site_address_snapshot, '')), '') IS NULL THEN
      NEW.site_address_snapshot := COALESCE(
        NULLIF(BTRIM(COALESCE(v_addr, '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.meta ->> 'siteAddress', '')), '')
      );
    END IF;
    IF NULLIF(BTRIM(COALESCE(NEW.site_name_snapshot, '')), '') IS NULL THEN
      NEW.site_name_snapshot := COALESCE(
        NULLIF(BTRIM(COALESCE(v_addr, '')), ''),
        NULLIF(BTRIM(COALESCE(v_title, '')), ''),
        NULLIF(BTRIM(COALESCE(NEW.meta ->> 'siteName', '')), '')
      );
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NULLIF(BTRIM(COALESCE(NEW.job_title_snapshot, '')), '') IS NULL THEN
      NEW.job_title_snapshot := NULLIF(BTRIM(COALESCE(NEW.meta ->> 'jobDescription', '')), '');
    END IF;
    IF NULLIF(BTRIM(COALESCE(NEW.site_address_snapshot, '')), '') IS NULL THEN
      NEW.site_address_snapshot := NULLIF(BTRIM(COALESCE(NEW.meta ->> 'siteAddress', '')), '');
    END IF;
    IF NULLIF(BTRIM(COALESCE(NEW.site_name_snapshot, '')), '') IS NULL THEN
      NEW.site_name_snapshot := NULLIF(BTRIM(COALESCE(NEW.meta ->> 'siteName', '')), '');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.inspections_fill_print_snapshots() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_inspections_fill_print_snapshots ON public.inspections;
CREATE TRIGGER trg_inspections_fill_print_snapshots
  BEFORE INSERT OR UPDATE OF client_id, crm_job_id ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.inspections_fill_print_snapshots();

CREATE OR REPLACE FUNCTION public.inspections_guard_finalised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_finalised boolean;
  v_still_finalised boolean;
  v_company uuid;
  v_print_client boolean;
  v_print_job boolean;
BEGIN
  v_finalised := OLD.archived OR OLD.status IN ('completed', 'issued', 'sent', 'archived');
  IF NOT v_finalised THEN
    NEW.updated_at := clock_timestamp();
    NEW.updated_by := auth.uid();
    RETURN NEW;
  END IF;

  v_still_finalised := NEW.archived OR NEW.status IN ('completed', 'issued', 'sent', 'archived');
  IF NOT v_still_finalised THEN
    RAISE EXCEPTION 'Finalised inspections cannot move to a non-finalised status'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.meta IS DISTINCT FROM OLD.meta
     OR NEW.responses IS DISTINCT FROM OLD.responses
     OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot
     OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
     OR NEW.doc_version IS DISTINCT FROM OLD.doc_version
     OR NEW.inspector_name_snapshot IS DISTINCT FROM OLD.inspector_name_snapshot
     OR NEW.inspector_licence_snapshot IS DISTINCT FROM OLD.inspector_licence_snapshot
     OR NEW.client_name_snapshot IS DISTINCT FROM OLD.client_name_snapshot
     OR NEW.job_title_snapshot IS DISTINCT FROM OLD.job_title_snapshot
     OR NEW.site_name_snapshot IS DISTINCT FROM OLD.site_name_snapshot
     OR NEW.site_address_snapshot IS DISTINCT FROM OLD.site_address_snapshot
  THEN
    RAISE EXCEPTION 'Finalised inspections cannot change printed content'
      USING ERRCODE = 'P0001';
  END IF;

  v_print_client := NULLIF(BTRIM(COALESCE(OLD.client_name_snapshot, '')), '') IS NOT NULL;
  v_print_job :=
    NULLIF(BTRIM(COALESCE(OLD.job_title_snapshot, '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(OLD.site_name_snapshot, '')), '') IS NOT NULL
    OR NULLIF(BTRIM(COALESCE(OLD.site_address_snapshot, '')), '') IS NOT NULL;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    IF NEW.client_id IS NULL AND OLD.client_id IS NOT NULL THEN
      IF NOT v_print_client THEN
        RAISE EXCEPTION 'Finalised inspections cannot drop client_id without a printed client snapshot'
          USING ERRCODE = 'P0001';
      END IF;
    ELSIF OLD.client_id IS NULL AND NEW.client_id IS NOT NULL THEN
      v_company := COALESCE(
        (SELECT p.company_id FROM public.profiles p WHERE p.id = COALESCE(NEW.inspector_id, OLD.inspector_id)),
        (SELECT j.company_id FROM public.jobs j WHERE j.id = COALESCE(NEW.crm_job_id, OLD.crm_job_id))
      );
      IF v_company IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE c.id = NEW.client_id
          AND c.company_id = v_company
      ) THEN
        RAISE EXCEPTION 'Finalised inspections can only attach a same-company client'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Finalised inspections cannot change client_id to a different client'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.crm_job_id IS DISTINCT FROM OLD.crm_job_id THEN
    IF NEW.crm_job_id IS NULL AND OLD.crm_job_id IS NOT NULL THEN
      IF NOT v_print_job THEN
        RAISE EXCEPTION 'Finalised inspections cannot drop crm_job_id without printed job snapshots'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      RAISE EXCEPTION 'Finalised inspections cannot change crm_job_id'
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
