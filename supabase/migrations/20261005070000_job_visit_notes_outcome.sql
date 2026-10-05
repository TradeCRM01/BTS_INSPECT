-- Additive. Old notes stay NULL. Do not apply this to live from the agent.
ALTER TABLE public.job_visit_notes
  ADD COLUMN outcome text NULL
  CONSTRAINT job_visit_notes_outcome_check
  CHECK (outcome IN ('all_done', 'more_to_do'));
