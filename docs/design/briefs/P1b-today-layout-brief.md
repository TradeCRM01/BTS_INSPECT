# P1b Today layout rebuild brief (Coach sign-off pending, 2026-10-23)
Base: main 30cb09d9 (#398 merged), own branch (e.g. `design/p1b-today-layout`). This is a layout and data rebuild of `/`, not a recolour. Use the **Light** mockups only: `design/directions/4-dark-light/dashboard-390-light.png`, `dashboard-1280-light.png` (HTML: `_src/boards/cmp4-dashboard-{390,1280}.html`). Dark stays gated on allowDark.
Binding visual spec: `design/briefs/P1b-today-layout-spec.md` (BTS UI, written in parallel; **it did not exist when this brief was finished, 19:50 AEST**). Where the spec and this brief disagree on pixels, the spec wins. On data, structure, kills and acceptance, this brief wins.
Merge order: **P1b merges next**, then LOOK-GATE (already in build), then P2 Schedule (being rescoped to the Schedule mockups). Building in parallel is fine. Merge one at a time, each rebased onto the new main with a fresh precheck.

## Why
Jack expected the new layout from the agreed mockups. #398 kept the old structure (reminders strip, then "Today's schedule" ledger, then the widget grid) and only recoloured it. P1b builds the mockup structure on real data.

## Off-limits
- No new tables, columns, RPCs, migrations, RLS or edge-function changes. No DB writes, except the seeds named in Live prove.
- Shell nav is already as ruled on main (phone: Today/Schedule/Jobs/More `appShellPhoneNav.ts:13–16`; 768+: Today/Jobs/Field/Money/Stock `brand.ts:6–12`). **Do not copy the mockup's 1280 nav** (Today/Schedule/Jobs/Quotes/Invoices/Clients/More). No changes to AppShell.tsx or appShellPhoneNav.ts.
- No changes to widget components' behaviour (`src/widgets/*`) except the opt-in prop noted in Q6. No change to nudge rules (`src/lib/nudges.ts`) beyond adding the one new kind in N4.
- tokens.css is untouched. Every colour comes from existing `--g-*` tokens.
- No fake, demo or placeholder figures in prod. A section with no data shows its empty state. `?look=` seeds are allowed only behind the existing gate `DashboardPage.tsx:507` `(import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1')`.

## Findings on 30cb09d9 (read-only; schema from information_schema, project ezszahvwwmbuekpedumf)
- F1 **CashFlowWidget is broken in prod.** `IntelligenceWidgets.tsx:368–371` selects `invoices.paid_at`, which does not exist (payments live in `invoice_payments.paid_at`). PostgREST rejects the whole select. There is no error check (`:376`), so "In" always paints $0. It also treats `updated_at` as the payment date and counts POs *created* as "Out". **The KPI strip and chart must not reuse this query.** Fix it, or retire it into the new cash-flow section, only if Coach says so (Q5).
- F2 Nudge invoices query `DashboardPage.tsx:473–476` selects `status in (sent, overdue)` only. Part-paid overdue invoices never nudge, even though `nudges.ts` invoiceChase handles them. Out of scope unless Coach says so (Q7).
- F3 Nothing in src has a "ready to invoice" or "uninvoiced job" concept (grep is empty). jobs has no completed_at column. invoices.job_id exists.
- F4 `dashboardHeadingDate` (`dashboardHome.ts:34`) prints 'EEEE d MMMM' with no time. The mockup eyebrow needs `· 13:40`.
- F5 Every date key is device-local (`dashboardTodayKey` `dashboardHome.ts:29`). `companies.time_zone` exists but is not used. P1b keeps device-local (Q8).
- F6 The default seeded widgets are upcoming_jobs, outstanding_invoices and compliance_deadlines (`dashboardWidgets.ts:13–17`). Two of them now duplicate new sections (Q6).
- F7 jobs_tomorrow rolls up only when there are more than 3 jobs (`nudges.ts:289`). The mockup's "2 jobs tomorrow" would render on main as 2 separate rows (Q4).
- F8 tsc baseline re-counted on 30cb09d9: `npx tsc -p tsconfig.app.json --noEmit` = **180** errors.
- F9 Chromium mocks `s2Shell.chromium.mocks.ts:156–180` ignore every filter (`eq/gte/in` return the chain unchanged). A KPI kill against them cannot catch a wrong filter. P1b must make them filter (see Kills K0).

## 1. Section map: mockup → real data → source (main 30cb09d9 file:line)
All queries run as `authenticated` under RLS SELECT `company_id = (select profiles.company_id where id = auth.uid())`. New queries also add `.eq('company_id', companyId)`. Every new query checks `error` and throws. Money = `formatMoney`, incl GST.

| # | Section (390 / 1280) | Exact figure / rows | Source |
|---|---|---|---|
| S1 | Eyebrow "MON 19 OCT · 13:40" / "MONDAY 19 OCTOBER · 13:40" | device-local now, 24h HH:mm, ticks each minute | NEW pure helper next to `dashboardHeadingDate` `dashboardHome.ts:34`. No query |
| S2 | Title "Today" | `NAV_WORDS.today` | `DashboardPage.tsx:7,970–974` (keep the P1-today-mark kill) |
| S3 | Whisper "5 jobs · 4 crew out" / "Northside Plumbing & Gas · 5 jobs · 4 crew out" | jobs = `todaysDashboardJobs(...).length`. Crew out = **D2**. 1280 prefixes `company.name` | todayJobs query `DashboardPage.tsx:647–693`. Whisper today `:960–964,975` |
| S4 | Header actions (768+): Week board → `/schedule`. New job | Week board = the existing Link `:977–995` (copy "Week board"). New job opens `JobFormModal` (`components/crm/JobFormModal`, as `JobsPage.tsx:835`) in place. ⋯ More (Customize/Done editing) stays (`DashboardHomeMore :996–1001,1323`) | no query |
| S5 | NOW card (phone, see Q2 for 768+) "NOW · 13:00–14:00 / title / #ref · client · crew", Directions, Open job | the job picked by **D3** from todayJobs. Directions = `https://www.google.com/maps/dir/?api=1&destination=<encodeURIComponent(address)>`, where address = job.address, else client.address. Hidden if both are empty. Open job → `/jobs/:id` | todayJobs `:647–693`. `formatJobRef`, `dashboardCrewLabel` `dashboardHome.ts:89`. NEW pure helper for the maps URL (no helper exists on main) |
| S6 | Outstanding $3,579.65 + "$462.00 overdue" (phone card, 1280 KPI 1 + "· 3 invoices") | **D1** | reuse the query shape of `WidgetComponents.tsx:858–873` (`invoices id, invoice_number, status, total, amount_paid, due_date`, status in sent/overdue/part_paid) plus `invoiceBalanceOwed` / `invoiceCountsAsOverdueMoney` `invoiceOpenBalance.ts:29,46`. New query key `['today-outstanding']`, adds `client_id` for S10 |
| S7 | KPI "Ready to invoice · 2 jobs · #0036 and #0037" | **D4** | **NEW Q-A** |
| S8 | KPI "In, last 7 days $4,214.30 · Out $1,862.75" | In = **D5**, Out = **D6** | **NEW Q-B, Q-C** |
| S9 | KPI "Net, last 7 days $2,351.55 · Tue 13 to Mon 19 Oct" | In − Out. Range label = today−6 … today | derived from Q-B/Q-C |
| S10 | Today's jobs (phone timeline / 1280 table: Time · Job + "#ref · client · crew" · Place · Status). "Week" / "Schedule ›" link → `/schedule` | rows = `todaysDashboardJobs` (not cancelled; scheduled today, plus any in_progress) sorted as main. Time = `dashboardClockLabel` (`dashboardHome.ts:59`). Phone stacks start over end. Place = `dashboardJobSuburb/Place` `:77–87`. Crew = `dashboardCrewLabel`. Pill = **D7** | todayJobs `:647–693`, crew `get_company_members` `:628–645`, current ledger `:1064–1130` (replaced) |
| S11 | Needs you (phone list / 1280 side column with count) | `deriveNudges(...)` (`nudges.ts:402`, loader `DashboardPage.tsx:462–501,715–722`) plus a NEW kind `ready_to_invoice` from Q-A (one item: "N jobs ready to invoice", detail "#a and #b", href `/jobs?status=completed`, or `/jobs/:id` when N=1). Count = items shown. Copy = main's nudge strings, unchanged (Q4) | existing + Q-A |
| S12 | Reminders (capture + list) below Needs you | unchanged: `listReminders` `:697–701`, capture `:724–750`, rows `:1004–1045` | existing |
| S13 | 1280 row: Outstanding list "#0112 Sarah Whitfield · Due Fri 30 Oct · $1,929.65" (All › → `/invoices`) | top 3 open invoices from S6, ordered by `created_at desc` (as the widget). Shows client name (clients `id,name` in(client_id)), due text ("Due EEE d MMM" / "N days overdue") and balance owed | S6 query + clients lookup (same as `WidgetComponents.tsx:628`) |
| S14 | 1280 row: Cash flow "7 days" In/Out/Net + per-day bars Tue…Mon (In = ink, Out = muted) | per-day sums of Q-B by paid_at and Q-C by expense_date. 7 buckets, zero-filled | NEW Q-B, Q-C (same rows as S8; one fetch) |
| S15 | 1280 row: Coming up "Tue 20 · Toilet cistern replacement · 07:30 · Gwen Albright · Kedron — Tom" (Week › → `/schedule`) | next 3 jobs after today | **NEW Q-D** |
| S16 | Your widgets | the user's `dashboard_widgets`, unchanged (`:534–613`, view grid `:1192–1208`) | existing |

### NEW QUERIES (need Coach approval, all read-only, existing tables, role `authenticated`, existing RLS)
- **Q-A Ready to invoice.** (1) `jobs` select `id, job_number, parent_job_id, title, status, scheduled_date, client_id`, filter `company_id = :co`, `status = 'completed'`, `scheduled_date >= today−30` (window per D4), order `scheduled_date desc`. (2) `invoices` select `id, job_id, status`, filter `company_id = :co`, `job_id in (ids from 1)`, `status <> 'void'`. Result = jobs in (1) with no row in (2). RLS: jobs/invoices company policy.
- **Q-B In.** `invoice_payments` select `amount, paid_at, invoice_id`, filter `company_id = :co`, `paid_at >= today−6`, `paid_at <= today` (date column). RLS: invoice_payments company policy.
- **Q-C Out.** `expenses` select `total, expense_date, status`, filter `company_id = :co`, `status in ('recorded','paid')`, `expense_date between today−6 and today`. RLS: expenses company policy.
- **Q-D Coming up.** `jobs` select `id, job_number, parent_job_id, title, status, scheduled_date, start_time, end_time, address, assigned_team, client_id`, filter `company_id = :co`, `scheduled_date > today`, `status in ('scheduled','in_progress')`, order `scheduled_date, start_time`, limit 3. Clients `id, name, address` in(client_id).
- **Q-E (column add, existing shape)** S6: `invoices` select `id, invoice_number, status, total, amount_paid, due_date, client_id, created_at`, `status in ('sent','overdue','part_paid')`, `company_id = :co`. No limit (the totals need every open invoice).

### Definitions (every one marked ⚑ needs Coach to confirm)
- **D1 Outstanding** ⚑ = Σ `invoiceBalanceOwed` (total incl GST − amount_paid, floored at 0) over invoices with status sent/overdue/part_paid. **Overdue** ⚑ = the same sum restricted to `invoiceCountsAsOverdueMoney` (status overdue, or due_date < today and open). "N invoices" ⚑ = count of open invoices with balance > 0. Drafts and void are excluded. This matches the existing widget.
- **D2 Crew out** ⚑ = distinct non-empty member ids across `assigned_team` of today's listed jobs whose status is not cancelled (completed jobs count, because the crew went out). The alternative is in_progress/scheduled only.
- **D3 NOW job** ⚑ (company-wide, not just the viewer): among today's jobs with status ∉ {completed, cancelled}, pick the one with `start_time ≤ now < end_time`. Ties go to in_progress first, then the latest start. Else take any `in_progress` job (label "NOW · On site"). Else take the next job starting later today (label "NEXT · HH:mm–HH:mm"). Else no card (show the empty line "Nothing on right now"). A job with no end_time counts as start + 1h. A job with no start_time is never NOW. ⚑ Should a crew-role viewer see only jobs they are on?
- **D4 Ready to invoice** ⚑ = job status `completed`, with no invoice row on `invoices.job_id` other than void, scheduled within the last 30 days. ⚑ Does a **draft** invoice count as invoiced? (Proposed: yes, so draft excludes the job.) ⚑ Window: 30 days, or all time? ⚑ Child visits (parent_job_id): are they invoiced on the parent? (Proposed: exclude a child whose parent has a non-void invoice.) The secondary line lists up to 2 refs ("#0036 and #0037"), then "+N".
- **D5 In, last 7 days** ⚑ = Σ `invoice_payments.amount` where paid_at ∈ [today−6, today], device-local dates. Refunds and credit notes don't exist. Payments on void invoices are still counted ⚑.
- **D6 Out, last 7 days** ⚑ = Σ `expenses.total` (incl GST) where status ∈ {recorded, paid} and expense_date ∈ [today−6, today]. POs are **not** counted (unlike CashFlowWidget). ⚑ Drafts excluded? Wages (cost_class/employee_cost_type) included?
- **D7 Status pill** ⚑ precedence: completed + D4-uninvoiced → "Ready to invoice" (green). completed + invoiced → "Done". in_progress → "In progress" (ink). scheduled with no crew (`jobCrewScheduleStatus` = "Needs crew", `jobCrewScheduleStatus.ts:18`) → "Needs crew" (amber, meta reads "No crew yet" ⚑ vs main's "Unassigned"). scheduled with crew → "Booked". `required_crew_count` is ignored, matching main ⚑.
- **D8 Needs you count** = the number of items rendered (nudges ≤ NUDGE_LIMIT 6, plus the ready-to-invoice item).

## 2. Widget reachability (nothing silently dropped)
- Saved widgets keep rendering in **"Your widgets"** below reminders (S16), at every width, in the view grid `:1192–1208`. Edit mode is unchanged: ⋯ → Customize → phone `DashboardPhoneEditStack` (<768, `:1151,1260`) and desk dnd canvas `FreeWidget` (md+, `:1165–1189,1374`). WidgetPicker `:1217–1224,1464–1547` lists all non-retired types (`dashboardWidgetPickerTypes`, `dashboardWidgets.ts:393`). New sections are fixed page chrome, not widgets. They are not in the picker and cannot be removed (Q6).
- In edit mode the new sections S5–S15 stay visible above the canvas (so the user sees what is fixed). Only "Your widgets" is editable.

| widget_type (registry.ts line) | Where it lives after P1b |
|---|---|
| recent_inspections :25, templates :35, inspection_stats :45, pending_reports :55, weather :66 (config), clock :78, calendar :88, calculator :98, activity_feed :109, quick_actions :119, client_stats :140, open_pos :151, low_stock :161, revenue_overview :181, industry_news :202, compliance_deadlines :212, kpi_scorecard :232, team_activity :242, agent_reminders :252, agent_activity :262, ai_agent :191 | Your widgets (below the fold). Picker + edit unchanged |
| upcoming_jobs :130 | Your widgets. It overlaps Coming up (S15) but is not removed (Q6) |
| outstanding_invoices :171 | Your widgets. It overlaps S6/S13 but is not removed (Q6) |
| cash_flow :222 | Your widgets. Still broken (F1) unless Coach rules (Q5) |
| retired bitcoin/crypto/stock_market :279 | stay hidden, as main |
| Reminders (not a widget) | S12, below Needs you, at all widths |
| Nudges | merged into Needs you (S11). The old "From your jobs, quotes and invoices" block `:1046–1061` is removed. Every nudge kind still renders there |
| Schedule ledger | replaced by Today's jobs (S10). "Open schedule"/"Week board" link kept |
| Crew | crew names in S3/S5/S10/S15 via `get_company_members` `:628–645`. Needs crew pill kept |
| AI widgets (ai_agent, agent_reminders, agent_activity) | Your widgets |

## 3. Breakpoints and section order
Header and nav as main: title "Today" everywhere. Phone tabs Today/Schedule/Jobs/More; 768+ top nav Today/Jobs/Field/Money/Stock.
- **375 / 390**: S1 eyebrow → S2 title + ⋯ → S3 whisper → S5 NOW → S6 Outstanding card (+ overdue right) → S10 Today's jobs timeline (+ Week link) → S11 Needs you → S12 Reminders → S16 Your widgets. No KPI strip, no S13–S15 (Q3). No header buttons. New job lives in ⋯ (Q3).
- **768**: S1 → S2 + S4 actions (Week board, New job, ⋯) → S3 → S5 NOW (Q2) → KPI strip 2×2 (S6, S7, S8, S9) → S10 table (Time/Job/Status; Place folds into meta) → S11 full width → S13, S14, S15 stacked → S12 → S16.
- **1024**: as 1280, but Needs you column min 280px. Bottom row S13/S14/S15 in 3 columns. Fall back to 2+1 if the spec says so.
- **1280**: S1 → S2 + S4 → S3 (with company) → KPI strip ×4 → [S10 table | S11 column] → [S13 | S14 | S15] → S12 → S16. No NOW card (mockup), see Q2.

## The bar (same as P1/P2)
- Off cream: no cream surface or ink (cream = L*>88 with b* 2.5–12). No navy (L*<35, hue 235–285, C*≥12). Only `--g-*` tokens. The amber/green pill colours are existing pill tokens (spec names them).
- CTA (New job, Directions, Open job, Week board) text/background ≥4.5:1. All secondary/muted text (eyebrow, meta, KPI sublines, dates, bar labels) ≥7:1.
- Every visible nav and title word comes from `NAV_WORDS`.
- Overflow 0 at 375/390/768/1024/1280 in view and edit: `documentElement.scrollWidth ≤ innerWidth` and max `rect.right ≤ innerWidth` over every node, **header included**, and every node's right ≤ its nearest clipping ancestor's right (KPI money, long client names, long refs).
- `data-theme=dark` with allowDark false → 0px pixel change at all 5 widths, view and edit.
- Every tap target ≥44×44 (rows, pills when linked, KPI cards when linked, Needs-you items, chart has no taps).
- `?look=` seeds only behind `DashboardPage.tsx:507` gate. In a prod build without the flag, `/?look=today-*` renders live data.

## Kills (behavioural; real render in Chromium over built dist; each with a paired real-file mutant that must turn it red)
K0 harness: extend `s2Shell.chromium.mocks.ts` so `from()` **applies** eq/neq/in/gte/lte/gt/lt/order/limit to the seeded rows and **records** (table, select columns, filters). Seed jobs, clients, invoices, invoice_payments, expenses, agent_reminders, quotes with known values (`TODAY_FIXTURE` below). Freeze the clock with `page.clock` at Mon 19 Oct 2026 13:40 local. Assertions are on rendered text and rects, pixels and call counts. **Never** grep source or read computed style.

| Kill | Asserts | Paired mutant (real file) |
|---|---|---|
| K1 kpi-outstanding | S6 text = "$3,579.65" and "$462.00 overdue" (+ "3 invoices" at 1280). The fixture includes one part_paid, one draft and one void that must be excluded | drop `'part_paid'` from the S6 status list. Make `invoiceBalanceOwed` return total |
| K2 kpi-ready | "2 jobs", "#0036 and #0037". The fixture holds a completed job with a draft invoice (excluded per D4), one with a void invoice (included), and one 40 days old (excluded) | remove the `status <> 'void'` filter. Remove the window |
| K3 kpi-in-out-net | In "$4,214.30", Out "$1,862.75", Net "$2,351.55", range "Tue 13 to Mon 19 Oct". Fixture: a payment on day −7 and an expense dated tomorrow (both excluded), a draft expense (excluded) | `gte(today−7)`. Add `'draft'` to expense statuses. Net = In + Out |
| K4 chart | 7 bars. The Mon bar height ratio In:Out equals the fixture ratio ±1px. The zero day has 0-height bars | shift the day bucket by 1 |
| K5 now-card | at 06:59 → NEXT 07:00 job. At 13:40 → the 13:00–14:00 job. At 14:00 → no "13:00" job (end exclusive). With an in_progress job and nothing timed → "On site". At 23:00 with nothing left → empty line. The card's job id equals Open job's href | `<=` on end. Drop the in_progress tie-break |
| K6 directions | href = maps URL of job.address. Falls back to client.address. Hidden with neither | swap the fallback order |
| K7 pills | each row's pill text per D7. "Needs crew" only on scheduled + empty assigned_team. A crew-filled row never shows it. The amber pill pixel = token | flip the `jobCrewScheduleStatus` crew>0 test |
| K8 whisper | "5 jobs · 4 crew out" (fixture has duplicate crew across jobs and one cancelled job) | count crew with duplicates |
| K9 needs-you | items and order = deriveNudges + ready_to_invoice. Count badge = items. Each item's href navigates | drop the ready_to_invoice push |
| K10 coming-up | 3 tiles, next days only, today's jobs excluded, cancelled excluded | `gte` instead of `gt` |
| K11 empty | zero rows in every table → each section shows its empty state. No "$0.00"-faked KPI shows a demo value. NOW shows the empty line. No console error | hardcode a fallback number |
| K12 widgets-reachable | for all 24 registry types plus reminders and nudges: seeded rows render in view at 390 and 1280. Edit → Customize → picker lists every non-retired type. Adding one inserts once (call count). Remove/move still persist (call count) | filter a type out of the "Your widgets" render |
| K13 schema | every recorded select column and filter column ⊂ `docs/schema/p1b-columns.json` (snapshot from information_schema, committed). This turns red on `paid_at` against invoices | add `paid_at` to the Q-E select |
| K14 bar | palette, contrast, overflow (incl clipping ancestor), dark-0px, hit ≥44, nav words, at 5 widths, view and edit (extend the P1 kills to the new nodes) | reuse the P1 mutants on the new classes |
| K15 order | section top order per §3 at each width (rect.top monotone, by section test-id) | swap S10 and S11 in JSX |
| K16 look-gate | prod build without the flag: `/?look=today-seed` renders live fixtures, not look rows | remove the gate |

TODAY_FIXTURE must reproduce the mockup figures exactly (the numbers above), so the before/after frames read like the mockup.

## Gates
- One run: `./gates.sh` = `npm run build` → `npx vitest run --maxWorkers=2` → `npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts` (Chromium). Paste all three tails.
- `npx tsc -p tsconfig.app.json --noEmit` ≤ **180** (main 30cb09d9, re-counted 2026-10-23). The normalised error list adds no new entries.
- Stubbed unit tests (vitest) assert their selected columns against `docs/schema/p1b-columns.json` (K13), so a stub can never pass a column that the real DB rejects.
- No new deps.

## Live prove (company 40183ed1 only)
- Seeds (all names end "— delete ok"; list them with ids in the PR; Coach deletes after): a client "P1b Kedron Medical — delete ok"; today jobs: 1 in_progress (13:00–14:00, with crew, address), 1 scheduled with crew, 1 scheduled no crew (Needs crew), 1 completed uninvoiced (Ready to invoice), 1 completed with a sent invoice; 1 job tomorrow and 1 the day after (Coming up / jobs tomorrow); invoices: 1 sent future due, 1 overdue, 1 part_paid; 1 invoice_payment dated today−2; 1 expense (recorded) dated today−1; 1 sent quote quiet ≥5 days (Chase quote); 1 reminder. Every card type then has a real row.
- Frames at 375/390/768/1024/1280 × view and edit, on the deployed preview, logged in to 40183ed1. Plus **before (main) / after** frames at 390 and 1280 for Jack.
- Live check: each KPI number equals a hand SQL read-out (read-only select, posted beside the frame).

## Frames
`docs/look/p1b/` : `today-{375,390,768,1024,1280}-{view,edit}.png`, `before-{390,1280}.png`, `after-{390,1280}.png`, `live-{390,1280}.png`. Capture script `scripts/capture-p1b-today-look.mjs`.

## Acceptance
- §1 every section renders from the named source. No demo fallbacks in prod.
- §2 every widget type is reachable. Edit and picker work at phone and desk.
- §3 order holds at all 5 widths. Nav is as ruled and the title is "Today".
- The bar passes. K0–K16 are green, and each paired mutant turns its kill red.
- Gates pass in one run. tsc ≤180. Live frames show real rows for every card.

## Out of scope
- Dark. Nav changes. Schedule page (P2). Company time zone (F5). Fixing nudge part_paid (F2) and CashFlowWidget (F1) unless Coach rules otherwise. Widget redesign. Seeding changes. Money role gating.

## Open questions for Coach
1. Confirm D1–D8 (⚑ above), especially D4 (draft invoice = invoiced? 30-day window? child visits) and D6 (expenses only, no POs, drafts out).
2. NOW card at 768/1024/1280? The mockup has it on phone only. Proposed: phone + 768, not 1024+.
3. Phone: no KPI strip and no Outstanding list/Cash flow/Coming up (as mockup)? And New job only in ⋯ on phone?
4. Needs you copy: keep main's nudge strings and the rollup >3 (so "2 jobs tomorrow" shows as 2 rows), or change to the mockup copy/rollup (a behaviour change in nudges.ts)?
5. CashFlowWidget (F1): fix in P1b to use Q-B/Q-C, or leave it broken and ticket it separately?
6. Duplicate widgets (upcoming_jobs, outstanding_invoices, cash_flow) for users who have them: leave them (proposed) or hide them? Leave the default seeding unchanged?
7. Fix nudge part_paid gap (F2) in P1b? Proposed: no.
8. Device-local dates (F5) acceptable for "today", "last 7 days" and NOW?
9. Should crew-role users see company money (KPIs, Outstanding, Cash flow) on Today? RLS allows it today. There is no role gate.
