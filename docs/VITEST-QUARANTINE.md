# Vitest quarantine — 13 Sep 2026

Full `vitest run` must not stay red without an owner. Record of the four failures seen after M0–5:

| ID | File | Disposition | Owner |
| --- | --- | --- | --- |
| Q-2026-09-13-due-contact | `src/lib/clientSheetContact.test.ts` | **Fixed.** Isolation freeze assumed `InspectionDueReminder` never reused client email/phone save. The due tray now does. Assertions match the current wiring. | CRM / inspections |
| Q-2026-09-13-due-attach | `src/lib/jobReminderClientAttach.test.ts` | **Fixed.** Same freeze vs `attachJobClient` on the due tray. Assertions now require the attach field. | CRM / inspections |
| Q-2026-09-13-jha-logo | `src/reports/jha/compose.test.ts` | **Fixed** (`companyLogo.ts` must exist). **Quarantined:** empty `git diff` vs `dc99d9e` on `shared/components.tsx` (letterhead sizes). Documents own a re-baseline. | Documents |
| Q-2026-09-13-sendReport-perf | `src/lib/sendReport.test.ts` — `decides send on one report without scanning the book` | **Skipped.** 2000× `decideReportSend` &lt; 80ms flakes on shared/Defender machines. Functional `decideReportSend` cases stay live. Re-enable with a machine-stable budget or drop the wall-clock gate. | Platform |

Do not add more `it.skip` without a row here.
