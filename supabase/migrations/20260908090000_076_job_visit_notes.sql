CREATE TABLE IF NOT EXISTS public.job_visit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_visit_notes_job_created
  ON public.job_visit_notes (company_id, job_id, created_at DESC);

ALTER TABLE public.job_visit_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view job visit notes" ON public.job_visit_notes;
CREATE POLICY "Company members can view job visit notes"
  ON public.job_visit_notes FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert job visit notes" ON public.job_visit_notes;
CREATE POLICY "Company members can insert job visit notes"
  ON public.job_visit_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND j.company_id = company_id
    )
  );

REVOKE ALL ON public.job_visit_notes FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.job_visit_notes TO authenticated;
GRANT ALL ON public.job_visit_notes TO service_role;
