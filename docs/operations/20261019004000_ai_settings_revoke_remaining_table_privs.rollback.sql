-- Rollback 20261019004000_ai_settings_revoke_remaining_table_privs
-- Restores leftover table privileges that the extra migration revoked.
-- Does not undo 20261019003952_ai_settings_interim_lock.
-- Do not run on production without approval.

GRANT DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_settings TO authenticated, anon;
