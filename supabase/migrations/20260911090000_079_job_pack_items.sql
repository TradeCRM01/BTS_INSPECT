-- One row per pack item so a tick is a single-row update and two phones on
-- the same job cannot clobber each other's ticks.

CREATE TABLE IF NOT EXISTS public.job_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  pack_key text NOT NULL,
  group_key text NOT NULL CHECK (group_key IN ('tools', 'materials', 'photos', 'safety')),
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  ticked_at timestamptz,
  ticked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ticked_by_name text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_pack_items_job_position
  ON public.job_pack_items (company_id, job_id, position);

ALTER TABLE public.job_pack_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view job pack items" ON public.job_pack_items;
CREATE POLICY "Company members can view job pack items"
  ON public.job_pack_items FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert job pack items" ON public.job_pack_items;
CREATE POLICY "Company members can insert job pack items"
  ON public.job_pack_items FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_pack_items.job_id
        AND j.company_id = job_pack_items.company_id
    )
  );

DROP POLICY IF EXISTS "Company members can tick job pack items" ON public.job_pack_items;
CREATE POLICY "Company members can tick job pack items"
  ON public.job_pack_items FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (ticked_by IS NULL OR ticked_by = auth.uid())
  );

REVOKE ALL ON public.job_pack_items FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.job_pack_items TO authenticated;
GRANT ALL ON public.job_pack_items TO service_role;
