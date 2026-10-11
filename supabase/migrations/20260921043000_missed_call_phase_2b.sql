-- NO-OP STUB (baseline r2 / #368).
-- organisations-stack. Prod is companies. Must never create
-- jobs_organisation_id_key or agent_reminders_organisation_id_key.
-- Original SQL is held at
-- docs/operations/held-org-stack/20260921043000_missed_call_phase_2b.sql
-- Not marked applied: those two indexes are missing in prod. Accidental apply is now a no-op.
SELECT 1;
