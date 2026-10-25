# P2 Schedule brief (runs in parallel with #398 r10; Jack approved via Coach 2026-10-23)
Base: main 7e5394df, on its own branch (e.g. `design/p2-schedule`). Look only: no layout order, data, routing or behaviour change. Thin.
Merge rule: no merge until #398 is CLOSED live. Then rebase onto the new main and run a fresh precheck.

## Off-limits (files #398 changes; `git diff --name-only 7e5394df db383c9e`)
- src/components/layout/AppShell.tsx, appShellPhoneNav.ts, appShellNavLabels.kill.test.tsx, appShellNavOrder.test.ts, appShellPhoneNav.test.ts, p1Dashboard.chromium.entry.tsx, p1Dashboard.chromium.kill.tsx, s2Shell.chromium.mocks.ts
- src/pages/DashboardPage.tsx, RemindersLook.test.ts, dashboardLaptopLook.test.ts, dashboardPage.test.ts, sheetWidthLaptopLook.test.ts
- src/widgets/IntelligenceWidgets.tsx, src/widgets/WidgetComponents.tsx, src/lib/brand.ts, supabase/functions/_shared/brand.ts, src/pr378TemplateGuard.test.tsx
- vitest.s2-shell.config.ts, scripts/capture-p1-dashboard-look.mjs, docs/look/p1/* (26 png)
- src/index.css is shared. Do not edit these regions (main line numbers):
  - 12530–13926: .dashboard-home*, .reminders-*, plus .dashboard-home-crew-schedule.hub-crew-schedule-needs at :12723.
  - 22620–22644: the "List-page quiet eyebrows (paper kit)" block. #398 edits 22632–22644.
  - Schedule CSS lives at 6088–8286 (+ :8975), inside `@layer components` (:46). It has no overlap with those regions, so edit there.
- Nav: the NAV_WORDS / phone tab bar code is #398's (AppShell, appShellPhoneNav). P2 only verifies it with kills and changes no nav code.
  - On main, the phone tabs already read Today/Schedule/Jobs/More.
  - At 768+ main still shows Dashboard/CRM/Field Work/Financials/Inventory. Those nav kills go green only after the rebase onto post-#398 main.
- Shared classes: change only Schedule-scoped selectors (.hub-week-*, .hub-schedule-*, .hub-day-*, .hub-board-cal, .hub-phone-unscheduled*).
  - .hub-jobs-phone-status and .hub-crew-schedule-needs are used by Jobs and Dashboard. Restyle them only under `.hub-week-agenda` / `.hub-board-cal`.
- LOOK-GATE: SchedulePage.tsx:390 `searchParams.get('look')` is ungated in prod, and so are its uses at :391–401.
  - No lookParam() helper exists on main (checked 7e5394df), so leave it alone. LOOK-GATE owns it.
  - Also leave the look seeds at :48–191, including the colours at :55–61.

## Views in scope (main)
- **Week view.**
  - Desk WeekBoardView (BoardViews.tsx:894).
  - Phone PhoneWeekList agenda (:396; rows at :437).
- **Day view.**
  - DayBoardView hours board (:477). It renders at every width, inside the hub-day-track scroller.
  - PhoneDayList (:370).
- **NeedsDateRail (:245)** on desk, and **PhoneUnscheduledTray (:279)**, the "Unscheduled · N" button.
- **Search:** ScheduleJobSearch.
- **Quick book:** ScheduleBookByVoice, i.e. the "Quick book" input, mic and Prefill.
- **Schedule sheet:** ScheduleJobSheet ("Schedule this job").
- **The More menu** (SchedulePage:271).
- **JobFormModal** is out of scope because it is shared.

## Findings on main 7e5394df
Measured live on grafter.com.au on 40183ed1, read-only, 2026-10-23 ~15:40 AEST. Frames and measure.json are in /workspace/grafter-proofs/p2-schedule/before/.
1. **Cream page and paper surfaces.**
   - The page bg paints rgb(245,240,230) = #F5F0E6 at every width, from index.css:6569 `.hub-board-cal.is-week-doc.ops-page`.
   - Painted cream is 46–86% of the frame: week 375 70.8%, 768 86%, 1280 46%; day 1280 68%.
   - #F5F0E6 also appears at :7075 (.hub-week-crew-opt:hover) and :7324 (agenda status pill bg).
   - #FFFDF8 surfaces:
     - :6707 .hub-week-document, :6721, :6754 sheet-bar, :6777 sheet-body, :6891 search panel, :7022 more-menu
     - :7161 day zebra, :7222 .hub-day-crew-lock, :7369 .hub-week-cell
     - :7583 .hub-schedule-job-sheet: the sheet paints rgb(255,253,248)
     - :7678/:7703/:7712/:7719/:7769/:7782 quick book
     - :7806/:7811 sheet footer/save
   - Cream hairlines #E2D9CC, e.g. :7304 agenda row and :7360 week grid.
   - Tailwind `cream` #F5F0E6 is in tailwind.config.js:14.
2. **Navy.**
   - #0A2540 appears on 33 lines in 6074–8564. Ink examples: :6755, :6794 hero, :6876, :6948 seg is-on, :6980, :7047, :7083, :7092, :7265, :7305, :7325, :7557, :7584, :7596, :7659, :7679, :7783, :8087, :8155.
   - It is also used as a bg and border:
     - :7810, the Save CTA bg. The sheet's Save button paints navy.
     - :7720/:7721 Prefill, :7770/:7771 "New job from this".
     - :7457 is a color-mix hover.
   - Navy shadows rgba(10,37,64) at :6713 and :7970.
   - TSX: BoardViews.tsx:737/:747 `colors.navy` dashed border and outline on the Unassigned crew. :835/:846 `hover:bg-navy/25`.
3. **Secondary text is under 7:1.**
   - #5B6B7C paints 5.38:1 on cream, on 28 lines including :6682, :6766, :6812 status-whisper, :6868, :6937 seg-btn, :6970 quiet, :7054 more-range, :7187 schedule-label, :7352 agenda meta/crew, :7612, :7620, :7735 and :8081.
   - Live, the lowest secondary text is 5.38 at every width, on whisper, seg-btn, Today/prev/next, more-range, agenda meta/crew, "Crew", and sheet-mark.
4. **CTA and chip contrast.**
   - btn-primary "New job" paints white on accent at 4.84. That passes but is accent-filled, not --g-inverse as in P1.
   - Week chips (desk 1024/1280) paint white text at 3.77:1 on job colours: .hub-week-chip-ref/desc at :7479–7495; ink comes from getReadableText at BoardViews.tsx:109/:337.
   - Chip refs truncate, e.g. "#0079.0" and "#0141.A" in schedule-week-1280-top.png.
   - Job colours are data, so P2 fixes only the ink rule/threshold (≥4.5) and does not change job colours.
5. **Taps under 44.**
   - .hub-week-seg-btn min-height 32px (:6933): Week is 48×32, Day 44×32, and at 1024+ Day is 38×32.
   - .hub-week-quiet min-height 24px with padding 0 (:6965/:6966): Today and prev/next are 44×24 at <1024. At 1024/1280, Today is 33×24 and Previous/Next are **16×24**.
   - The day-board resize handles are w-2 (8px), at BoardViews.tsx:835/:846. They are drag affordances; give them a ≥44 hit area via a pseudo-element without changing the drag behaviour.
   - The header logo is 106×24, but that is AppShell, which is off-limits. Note it, don't fix it.
6. **Phone agenda rows are not M2.**
   - .hub-week-agenda-row (:7294) is a flex 2-column row: time `flex:0 0 5.5rem` (:7310), with the copy column at x=112 vs time at x=12 at 390.
   - The time column wraps to 3 lines: "Booked Mon 19 Oct · Add a time".
   - The title/meta/crew/pill block runs 3–5 lines. Meta uses white-space:normal (:7353), so it breaks mid-segment.
   - The pill renders inside the copy column.
   - At 768 the rows are the same, at x 45/145.
7. **Overflow.**
   - Document scrollWidth equals innerWidth at all 5 widths in both views.
   - Week max rect.right equals the viewport.
   - In day view, max rect.right is 857 / 857 / 890 at 375 / 390 / 768 (.hub-day-hours-head, BoardViews.tsx:715), inside the hub-day-track horizontal scroller (index.css:7196).
   - **Decision for Coach:**
     - Default: keep the scroller, because removing it is a behaviour change.
     - The overflow kill then clips each rect to its nearest overflow-x:auto|scroll|hidden ancestor, and that scroller's own right must be ≤ innerWidth.
     - Otherwise this is a red at 375/390/768.
8. **Forced dark** (colorScheme dark, allowDark false):
   - It changed 0px at 1280 in both views and 0px at 390 on rerun.
   - The first pass showed 14px at 390 in both views, probably the live now-line or clock drift.
   - The kill must freeze the clock (page.clock) before comparing.
9. **Quick book sheet at 390** (opened via Unscheduled · 11 → "Set a date"; nothing saved):
   - Width 390 and right 390, no overflow and no sub-44 taps.
   - Paints #FFFDF8 over a cream scrim area, with the navy Save CTA and a cream-bordered Cancel.
10. **Green/amber:**
    - No green or amber text classes appear in the Schedule TSX.
    - Amber appears only as a color-mix bg on .hub-board-cal .ops-status-progress (:6517). That is fine as a pill; keep it a pill.
    - Job-colour chips are data, not status.

## The bar (P2)
- **Surface:**
  - The page surface is --g-bg (tokens.css:65 #F5F5F7).
  - Sheets, cells, menus and the document use --g-surface (#FFF), with a 1px --g-line (#E4E4E7) hairline.
  - No #F5F0E6, #FFFDF8, #E2D9CC or navy literal stays in the Schedule CSS 6088–8286 or in the Schedule TSX listed above. Use --g-ink for titles.
  - At most one quiet elevation.
- **Text and CTAs:**
  - Secondary text uses --g-ink-muted (#3F3F46) at ≥7:1 on both bg and surface.
  - CTAs are ≥4.5:1. The Save, Prefill and New job primaries sit on --g-inverse, as in P1. Links and the focus ring use --g-accent.
  - Chip ink is ≥4.5:1 on its painted chip colour.
- **Status colour:** green and amber appear only as pills or icons.
- **Taps:** every interactive element is ≥44×44, including the seg buttons, Today, prev/next, the More summary, tray and chips, and the resize-handle hit areas. Visual size may stay smaller if the hit area is ≥44.
- **Nav (S2 ruling (b)):** the vocabulary comes only from NAV_WORDS.
  - Phone tabs are Today/Schedule/Jobs/More, and Schedule takes 1 tap.
  - At 768+ the groups are Today/Jobs/Field/Money/Stock, with Schedule first in Field. (Verify only; #398 owns the code.)
- **Overflow:** 0 at 375/390/768/1024/1280, counting scrollWidth and max rect.right including the header, per the scroller rule in finding 7.
- **Forced dark:** with allowDark false, the page changes 0px.
- **M2 stacked rows** (phone agenda rows, PhoneDayList rows, and any time+job row):
  - **Below 640:**
    - A single column ordered time, title, meta, pill.
    - Time and title share the same x.
    - The thead is sr-only, if any header row exists. The agenda's day heading "Mon 19 Oct" is a heading, not a thead, so it stays.
    - Each meta segment is `white-space:nowrap`, so a line breaks only after ' · ', with an `overflow-wrap:anywhere` fallback.
    - Pills use `align-self:flex-start`.
  - **At 640+:** the header and rows share one grid-track variable, e.g. `--hub-agenda-track`.
  - Use exact prod strings. No row may exceed main's line count. A 3+-line meta is a FAIL.

## Kills (behavioural only)
Each kill is a real-file mutant → `vite build` → Chromium paint suite over the built dist. Never greps, className regexes or CSS-var reads.
- **Painted palette:**
  - Scan every pixel of top and scrolled frames per view per width, plus the sheet at 390. Navy is L*<35 with hue 235–285 and chroma ≥12. Cream is L*>88 with b* 2.5–12.
  - The thresholds and the hard-coded exclude list (job-colour chips, the crew colour dots/rails, the photo/avatar, the logo) come from tokens.css / main, never from the page under test.
  - Mutants: restore :6569 cream; restore :7810 navy Save.
- **Contrast:** per text node vs its painted bg (walk to the first opaque ancestor), with secondary ≥7, CTA ≥4.5 and chip ink ≥4.5.
  - Mutants: restore #5B6B7C at :6812 (.hub-week-status-whisper); restore the getReadableText threshold.
- **Hit size:** each interactive rect ≥44×44 at all 5 widths and in the open sheet.
  - Mutants: min-height 24px at :6965; 32px at :6933.
- **Line counts vs main, with exact prod strings:**
  - Agenda title, meta and time lines must be ≤ main.
  - Meta breaks only at ' · ', i.e. each line's text starts at a segment boundary.
  - Mutant: meta white-space:normal.
- **M2 alignment:**
  - Below 640, time.left == title.left (±1px) and the order is time < title < meta < pill by top.
  - At 640+, the header and row column lefts are equal (±1px).
  - Mutant: restore the flex 2-column layout.
- **Forced dark:** page.clock frozen, then emulateMedia dark vs light, with 0 changed px. Mutant: an unguarded prefers-color-scheme rule.
- **Overflow:** docSW, bodySW and max rect.right (scroller-clipped) all ≤ innerWidth, including the header, at 5 widths × week/day. Mutant: min-width on .hub-week-agenda-row.
- **1-tap Schedule:**
  - From /, one tap on the phone tab reaches /schedule at 375 and 390.
  - At 768+, the first Field item is Schedule. This one goes green after the post-#398 rebase.
  - Mutant: reorder in a copy of the dist's tab config, or verify on rebased main.
- **Mocks:** the Chromium suite runs on mocked data (copy the s2Shell mocks pattern into a new p2 file; do not edit s2Shell.chromium.mocks.ts). There are no live writes.

## Gates (one run)
- `gates.sh`: build → `vitest --maxWorkers=2` → Chromium kills, in one invocation.
- tsc errors ≤ main's count; r9 baseline on main was 180, so re-count on the base used.
- No new failing vitest files. Existing schedulePage.test.ts and scheduleDesktop1280.test.ts stay green.

## Frames (BTS UI; before/after, Light; one viewport plus one scrolled viewport)
- Schedule week at 375/390/768/1024/1280, top and scrolled.
- Schedule day (?view=day) at the 5 widths, top and scrolled.
- The phone Unscheduled tray open at 390, and NeedsDateRail at 1280.
- The quick book row and Prefill result hints at 390 and 1280.
- The quick book / Schedule sheet ("Schedule this job") at 390.
- The More menu open at 390 and 1280.
- The phone tab bar at 390 with Schedule active, and the header nav at 768 and 1280 (after the rebase).
- The before set is already captured: schedule-{week,day}-{375,390,768,1024,1280}-{top,scrolled}.png, schedule-unscheduled-tray-390.png, schedule-quickbook-sheet-390.png, forced-dark-week-390.png, and measure.json.

## Acceptance
- Every Bar item is proven by a kill that goes red on its mutant and green on the branch.
- Overflow pairs, the contrast table (secondary, CTA, chip, pill), the tap table and forced-dark numbers are in the PR body.
- No off-limits file appears in `git diff --name-only 7e5394df..HEAD`. index.css hunks fall only in the Schedule range 6088–8286/8975.
- No behaviour change: the same DOM order, routes and handlers, and the existing schedule tests are untouched and green.
- After #398 is CLOSED live: rebase onto the new main, run a fresh precheck (including the nav kills at 768+), and only then merge.

Out of scope: JobFormModal, the Jobs page, the Dashboard, AppShell/nav code, dark contrast (S3), the ?look= gate (LOOK-GATE), and job colours.

## Coach ruling on finding 7 (2026-10-23 15:42 AEST)
Keep the hub-day-track scroller, with a tight exemption:
1. The allowlist holds only `.hub-day-track`, named in the kill file. Any new scroller needs a Coach ruling.
2. Inside it, children are measured up to the scroller's own rect. The scroller itself must keep rect.right ≤ innerWidth. The page-level max rect.right ≤ innerWidth stays as it is, header included.
3. Kill: the scroller really scrolls at 375/390/768 (scrollWidth > clientWidth and scrollLeft changes). Vertical page scroll over the board still works (no scroll trap).
4. Mutant: a non-allowlisted element pushed past innerWidth inside a fake overflow-x:auto wrapper must go RED.
5. LOOK: the cut-off edge must show there's more to the right (a partial hour column or a fade); otherwise FAIL.
The 768+ nav kill going green only after the rebase onto #398 is fine.

## BTS UI LOOK additions (2026-10-23 18:48 AEST, Schedule ranges only, look only)
1. Tracker stays plotted (Jack's lock, 27 Aug): day and week keep the plotted hours and day tracks. Empty days and hours still draw on the track, never collapsing into empty-state copy. A kill or frame shows an empty day drawn.
2. Week chips: ink is whichever of #FFFFFF or --g-ink (#0A0A0B) contrasts more with the painted chip colour, so ≥4.5 always and no job colour is exempt. The ref is nowrap and full width, never truncated; the description takes the ellipsis. '#0079.0' or '#0141.A' = FAIL.
3. Seg control (Week/Day): on = --g-inverse fill with white text; off = --g-ink-muted on surface. Visible focus is a 2px --g-accent ring with a 2px offset on every seg, quiet and Today button. Hit areas ≥44; the visual may be smaller.
4. Today marker: --g-accent text or a 2px underline, never a green or cream fill. Now-line is 2px --g-accent. No pulse animation.
5. Day board: hour lines in --g-line. The zebra alternates --g-bg (#F5F5F7) on --g-surface, with no #FFFDF8. The unassigned-crew dashed border and outline (BoardViews.tsx:737/747) use --g-line-strong or --g-ink-muted, not navy. The resize-handle hover (:835/:846) is a --g-accent tint, not navy/25.
6. Scroller edge (Coach ruling 5): at 375/390/768, .hub-day-track's right edge shows a partial hour column plus a 24px fade from transparent to --g-surface. The fade is pointer-events:none and doesn't cover the last tap target when scrolled to the end.
7. Quick book and Schedule sheet: scrim rgba(10,10,11,.4); sheet --g-surface with a hairline top and the one quiet elevation. Save and Prefill use --g-inverse. Cancel is surface with a --g-line border and --g-ink text. The footer honours safe-area-inset-bottom.
8. Tray: 'Unscheduled · N' and 'Set a date' each have a full 44px target, and the first tap expands, exactly as today (no regression).
9. Agenda time when there's no time: keep the existing strings on line 1 of the M2 stack in --g-ink-muted, with no own column.
10. Status pill (:7324): bg --g-well (#EBEBEE) with --g-ink text. Amber only on .ops-status-progress, as a pill.
Extra frames:
- Day view at 390, scrolled to the middle and to the end
- A zoomed crop of the 1024 week chips showing full refs
- A week frame with an empty day
- A keyboard focus frame on the seg control at 1280
The PR body also gets a hover-colour table (crew option, resize handle, chips).
