# Grafter 9+ programme — development status

Baseline: live UX audit of original Grafter, 13 September 2026.
Working branch: `integration/job-workspace-tabs`.
This is the original Grafter repository (`TradeCRM01/BTS_INSPECT`). The 13 Sep brief’s “isolated copy” wording was a misread; work continues here. Production deploys, `grafter.com.au`, payments, and customer email are still out of scope unless separately approved.

Do not treat any category as a verified 9 / 10 until Milestone 5 gates and physical-phone checks pass.

| Category | Audit baseline | Current (this branch) | Verified 9+ |
| --- | ---: | ---: | --- |
| Overall app | 6.5 | In progress | No |
| UI/UX vs competitors | 6.0 | Unchanged | No |
| Desktop efficiency | 6.5 | Unchanged | No |
| Mobile field | 5.5 provisional | Phone week exists; not physically validated | No |
| Scheduling / dispatch | 6.0 | Crew-axis week + overlap/hours warnings | No |
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

## Later milestones

1. Shell, navigation, dashboard command centre, dense Jobs/CRM lists, settings split — not started.
2. Dispatch intelligence beyond overlap + dated hours — not started.
3. Unified job timeline and one-handed field path — not started.
4. CRM/commercial/inventory exception depth — not started.
5. Rubric, E2E, visual regression, real-device 9+ gate — not started.
