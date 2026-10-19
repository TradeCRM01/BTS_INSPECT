-- Extra lock after ai_settings_interim_lock (20261019003952).
-- That file revoked table-wide SELECT/INSERT/UPDATE from authenticated and anon.
-- DELETE, TRUNCATE, REFERENCES, and TRIGGER were still held by those roles.

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_settings FROM authenticated, anon;
