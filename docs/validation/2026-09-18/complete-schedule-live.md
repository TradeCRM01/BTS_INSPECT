# Complete Schedule live release

Baseline: `origin/main` `de768d0`. Sources: `#224` `75621e3` (Hours, dispatch bar/queue, `saveJobDispatch`), `#225` `4f5f878` (loading, clip, On-site strip), original `357fb62`. Not a blind merge of both PRs.

## Visible live

- Dispatch command bar, Day/Week, Hours & leave, dispatch queue
- Window controls, clipped-job chips, retained loading counts
- Crew assignment through `save_job_dispatch` only (no `jobs.update` fallback)
- Booking/conflict feedback, mobile On-site strip
- Main four-tab job sheet and phone Today / Schedule / Jobs / More kept

## Database

- Hours already live: `20260910203517` / `068_staff_hours`. Do not apply unused `082`.
- Applied additive: `save_job_dispatch_tables`, then `save_job_dispatch` on `ezszahvwwmbuekpedumf`.
- Repo file: `supabase/migrations/20260918200000_083_save_job_dispatch.sql` (no demo catalogue).
- Old client: new job columns default; unused tables unused. New client requires the RPC.

## Rollback

Revert the Schedule client on `main` so assignment returns to `jobs.update`. Leave unused dispatch tables in place.

## Devices

Physical-device checks: not run.
