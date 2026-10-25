# Decisions log

## Approval status (Jack, 19 Oct 2026, 12:57 AEST: "Yes, go with this look and those changes")
| Item | Decision | Status |
|---|---|---|
| Success `#16703A`, warning `#A4410A` | D4 | **APPROVED** |
| Control radius 10px | D5 | **APPROVED** |
| Input/control border `#808A93` | D6 | **APPROVED** |
| No navy bands on documents (in-app document view and PDF) | D8, D10 | **APPROVED** |
| Balance due is the biggest figure on the PDF | D8 | **APPROVED** |
| Green only on status dots and pills | D11 | **APPROVED** |
| Usage rule: blue text (links, text buttons) is `#296AA5` | D3 | **APPROVED, locked** |
| Usage rule: Rajdhani only at 20px and up | D12 | **APPROVED, locked** |

Still open: D7 (navy toast) and D9 (navy strip on list sheets). D10's thin navy head bar is approved as part of the mockup look (Job sheet, Dashboard "Today"). Confirm it before extending it to other record sheets. See open-questions.md.

| # | Date | Decision | Why | Revisit if |
|---|---|---|---|---|
| D1 | 2026-10-19 | Brand lock kept; no alternative proposed | Ceiling is execution (two parallel systems, 26 sizes, 17 shadows), not palette or fonts | Live screenshots show Rajdhani H1–H3 still feel "tech/gaming" after the scale fix |
| D2 | 2026-10-19 | Blue = actions only; selected/active states are navy | Blue is currently spent on status, tabs and decoration, so it stops meaning "do this" | — |
| D3 | 2026-10-19 | Link/text-button colour `#296AA5` (the existing hover shade) **APPROVED** (Jack, 2026-10-19 12:57 AEST) | `#2E75B6` text on cream is 4.26:1 (fails AA) | Jack prefers links only on sheet, where `#2E75B6` passes at 4.76 |
| D4 | 2026-10-19 | success `#1B7F3A`→`#16703A`, warning `#B54708`→`#A4410A` **APPROVED** (Jack, 2026-10-19 12:57 AEST) | AA on cream and on tints | — |
| D5 | 2026-10-19 | Control radius 12→10 (one token, own PR) **APPROVED** (Jack, 2026-10-19 12:57 AEST) | Crisper at 44px; closer to Stripe/Linear | Jack prefers current 12 |
| D6 | 2026-10-19 | Control borders `#808A93` (3.46:1) **APPROVED** (Jack, 2026-10-19 12:57 AEST) | WCAG 1.4.11; today `#E2D9CC` is 1.37:1 | Mockups look too heavy; fallback is to keep hairline borders and accept a documented 1.4.11 gap |
| D7 | 2026-10-19 | Navy toasts (inverse surface) | Premium/high-contrast on cream (Superhuman/Linear). A toast is not a page, so the navy-page ban doesn't apply | Jack reads it as "dark UI" |
| D8 | 2026-10-19 | PDF page `#FFFDF8`, no navy bands, balance-due-first **APPROVED** (Jack, 2026-10-19 12:57 AEST) | Prints clean; matches in-app paper reference | — |
| D9 | 2026-10-19 | Remove the navy "List" strip atop list sheets and the navy empty photo stamp | No navy blocks inside paper | Jack treats the strip as locked chrome |

## D10: Thin navy head bar on record sheets (mockup phase, 19 Oct 2026)
D9 removed the navy strip from list sheets. Jack's mockup brief asks for a thin navy head bar on the Job sheet showing hours and status, so record sheets (Job, Dashboard "Today") keep a 40px navy bar.
- It holds the record ref, live hours and the status control. It never holds a title or a primary.
- Documents (Invoice in the app and the PDF) have no navy band. **APPROVED** (Jack, 2026-10-19 12:57 AEST)

