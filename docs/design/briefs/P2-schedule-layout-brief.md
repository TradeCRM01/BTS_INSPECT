# P2 Schedule layout rebuild brief (Coach sign-off pending, 2026-10-23)
Base: main 30cb09d9 (#398 merged). Build **on top of the P2 colour layer** (cloud agent bc-0e43508b, stopped at a checkpoint and pushed as a draft PR). Branch e.g. `design/p2-schedule-layout` off that draft PR's head. This is a layout and data rebuild of `/schedule`, not a recolour. `P2-schedule-brief.md` stays unchanged as the record of the colour layer. Its bar, findings and Coach rulings (finding 7 scroller, 15:42) and the BTS UI LOOK additions 1–10 (18:48) still bind unless this brief says otherwise.
Mockup: **Light only.** `design/directions/4-dark-light/schedule-1280-light.png` (+ `-vp-01/-vp-02`), HTML `4-dark-light/html/schedule-1280-light.html`, src `_src/boards/cmp4-schedule-1280.html`. Dark stays gated on allowDark. **Only the 1280 week exists.** There is no mockup for day view, 375/390/768/1024, the sheets or Quick book. Those are derived below from the 1280 system and today's structure, and flagged (OQ1).
Merge order: **P1b Today first, then LOOK-GATE, then P2** (colour layer + this layout, as one PR or two stacked). Rebase onto the new main with a fresh precheck (gates + tsc count + frames) at each step.

## Why
Coach withdrew "look only, no layout change". Jack expects the agreed Schedule mockup structure: one header, one tools row, a crew × day board with white booking cards, and an Unscheduled tray under the board. Jack's tracker lock (plotted hours, day tracks, empty days drawn) and every existing action stay.

## Off-limits
- No new tables, columns, RPCs, migrations, RLS or edge-function changes. No DB writes except the Live-prove seeds.
- Shell nav as ruled on main: phone Today/Schedule/Jobs/More (`appShellPhoneNav.ts:13–16`), 768+ from `NAV_WORDS` (`brand.ts:4–13`). **Do not copy the mockup's nav** (Today/Schedule/Jobs/Quotes/Invoices/Clients/Reports/More) or its global search bar. No changes to AppShell.tsx, appShellPhoneNav.ts, brand.ts or tokens.css.
- No behaviour change to mutations: `rescheduleJob` `SchedulePage.tsx:647–685`, `resizeJob` `:687–714`, `scheduleFromSheet` `:716–763`, `applyQuickBook` `:855–941`, drag/drop `dispatch.ts`. Layout only re-homes the controls that call them.
- `?look=` (`SchedulePage.tsx:390–397`, seeds `:48–201`) is left alone. LOOK-GATE owns it and merges before P2.
- No fake, demo or placeholder figures in prod. Every colour comes from an existing `--g-*` token (`tokens.css:62–125`). A saved `schedule_color` is user data (see D3).

## Findings on 30cb09d9 (read-only; schema from information_schema, project ezszahvwwmbuekpedumf)
- F1 **Two headers in the DOM.** `ops-page-head` (`SchedulePage.tsx:1113–1131`, h1 + whisper + New job), the day-only Week/Day chips (`:1133–1151`) and the lg:hidden pick panel (`:1153–1171`) are all `display:none` (`index.css:6128–6131`). The visible header is `WeekBoardDocument` (`:337–383`). The layout keeps one header and deletes the dead DOM.
- F2 **The ⋯ More menu (`WeekBoardMore :203–331`) duplicates the track.** Range, Today, Previous, Next, Day/Week are all on `boardTrack :1062–1106`. Its only unique item, "All crews" (`:318–327`), can never show: `setFilteredEmployeeIds` is only ever called by `clearEmployeeFilters :815` (a reset). Nothing sets a crew filter on main.
- F3 `partitionScheduleJobs` (`jobNextAction.ts:283–295`) puts **completed and cancelled** dated jobs into `onBoard` (`jobListBucket :184` returns 'closed', then the `else if (scheduled_date)` branch keeps them). So cancelled jobs show on the board and count in "N on the board" (OQ6).
- F4 Week chips are filled with the **job colour** (`weekBoardChipColor scheduleBoard.ts:308–319`, JobBlock `BoardViews.tsx:105–140`, WeekJobChip `:323–368`). The mockup draws a white card with a 3px **crew** rail and a 2px time track. Job colour (`jobs.color`) then has no place on the board (OQ2).
- F5 Week lane labels are first name only (`weekBoardCrewLabel scheduleBoard.ts:219–224`). The mockup shows the full name plus "4 bookings". Lane counts exist only on day view (`BoardViews.tsx:730–758`).
- F6 Unassigned is the **first** lane (`weekBoardRows scheduleBoard.ts:358–384`, day `BoardViews.tsx:494–504`). The mockup puts it **last**.
- F7 Nothing on Schedule knows "Ready to invoice". The jobs query (`SchedulePage.tsx:549–593`) reads jobs and clients only. P1b adds Q-A (D4, Coach-signed 19:58).
- F8 The clients fetch at `:581–584` has no error check. Out of scope unless Coach says so (OQ9).
- F9 Jobs/clients reads rely on RLS only. There is no `.eq('company_id')` (`:549–593`). Existing reads are unchanged. The new query adds it.
- F10 Mocks `s2Shell.chromium.mocks.ts:159–179` ignore every filter. P1b K0 fixes this and merges first, so P2 reuses it.
- F11 tsc baseline = **180** on 30cb09d9 (`npx tsc -p tsconfig.app.json --noEmit`).
- F12 Day range: `DAY_START_HOUR 6`, `DAY_END_HOUR 20`, `DAY_HOUR_COUNT 15`, `HOUR_WIDTH_PX 96`, `DAY_HOUR_MIN_PX 56` (`dispatch.ts:5–9`). The mockup's track implies 06:00–18:00. Use the real constants.
- F13 Schema: `jobs` has `status, scheduled_date, start_time, end_time, address, assigned_team, color, parent_job_id, cost_code, job_number, required_crew_count, company_id`. `invoices` has `job_id, status, company_id`. `get_company_members` returns `id, email, name, …, schedule_color`. `clients` has `id, company_id, name, address, archived`.

## 1. Section map: mockup → real data → source (main 30cb09d9 file:line)
All reads run as `authenticated` under the company RLS policy. Strings are prod strings unless OQ3 changes them.

| # | Region (mockup 1280) | Figure / rows | Source |
|---|---|---|---|
| S1 | Eyebrow "Week of 19 October" (day: "Monday 19 October") | `format(rangeStart,'d MMMM')` / `format(currentDate,'EEEE d MMMM')`. Device-local | `rangeStart :539–547`, `currentDate :398–406`. No query |
| S2 | h1 "Schedule" | `NAV_WORDS.schedule` | `brand.ts:11`. Replaces `hub-week-hero :366` |
| S3 | Whisper "14 on the board · 2 need crew · 3 without a date" | `onBoard.length` · `unassignedOnBoard` · `needsDate.length`. Zero parts drop as today. "week of" moves to S1 | `partitionScheduleJobs :978–981`, `unassignedOnBoard :989`, `weekWhisper :990–995`, `dayWhisper :996–1002`. Copy "unassigned"→"need crew" is OQ3 |
| S4 | "+ New job" (btn-primary, header right) | opens JobFormModal | `openNewJob :1023`, modal `:1335–1367` |
| S5 | Tools: Week/Day seg | `setView` | `boardTrack :1064–1079` |
| S6 | Tools: ‹ "19 to 25 Oct" › | prev/next ±1 week / ±1 day; label full/short | `:1084–1103`, labels `:983–988` |
| S7 | Tools: search field "Search jobs or clients" | ScheduleJobSearch + results panel | `weekSearch :1030–1047`, debounce `:595–598`, `['schedule-job-search',q]` `:607–611` → `searchScheduleJobs scheduleJobSearch.ts:81` |
| S8 | Tools: "Today" (btn-secondary) | `applySchedule(viewMode,new Date())` | `:1081` |
| S9 | Quick book (not in mockup, stays: §2) | text + mic + Prefill → sheet | `ScheduleBookByVoice :1189–1197` (`ScheduleBookByVoice.tsx:87–160`), `applyQuickBook :855–941` (clients `id,name` archived=false `:884–888`) |
| S10 | Board head row: "Crew" + Mon..Sun with date; today "19" marked + "Now 13:40" | `scheduleWeekDays scheduleBoard.ts:91`. Now = device clock, ticks each minute | WeekBoardView head `BoardViews.tsx:948–966` (day head → `onSelectDay`). NEW pure clock helper (or P1b's S1 helper once merged). No query |
| S11 | Lane label: crew swatch + full name + "4 bookings" | members from RPC. Count = Σ cell.jobs.length in the lane (a job on 2 crews counts in both lanes) | `['team-members-schedule']` rpc `get_company_members` `:507–537`. `weekBoardRows scheduleBoard.ts:358–384`. Swatch `EmployeeColorSwatch.tsx`. Label currently `:969–971` |
| S12 | Unassigned lane (hollow swatch, "2 need crew") | jobs with empty `assigned_team` | `WEEK_UNASSIGNED_CREW_ID`, `jobOnCrewRow scheduleBoard.ts:333–340`. Position: OQ5 |
| S13 | Cell (empty cells drawn; Sat/Sun shaded `--g-surface-2`) | `row.cells[7]` | `BoardViews.tsx:972–996`. Drop/click handlers unchanged |
| S14 | Booking card line 1 "07:00–10:30 · #0036" | `scheduleChipClock(start,end,date)` (untimed → "Booked Mon 19 Oct · Add a time") · `formatJobRef` | `scheduleBoard.ts:265–275`, `jobRef.ts:20`, chip `weekBoardChip :321–331` |
| S15 | Card title + suburb | `weekBoardChipDescription :300–306`. Suburb = `jobsListSuburbFromSite(jobsListSite(address, client_address))` | `jobsListRow.ts:25,33` (as the agenda uses at `BoardViews.tsx:433–454`) |
| S16 | Card status pill | **D1** | `job.status` from jobs query + **NEW Q-S1** |
| S17 | Card rail (3px) + time track (2px) | rail = **D3** lane colour. Track = **D2** | `schedulePlotTimes scheduleBoard.ts:277–294`, `dispatch.ts:5–7` |
| S18 | Tray "Unscheduled" + "3 jobs without a date. Drag one onto a crew and day." | `needsDate` (undated `scheduled`/`in_progress`) | undated read in jobs query `:549–593`. Rail today `NeedsDateRail BoardViews.tsx:245–277` |
| S19 | Tray card: title, "#0048 · Luke Ferris · Wavell Heights", action | ref · `client_name` · suburb. Actions: card tap = pick, drag, "Set a date" (mockup "Place", OQ3), Open, ⋯ Add to calendar | `UnscheduledJobCards BoardViews.tsx:154–243`, `handlePickJob :765`, `handleRailDragStart :769`, `openScheduleSheet :828`, `JobCalendarOverflow.tsx:47–52` |
| S20 | Sheets (no mockup): Schedule this job, Quick book prefill, JobFormModal | unchanged fields. Look per LOOK addition 7 | `ScheduleJobSheet.tsx:99–244` (`:1313–1333`), JobFormModal `:1335–1367` |
| S21 | Phone agenda (no mockup) | `scheduleWeekAgenda scheduleBoard.ts:146–157`. Row = S14–S16 anatomy. Crew = `scheduleCrewLabel :209–217` | `PhoneWeekList BoardViews.tsx:396–473` |
| S22 | Day board (no mockup) | rows per crew + Unassigned, hours 06–20, now-line, resize | `DayBoardView BoardViews.tsx:477–875`, `.hub-day-track :700–708` (`index.css:7196`) |
| S23 | Phone "Unscheduled · N" chip | `phoneUnscheduledChipLabel` | `schedulePhoneUnscheduled.ts:2–11`, `PhoneUnscheduledTray BoardViews.tsx:279–321` |

### NEW QUERIES (need Coach approval; read-only, existing tables, RLS + explicit company_id, error checked and thrown)
- **Q-S1 Invoiced state for completed jobs on the visible range.** `invoices` select `id, job_id, status`, filter `company_id = :co`, `job_id in (ids of completed onBoard jobs ∪ their parent_job_id)`, `status <> 'void'`. Key `['schedule-invoiced', rangeStart, rangeEnd, ids]`. Enabled only when there is at least one completed job in range. This is the same shape as P1b Q-A step (2). Reuse P1b's helper once it is merged. Result feeds D1 only.
- No other figure needs a new query. Lane counts, need-crew counts, Now, the tracks and the suburbs all come from data already loaded.

### Definitions ⚑
- **D1 Pill** ⚑ completed + no non-void invoice on the job or its parent (P1b D4 as signed: draft counts as invoiced, child visits roll up to the parent) → "Ready to invoice" (`--g-ok-bg`/`--g-ok`). completed + invoiced → "Completed" (`JOB_STATUS_LABELS crm.ts:61–66`). in_progress → "In progress" (`--g-live-bg`/`--g-live`). scheduled → "Scheduled" (`--g-sched-bg`/`--g-sched`). cancelled → "Cancelled" (`--g-bad-bg`, if still shown, OQ6). ⚑ The 30-day window from P1b D4 does **not** apply here: the board week sets the scope. ⚑ Keep the mockup's "In progress" or prod's "In Progress" (OQ3)? Conflict: LOOK addition 10 says pills are `--g-well` + ink, with amber only on `.ops-status-progress`. The mockup uses tinted ok/sched/live pills (OQ4).
- **D2 Time track** = a 2px `--g-line` bar across the card's inner width. Span left = (start − 06:00)/(15×60), width = (end − start)/(15×60), clamped to [0,1]. Untimed (`schedulePlotTimes.stored=false`) → the track is drawn empty, with no span. Span colour = rail colour.
- **D3 Lane colour** = `pickEmployeeColor(id, schedule_color)` (`jobColors.ts:63`). With no saved colour, the hash fallback maps to `--g-crew-1..6` (`tokens.css:117–122`), not `EMPLOYEE_COLORS` (`jobColors.ts:21–34` has navy entries #1E4A6D/#4F6F8F that fail the bar). Unassigned = `--g-line-strong`. ⚑ A saved navy `schedule_color` is user data. Draw it unchanged (allowlisted, as a ≤3px rail and the swatch) or remap it (OQ2)?
- **D4 Need crew** = scheduled-on-board job with empty `assigned_team`, as main. `required_crew_count` is ignored, matching main and P1b D7.
- **D5 Now** = device-local HH:mm on today's column head only (week) and the now-line (day). It ticks on the minute. There is no pulse.

## 2. Reachability (every existing action → where it goes; none dropped)
| Action today (file:line) | 375/390 | 768 | 1024/1280 |
|---|---|---|---|
| New job `:370` | header, right of h1 (icon + "New job", ≥44) | header right | header right |
| Week/Day seg `:1064–1079`, ⋯ Day/Week `:300–317` | tools row 1 (full width) | tools row | tools row |
| Prev/Next/range `:1084–1103`, ⋯ `:275–299` | tools row 2: ‹ range › | tools row | tools row |
| Today `:1081`, ⋯ `:276` | tools row 2, right | tools row | tools row |
| ⋯ More menu `:271` | **removed** (F2: every item is on the tools row). "All crews" `:318–327` has no trigger on main. Not reachable today, so nothing is lost (OQ7) | same | same |
| Search `:1186` | own row | own row | tools row (flex) |
| Quick book text/mic/Prefill/picks/"New job from this" `:1189–1197` | own row under search | own row under search | full-width row under the tools row (OQ1) |
| Pick → place-on-crew row `:1198–1216` | under Quick book when picked | same | same |
| Drag chip to crew/day (week) `BoardViews.tsx:972–996`; drop Unassigned | n/a (agenda, as today) | n/a | board |
| Click empty cell → JobFormModal with date+crew `handleDayClick :786` | day board cells | day board | week cells + day board |
| Day head → day view `onSelectDay :948–966` | agenda day heading taps → day view (as `handlePhoneDayClick :796`) | same | head cell button |
| Open job (timed → /jobs/:id; untimed → sheet) `openBoardJob :847` | agenda row tap | agenda row | card tap |
| Drag/move, resize start/end (day) `:574–653`, handles `:830–855` | day board (handles ≥44 hit, 8px visible) | same | same |
| Unscheduled: pick, drag, Open `:192`, ⋯ Add to calendar `:206`, Set a date `:214–233` | "Unscheduled · N" chip (44), first tap expands, list with all actions | same | tray under the board, all actions on each card |
| Schedule sheet Save/Cancel/"New job instead" `ScheduleJobSheet.tsx:233–240` | sheet | sheet | dialog |

## 3. Breakpoints and section order (structural change vs today)
Today's pieces that are removed: the sheet-bar Week/Day mark + range (`:357–362`, the range lives in S6), the board head "This week / Drag a chip…" (`BoardViews.tsx:939–944`, its hint moves into the S18 sub), "Swipe sideways…" (`:945`), the day board head date/TODAY/hint (`:684–698`, the date goes into S1 and the hint into the tray sub), the paper document card frame, and the dead DOM (F1).
- **375 / 390** week: Header (S1 eyebrow, h1 + New job, S3) → Tools 1 (seg) → Tools 2 (‹ range › Today) → Search → Quick book → [place row] → Agenda: 7 days Mon–Sun, each heading + a drawn empty day strip when nothing is booked (Jack's lock, OQ8) → "Unscheduled · N" chip (`PHONE_SCHEDULE_SECTION_ORDER`). Agenda row = M2: line 1 muted "time · ref", then title (ellipsis), "suburb · crew", pill. No separate time column (LOOK 9).
- **375 / 390** day: Header → Tools → Search → Quick book → [place] → Day board in `.hub-day-track` (crew column sticky, hours 06–20, partial hour column + 24px fade at the edge, LOOK 6) → chip.
- **768**: Same order as phone. Tools fit in one row (seg · ‹ range › · Today). Week stays as the agenda (no new scroller, Coach's finding-7 ruling). The day board is in `.hub-day-track`.
- **1024**: Header row (S1–S3 left, New job right) → Tools row (seg · ‹ range › · search flex · Today) → Quick book row → [place] → Week board grid `148px repeat(5,minmax(0,1fr)) repeat(2,72px)` (OQ5 weekends) → Tray (2 columns). Card line 1 may wrap time / ref onto two lines. The ref is never truncated (LOOK 2).
- **1280**: As 1024, tray 3 columns (mockup). Day view: header/tools/quick book → day board (fits, no scroll when `dayBoardHoursFit dispatch.ts:81`) → tray.
- Tray at ≥1024 is shown even when empty, with "No unscheduled jobs." (`BoardViews.tsx:245–277`), same as today's `alwaysShow`.

## The bar (P2 colour bar carried; scope = all new nodes)
- No cream (L*>88, b* 2.5–12) and no navy (L*<35, hue 235–285, C*≥12) on any painted pixel, except a user-saved `schedule_color` rail if OQ2 allows it. Only `--g-*` tokens.
- CTAs (New job, Today, Set a date, Prefill, Save, seg-on) ≥4.5:1. All secondary text (eyebrow, whisper, lane counts, card time line, suburb, tray meta, agenda line 1) ≥7:1.
- Nav and title words come from `NAV_WORDS`.
- Overflow 0 at 375/390/768/1024/1280, week and day: `documentElement.scrollWidth ≤ innerWidth`, max `rect.right ≤ innerWidth` over all nodes **header included**, and each node's right ≤ its nearest clipping ancestor. **Only `.hub-day-track`** is allowlisted (Coach 15:42). Its children are measured against the scroller rect, and the scroller right ≤ innerWidth.
- Forced `data-theme=dark` with allowDark false → 0px change at all 5 widths, week + day, clock frozen.
- Taps ≥44×44 (seg, ‹ ›, Today, cards, lane cells, tray actions, chip, resize hit areas).
- `?look=` untouched (LOOK-GATE).

## Kills (behavioural; real render in Chromium over built dist; each with a paired real-file mutant that must turn it red)
K0 harness: reuse P1b K0 (filter-applying, recording mocks). Add `rpc('get_company_members')` with `schedule_color` and `SCHEDULE_FIXTURE`, which reproduces the mockup week: 4 crews, 14 on the board, 2 need crew, 3 undated, a 2-crew job (#0036), a completed uninvoiced, a completed with a draft invoice, a child visit, a weekend job, a cancelled dated job, an untimed job, and a long ref `#0141.A`. Freeze `page.clock` at Mon 19 Oct 2026 13:40 local. Assert on text, rects, pixels and call counts. **Never grep source or read computed style.**

| Kill | Asserts | Paired mutant (real file) |
|---|---|---|
| K1 header | one visible h1 = "Schedule"; eyebrow "Week of 19 October" / day "Monday 19 October"; S3 text exact; one New job, opens modal (call count) | unhide `ops-page-head` (restore F1 DOM). Count need-crew including crewed jobs |
| K2 tools | seg toggles view (URL + board swap); › moves the range label by 7 days (day: 1); Today returns; search → panel after debounce, 1 call | `onNext` uses `addWeeks(…,-1)` |
| K3 grid + empty days | ≥1024 week: 8 columns, Mon..Sun in order; every lane × 7 cells drawn with width>0 and height≥min, including all-empty days and weekends | skip cells with no jobs in `weekBoardRows` |
| K4 lanes | lane order = RPC order, full names; "4 bookings" per lane counts multi-crew jobs in both lanes; Unassigned per OQ5 with "2 need crew" | count distinct days instead of cards |
| K5 card | line 1 "07:00 – 10:30 · #0036"; ref text-range rect inside the card rect (never cut; `#0141.A` whole); title ellipsis allowed; suburb; #0036 is in both lanes | ellipsis on the ref span; `jobOnCrewRow` checks only `team[0]` |
| K6 pill | D1 per fixture row: void-only → Ready to invoice, draft → Completed, child rolled up; pill bg pixel = token; Q-S1 call count 1 with `company_id` + `neq void` recorded | drop `status <> 'void'`; drop the company_id filter |
| K7 rail + track | rail pixel = lane colour (saved or `--g-crew-n`); Unassigned = line-strong; span left/width = D2 ±1px; untimed → track drawn, no span | divide by 14h instead of `DAY_HOUR_COUNT` |
| K8 now | today head "Now 13:40"; advance 60s → "13:41"; absent on other weeks; day now-line x matches 13:40 ±1px | format `hh:mm` |
| K9 week moves | drag card → other crew/day: 1 update with the new `scheduled_date`/`assigned_team`; drop on Unassigned → `[]`; empty cell click → modal prefilled date+crew; head click → day view | drop handler keeps the old date |
| K10 day board | hours 06–20 drawn with zero jobs; empty lanes drawn; resize end → 1 update `end_time`; untimed chip shown; `.hub-day-track` at 375/390/768: scrollWidth>clientWidth, scrollLeft changes, wheel deltaY moves window.scrollY (no trap); fade pointer-events none; a partial hour column is visible at the edge | hide hours with no jobs; `overflow:hidden` on the track; fade `pointer-events:auto` |
| K11 tray | ≥1024 after the board: heading, sub with N, one card per needsDate job, "#ref · client · suburb"; Set a date → sheet prefilled → Save = 1 update + toast; card tap → place row; drag onto cell = 1 update; Open href; ⋯ Add to calendar present. <1024 chip 44px, first tap expands, same actions | `needsDate.slice(0,3)` |
| K12 agenda | 7 day sections in order; empty day heading + strip drawn (not collapsed); row line-1 top < title top and same left (no time column) | filter out zero-job days |
| K13 quick book | present at all 5 widths in §3 position; "Leaking tap tomorrow 9am Dean" + Prefill → sheet with date/time/crew; clients call count 1; 390 sheet frame within viewport, Save above safe-area | render ScheduleBookByVoice only ≥1024 |
| K14 reachability | every §2 row has a visible ≥44 control at each width (scroll into view, rect in viewport) | delete Today from the tools row |
| K15 schema | every recorded select/filter column and RPC field ⊂ `docs/schema/p2-columns.json` (information_schema snapshot, committed). Stubbed unit tests assert against the same file | add `invoices.paid_at` to Q-S1 |
| K16 bar | palette, contrast, overflow (+ clipping ancestor, allowlist only `.hub-day-track`), dark 0px with clock frozen, taps, NAV_WORDS, 5 widths × week/day | a non-allowlisted node in a fake `overflow-x:auto` wrapper must go red; reuse the colour-layer mutants |
| K17 order | §3 section order by section test-id `rect.top`, per width and view | swap tray and board in JSX |
| K18 empty/error | empty company: all lanes/days/hours drawn, "0 on the board", tray empty state, no console error; jobs error → PageError | hardcode a fallback count |
LOOK-GATE's own kill is re-run after rebase. There is no new look kill in P2.

## Gates
- One run: `./gates.sh` = `npm run build` → `npx vitest run --maxWorkers=2` → `npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts` (Chromium; add `p2Schedule.chromium.kill.tsx` to `include`). Paste all three tails.
- `npx tsc -p tsconfig.app.json --noEmit` ≤ **180** (main 30cb09d9). No new entries in the normalised list.
- No new deps. Every kill has its mutant run recorded red, then reverted.

## Live prove (company 40183ed1 only)
- Seeds (names/titles end "— delete ok"; ids listed in the PR; Coach deletes): client "P2 Stafford Dental — delete ok"; in the current week: 1 in_progress timed on 2 crews, 1 scheduled timed, 1 scheduled untimed, 1 scheduled no crew, 1 completed uninvoiced, 1 completed + draft invoice (notes "— delete ok"), 1 child visit `.01` of a seeded parent, 1 Saturday job, 1 with a long cost-code ref and long title, 1 cancelled dated; 2 undated scheduled (tray). Existing members only; no profile writes.
- Frames on the deployed preview logged in to 40183ed1: 375/390/768/1024/1280 × week + day, plus 390 Quick book sheet. **Before (main) / after at 390 and 1280** for Jack. Extra frames carried from LOOK additions: day 390 scrolled middle/end, 1024 card crop zoomed, empty-day week, keyboard focus on the seg at 1280, hover-colour table.
- Live check: S3 figures and lane counts equal a hand read-only SELECT, posted beside the 1280 frame.

## Frames
`docs/look/p2/`: `schedule-{375,390,768,1024,1280}-{week,day}.png`, `quickbook-390.png`, `before-{390,1280}.png`, `after-{390,1280}.png`, `live-{390,1280}.png`, the extras above. Script `scripts/capture-p2-schedule-look.mjs`.

## Acceptance
§1 every region comes from its named source, with no demo values in prod. §2 nothing is dropped. §3 order holds at 5 widths × 2 views. The bar passes. K0–K18 are green and each mutant goes red. Gates pass in one run, tsc ≤180. Live frames show a real row of every card/pill type.

## Out of scope
Dark. Nav. Crew filtering UI (F2). Company time zone. Clients error check (F8) and cancelled-on-board (F3) unless Coach rules. Mutation behaviour. Week board at <1024.

## Open questions for Coach (and conflicts)
1. **No mockup** for phone, 768, 1024, day view, sheets or Quick book. Accept §3's derived layouts? Quick book is not in the mockup. Keep it as a full-width row under the tools (proposed), or put it behind a "Quick book" button?
2. **Conflict, job colour vs mockup:** the mockup's white card + crew rail drops `jobs.color` from the board (F4). OK? Day-view blocks get the same card (proposed). A user-saved navy `schedule_color`: draw it as is, or remap it?
3. Copy: "need crew" vs main's "unassigned"; "In progress" vs "In Progress"; "Place" vs "Set a date" (proposed: keep "Set a date", LOOK 8); "07:00–10:30" vs main's "07:00 – 10:30"; "bookings" vs day view's "jobs".
4. **Conflict, pills:** the mockup's tinted ok/sched/live pills vs LOOK addition 10 (`--g-well` + ink, amber only on progress). And the mockup's filled ink circle on today's date vs LOOK addition 4 (accent text or 2px underline). Which wins?
5. Unassigned lane last (mockup) or first (main)? Weekends fixed at 72px (mockup). A weekend booking card won't fit 72px. Proposed: 72px only when the week has no weekend jobs, else equal width. Days stay drawn either way (Jack's lock holds).
6. F3: should cancelled (and completed) dated jobs stay on the board and in "N on the board"?
7. ⋯ More is removed (F2). Its "All crews" item has no trigger on main. Confirm there is no crew filter to restore.
8. **Conflict, Jack's lock vs agenda:** phone empty days show "Nothing booked" today. Proposed: keep the copy and also draw an empty day strip so the day is still drawn on a track. Agree?
9. Q-S1 approval (read-only `invoices id, job_id, status`, RLS + company_id, no window). Fix the unchecked clients error (F8) in P2?
10. **Conflict, Coach's scroller ruling vs mockup at 1024:** the 5 fluid columns are ~137px at 1024. Line 1 wraps instead of scrolling (no new scroller). Agree?
- 09:04 CoS CORRECTION (measured real mock w/ fonts.ready, r8c): Search 755.27x48, New job 128.22x48 y156, Today 85.25x48 white inset ring rgb(161,161,170). Earlier 753/129/86 were font-load misses; measured values win. No 390 Schedule mock exists; 390 pins = 16px gutter + overflow only until a signed 390 mock.
