-- Rollback 085_profile_expense_cost_model_lock (do not run on production without approval).
DROP TRIGGER IF EXISTS trg_protect_profile_expense_cost_model ON public.profiles;
DROP FUNCTION IF EXISTS public.protect_profile_expense_cost_model();
DROP FUNCTION IF EXISTS public.profile_expense_cost_model_write_allowed(uuid);
