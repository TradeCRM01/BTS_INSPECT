# P3 Jobs layout rebuild brief (Coach sign-off pending, 2026-10-23)
Base: main 30cb09d9. Branch e.g. `design/p3-jobs-layout`. This is a layout and data rebuild of `/jobs` and `/jobs/:id` (all 4 tabs) plus new/edit job (JobFormModal) to the agreed Light mockup. It is not a recolour. Scope files follow BUILD-PLAN P3 (`4-dark-light/BUILD-PLAN.md:248`): JobsPage.tsx, JobDetailPage.tsx, `src/components/jobs/*`, JobFormModal.tsx, FromBooking.tsx, EnquiryConversation.tsx.
Rulings applied: P1b sign (D4, D7) and the **P2 Coach sign 19:59**. The mockup wins over the BTS UI LOOK additions, and Jack's locks win over both. Wording is fixed: "need crew", "In progress", "Set a date", "07:00–10:30" (no spaces), "jobs" never "bookings". Status pills are tinted (text ≥4.5:1; green/amber only on pills and icons).
Merge order: P1b → LOOK-GATE → P2 → **P3**. Rebase onto the new main with a fresh precheck (gates + tsc count + frames) at each step. Reuse P1b/P2 helpers once they are merged; do not fork them.

## Mockups: what is real and what is derived
| View | Width | Real mockup (Light, `design/directions/`) | Status |
|---|---|---|---|
| Job detail (Overview tab, scrolled) | 390 | `4-dark-light/job-390-light.png` + `-vp-01/02/03`, `4-dark-light/html/job-390-light.html`, `_src/boards/cmp4-job-390.html`, `compare-dark-vs-light-job-390.png` | **REAL** |
| Job detail | 375 / 768 / 1024 / 1280 | none | DERIVED from job-390 + kit (`html/kit.html`: tabs "Overview · People · Paperwork · Materials", kv rows, bill table) |
| Job detail People / Paperwork / Materials tabs | all | none (only the tab labels and counts appear in job-390) | DERIVED from kit list rows and section headers |
| Jobs list | all 5 | **none at any width** | DERIVED: kit "List row · section header · card" (`#0036 · Stafford · Dean, Tom` + pill; "No crew yet" + Needs crew), kit "Table row · laptop", and the list pattern in `clients-390-light.png` (eyebrow, h1 + New, whisper, visible search, filter chips with counts) |
| Enquiries view | all | none | DERIVED (same list anatomy) |
| New / edit job (JobFormModal) | all | none | DERIVED: kit inputs (Client, Site address, Job type, Date, Start; 2px focus ring), kit bottom sheet (phone) and modal (≥768) |
| Shell nav | — | `nav/4-dark-light/tabbar-390`, `more-sheet-390`, `topnav-768/1024/1280` | **Do not copy.** NAV_WORDS rules (below) |
The other directions (1-mission-dark, 2-monochrome-light, 3-evolved) also have job-390. They are **not** used.

## Why
Jack expects the agreed job sheet: an eyebrow with the ref and a status pill, the title, site and time lines, one full-width primary action with a money figure, a 4-tab segmented control, key-value rows (Site · Go, Client, Phone · Call, Crew), Scope, Notes, Photos and the Job bill on Overview, all on white/off-cream with ink and no navy. The Jobs list then has to read like the kit list row and the clients list. Every existing action stays.

## Off-limits
- No new tables, columns, RPCs, migrations, RLS or edge-function changes. No DB writes except the Live-prove seeds.
- Shell nav as ruled on main: phone Today/Schedule/Jobs/More (`appShellPhoneNav.ts:13–16`), 768+ Today/Jobs/Field/Money/Stock (`NAV_WORDS brand.ts:4–13`). Do not copy the mockup's app bar search icon or avatar, and make no change to AppShell.tsx, appShellPhoneNav.ts, brand.ts or tokens.css. Titles come from `NAV_WORDS.jobs`.
- No behaviour change to mutations: approve/dismiss `JobsPage.tsx:643–691`, handleSaved `:631–641`, `updateStatus`, attach client, save phone/email, clock on/off, invoice create (`runNext`, `JobCostingPanel onInvoiceCreated JobDetailPage.tsx:3672–3687`), JobFormModal save/delete (`JobFormModal.tsx:338,354,370`). Layout only re-homes the controls that call them.
- `?look=` (`JobsPage.tsx:414–423`, seeds `:64–406`; `JobDetailPage.tsx:1554`, look CSS and audit mocks) is left alone. LOOK-GATE owns it.
- No fake, demo or placeholder figures in prod. The mockup's "6 · placeholders" photo tiles are demo only. Every colour comes from an existing `--g-*` token (`tokens.css:62–125`).

