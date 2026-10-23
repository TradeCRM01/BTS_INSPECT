-- Not applied. Restores table SELECT for anon and authenticated and drops the status RPC.

DROP FUNCTION IF EXISTS public.email_smtp_ready();

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.email_settings TO anon, authenticated;