## D11: No green text or fills in the UI (19 Oct 2026). **APPROVED** (Jack, 2026-10-19 12:57 AEST)
The brand lock allows no green in the UI. The success colour (#16703A on #E6F1E7) is allowed only on small status dots and pills, such as "JHA on file" and "Accepted" on the Job sheet. It never colours headline figures, money, totals or icon tiles.
- Dashboard Cash Flow "Net": changed to navy ink.
- Invoice "Paid to date": changed to secondary ink.
- Invoice Deposit tick tile: changed to a paper-50 tile with a hairline border and a navy tick.
- The PDF already had no green.

## D12: Rajdhani only at 20px and up (19 Oct 2026). **APPROVED, locked** (Jack, 2026-10-19 12:57 AEST)
Rajdhani 700 is for titles at 20px (H3) and above, including big money figures. Anything smaller (table heads, kickers, eyebrows, date tiles, labels) uses Source Sans 3.
- In PDFs, 20px is 15pt, so Rajdhani is allowed only at the 20pt and 22pt sizes.
- Mockups fixed to comply: the dashboard Upcoming Jobs date tile went from Rajdhani 18px to Source Sans 16px, and the PDF "Tax invoice" kicker went from Rajdhani 14pt to Source Sans 10pt.
- This retires the audit's 44 Rajdhani rules at 11px and 14 at 16px.

## D13 — Toasts: navy floating chips (APPROVED, Coach under Jack's 19 Oct 12:57 AEST design approval, recorded 13:16 AEST)
Small navy #0A2540 floating chip, cream text, one action link. Phone: bottom-centre above the tab bar and safe area. Laptop: bottom-right. Open/Undo stays tappable for 15 s. Errors get a warning #A4410A left accent, never a red chip. Closes Q2; unblocks PR A6.

## D14 — List sheets: no navy 'List' strip (APPROVED, Coach, recorded 13:16 AEST)
List sheets drop the navy strip and use a clean #FFFDF8 title row with a 1px divider. The thin navy head bar stays on OPEN records only, so navy stays an accent. Closes Q3.

## D15: Crew schedule palette, six muted tints (Phase 1b). **APPROVED** (Coach signed, 19 Oct 2026 14:07 AEST)
One palette of six tints (harbour, plum, clay, ochre, slate, dusk) replaces the free hex "Schedule colour" picker. No green or teal. Every ink/tint pair is AA (6.79–8.30:1), navy titles on tints are ≥12.49:1, and the 3px rules are ≥3:1. Crew colour shows **who**; status is always a small pill, never a fill. Unassigned has no tint (dashed paper-50). Tokens `--g-crew-*` in tokens.css §9b; spec §2.6; mockups `after/schedule-{1280,390}.png`.

## D16: Settings section chips wrap on phones (Phase 1b). **APPROVED** (Coach signed, 19 Oct 2026 14:07 AEST)
At <600px the 7–8 section chips wrap into 2–3 rows as a non-sticky section index; from 600px they stay one sticky row. Chosen over a scroll cue because nothing is hidden or clipped, and a sticky 2–3-row block would take 15–22% of a small phone screen. Spec §6.9; mockups `after/settings-{375,390}.png`.

## D17: D14 applied to the Dashboard and Schedule (Phase 1b). **APPROVED** (Coach signed, 19 Oct 2026 14:07 AEST)
D14 keeps the navy head bar for open records only. The Dashboard is not a record, so its "Today" bar is removed; it now opens with the same clean title row as list sheets. `after/dashboard-{390,1280}.png` and the dashboard before/after boards were re-rendered. The job sheet keeps its bar (an open record). D10's bar list narrows to: open job, open quote.

## D18: Mockup and demo contact details are provably fictional (Phase 1b). **NOTED** (Coach, 19 Oct 2026 14:07 AEST)
Phones use ACMA's fiction ranges ((07) 5550 xxxx, 0491 570 xxx). Emails use reserved `.example` and `example.com` domains. The ABN `61 482 377 915` fails the ATO checksum. Bank details are placeholders (BSB 000-000, account 1234 5678). The invoice mockup and PDF were re-rendered with these (previously a gmail address, a 07 3359 number and BSB 064-118). Source: `spec/demo-seed.md`.

## D19: Settings uses one sticky save bar (PROPOSED, Phase 1c, 19 Oct 2026 ~14:05 AEST; logic change, needs Lead)
Today Company settings has four separate saves ("Save Changes", "Save payment methods", "Save theme", "Save Email Settings"). Proposal: one bar that appears only when something is dirty. It says what changed ("2 unsaved changes · Labour rate, Kayla's colour"), offers Discard and **Save changes**, and saves only the dirty sections. On phone it sits above the tab bar; on desktop it sticks to the bottom of the sheet. Changed fields show a quiet "Changed from $115.00" hint. Feedback follows D13 (a toast on save). This changes save logic, so it is out of scope for the style PRs until the Lead agrees. Mockups: `after/settings-full-{390,1280}.png`, `after/settings-team-390.png`.

## D20: Phone "place on a person" flow (PROPOSED, Phase 1c)
Phones can't drag across a week grid, so placing works in three taps: Unscheduled sheet → **Place** → a Place sheet with day chips, a person list showing each person's load that day, and start times with busy slots struck through, then **Place on Tom**. The result is a D13 toast ("Placed on Tom, Wed 21 Oct, 08:00 · Undo", 15 s) and the new row highlighted in the agenda. Desktop keeps drag: lifted chip (`--g-elev-2`), target cell outlined with a "free until" slot, tooltip "Drop to book Tom · Wed 21 Oct · 08:00", source card dimmed, and the same text in an `aria-live` region. Mockups: `after/schedule-place-flow-390.png`, `after/schedule-drag-1280.png`, `after/schedule-day-{390,1280}.png`.

## D21: Non-GST-registered businesses (PROPOSED answer to Q4, Phase 1c)
When the company is not registered for GST:
- the document title is **"Invoice"** (not "Tax invoice");
- there is no GST column and no GST row; the total is labelled **"Total"**, and Balance due stays the biggest figure;
- a plain notice under the totals: "No GST is charged. <Business> is not registered for GST.";
- the ABN is still shown if the business has one.

Drive it from an explicit `gst_registered` company flag, never from a $0 GST total (a GST-free line on a registered business's invoice is still a tax invoice). This is a logic change, out of style scope. Mockup: `after/pdf/invoice-nogst-pdf-p1.png`.

## D22: Long documents paginate with a running header (PROPOSED, Phase 1c)
Page 1 keeps the full header and parties. Later pages get a slim running header ("Tax invoice #0114 · continued") and repeat the table head. Totals, Balance due and How to pay sit only on the last page. Page 1 ends with "Continued on page 2", and each footer shows "Page X of N". Never split a line item across pages. Mockup: `after/pdf/invoice-2page-pdf-p{1,2}.png` (18 lines, 9/9).

## D23: Dashboard Customize mode and widget anatomy (PROPOSED, Phase 1c)
Widgets use the same card anatomy as the rest of the dashboard: a title row, one key figure, and at most 5 rows. Customize ("Customize" / "Done editing", the real labels) shows a slim edit bar on each card (move and remove). On desktop the lifted card shows a "Drop here" slot; on phone there are up/down arrows and no grip. "Add a Widget" opens a catalog panel. Changes save as you go. Weather shows the company's suburb (Brisbane; see Q10), and Compliance shows due items with an Overdue pill. Mockups: `after/dashboard-{widgets,customize}-{390,1280}.png`.

## Coach SIGNs — 19 Oct 2026 14:07 AEST
- D19 SIGNED in principle: sticky 'Unsaved changes' bar with Save + Discard, sharing the SWEEP-10 unsaved-changes guard (one guard, not two). Lead + CoS must agree logic before slotting.
- D20 SIGNED: 3-tap place on phone; every target >=44px; Undo in the toast.
- D21 SIGNED with conditions: existing companies default gst_registered=true; setting lives in Company Settings with plain help text; toggling never rewrites issued documents; quotes follow the same rule (non-registered must not be titled 'Tax invoice').
- Landing: copy flags handed to Grafter Landing with the restyle mock; their copy changes need Coach LOOK before merge.

## D24: Schedule is full-pane (Phase 1d, 19 Oct 2026 ~14:30 AEST; from Jack's live fail). **SIGNED** (Coach, LOOK passed, 19 Oct 2026 14:20 AEST)
**Applies to Schedule only (Week, Day, drag, place flow, and the empty, loading and error states).** Other record and list pages keep their sheet.

The board is the surface. There is no centred card, no outer cream margin, no radius and no shadow. The work area runs edge to edge below the app bar at every width. The only inset is the gutter (`--g-sheet-pad`: 16px on phone, 24px from 1024), which is at most 24px. The app bar's contents go full width too, so its edges line up with the board.

**How the columns stretch:**
- **Week:** a `--crew-col` column (148px, or 200px from 1440), then Mon–Fri at `1fr` each and Sat–Sun at `.55fr` each, so the extra width goes to working days, not empty weekends. From 1440, chips add the client after the suburb and cells get 8px of padding.
- **Day:**
  - The hour axis is 6 AM–6 PM with a minimum of 88px per hour (80px until Phase 1e).
  - Above that minimum the hours stretch. Below it, the board scrolls sideways inside itself: the crew column stays put, and a scroll cue appears ("Later hours" chip plus an edge fade).
  - Today that happens only between 1024 and 1251px.

Spec: `design-system.md` §16. Mockups: `after/schedule-{1280,1440,1920}.png`, `after/schedule-day-{1024,1280,1440,1920}.png`, `after/schedule-drag-1280.png`.

**Day-view geometry (also part of D24):**
- Every crew track, the hours lane and the now lane share one axis: the same left edge and width. Blocks sit on a 144-column, 5-minute grid, so their edges fall exactly on their start and end times.
- The crew cell and its track are always the same height.
- The now marker's label sits in its own lane under the hours, so it can never cover an hour label. The line runs behind the blocks.
- `shoot2.js` checks all of this to ±1px. See ALIGN in §16.

**Fix found while doing this (all pages, not a design change):** from 1024 to 1279px the app bar's nav ran under the search box (the "Inventory" label sat behind it). In that range the search now collapses to a 44px icon button, keeping its `aria-label`, and the gaps are 16px. `shoot2.js` gained an OVERLAP check on the app bar. Every page was re-checked at 1024 and 1100.

**Phase 1e data nits (Coach, 14:20 AEST, non-blocking), applied:**
- **(a) Statuses follow the seed's rules at the demo now** (Mon 19 Oct, 13:40; `demo-seed.md` §6, asserted in `seed.py` and `sched_data.py`). #0036 (07:00–10:30) and #0037 (11:00–12:00) now read **Ready to invoice**, and #0038 (13:00–14:00) reads **In progress**. This is applied on the week and day boards, the drag and place frames, the long-data pages, the dashboard (with the stale "Leave soon · 10:40" nudge replaced by "2 jobs ready to invoice"), the job sheet and its records, bill sheet and states, and the client record (#0034 shows **Done**). The Clients "Has open jobs" count is now 10.
- **(b) Day-view blocks of 1 h or longer carry the week view's small status pill**; shorter blocks stay bare. In 1-hour blocks at the 88px minimum the pill drops its dot and may wrap (container query), and never spills. `shoot2.js` SPILL now also covers `.dv-blk`, `.wchip` and `.pill`.

## Coach rulings 00:23 AEST 24 Oct
- #402: FOLD JobDetail path fixtures :380/:381/:408. Kill: no-flag prod build /look-job-bayswater, /look-job-p307 render real not-found or real job, never fixture; four-way render kills; scan supporting only.
- P2 (1) 20:43 beats brief S19/:87: card shows 'No date' pill only, 'Set a date' in sheet; K11 rewritten. (2) Unknown status never Scheduled/Booked: dated+crewless = Needs crew, else neutral pill with raw status sentence-cased; same in #403. (3) Drop jobColors, JobFormModal aria, dashboardHome.ts:58 (aria may become own ticket). (4) needCrew never throws; malformed assigned_team = no crew, in #403 helper with kill; P2/P3 consume it. Reach: all reachable at 900 tall; 390 agenda never 0.
- 00:47 Coach CLOSE PARTIAL #401 0898c3b9/index-DLsm-zAD-r2.js. SEC-SMTP-fu -> SWEEP-2b, must land before SMTP lane unparks: diff readiness vs main 30cb09d9 emailSettingsReady; indicator from email_smtp_ready() (any host + pass = set); real-PG kill non-resend host+pass => ready=true. P3 CTA: measured mockup pixel wins (black vs r6 navy = FAIL).
- 2026-10-24 01:33 SWEEP-2b ticket: JobFormModal (New job sheet) lacks role=dialog, aria-modal, aria-labelledby (reverted from P2 #399). Own thin item; render kill on roles.
- 02:21 Coach FAIL #404 r5: painted must == stored == main after any drag sequence (826 vs 820 FAIL); r6: fix + two-drag exact-pin kill + restore toBe(792/406/370) (loosening own kill asserts = FAIL) + cites; r6 asked of Lead incl. rebase on 0898c3b9. Remaining 12 r5 mutants finishing.