## Findings on 30cb09d9 (read-only; schema from information_schema, project ezszahvwwmbuekpedumf)
- F1 **The list's status column is not the job status.** The phone row (`jobsListPhoneRow jobsListRow.ts:48–79`) and the desk row (`JobRow JobsPage.tsx:1063–1107`) both show `jobCrewScheduleStatus` (`jobCrewScheduleStatus.ts:3–5,18`: Booked / Needs crew / Not scheduled). So a completed job with a crew reads "Booked", and a completed job with no crew reads "Needs crew". The kit pill is the job status (D1).
- F2 **Search is hidden.** It sits behind a ⋯ `summary aria-label="Search"` (`JobsListFind :752–754, :967–1012`). The kit and the clients list show a visible search field.
- F3 **"Ready to invoice" is already derivable on the list with no new query.** `loadJobCardExtras jobCardExtras.ts:15` already reads `invoices id, job_id, invoice_number, status, total, due_date` (`:60`) for every listed job. But every extras read ignores `error` (`:29–60`), and the caller swallows throws (`JobsPage.tsx:494–500`). A failed read would show a false "Ready to invoice" (D1 guard, K4).
- F4 The clients fetch on the list (`JobsPage.tsx:477–483`) has no error check. This is the same bug Coach ruled to fix on Schedule (P2 sign 9).
- F5 The list jobs read is `select('*')` with no limit and no `.eq('company_id')` (`:449–508`). The extras do `in('job_id', allIds)` with no bound. That is a URL-length risk for large companies (OQ8). Existing reads stay as they are.
- F6 The extras sign a cover-photo URL per job (`jobCardExtras.ts:52–55`), but the rows never show it. That is wasted calls (OQ9).
- F7 Two scrollers that the bar forbids: the list status filter rail (`index.css:11792–11801`, `overflow-x:auto`) and the job sheet tab rail (`index.css:10948–10958`). The mockup's 4 tabs fit at 390.
- F8 **Navy/cream on main:** the list "List" mark bar `#0A2540` (`index.css:~11715–11724`, `hub-jobs-list-bar` `JobsPage.tsx:700–705`). The `#FFFDF8` sheet paper. `text-navy` on the bill icon (`JobDetailPage.tsx:3659`). JobFormModal borders `#E2D9CC`, hover `#F5F0E6` and `text-navy` title (`JobFormModal.tsx:380–398, 724–735`). Inline `<style>` blocks inside JobDetailPage (`~:677, :1232, :3098–3111`).
- F9 The job sheet has two "back to Jobs" controls: Breadcrumbs (`:3113–3116`) and the `hub-jobs-open-chrome` link (`:3118–3120`). The mockup has one "‹ Jobs".
- F10 The mockup's Overview carries Notes, Photos and the Job bill. On main these live on the Paperwork tab (`job-visit-notes :3873`, `job-gallery :4221`) and the Materials tab (`job-bill :3653`, which is collapsed until Materials opens, `billOpen :1559`). Overview on main is the ledger, the "lanes" summary rows (`:3577–3621`) and the stages.
- F11 Tab labels: main has "Schedule & people" (`jobSheetTabs.ts JOB_SHEET_TABS`); the mockup has "People", and "Paperwork 3" / "Materials 1" carry counts.
- F12 Status is changed with a bare `<select>` under the h1 (`:3233–3242`). The mockup shows a pill.
- F13 **Security (out of scope, for Coach):** `JobClientReminder.tsx:135–136` reads `email_settings smtp_pass` into the browser.
- F14 Schema: **every column in every Jobs select exists** (checked below). tsc baseline = 180.

