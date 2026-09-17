# Hours repairs — 16 Sep 2026 (local)

Tested commit: `999338b` plus uncommitted Hours / fixture / Auth repairs. Local Kong `127.0.0.1:54321`. `.env` production host unused.

## Member selection (async team list)

`StaffHoursPanel` still initialises `memberId` to `''` when `members` is empty on first mount. `selectedHoursMemberId` then uses the first listed person once the team arrives, and keeps an explicit later selection. Save/clear send that resolved id. Unit tests cover empty → first member, keep selection, and drop a gone id.

Live isolation (REST, admin session): three `staff_hours` rows for 2099-03-01/02 (Jack d1, Member d1, Jack d2). Deleting Jack d1 left Member d1 and Jack d2. Deleting Member d1 left Jack d2.

## DELETE policy vs intended model

Product migration `supabase/migrations/20260911040000_068_staff_hours.sql` already grants company-scoped SELECT/INSERT/UPDATE/**DELETE** to `authenticated`. Hours UI is not admin-only. Same-company members may clear a colleague’s exception.

`scripts/local-apply-cogs-hours.sql` had lagged: GRANT included DELETE, but no DELETE policy. Restore usual then deleted 0 rows. **Local-fixture mismatch, not a product schema gap.** The local script now matches 068. No new production migration.

## Live sessions (not a SQL-string check)

| Check | Result |
| --- | --- |
| Admin delete own company row | PASS — target gone; other member/date rows stayed |
| Same-company member delete own row | PASS |
| Same-company member delete colleague row | PASS (matches 068 company-scoped policy) |
| Other-company admin delete BTS row | PASS — 0 rows affected; row still present |
| Unauthenticated (anon JWT) delete | PASS — `42501 permission denied`; row still present |
| `has_table_privilege('anon','staff_hours','DELETE')` | false |
| Cleanup of 2099 isolation rows | PASS |

Runner: `scripts/local-staff-hours-rls.ps1` (env keys only; does not print tokens).
