-- COSTMODEL: default employee cost model on profiles for job-bill labour unit_cost (MONEY-2 pull path).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expense_cost_model_id uuid
  REFERENCES public.expense_cost_models(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.expense_cost_model_id IS
  'Default expense cost model for this team member; used when pulling logged hours to the job bill.';

CREATE INDEX IF NOT EXISTS idx_profiles_expense_cost_model_id
  ON public.profiles(expense_cost_model_id);