## 1. Section map: mockup → real data → source (main 30cb09d9 file:line)
All reads run as `authenticated` under the company RLS policy.
### Job detail (REAL at 390)
| # | Region | Figure / rows | Source |
|---|---|---|---|
| J1 | "‹ Jobs" back | one link to `/jobs` (keep the Breadcrumbs at ≥1024 only, OQ6) | `:3113–3120` |
| J2 | Eyebrow "JOB #0036" + pill (right) | `formatJobRef` (`jobRef` `:2761`) · **D1** pill. The pill is the status control: tap opens the status picker (same `updateStatus`) | ref `:3124`; status select `:3233–3242`; invoices `['job-invoices'] :1935` select `id, invoice_number, status, total, due_date, created_at, quote_id`; children `['job-children'] :1773`; **NEW Q-J1** for a child visit's parent |
| J3 | h1 title | `job.title` | `:3232` |
| J4 | Pin "12 Grange Rd, Stafford" / calendar "Mon 19 Oct · 07:00–10:30" | `site = job.address || client.address` (`:2760`); `EEE d MMM` + `HH:mm–HH:mm`, no spaces. Undated → "No date yet" + "Set a date" link (People tab) | `:3526–3536`, `OpsSiteRow :3350` |
| J5 | Primary CTA "Create invoice · $919.05" (full width, inverse) | `jobOpenNext` label (`:2895–2920`). When `next.key='invoice'`, the label is "Create invoice · " + `formatMoney(preview.totalIncGst)` (OQ3). Other keys keep their label (Set a date, Assign crew, On my way, Clock on, Share, Post update). Held skeleton unchanged | `:3244–3322`, preview `:2646–2670` (`loadJobBillInvoicePreview`), `jobNextAction.ts:135–156,407` |
| J6 | Sub "4 bill lines · 4.4 h logged" | `preview.lineCount` · `formatLabourHoursOneDecimal(jobClockedMinutes(timesheets))`. A zero part drops | preview; `['job-timesheets'] :1964` |
| J7 | Tabs "Overview · People · Paperwork 3 · Materials 1" | **D5** counts. Equal-width segmented control, no scroller | `:3324–3338`, `jobSheetTabs.ts` |
| J8 | kv Site + "Go" | site; Go = maps href (existing `OpsSiteRow mapsQuery`). Parent "Stage of #…" link under it | `:3348–3361` |
| J9 | kv Client | client link, or attach picker, or "No client" | `:3363–3414` |
| J10 | kv Phone + "Call" | `tel:`; edit form when empty (the same save) | `:3415–3463` |
| J11 | kv Email (not in mockup, kept) | mailto / edit form | `:3464–3512` |
| J12 | kv Crew | names, or "No crew yet" (D4) | `:3515–3525`, `jobSheetIdentityCrewLabel` |
| J13 | "Scope of works" | `job.description`; priority ≠ medium shown as a meta line | `:3537–3553` |
| J14 | Enquiry conversation (not in mockup, kept) | under Scope | `EnquiryConversation :3578` |
| J15 | "Notes" (author · HH:mm + body) | latest 2 visit notes + "All notes" → Paperwork. `author_name`, `created_at` in the tenant zone | `['job-visit-notes'] :2052` (`JOB_VISIT_NOTE_COLUMNS jobVisitNotes.ts:5`) |
| J16 | "Photos · N", 3-col grid | first 6 real photos (job photos + inspection gallery) + "All photos" → Gallery. Hidden when N=0 | `['job-photos'] :2076`, `['job-gallery-inspection-photos'] :2099`, `['job-gallery-urls'] :2131` |
| J17 | "Job bill": Budget / Cost / Charge ex GST; lines; Subtotal, GST (10%), Total inc GST | budget = `job.budget`; cost/charge = `['job-cost-totals'] :2188`; lines = `['job-costs', jobId]` (the same key and select as `JobCostingPanel.tsx:137–144`, so it is shared, not new; OQ4); totals = preview `subtotal/taxAmount/totalIncGst`. "Edit bill" → Materials | `:3653–3690` |
| J18 | Stages (not in mockup, kept) | child list + Add stage | `:3623–3651` |
| J19 | People tab | Dispatch (date, time, crew) + client reminder + "Time on this job" (Clock on/off, Add hours, entries) | `:4412–4427`, `:4429+` |
| J20 | Paperwork tab | groups Safety (JHA/SWMS `:3692`, Take 5 `:3796`), Field records (Visit notes `:3873`, Inspections `:4144`, Gallery `:4221`, Testing due `:4296`), Quotes & invoices (`:4321`, `:4376`); the ledger quote/invoice links `:3555–3573` move here | `PAPERWORK_GROUPS jobSheetTabs.ts` |
| J21 | Materials tab | `JobCostingPanel` open (no collapse) | `:3653–3690` |
| J22 | ⋯ More (top right) | Post update, JHA/templates, Start inspection, Gallery, Invoice, Clock on/off, Details (edit), Add to calendar. "Schedule & people" becomes "People" | `:3125–3228` |
| J23 | Sheets | quoted-invoice, zero-labour, edit, new stage | `:4493–4560` |
The lanes summary block (`:3577–3621`) is removed. Each lane's figure is now on Overview (J15–J17) or on a tab with a count (J7), and each lane's Retry stays inside its own section (reachability §2).

