-- Primary trade(s) for the company, first is primary. Empty means unset; the job pack then loads electrical.
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS trades text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_trades_known;
ALTER TABLE public.companies ADD CONSTRAINT companies_trades_known
  CHECK (trades <@ ARRAY['plumbing', 'electrical', 'hvac', 'carpentry', 'general']::text[]);
