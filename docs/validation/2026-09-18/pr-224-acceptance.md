# PR 224 acceptance (18 Sep 2026)

Branch `integrate/grafter-hours-dispatch-main`. Source `origin/integration/job-workspace-tabs` @ `357fb62` left intact. No merge to main. No production migration. No Cloudflare deploy.

## Dispatch fallback (chosen behaviour)

Crew assignment, timed resize, resource/skill writes and schedule drops require `save_job_dispatch`.

- Client `evaluateDispatch` / `decideDispatchWrite` still run first.
- A missing RPC (`42883` / `PGRST202`) returns `unavailable` and **does not** `jobs.update`.
- Hard and permission (member override) rejections return `blocked` and never open the RPC or a direct write.
- Offline / fetch failure keeps the same idempotency key for Retry.

Effect on current main after this PR, before a local or authorised schema apply: Schedule drops and the job-sheet date/time/crew tray are read-only with `DISPATCH_UNAVAILABLE`. Job status, visit notes, photos, JobFormModal details, invoices and quotes still use their existing `jobs.update` paths.

## Schema dependencies

| Feature | Production migration | Local-only |
| --- | --- | --- |
| Hours & leave | `082_staff_hours` (`staff_hours` + company RLS) | `scripts/local-apply-cogs-hours.sql`, `local-staff-hours-rls.ps1` |
| Booking warnings | none (client + existing jobs) | Hours rows from `staff_hours` |
| M6 server validation, tenant, idempotency, allocations | **none in this PR** | `scripts/local-m6-dispatch-resources.sql` (`save_job_dispatch` + dispatch tables) |
| M6 negatives / retry | none | `local-m6-dispatch-security.sql`, `local-m6-acceptance.ps1`, `local-dispatch-lost-response.ps1` |

`082` is numbered after `081_reminders_visibility_tags`. It does not duplicate a main migration. An untracked `068_staff_hours` copy was not committed.

Proposed rollout if authorised later: (1) merge client after review, (2) apply `082` to production, (3) separately authorise a production `save_job_dispatch` migration before dispatch writes work off localhost. Rollback: revert the app deploy; `082` table is additive (`IF NOT EXISTS`) and can be left unused.

## Vitest baseline (`de768d0` clean worktree vs this branch)

Identical 18 failing files / 20 failing tests on `de768d0`. This branch added one lock failure (`weekBoardLaptopLook` expected `rescheduleJob.mutate`); the lock now requires `saveJobDispatch` / `runDispatchSave` and forbids the old mutate. No tests deleted or skipped.

`origin/main` was still `de768d0` when this note was written.

## Isolated local acceptance

Vite `127.0.0.1:5175` with `VITE_SUPABASE_URL=http://127.0.0.1:54321` (module transform contained the local URL, not the production host). Local passwords set only in the sandbox `auth.users` rows; not printed.

| Check | Result |
| --- | --- |
| Hours RLS (own delete, cross-company, unauthenticated, colleague) | PASS (`local-staff-hours-rls.ps1`) |
| Hard timed overlap + OOS equipment | PASS reject unchanged |
| Admin soft without reason | PASS `override_reason_required` |
| Member override | PASS `override_forbidden` |
| Admin soft with reason | PASS persist + audit |
| Lost-response retry same key | PASS one event, `replayed` |
| Browser drag/drop, sticky strip, four-tab sheet, 390/375 frames | NOT RUN — Cursor browser MCP unavailable this pass |
| Physical iPhone/Android, VO/TalkBack | NOT RUN |

No FUNCTION or LOOK sign-off is claimed.