### Jobs list (DERIVED)
| # | Region | Figure / rows | Source |
|---|---|---|---|
| L1 | h1 "Jobs" / "Enquiries" + "New job" (right) | `NAV_WORDS.jobs`; New job opens JobFormModal | `:707–711`, `:742–751` |
| L2 | Whisper | `listCountWhisper` / `enquiryWhisper` (existing copy) + " · N need crew" when N>0 (D4) | `:596–604` |
| L3 | Jobs / Enquiries view tabs (only when enquirySurface) | review count | `:713–741` |
| L4 | Visible search "Search jobs or clients" | the same client-side filter | `JobsListFind :967–1012`, `filtered :558–575` |
| L5 | Filter chips with counts: All · Scheduled · In progress · Completed · Cancelled (+ "Need crew", "Ready to invoice", OQ2) | counts from `jobs` already loaded. They wrap and never scroll | `STATUS_FILTERS :56–62` |
| L6 | Phone row (<640) | line 1 title + **D1** pill (right); line 2 muted "#0036 · Stafford · Dean, Tom" (or "No crew yet"); line 3 muted "client · 19 Oct" + Next link (e.g. "Set a date") | `JobPhoneRow :1014–1061`, `jobsListRow.ts:10–79`, `jobOpenNext` |
| L7 | Table (≥640) | Job (title + ref) · Client · Suburb · Crew · Date · Status (D1 pill) · Next | `JobRow :1063–1107`, thead `:816–827` |
| L8 | Enquiry row | Call back, Approve, Dismiss, Open job | `EnquiryListRow :1109–1197`, dismiss sheet `:877–932` |
| L9 | Empty / loading | "No jobs yet" / "No matching jobs" | `:799–808` |
| L10 | `?client=` preset → opens the form | unchanged | `:606–614` |
### New / edit job (DERIVED)
| N1 | JobFormModal: phone = bottom sheet (full width, sticky footer above the safe area); ≥768 = modal. Fields and order unchanged (`:403–700`). Delete confirm unchanged (`:726–735`). Title "New job" / "Edit job" (sentence case) | `JobFormModal.tsx`; callers `JobsPage :834–876`, `JobDetailPage :4529, :4554` |

### NEW QUERIES (need Coach approval; read-only, existing tables, RLS + explicit company_id, error checked and thrown)
- **Q-J1 Parent invoiced state for a completed child visit (job sheet only).** `invoices` select `id, job_id, status`, filter `company_id = :co`, `job_id = job.parent_job_id`, `status <> 'void'`. Key `['job-parent-invoiced', parentId]`. Enabled only when `job.status='completed' && job.parent_job_id`. This is the same shape as P2 Q-S1; reuse that helper. It feeds D1 only.
- No other new query. The list's D1 uses the existing extras invoices (F3). The detail uses `['job-invoices']` + `['job-children']`. Counts, the bill and hours come from loaded data. J17's `['job-costs']` is an existing query that is mounted earlier (on Overview), so it is not new (OQ4).
- Changed (not new): the extras reads (`jobCardExtras.ts:29–60`) and the list clients read (`JobsPage.tsx:477–483`) check `error` and throw (F3, F4).

