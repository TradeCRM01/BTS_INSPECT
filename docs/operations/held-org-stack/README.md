# Held organisations-stack SQL

These two files used to live in `supabase/migrations/`. They are **not**
applied on prod (`ezszahvwwmbuekpedumf`). Their objects are missing:

- `20260921020000_tradecrm_organisation_remap.sql` — `public.job_visits` plus policy and 3 indexes
- `20260921043000_missed_call_phase_2b.sql` — `jobs_organisation_id_key` and `agent_reminders_organisation_id_key`

The live path is `missed_call_companies_*`. The copies in `supabase/migrations/`
at the same versions are no-op stubs (`SELECT 1`).

Why stub in place, not delete the versions: local `db reset` keeps the same
timestamp order, and a later accidental apply of these versions runs empty SQL
instead of creating organisations-stack objects. Do not put the held SQL back
into `migrations/` without Coach SIGN.
