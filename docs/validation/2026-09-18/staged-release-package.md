# Staged release package (18 Sep 2026)

Production is unchanged. PR #224 stays open at `75621e3` (`integrate/grafter-hours-dispatch-main`). This note is the inventory. Nothing from the Hours / M6 / field-path objective is discarded.

## Smaller PR (schema-safe, current main)

Branch `integrate/schedule-loading-window-strip`, cut from `origin/main` @ `de768d0`.

Assignment on this PR is unchanged. Schedule drops still call `rescheduleJob.mutate` and persist with `jobs.update`. There is no `saveJobDispatch`, no RPC-missing fallback, and no M6 claim.

### Retained in the smaller PR

| Improvement | Why it is independent |
| --- | --- |
| Truthful schedule loading | `keepPreviousData` plus `scheduleBoardSummary`. Spinner only when `isLoading && jobs == null`. Uses existing jobs queries. |
| Day-board window / clip | `clipJobToVisibleHours`, `countJobsOutsideVisibleWindow`, `visibleDayHours`. Default window stays 6am–8pm. Optional 7am–5pm toggle. No new tables. |
| Compact chip crash | `compact={box.width < 120}` instead of a free `width`. |
| On-site strip | `JobFieldPathBar` plus sticky CSS. Clock, visit note, gallery, JHA, Take 5, and status already exist on main. |

### Deferred on #224 (do not merge with this PR)

| Improvement | Dependency |
| --- | --- |
| Hours & leave panel, Hours RLS | `082_staff_hours` (`staff_hours`). Not on production. Do not apply without authorisation. |
| Booking warnings from Hours | Hours rows. Client-only warnings still need those rows to mean anything. |
| M6 `save_job_dispatch` | Local SQL only (`scripts/local-m6-dispatch-resources.sql`). Production has no RPC. |
| Schedule / job-sheet assignment via RPC | Same RPC. A client-first swap disables live `jobs.update` assignment. Rejected as a default release. |
| Attention-only board filter | Tied to dispatch pack / skill-resource attention on #224. `attentionCount` is 0 on the smaller PR. |
| `DISPATCH_UNAVAILABLE` / locked date-time-crew | Only correct after the RPC exists. |
| `weekBoardLaptopLook` lock on `saveJobDispatch` | Stays on #224. Smaller PR keeps `rescheduleJob.mutate`. |

## Hours / M6 dependency-first rollout

Keep existing assignment live until each server piece is present and proven.

1. Compatibility check on production. Confirm `save_job_dispatch` is absent (`42883` / `PGRST202`). Confirm `staff_hours` is absent. Confirm current clients still write assignment through `jobs.update`.
2. Authorise and apply Hours schema only when wanted (`082` after `081`). Additive table. Re-run `scripts/local-staff-hours-rls.ps1` against a staging clone first. Own delete, cross-company deny, unauthenticated deny, colleague deny.
3. Authorise a production `save_job_dispatch` migration separately. Port from `scripts/local-m6-dispatch-resources.sql`. Server tests before any client swap. Hard overlap, OOS equipment, admin soft without reason, member override forbidden, admin soft with reason, lost-response retry same idempotency key (`scripts/local-m6-acceptance.ps1`, `local-m6-dispatch-security.sql`, `local-dispatch-lost-response.ps1`).
4. Only then merge the #224 client that routes assignment through the RPC and refuses `jobs.update` when the RPC is missing.
5. Rollback. Revert the app deploy first so assignment returns to `jobs.update`. Leave unused additive tables in place unless a later authorised drop is requested. Do not ship the RPC-missing client onto a host that still lacks the RPC.

No extra production migrations are created or applied in this package.

## Validation status (smaller PR)

See `docs/validation/2026-09-18/schedule-strip-acceptance.md`. FUNCTION and LOOK remain pending until the evidence in that file is complete.