### Definitions ⚑
- **D1 Pill** (the same rule as P2 D1, signed): completed + no non-void invoice on the job or its parent, and for a parent, every child visit completed (P1b D4: draft counts as invoiced, child visits roll up) → "Ready to invoice" (`--g-ok-bg`/`--g-ok`). completed + invoiced → "Completed" (`--g-draft`, OQ1). in_progress → "In progress" (`--g-live-bg`/`--g-live`). scheduled + date + empty `assigned_team` → "Needs crew" (`--g-warn-bg`/`--g-warn`, D4). scheduled + date + crew → "Scheduled" (`--g-sched-bg`/`--g-sched`). scheduled + no date → "No date" (`--g-draft`) with the "Set a date" action beside it (OQ1). cancelled → "Cancelled" (`--g-bad-bg`/`--g-bad`). No 30-day window (the same as P2). If the invoice read errored, a completed job shows "Completed" and never "Ready to invoice".
- **D4 Need crew** = P2 D4 verbatim: a scheduled-on-board job (dated, status scheduled) with an empty `assigned_team`. `required_crew_count` is ignored. Meta copy "No crew yet"; whisper copy "N need crew". In progress, completed and cancelled jobs never show the Needs crew pill (data flag OQ7).
- **D5 Tab counts**: Paperwork = JHA + Take 5 + inspections + quotes + invoices + visit notes. Materials = `costTotals.lines` (bill lines). A count of 0 is hidden. While held: no number (OQ5).
- **D6 Hours** = `jobClockedMinutes(timesheets, now)` to 1 dp + " h logged". A running entry counts to now (as main).

## 2. Reachability (every existing action → where it goes; none dropped)
| Action today (file:line) | 375/390 | 768 | 1024/1280 |
|---|---|---|---|
| List: New job `:742` | header right (≥44) | same | same |
| List: Search (⋯) `:752` | visible field under the whisper | same | tools row |
| List: status filters `:756` | wrapped chips | same | same |
| List: Jobs/Enquiries `:713` | under the h1 | same | same |
| List: open job / Next link `:1014–1107` | row tap / Next | table row / Next cell | same |
| Enquiry: Call back, Approve, Dismiss, Open `:1109–1197` | row actions | same | same |
| Sheet: back `:3113–3120` | "‹ Jobs" | same | same + breadcrumbs (OQ6) |
| Sheet: status select `:3233` | header pill → picker | same | same |
| Sheet: primary Next/held/Post update `:3244–3322` | full-width CTA | CTA under the title | CTA right of the title block |
| Sheet: tabs `:3324` | 4 equal segments | same | same |
| Sheet: Go / Call / mailto / phone edit / email edit / attach client `:3348–3512` | Overview kv rows | same | same |
| Sheet: lanes → reveal section + Retry `:3577–3621` | tab buttons + each section's own Retry | same | same |
| Sheet: Add stage `:3630` | Overview "Project stages" | same | same |
| Sheet: bill open/edit, invoice create `:3653–3690` | Overview "Edit bill" → Materials; panel | same | same |
| Sheet: JHA, Take 5, inspection, gallery upload, visit note + photo, testing due, quotes, invoices `:3692–4410` | Paperwork | same | same |
| Sheet: dispatch, client reminder/On my way, Clock on/off, Add hours `:4412–4470` | People | same | same |
| Sheet: ⋯ items `:3131–3226` | ⋯ top right (all items) | same | same |
| Form: Save, Cancel, Delete + confirm | sticky footer | modal footer | modal footer |

## 3. Breakpoints and section order
Removed: the list "List" bar (`:700–705`), the open-chrome Jobs link (F9), the lanes block (F10), the status select (F12), and the paper document frame. The page is `--g-bg` off-white with white cards. No navy.
- **375 / 390 sheet** (= mockup): back → eyebrow + pill → h1 → site → date → CTA → sub → tabs → Overview: Site, Client, Phone, Email, Crew → Scope → Enquiry conversation → Notes → Photos → Job bill → Stages. Phone tab bar from the shell.
- **768 sheet**: same order. Content max-width 720, centred. Photos in 4 columns.
- **1024 / 1280 sheet**: header block (eyebrow, h1, site, date) left and CTA + sub right. Tabs below. Overview in 2 columns: left kv rows + Scope + Notes + Photos; right Job bill + Stages (OQ10). Other tabs in 1 column, max 880.
- **List <640**: h1 + New job → whisper → views → search → chips → rows.
- **List 640–1023**: as phone, then table L7 without the Crew and Date columns (they go under the title as meta).
- **List ≥1024**: h1 row (New job right) → whisper → views → tools row (search flex · chips) → full table L7.
- **Form**: <768 bottom sheet; ≥768 modal 560 wide.

