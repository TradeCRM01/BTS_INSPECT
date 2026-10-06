-- MONEY-2: company default labour sell rate (ex GST). Additive; 082 is separate.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_labour_rate numeric;

COMMENT ON COLUMN public.companies.default_labour_rate IS
  'Default labour sell rate ex GST when pulling logged hours to the job bill.';
