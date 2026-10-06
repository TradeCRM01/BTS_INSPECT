-- Rollback 084_profiles_expense_cost_model_id (do not run on production without approval).
DROP INDEX IF EXISTS public.idx_profiles_expense_cost_model_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS expense_cost_model_id;