## The bar (scope = all new and changed nodes on /jobs, /jobs/:id ×4 tabs, the form)
- No cream (L*>88, b* 2.5–12) and no navy (L*<35, hue 235–285, C*≥12) on any painted pixel. Only `--g-*` tokens. Remove the F8 literals.
- CTAs (New job, the sheet primary, Go, Call, Save, Approve, tab-on) ≥4.5:1. Secondary text (eyebrow, whisper, row lines 2–3, kv labels, sub line, note author/time, photo count, bill labels) ≥7:1. Pill text ≥4.5:1 on its tint.
- Nav and title words from `NAV_WORDS`.
- Overflow 0 at 375/390/768/1024/1280 on list, sheet ×4 tabs and the open form: `documentElement.scrollWidth ≤ innerWidth`, max `rect.right ≤ innerWidth` over all nodes **header included**, and each node's right ≤ its nearest clipping ancestor. **No allowlist** (the tab rail and chip rail stop scrolling, F7).
- Forced `data-theme=dark` with allowDark false → 0px change on every frame, clock frozen.
- Taps ≥44×44 (rows, chips, tabs, Go, Call, CTA, pill, ⋯, photo tiles, form fields and footer).
- `?look=` untouched (LOOK-GATE).

## Kills (behavioural; real render in Chromium over built dist; each with a paired real-file mutant that must turn it red)
K0 harness: reuse P1b K0 (mocks that apply filters and record table, columns and filters) + P2's rpc mock. `JOBS_FIXTURE`: #0036 completed, 2 crews, uninvoiced (mockup sheet: 4 bill lines, 4.4 h, $919.05); completed + draft invoice; completed + void-only invoice; a child visit `.01` whose parent has an invoice; a parent with one open child; in_progress; scheduled + crew; scheduled + date + no crew; scheduled undated; cancelled; a long ref `#0141.A` with a long title; 2 enquiries; 2 visit notes; 7 photos; 1 JHA, 1 quote. Freeze `page.clock` at Mon 19 Oct 2026 13:40. Assert on text, rects, pixels and call counts. **Never grep source or read computed style or CSS vars.**
| Kill | Asserts | Paired mutant (real file) |
|---|---|---|
| K1 list header | one h1 "Jobs"; whisper exact incl. "1 need crew"; New job opens the form (call count); no "List" bar node | count need crew with crewed jobs too |
| K2 search + chips | the search input is visible without a tap; "Grange" filters to 1 row with 0 extra calls; chip counts equal the fixture; chips wrap (no node right > viewport) | put the search back inside `<details>` |
| K3 list rows | phone: line 2 "#0036 · Stafford · Dean, Tom", the no-crew row "No crew yet"; undated row Next "Set a date"; ≥640 the table column order; the ref is never cut | `jobsListPhoneRow` meta drops the crew |
| K4 pill D1 | per fixture: uninvoiced + void-only → Ready to invoice; draft → Completed; child with parent invoice → Completed; open-child parent → Completed; no-crew → Needs crew; undated → No date; pill bg pixel = token; extras invoice error → no "Ready to invoice" | drop `status <> 'void'`; swallow the extras error again |
| K5 sheet header | eyebrow "JOB #0036"; pill; h1; "Mon 19 Oct · 07:00–10:30"; CTA "Create invoice · $919.05"; sub "4 bill lines · 4.4 h logged"; the CTA click calls the invoice path once; the pill opens the picker, picking In progress = 1 update | format the time with spaces; drop the money from the label |
| K6 Q-J1 | child completed: 1 call with `company_id` + `neq void` + `job_id=parent` recorded; not called for non-child or non-completed | drop the company_id filter |
| K7 tabs | 4 tabs in one row, each ≥44, none clipped at 375; labels "Overview, People, Paperwork 4, Materials 4" (fixture: 1 JHA + 1 quote + 2 notes; 4 bill lines); `?tab=paperwork` deep link; tab switches replace history | restore `JOB_SHEET_TABS` label "Schedule & people" |
| K8 overview | kv rows in order; Go href = maps with the site; Call href `tel:`; empty phone → edit form → Save = 1 update; Notes shows 2 newest "Tom Nguyen · 07:40"; Photos 6 tiles of 7 + "All photos"; bill lines and totals equal the preview; "Edit bill" → Materials | slice notes to 1; read the totals from cost totals instead of the preview |
| K9 people/paperwork/materials | dispatch, reminder, hours (Clock on = 1 insert, Add hours opens the sheet); the 3 paperwork groups in order; Materials renders JobCostingPanel open | hide `job-hours` from People |
| K10 ⋯ More | every item present and fires its handler (call/route) | remove "Add to calendar" |
| K11 enquiries | approve = 1 createJob + 1 status update; dismiss sheet → 1 update; Call back `tel:` | approve skips the status update |
| K12 form | phone sheet inside the viewport with Save above the safe area; ≥768 modal; new → 1 insert; edit → 1 update; Delete needs a confirm → 1 delete | Delete without confirm |
| K13 clients/extras errors | list clients error → PageError (no rows that look valid); extras error → rows render, no Ready pill | remove the `if (error) throw` |
| K14 reachability | every §2 row has a visible ≥44 control at each width (scroll into view, rect in viewport) | delete Post update from ⋯ and the CTA fallback |
| K15 schema | every recorded select/filter column and RPC field ⊂ `docs/schema/p3-columns.json` (information_schema snapshot, committed; extends p2) | add `invoices.paid_at` to Q-J1 |
| K16 bar | palette, contrast, overflow (header + clipping ancestor, no allowlist), dark 0px, taps, NAV_WORDS; 5 widths × list / sheet ×4 tabs / form | wrap the tab rail in `overflow-x:auto` |
| K17 order | §3 order by section test-id `rect.top` (and `rect.left` for the 1024+ columns) per width | swap Notes and Photos |
| K18 empty/error | a job with no client, no crew, no date, no notes, no photos, no bill: no empty headings, "No crew yet", "Set a date", zero parts dropped; job not found → PageError; empty company list → "No jobs yet" | render "Photos · 0" |

