# P1b spec cross-check (CoS, 23 Oct 2026, 20:05 AEST)
Inputs: brief `P1b-today-layout-brief.md`, `.coach-sign` (19:58), spec `P1b-today-layout-spec.md` (566 lines), crops `P1b-crops/` (01–09 present, as in the spec's table). Read-only checks against main 30cb09d9 used `git show` in the existing `/workspace/BTS_INSPECT` checkout. Nothing was modified.
Precedence: the brief wins on data, structure, kills and acceptance. The spec wins on pixels, tokens, type and states. **New Coach rule (P2 sign, 19:59):** where the mockup and BTS UI's earlier LOOK additions conflict, the mockup wins, and Jack's own locks beat both.

## 1. sha check
- `sha256sum P1b-today-layout-brief.md` = `3e890d189027ac52d87f814cd5cf7612d74ce4ede928748cee9d3c9c02a3787e`. It starts 3e890d189027 and **matches** the pin in `.coach-sign` line 1. The brief's line 1 still reads "sign-off pending", which is cosmetic.
- Rulings match the CoS summary, with 2 wording differences:
  - (a) Q5 in the sign says only "CashFlowWidget uses Q-B/Q-C + kill". The detail "In>0 on seeded payment + mutant" is not in the file.
  - (b) Q9 in the sign says "crew sees NOW, jobs, Needs you without $ items". "No $ anywhere" is broader than the file, which scopes the gate to the new sections.

## 2. CONFLICTS (11)
| # | Spec | Brief / ruling | Winner |
|---|---|---|---|
| C1 | §0 l34, pass l512: REMOVE the black "Today" bar `header.dashboard-home-sheet-bar` (the mockup has no bar) | Brief S2 l33 "keep the P1-today-mark kill". On main that kill (`p1Dashboard.chromium.kill.tsx:2055`) asserts `.dashboard-home-mark` = the **black bar** text (`DashboardPage.tsx:970–972`) | **needs Coach** (procedural). Recommendation: keep the bar removal (mockup), and retarget the kill to the single h1 with the same NAV_WORDS mutant. Lead must also update the static tests that assert the class (`dashboardPage.test.ts:153,175`, `dashboardLaptopLook.test.ts:23,70`, `sheetWidthLaptopLook.test.ts:16`). Scope the CSS removal to `/`, because RemindersPage:113 and ReminderEditPage:183 reuse the bar |
| C2 | No role gate anywhere. The phone S6 money block (l216–238), the KPI strip (l240), S13 and S14 render for everyone. Needs you shows every nudge (l348). No crew state or layout is specced | Sign Q9 l3: KPI strip, Outstanding and Cash flow are owner/admin only. Crew sees NOW, jobs and Needs you **without $ items**. Kill both roles | **Ruling wins.** Spec must add crew states: S6 phone block, S6–S9, S13 and S14 not rendered (no gap). Grid3 at T/D then holds S15 only (spec the layout). The Needs-you count = rendered items (D8). **needs Coach** on the exact crew Needs-you set: invoice_unpaid details carry formatMoney (`nudges.ts:387–392`), and quote_chase single-item details carry $ (`:338,:351`) but rollups do not. Hide those kinds, or show them with $ stripped? Also, does Q9 reach saved $ widgets (revenue_overview, outstanding_invoices, cash_flow)? Q6 says leave widgets unchanged |
| C3 | l110, l167: at 768, S4 actions sit on their own row **under S3** | Brief §3 l86: 768 = "S2 + S4 actions → S3". K15 checks rect.top order | **Brief wins** (structure). There is no 768 mockup |
| C4 | l308, A12: phone S10 meta "ref · suburb · crew" (mockup) | Brief S10 l41: "#ref · client · crew" | **Brief wins** (data). Show the client at P. Coach may waive |
| C5 | l351, A15: Needs you capped at P 3 / T–D 4, with a "Show all N" expander | Brief S11 l42 "Count = items shown". D8 (confirmed) = nudges ≤6 + ready item, all rendered. K9 asserts all items | **Brief wins.** Keeping the cap needs D8/K9 amended (Coach) |
| C6 | l285, l323: Place column only at ≥1200, so at 1024 Place folds into meta | Brief §3 l87: "1024: as 1280" | **Spec wins** (pixel fit, and the data stays in meta). Brief K15/frames should note it |
| C7 | §1 l73, A18: "$462.00 overdue" and "10 days overdue" become **warn pills**, a deviation from the mockup | Mockup: amber text. New rule: mockup beats BTS additions. But P2 sign rule 4 keeps "green/amber only on pills/icons", and that is a Coach rule | **needs Coach.** Both options pass contrast (`--g-warn` #7A2E03 on bg = 8.69:1) |
| C8 | l287, A4: the phone M2 stack is "binding over mockup", with no 64px time column | The mockup has a 64px time column. M2 comes from the P2 brief bar (BTS LOOK 9). It is not a Jack lock (Jack's 6 Oct lock is the Schedule phone list). The P2 sign superseded LOOK 4/10, not 9 | **needs Coach** (new rule vs a still-standing M2 bar) |
| C9 | A8, §2: type snapped to the ramp (15→16, 15→14, 17→16, 28→24, 44→40) | New rule: mockup px beat BTS additions | **Mockup wins** (literal px in the page stylesheet, as A3 already does for 24; tokens.css untouched), unless Coach says the Geist ramp is a Jack lock |
| C10 | l407: Out bars `--g-chart-2` #A1A1AA = **2.35:1** on bg (2.56 on surface). "Numbers carried in text + sr-only table" | The brief bar has no non-text rule, so this is no brief breach. But WCAG 1.4.11 needs 3:1 for graphics needed to read the chart. Visible text gives only 7-day totals. Per-day values sit only in the **sr-only** table, which sighted low-vision users cannot see. **So it does not satisfy 1.4.11** | **needs Coach** (bar question). Options: use `--g-ink-muted` for Out bars (9.59:1, still distinct from ink In), or show the per-day table visibly. Spec nit: Out is named both `--g-line-strong` (l60) and `--g-chart-2` (l68); both are #A1A1AA |
| C11 | Stale branches: "If D6 is not approved" (l267, l400). DC5 says "expenses not in allowed list" (l465, l560). S16 cash_flow is called "broken" (l476) | Sign: D6 and Q-C approved, F1 fixed in P1b (Q5), F2 fixed (Q7) | **Rulings win.** Delete the D6-refused states, and mark cash_flow as fixed via Q-B/Q-C |

Notes that are not spec conflicts, for Coach/Lead:
- **Q-E "sums server-side"** vs brief off-limits "no new RPCs" (l10) and D1's per-invoice floor at 0. A PostgREST aggregate cannot floor per row, and aggregates may be disabled. Coach should say whether a client-side sum over the uncapped Q-E rows meets the intent.
- **mapsHref verified:** `src/lib/clientRecords.ts:178` on 30cb09d9 exports `mapsHref` = `https://maps.google.com/?q=…` (used by OpsCard). So the brief's "no helper exists on main" (l36) is wrong in letter. But mapsHref is a search URL, not a directions URL, so A9 (new dir helper, as the brief says) stands.
- **Tokens checked** on 30cb09d9:
  - muted #3F3F46: 9.59:1 on `--g-bg` #F5F5F7, 10.44 on surface, 8.78 on surface-2. All ≥7:1, so the spec's claim is correct.
  - link: 7.90:1.
  - CTAs (inverse, and Week board ink on surface): 19.79:1.
  - pill text: ok 7.20, warn 8.15, draft 8.93, sched 9.30.
  - bg is neutral (not cream). No navy is used.
- **Nav** in the spec matches the ruling (l45: shell unchanged, the mockup's 1280 nav not copied). The spec covers overflow at 5 widths, dark 0px and ≥44 taps. **Phone order** (l105–117) matches brief §3: eyebrow, h1+⋯, sub, NOW, Outstanding, jobs, Needs you, Reminders, widgets, and no KPI strip. Outstanding on phone is per brief/Q3, but owner/admin only per Q9 (C2). 768 = 2×2 KPI + NOW, and 1024+ = 4 KPI with no NOW, both match Q2 and §3.

## 3. DC1–DC11
- **DC1 Crew out:** D2 confirmed. Distinct non-empty member ids across `assigned_team` of today's listed jobs whose status is not cancelled. Completed jobs count. (brief l58; sign l2)
- **DC2 NOW:** D3 confirmed, company-wide (Q9 gives crew NOW with no viewer filter).
  - Picks the job with `start ≤ now < end`. Ties go to in_progress first, then the latest start.
  - Else any in_progress job ("On site"). Else the next job today ("Next"). Else the empty line.
  - No end_time counts as start+1h. No start_time is never NOW.
  - Shown on phone + 768 only (Q2). (brief l59; sign l2–3)
- **DC3 Ready to invoice:** D4 as ruled.
  - Any non-void invoice, drafts included, counts as invoiced. 30-day window.
  - Child visits roll up to the parent, which counts **once, when all visits are complete**. This replaces the brief's proposal at l60.
  - New nudge kind `ready_to_invoice` per brief S11 (Q-A approved).
  - Lead note: "all visits complete" needs the sibling visits regardless of status. Q-A(1) as written selects only completed jobs, so it needs a read-only jobs lookup by `parent_job_id`.
  - **OPEN (minor):** which date the 30-day window uses for a rolled-up parent (proposed: the latest visit). (sign l2; brief l50, l60)
- **DC4 In:** D5 confirmed. Σ invoice_payments.amount, paid_at in [today−6, today]. Payments on void invoices are counted. Device-local dates are OK (Q8, F5 ticketed). (brief l61; sign l2–3)
- **DC5 Out/Net:** D6 ruled. Expenses recorded+paid, incl GST. No drafts, POs or wages. Label "Out". Q-C approved, so S9, the Out stat and the Out bars stay (the spec's "not allowed" is moot).
  - Lead note: excluding wages needs a filter that Q-C does not yet have (cost_class/employee_cost_type, brief l62). Its columns must be in `p1b-columns.json` (K13). (sign l2)
- **DC6 Needs crew seed:** decided by brief Live prove l130 ("1 scheduled no crew (Needs crew)"). D7 confirmed: the meta reads "No crew yet".
- **DC7 Rollup/copy:** Q4. Keep main's nudge strings and the rollup >3, so "2 jobs tomorrow" renders as 2 rows. Mockup copy is not adopted. (sign l3)
- **DC8 Coming up:** Q-D approved. `scheduled_date > today` (today excluded). Status scheduled or in_progress, so future-dated in_progress counts. Cancelled is out. Limit 3. K10. (brief l53, l113; sign l2)
- **DC9 Chart buckets:** brief S14 l45. Per-day sums of Q-B by paid_at and Q-C by expense_date. 7 device-local buckets, zero-filled. K4. (sign l2–3)
- **DC10 cash_flow widget:** Q5. Fix F1 in P1b on Q-B/Q-C with a kill (the file does not give the kill detail). Q6: leave saved widgets and default seeding unchanged. Also Q7: fix the F2 part_paid nudge query, with a kill. (sign l3)
- **DC11 Crew money:** Q9. KPI strip, Outstanding (incl the phone S6 block) and Cash flow are owner/admin only (a UI gate). Crew sees NOW, jobs and Needs you without $ items. Kill both roles. Jack may override. **OPEN for Coach:** see C2 (quote_chase/invoice items for crew; saved $ widgets). (sign l3)

OPEN: DC3 window date for a rolled-up parent (minor) and the DC11 crew details. Neither is fully decided.

## 4. AMBIGUOUS defaults that conflict
- **A4** → C8 (needs Coach).
- **A7** legend swatches: an addition that is not in the mockup. Per the new rule, drop them unless Coach keeps them as part of the C10 fix.
- **A8** → C9 (mockup wins).
- **A11, and A15's S11 caps** → C5 (brief wins). The A15 S10 cap is fine: the fixture has 5 jobs, under the cap of 6.
- **A12** → C4 (brief wins).
- **A18** → C7 (needs Coach).
- No conflict: A1, A2, A3, A5, A6, A9, A10, A13, A14, A16, A17. A5 matches brief §3 "1024 as 1280", and A16 matches Q2. A10 is fine for owner/admin; for crew the S6/S7 links are gone.
- Spec-internal nit: S5 loading uses `--g-skeleton` (l202), but A1 and L15 require `--g-surface-2`.

## 5. OK to release to Lead
**No** for the visual layer. Two things are needed first:
- Coach rulings on C1, C2 (crew details), C7, C8 and C10.
- BTS UI spec edits for C2–C5, C9 and C11.

The data layer and kills are already GO per sign l4.

## Coach rulings 2026-10-23 20:02 AEST (visual layer RELEASED under these)
- C1: Approved. Retarget P1-today-mark kill to the h1 (same mutant); update the 5 static tests; remove the bar on / only. Kill: Reminders pages still render the bar.
- C2: Crew sees no $ anywhere. (a) Invoice and quote-chase nudges are hidden from crew entirely (not shown without the amount). (b) Saved $ widgets are hidden from crew at render; saved config untouched (Q6 holds). Kill: crew render of / has no currency glyph and no $ widget.
- C7: Warn pill wins. Amber only on pills and icons.
- C8: Mockup 64px time column wins at 375/390 IF the M2 no-overflow kill passes (0px into the Job column at 375 and 390); otherwise fall back to the M2 stack. The no-overflow kill is the lock.
- C10: Out bars drawn in muted #3F3F46. In as per the mockup, and also >=3:1.
- Q-E: No new RPC. Sum client-side with a per-invoice floor at 0 over the FULL non-void outstanding set (amount fields fetched uncapped under RLS); cap only the display list. Kills: mutant removing the floor goes red; mutant summing only the capped list goes red.
- Open: a rolled-up parent's 30-day window uses the completion date of its last child visit.
- The six self-resolved items are accepted (C3, C4, C5 brief wins; C6 spec wins; C9 mockup type sizes; C11 rulings win).
