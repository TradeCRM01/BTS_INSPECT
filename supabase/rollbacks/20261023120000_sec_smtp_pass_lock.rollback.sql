-- Not applied. Restores table SELECT for anon and authenticated and drops the status and setter RPCs.

DROP FUNCTION IF EXISTS public.email_smtp_ready();
DROP FUNCTION IF EXISTS public.email_smtp_set_pass(text);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.email_settings TO anon, authenticated;