## Schema-column check (information_schema, 2026-10-23, all columns present)
`jobs *`, and `id,title,job_number`; `id,title,status,job_number,cost_code`; `cost_code` · `clients *`, `id,name` · `invoices id,job_id,invoice_number,status,total,due_date` + `id,invoice_number,status,total,due_date,created_at,quote_id` (+Q-J1 `id,job_id,status`) · `quotes id,job_id,quote_number,status,total` + `id,quote_number,status,total,created_at,line_items` · `inspections id,crm_job_id` + `id,status,started_at,template_snapshot,meta,responses,crm_job_id,due_on,archived` · `photos inspection_id,storage_path,caption,uploaded_at` · `reports id,inspection_id,report_number,sent_at` · `jha_templates id,name,archived` · `jha_documents id,status,report_number,created_at,template_snapshot,meta,steps` · `jha_take5 id,jha_document_id,status,meta,stop_think,identify_hazards,control_actions,signature,signed_name,go_no_go,created_at` · `timesheet_entries id,timesheet_id,job_id,start_time,end_time,work_type,billable,notes` · `job_visit_notes id,company_id,job_id,author_id,author_name,body,created_at,outcome` · `job_photos` (14 cols, `jobPhotos.ts:14`) · `job_costs total_cost,total_price` + `*` · `expense_cost_models *` · `stock_items *` · `email_settings smtp_host,smtp_pass,from_name,from_email` (F13) · `missed_call_sms_threads id,caller_phone_e164,job_service,contact_name,service_area,enquiry_status,approved_job_id,latest_inbound_message_id,missed_call_id,created_at` · `missed_calls id,received_at` · `sms_messages id,body` · rpc `get_company_members` (`id,name`). Commit it as `docs/schema/p3-columns.json` for K15.

## Gates
- One run: `./gates.sh` = `npm run build` → `npx vitest run --maxWorkers=2` → `npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts` (Chromium; add `p3Jobs.chromium.kill.tsx` to `include`). Paste all three tails.
- `npx tsc -p tsconfig.app.json --noEmit` ≤ **180**. No new entries in the normalised list.
- Existing tests that pin the old look (`jobSheetLaptopLook`, `jobsListLaptopLook`, `jobsListTheme`, `jobsSheetTheme`, `jobsEnquiriesLook`) are updated only where they pin layout or style, and each change is listed in the PR. `jobDetailValidation` must stay unchanged and green.
- No new deps. Every kill has its mutant run recorded red, then reverted.

