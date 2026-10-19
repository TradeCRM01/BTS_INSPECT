-- Extra lock after ai_settings_interim_lock (20261019003952).
-- That file revoked table-wide SELECT/INSERT/UPDATE from authenticated and anon.
-- DELETE, TRUNCATE, REFERENCES, TRIGGER, and MAINTAIN (PG17) were still held.

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.ai_settings FROM authenticated, anon;
