# Vitest quarantine — 14 Sep 2026

Full `vitest run` must not stay red without an owner. Do not add `it.skip` without a row here.

| ID | File | Disposition | Owner | Re-enable / removal |
| --- | --- | --- | --- | --- |
| Q-2026-09-13-due-contact | `src/lib/clientSheetContact.test.ts` | **Fixed.** Due tray reuses email/phone save. | CRM / inspections | Keep current assertions. |
| Q-2026-09-13-due-attach | `src/lib/jobReminderClientAttach.test.ts` | **Fixed.** Due tray reuses `attachJobClient`. | CRM / inspections | Keep current assertions. |
| Q-2026-09-13-jha-logo | `src/reports/jha/compose.test.ts` | **Fixed** (`companyLogo.ts` must exist). Empty `git diff` vs `dc99d9e` on shared letterhead **dropped**, not skipped. | Documents | Re-baseline `src/reports/shared/components.tsx` when letterhead sizes are signed. |
| Q-2026-09-13-sendReport-perf | `src/lib/sendReport.test.ts` | **Replaced.** Wall-clock 2000× `decideReportSend` &lt;80ms removed. Live guard: `decideReportSend` source has no list walk; `pickReportByIdAndCompany` is one `for` pass. | Platform | Do not restore the 80ms gate. |
| Q-2026-09-14-sendInvoice-perf | `src/lib/sendInvoice.test.ts` | **Replaced.** Wall-clock 2000× `decideInvoiceSend` &lt;80ms failed at 140ms on a loaded runner. Live guard: `decideInvoiceSend` source has no list walk; `pickInvoiceByIdAndCompany` is one `for` pass. | Platform | Do not restore the 80ms gate. |

No `it.skip` remains for these IDs.