## Live prove (company 40183ed1 only)
- Seeds (titles/names end "— delete ok"; ids listed in the PR; Coach deletes): client "P3 Grange Rd — delete ok" with phone; jobs: completed uninvoiced with 4 bill lines + 2 time entries + 2 visit notes + photos (the mockup sheet); completed + draft invoice (notes "— delete ok"); a parent + child visit `.01` (child completed, parent invoiced); in_progress with crew; scheduled + crew; scheduled + date + no crew; scheduled undated; cancelled; a long ref/long title; 1 enquiry thread only if the company has the enquiry surface (else K11 covers it). Existing members only; no profile writes.
- Frames on the deployed preview logged in to 40183ed1: list, sheet ×4 tabs and the form at 375/390/768/1024/1280. **Before (main) / after at 390 and 1280** for Jack (list + sheet).
- Live check: the list pills and the sheet CTA/sub/bill totals equal a hand read-only SELECT, posted beside the 1280 frame.

## Frames
`docs/look/p3/`: `jobs-list-{w}.png`, `job-{overview,people,paperwork,materials}-{w}.png`, `job-form-{w}.png` for w ∈ 375/390/768/1024/1280; `before-{list,job}-{390,1280}.png`, `after-…`, `live-{390,1280}.png`; plus `job-390-vs-mockup.png` (side by side with `job-390-light.png`). Script `scripts/capture-p3-jobs-look.mjs`.

## Acceptance
§1 every region comes from its named source, with no demo values in prod. §2 nothing is dropped. §3 order holds at 5 widths. The bar passes. K0–K18 are green and each mutant goes red. Gates pass in one run, tsc ≤180. Live frames show a real row of every pill type and the full mockup sheet.

## Out of scope
Dark. Nav/AppShell. The P9 field pages that reuse job-390 patterns. F5 limits/chunking and F6 signed URLs unless Coach rules. F13 (separate security ticket). Mutation behaviour. Company time zone changes.

## Open questions for Coach (conflicts listed only where they hit Jack's locks or data)
1. **Pill words.** P2 D1 (signed) says "Completed" for completed + invoiced. The kit and P1b D7 say "Done". The brief uses "Completed" so Jobs matches Schedule. Should all three pages switch to "Done"? For undated jobs main says "Not scheduled". The brief uses a "No date" pill plus the "Set a date" action. OK?
2. List filters: add "Need crew" and "Ready to invoice" chips (derived, no query), or keep main's 5?
3. CTA copy: "Invoice" → "Create invoice · $919.05" (mockup) on the job sheet only, with Today/Schedule Next labels untouched. OK?
4. Mounting `['job-costs']` on Overview moves one existing read earlier, from Materials-open to sheet-open. OK, or show bill totals only and keep the lines on Materials?
5. Tab counts per D5. Should visit notes count in Paperwork? Materials = all bill lines (the mockup shows "Materials 1" next to a 4-line bill)?
6. The derived layouts (list at all widths; sheet at 375/768/1024/1280; other tabs; the form) are accepted as in §3? Keep breadcrumbs at ≥1024?
7. **Data:** Needs crew is limited to status scheduled (D4). Main's `jobCrewScheduleStatus` also flags completed or in-progress jobs with no crew, and P2's "need crew" whisper counts every on-board job with an empty team, completed included. Agree on one shared helper, and should P2's count be narrowed to match?
8. **Data:** the list reads every job with no limit, and the extras use `in()` over every id (F5). Chunk or limit in P3, or leave as is?
9. **Data:** drop the unused per-job signed cover URLs in the extras (F6)?
10. 1024+ Overview in 2 columns (kv/notes/photos left, bill/stages right). OK, or one column like the mockup?
11. Q-J1 approval.
12. Fix the swallowed extras errors and the unchecked list clients error (F3/F4) in P3, as P2 sign 9 did for Schedule? (Proposed: yes, K13.)
13. **Jack's locks (19 Oct, `notes/decisions.md`):** D10/D17 keep a thin navy head bar on the open job sheet, and D3 locks link text to `#296AA5`. The agreed Light mockup and this bar have no navy and use ink links. Confirm the 4-dark-light mockup supersedes both for P3.
14. F13: `smtp_pass` is read in the browser. Raise a separate security fix?
