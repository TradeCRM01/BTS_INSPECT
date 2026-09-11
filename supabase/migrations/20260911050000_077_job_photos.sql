-- Job photos on an existing job: visit-note shots or general job shots.
-- Company-scoped, RLS. Files ride uploaded-pdfs under
-- {companyId}/jobs/{jobId}/{photoId}.jpg — same family as member ticket
-- photos. Not a gallery module, not a new bucket, not public.photos.

CREATE TABLE IF NOT EXISTS public.job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  visit_note_id uuid REFERENCES public.job_visit_notes(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  caption text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_photos_job_created
  ON public.job_photos (company_id, job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_photos_visit_note
  ON public.job_photos (visit_note_id);

ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company members can view job photos" ON public.job_photos;
CREATE POLICY "Company members can view job photos"
  ON public.job_photos FOR SELECT
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Company members can insert job photos" ON public.job_photos;
CREATE POLICY "Company members can insert job photos"
  ON public.job_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND j.company_id = company_id
    )
  );

DROP POLICY IF EXISTS "Company members can delete job photos" ON public.job_photos;
CREATE POLICY "Company members can delete job photos"
  ON public.job_photos FOR DELETE
  TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

REVOKE ALL ON public.job_photos FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.job_photos TO authenticated;
GRANT ALL ON public.job_photos TO service_role;
