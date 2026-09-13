# Grafter 9+ programme — development status

Baseline: live UX audit of original Grafter, 13 September 2026.
Working branch: `integration/job-workspace-tabs`.
This is the original Grafter repository (`TradeCRM01/BTS_INSPECT`). The 13 Sep brief’s “isolated copy” wording was a misread; work continues here. Production deploys, `grafter.com.au`, payments, and customer email are still out of scope unless separately approved.

Do not treat any category as a verified 9 / 10 until Milestone 5 gates and physical-phone checks pass.

| Category | Audit baseline | Current (this branch) | Verified 9+ |
| --- | ---: | ---: | --- |
| Overall app | 6.5 | In progress | No |
| UI/UX vs competitors | 6.0 | Unchanged | No |
| Desktop efficiency | 6.5 | Today command bar + denser Jobs/CRM lists | No |
| Mobile field | 5.5 provisional | Field path on job sheet; not physically validated | No |
| Scheduling / dispatch | 6.0 | Overlap, dated hours, load vs recorded hours | No |
| Reliability / recovery | 4.5 | Milestone 0 in this branch | No |

## Milestone 0 — reliability (implemented, not yet deployed)

- Inspection register and job-sheet inspection queries retry without `due_on` on Postgres `42703`.
- Inspection error copy shows the real failure, not a fake network message.
- Dashboard overdue count/total uses the same `effectiveInvoiceStatus` rule as the invoice Overdue tab.
- `/invoices?status=overdue` opens that tab.
- PWA install is dashboard-only, top of screen, dismiss remembered (`pwa-install-dismissed`).
- Zero-duration time entries cannot be saved; submit of 0 minutes is refused; 0m is labelled.

Tests added/updated: `missingColumn`, `installPrompt`, `invoiceStatus` overdue count, `timesheetJob` recorded duration.

Still open on M0: live deploy of this branch; physical-device confirmation of the install banner; inspection register not re-proven in a signed-in browser this session.

## Milestone 1 — shell and list density (implemented, not a 9+)

- Dashboard keeps the widget canvas; a Today command strip sits above it (on today, unassigned dated work, needs a date, overdue invoices).
- Jobs table has a Crew column; job cards show date, time, and crew count.
- Client rows show open jobs, last scheduled date, and outstanding (when not already in the overdue signal).
- Desktop Field / CRM / Financials / Inventory menus no longer use a full-screen overlay that ate clicks; click-away is document-level; buttons expose `aria-expanded`.
- Settings is still one page (not a rewrite) with jump links to tax, logo, theme, types, email, users, and company details.

Tests: `todayCommand`.

Still open on M1: widget canvas itself; a full settings IA split; physical confirmation that menus open on a real desktop pointer.

## Milestone 2 — dispatch load (implemented, not Simpro parity)

- Week and day boards show booked hours per crew cell. Available hours appear only when that date has a `staff_hours` working window — weekdays are not invented.
- Booking warnings include over-capacity against those recorded hours.
- Dropping an untimed job onto a time on the day grid sets a one-hour end.
- Skills, equipment, travel time, and a persisted booking audit log are not in this slice.

Tests: `crewDayLoad`, `capacityWarnings`, `applyDropStartTime` default duration.

## Milestone 3 — field path (implemented, not physically validated)

- Dashboard On today opens `/jobs?when=today`.
- Below `lg`, the job sheet has a 44px On site strip: clock, photo, note, More to do, All done. Header clock controls stay on desktop only so the same action is not tapped twice.
- Notes append to `jobs.description`. Photos upload to the existing `photos` bucket and record a line on the job. No new schema.

Tests: `jobFieldPath`.

## Milestone 4 — commercial / inventory exceptions (partial)

- Stock list shows available (on hand) and allocated (sum of `allocated_to_job` movements). Allocations already decrement on-hand, so available is not on-hand minus allocated again.
- Expenses show a reconcile banner when recorded/paid COGS is tagged to a job.
- Quotes already expose convert/invoice next actions.

Tests: `stockAvailability`, `expenseReconcile`.

## Milestone 5 — 9+ gate (not passed)

Weights from the 13 Sep brief, recorded so we do not invent a score:

| Category | Audit | This branch (honest) | 9+ |
| --- | ---: | --- | --- |
| Reliability | 4.5 | Better in code; not re-proven on production JS | No |
| Desktop | 6.5 | Command bar + menus + denser lists | No |
| Mobile field | 5.5 | Field path exists; no physical iPhone/Android pass | No |
| Scheduling | 6.0 | Load vs recorded hours only | No |
| CRM / money / stock | — | Exception banners and columns only | No |

Not done for a 9+: deploy of this branch, E2E, visual regression, 1366 and 390 viewports in a signed-in browser this session, VoiceOver/TalkBack, offline no-dupe proof, skills/travel/audit log, settings IA rewrite, widget canvas, Simpro-depth dispatch.

## Later milestones

1. Shell and list density — this branch (above). Not verified 9+.
2. Dispatch load vs recorded hours, default one-hour slot on timed drop — this branch. Skills, travel, and a booking audit log are not started (no schema invented). Not verified 9+.
3. Mobile field path on the job sheet (clock, photo, note, All done / More to do) and Today → `/jobs?when=today`. Photos are stored in the existing photos bucket plus a description line — not a new photos table. Not physically validated. Not verified 9+.
4. Stock available vs allocated-to-job; expenses warn when COGS is already on a job. Quotes already had next-action buckets. Not verified 9+.
5. Rubric recorded above — gates not passed. Not a 9+.
