# P1b Today: layout spec (BTS UI, 2026-10-23, AEST)

**Status:** binding visual spec for P1b. It is a companion to `P1b-today-layout-brief.md` (CoS). The brief wins on data, structure, kills and acceptance. This spec wins on pixels, tokens, type and states. Section ids S1 to S16 and definitions D1 to D8 are the brief's ids.
**Theme:** LIGHT only. Dark stays gated (allowDark false, 0px change).
**Base:** main 30cb09d9 (#398). Tokens are from `src/styles/tokens.css` on that commit.

**Mockups.** Specced from the light half of the compare PNGs:
- `directions/compare-dark-vs-light-dashboard-390.png`: 1108×1801, **DPR 1**. Light phone at x510–899.
- `directions/compare-dark-vs-light-dashboard-1280.png`: 2888×1543, **DPR 1**. Light page at x1400–2679.

Measurements come from the same boards at **DPR 2**: `4-dark-light/dashboard-390-light.png` (780×3028 = 390×1514 CSS) and `dashboard-1280-light.png` (2560×2512 = 1280×1256 CSS). They were confirmed by rendering the board HTML with element rects at DPR 1 (`P1b-crops/_work/measure.txt`). All px below are **CSS px**.

**Crops:** `design/briefs/P1b-crops/`. Callouts use the S ids.

| File | Shows |
|---|---|
| 01 | 390 full |
| 02 | NOW + money zoom |
| 03 | Job rows zoom |
| 04 | Needs you zoom |
| 05 | 1280 top |
| 06 | 1280 bottom row |
| 07 | KPI zoom |
| 08, 09 | #398 live: keep/move/remove at 390 and 1280 |

Copy rule for this file: UI strings are in "quotes". None use an em dash. Time ranges use an en dash (13:00–14:00), as the mockup does.

---

## 0. What happens to the #398 page

| #398 element | P1b | Why |
|---|---|---|
| Black "Today" sheet bar (`header.dashboard-home-sheet-bar`) | **REMOVE** | The mockup has no bar. The h1 is the only title. Crops 08 and 09, callout X. |
| White sheet card around the whole page (`article.dashboard-home-sheet`, rounded, bordered) | **REMOVE** the visual card. Keep the `article` element unstyled. | The page sits on `--g-bg`. The NOW card is the only card, so there are no cards in cards. |
| h1 "Today" (`.dashboard-home-hero`) | KEEP and restyle (S2) | |
| Whisper line "date · company · N jobs" | SPLIT. Date and time go to the eyebrow (S1). Company, jobs and crew out go to the sub line (S3). | |
| Week board, primary black | KEEP and demote to **secondary** at 768+. It is not shown on phone; the phone has the "Week" link in S10. | Mockup |
| ⋯ overflow (DashboardHomeMore: Customize / Done editing) | KEEP as a 44×44 icon button. Phone: right of the h1. 768+: after New job. | Brief §2 |
| Reminders strip (capture + list), first on page | KEEP and MOVE below Needs you (phone) or below the bottom row (768+) | Coach outline |
| "From your jobs, quotes and invoices" nudges | MOVE into Needs you (S11). Remove the old block. | |
| "Today's schedule" ledger | REPLACE with Today's jobs (S10). Same query and row links. | |
| LoadingSpinner | REMOVE. Use skeletons in `--g-surface-2`. | |
| Widget grid | KEEP below Reminders as "Your widgets" (S16), unchanged. | Brief §2 |
| Shell (appbar, top nav, tab bar) | UNCHANGED. Do not copy the mockup's 1280 nav or its phone appbar search/avatar. | NAV_WORDS |
| Plotted day/week tracker (Schedule) | UNTOUCHED | |

## 1. Tokens (exact names, light values for reference only)

Mockup var → repo token. Never use raw hex in code.

| Use | Token |
|---|---|
| Page bg | `--g-bg` |
| Raised surface (secondary button fill) | `--g-surface` |
| Well and skeleton | `--g-surface-2` (**there is no `--g-well`**, see A1) |
| Primary ink, figures | `--g-ink` (mockup `--hero-figure`) |
| Muted and secondary text, icons | `--g-ink-muted`. Mockup `--muted` (#4A4A52) and `--text-2` both map here. 9.59:1 on bg, 10.44:1 on surface, 8.78:1 on surface-2. |
| Hairlines | `--g-line` |
| Strong rules, secondary button border, chart Out | `--g-line-strong` |
| KPI strip top rule | `--g-ink` (1px) |
| Links, quiet buttons | `--g-link`. Mockup `--link`, 7.90:1 on bg. Note: `--g-accent` is ink #0A0A0B on main, not blue; see A2. |
| Focus ring | `--g-focus` on light. `--g-live-dot` inside the NOW card. |
| Primary CTA | `--g-inverse`, `--g-inverse-ink`, `--g-inverse-hover` |
| NOW card | `--g-live-bg`, `--g-live`, `--g-live-dot` |
| Pills | `--g-ok`/`-bg`/`-dot`, `--g-warn`/`-bg`/`-dot`, `--g-sched`/`-bg`/`-dot`, `--g-draft`/`-bg`/`-dot`, plus live as above |
| Needs-you dots | `--g-warn-dot`, `--g-ink`, `--g-sent-dot`, `--g-sched-dot` |
| Chart | In = `--g-chart-1`, Out = `--g-chart-2`, baseline = `--g-line` |
| Radius | Card `--g-radius-lg` (14). Controls and date chip `--g-radius-md` (10). Pills `--g-radius-pill`. Skeleton `--g-radius-sm` (8). |
| Elevation | **None used on the page.** The NOW card is flat inverse. `--g-sh-1` is the only one allowed and is not needed. |
| Disabled | `--g-disabled-bg`, `--g-disabled-ink` |

Green (`--g-ok*`) and amber (`--g-warn*`) appear **only** in pills and dots or icons. **Deviation from the mockup:** the mockup paints "$462.00 overdue" and "10 days overdue" as amber text. P1b renders them as warn pills (S6, S13).

## 2. Type ramp (Geist only, `--g-font-sans`)

Steps: 12 / 13 / 14 / 16 / 20 / 24 / 40 / 56. Use `font-variant-numeric: tabular-nums` on every money figure, time, date number and count.

| Role | Size/LH | Wt | Tracking | fs token | Used by | Mockup px → snapped |
|---|---|---|---|---|---|---|
| R1 title-xl | 56/56 | 600 | -0.035em | `--g-fs-display` | h1 at ≥1024 | 56 |
| R2 title / hero money | 40/44 | 600 | -0.035em (h1), -0.03em (money) | `--g-fs-h1` | h1 below 1024, S6 figure (phone and KPI hero) | 40, 44→40 |
| R3 figure-2 | 24/30 | 600 | -0.02em | none, see A3 | NOW title, KPI figures S7–S9 | 24, 28→24 |
| R4 h2 | 20/26 | 600 | -0.015em | `--g-fs-title` | section heads | 20 |
| R5 strong | 16/22 | 600 | 0 | `--g-fs-input` | row titles, nudge titles, cash stats dd, date-chip number, button labels (16/20) | 15→16, 16, 17→16 |
| R6 body | 16/24 | 400 | 0 | `--g-fs-input` | sub line, NOW meta (16/22), empty-state text | 15→16, 16 |
| R7 meta | 14/20 | 400 (label 500) | 0 | `--g-fs-body` | meta, KPI label and note, Place cell, Outstanding label; **time = 14/20 600 ink** | 14, 15→14 |
| R8 eyebrow / th / pill | 13/16 | eyebrow 500 caps +0.1em; th 500; pill 600 | | `--g-fs-meta` | | 13 |
| R9 small | 12/16 | 500 | 0 | `--g-fs-small` | chart day labels, date-chip day, count badge, due line | 12, 13→12 for the due line |

Colour per role: R1–R5 use `--g-ink`. R6, R7, R8 eyebrow/th and R9 use `--g-ink-muted`. Exceptions: time, money figures and amounts use `--g-ink`, and pills use their own tokens.

## 3. Grid and breakpoints

| Width | Band | Page padding (T/R/B/L) | Content width | Max width |
|---|---|---|---|---|
| 375 | P (<640) | 4/16/24/16 | 343 | |
| 390 | P | 4/16/24/16 | 358 | |
| 768 | T (640–1023) | 24/24/48/24 | 720 | |
| 1024 | D (≥1024) | 32/32/56/32 | 960 | |
| 1280 | D | 40/32/64/32, centred | 1168 (x56–1224) | 1232 |

All grid tracks use `minmax(0, …)`. Every flex child that holds text has `min-width: 0`.

DOM order is the same at every width (brief §3, kill K15). Sections that do not show at a width are not rendered; they are not hidden with CSS. Order:
S1 eyebrow → S2 h1 row (+⋯) → S3 sub → S4 actions → S5 NOW → S6–S9 money/KPI → S10 Today's jobs → S11 Needs you → S13 Outstanding → S14 Cash flow → S15 Coming up → S12 Reminders → S16 Your widgets.

| Section | P (375/390) | T (768) | D 1024 | D 1280 |
|---|---|---|---|---|
| S4 actions | – (New job in ⋯) | own row under S3 | right of header | right of header |
| S5 NOW | yes | yes, full width | – | – |
| S6 | money block | KPI 2×2 | KPI ×4 | KPI ×4 |
| S7–S9 | – | KPI 2×2 | KPI ×4 | KPI ×4 |
| S10 | M2 stack, sr-only thead | table Time/Job/Status | table Time/Job/Status + Needs you side column | table Time/Job/Place/Status + Needs you side column |
| S11 | full width | full width | side column | side column |
| S13–S15 | – | stacked full width | 3 columns | 3 columns |
| S12, S16 | full width | full width | full width | full width |

Vertical rhythm, as measured:

| Gap | Size |
|---|---|
| eyebrow → h1 | 6 |
| h1 → sub | 6 (P) / 10 (D) |
| sub → NOW | 20 |
| NOW → money | 16 |
| Section to section (P) | 28 |
| Header bottom padding (D) | 28 |
| KPI → grid2 (D) | 40 |
| grid2 → grid3 (D) | 48 |
| → Reminders (T/D) | 48 |
| → Your widgets | 48 (P 28) |
| Section head height | 44, with 6 below |

---

## 4. Sections

Each section covers: 1 DOM, 2 box, 3 tokens, 4 type, 5 content, 6 states, 7 taps, 8 at 768/1024, 9 a11y.

### S1–S3 Header (eyebrow, h1, sub). Crops 01 and 05, callout S1-3
1. **DOM:** `header.today-head` > `div.today-head-text` > `p.eyebrow`, then `div.today-title-row` > `h1` + ⋯ button (P only), then `p.today-sub`. Then S4 `div.today-actions` (T/D).
2. **Box:** P: block, eyebrow at y60 (4px under the 56px shell bar), h1 top at y82, sub top at y132. D: `display:flex; align-items:flex-end; justify-content:space-between; gap:24; padding-bottom:28`, with the text block `flex:1 1 auto; min-width:0`. 1280: eyebrow y104, h1 y130, sub y196, header bottom y248.
3. **Tokens:** eyebrow and sub `--g-ink-muted`; h1 `--g-ink`.
4. **Type:** eyebrow R8 (500, uppercase, +0.1em, tabular time). h1 R2 (<1024) / R1 (≥1024). Sub R6.
5. **Content:**
   - Eyebrow P: "Mon 19 Oct · 13:40". 768+: "Monday 19 October · 13:40". Device-local 24h time (D/F5). It updates each minute.
   - h1 is the string from `NAV_WORDS.today`.
   - Sub P and T: "5 jobs · 4 crew out". D: "Northside Plumbing & Gas · 5 jobs · 4 crew out". Use the singular forms "1 job" and "1 crew out".
   - Each segment is a `nowrap` span. A break may only fall after " · ". The company segment is the exception: it may wrap at spaces, and `overflow-wrap:anywhere` applies only when a single word is wider than the line.
   - Never ellipsis.
6. **States:**
   - Loading: eyebrow and h1 render at once (no data). The sub becomes a skeleton bar 14×180, radius sm.
   - 0 jobs: "No jobs today". Drop the crew segment.
   - Crew 0 with jobs: "3 jobs · No crew out".
   - 53-character company at 1280: the sub wraps to at most 2 lines inside the text block. The actions stay bottom-aligned and do not move.
   - Error (jobs query): the sub omits the counts and shows only the company at D. S10 carries the error.
7. **Taps:** none. The ⋯ button is S4.
8. **768:** h1 R2, sub without company, S4 on its own row. **1024:** as 1280, but the company sub wraps sooner.
9. **A11y:** this is the only `h1`. The eyebrow is a `p`, not `aria-live`. Use `<time datetime>` for the date.

### S4 Header actions. Crop 05, callouts S4a and S4b
1. **DOM:** `div.today-actions` > `a.btn-secondary` "Week board", then `button.btn-primary` "New job", then the ⋯ `button.icon-btn`.
2. **Box:** flex, gap 10, `flex:none`.
   - Buttons: h48, padding 0 18 0 16, radius md, 20px icon with a gap of 8. Week board measures 158×48 and New job 129×48 at 1280 (x927 and x1095, y172).
   - Icon button: 44×44.
   - T: the row sits under S3 with margin-top 16 and left-aligned.
3. **Tokens:**
   - Secondary: bg `--g-surface`, text `--g-ink`, `inset 0 0 0 1px --g-line-strong`, hover bg `--g-surface-2`.
   - Primary: `--g-inverse`, `--g-inverse-ink`, hover `--g-inverse-hover`.
   - Focus: 2px `--g-focus`, offset 2.
4. **Type:** R5 at 16/20.
5. **Content:** "Week board" with a calendar icon. "New job" with a plus icon. Neither wraps.
6. **States:** always rendered. New job is disabled (`--g-disabled-*`) only if the user lacks job create permission, mirroring JobsPage.
7. **Taps:**
   - Week board → `/schedule`. Keep the existing link, including its empty-day "Open schedule" behaviour; see A13.
   - New job opens the existing `JobFormModal` in place, as on the Jobs page (brief S4). No new route.
   - ⋯ opens Customize / Done editing. On phone it also holds "New job".
8. **768:** as above, on its own row. **1024:** right side of the header.
9. **A11y:** real `a` and `button` elements. The ⋯ button has `aria-label="More"` and `aria-haspopup="menu"`.

### S5 NOW card (P and T only). Crops 01, 02, callout S5
1. **DOM:** `section.now[aria-labelledby]` > `h2.eyebrow` "Now · 13:00–14:00" > `p.now-title` > `p.now-meta` > `div.now-actions` (`a` Directions, `a` Open job).
2. **Box:**
   - Full content width (358 at 390, 343 at 375). Measured height 176 at y176.
   - Padding 18/18/16, radius `--g-radius-lg`, no border, no shadow.
   - Gaps: eyebrow → title 8, title → meta 6, meta → actions 16.
   - Actions: `grid-template-columns: 1fr 1fr; gap:10`, buttons h48 radius md (156×48 at 390, 148.5×48 at 375).
   - T: full width 720. Buttons are capped at 220 each and left-aligned (`grid-template-columns: repeat(2, minmax(0,220px))`).
3. **Tokens:**
   - Card: `--g-live-bg`, text `--g-live`. The eyebrow is `--g-live` at full opacity; do not dim it.
   - Directions: bg `--g-live`, text and icon `--g-live-bg`.
   - Open job: transparent, `inset 0 0 0 1px --g-live`, text `--g-live`, hover bg `--g-inverse-hover`.
   - Focus: `--g-live-dot`.
4. **Type:** eyebrow R8. Title R3 (24/30). Meta R6 at 16/22 in `--g-live`. Buttons R5.
5. **Content:**
   - Choose the job by D3. Eyebrow "Now · 13:00–14:00", or "Now · On site" (in_progress and untimed), or "Next · 14:30–16:00".
   - Title clamps at 2 lines.
   - Meta is "#0038 · Kedron Medical Centre · Dean". The segment rule from S3 applies, and the meta clamps at 2 lines.
   - "Directions" has a navigation-arrow icon of 20.
6. **States:**
   - Loading: the card shape is a 176px block in `--g-surface-2` (not live-bg), with 3 inner bars and 2 button blocks in `--g-skeleton`.
   - No current or next job (D3): no card. Show a flat line `p.now-empty` "Nothing on right now", R6 muted, padding 14 0, hairline bottom, h48.
   - Empty day: the same line.
   - No site address: Directions is not rendered, and Open job spans both columns.
   - Long title or client: clamps as above. Card height grows; the buttons stay at 48.
   - Error: the card is replaced by the same flat line, with "Could not load jobs" and a "Try again" quiet button (44).
7. **Taps:**
   - Directions → external maps URL from the D3 site address, in a new tab (`rel="noopener"`). See A9.
   - Open job → `/jobs/:id`.
   - The card itself is not a link.
8. **768:** shown. **1024+:** not rendered (brief Q2, mockup). The in-progress job is visible in S10.
9. **A11y:** the eyebrow is the section `h2`. Directions has `aria-label="Directions to <site>"`. The icon is `aria-hidden`.

### S6 Outstanding (P money block) / S6–S9 KPI strip (T/D). Crops 02 and 07
**P money block**
1. **DOM:** `section.money[aria-labelledby]` > `div` (`p#lbl` "Outstanding", `p.fig`) + warn pill.
2. **Box:**
   - y368–474 at 390 (h106), margin-top 16, padding 18 0.
   - Hairline top and bottom (`--g-line`). No card and no background.
   - Flex `justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:8 12`.
   - Pill margin-bottom 9, so it centres on the figure line.
   - The figure never shrinks. If the pill does not fit, it wraps under the figure, left-aligned.
3. **Tokens:** label `--g-ink-muted`, figure `--g-ink`, pill warn.
4. **Type:** label R7 500. Figure R2 40/44, -0.03em, tabular. Pill R8.
5. **Content:**
   - "Outstanding" and "$3,579.65" (D1).
   - Pill "$462.00 overdue" with a warn dot.
   - **This is the biggest figure in its block.**
6. **States:**
   - Loading: a label bar 14×96 and a figure bar 40×200 in `--g-surface-2`.
   - Zero outstanding: "$0.00" in ink with no pill. Do not hide the block; zero is real data.
   - No overdue: no pill.
   - Long money ("$1,234,567.89"): about 270px at 40px, so it fits 343, and the pill wraps.
   - Error: "Could not load invoices" with "Try again", R6 muted.
7. **Taps:** the whole block is a link to `/invoices`, min-h ≥44. It is a full-block `a` with no visible chevron; see A10.
8. Not shown at T/D. The KPI strip replaces it.
9. **A11y:** region named "Outstanding". The figure is a plain `p`.

**T/D KPI strip.** Crop 07, callouts S6–S9
1. **DOM:** `section.kpis[aria-label="Key figures"]` > `dl` > 4 × `div.kpi` (`dt` label, `dd.fig`, `dd.note`).
2. **Box:**
   - 1280: y248–392 (h144). `grid-template-columns: minmax(0,1.35fr) repeat(3, minmax(0,1fr))`, which gives cells of 362.5 and 268.5×3.
   - Rules: border-top 1px `--g-ink`, border-bottom 1px `--g-line`.
   - Cells: padding 20 24 22, `border-left:1px --g-line`. The first cell has padding-left 0 and no border.
   - Gaps: label → fig 6, fig → note 6.
   - T: `repeat(2, minmax(0,1fr))`, with a hairline between rows. The first cell of each row has padding-left 0 and no left border.
3. **Tokens:** label and note `--g-ink-muted`, figures `--g-ink`, pill warn.
4. **Type:** label R7 500. S6 figure R2 40/44 (hero). S7–S9 figures R3 24/30. Note R7, which carries the pill at R8 when present.
5. **Content:**

   | Cell | Label | Figure | Note |
   |---|---|---|---|
   | S6 | "Outstanding" | "$3,579.65" | pill "$462.00 overdue" + " · 3 invoices" |
   | S7 | "Ready to invoice" | "2 jobs" | "#0036 and #0037", or "#0036, #0037 +3" |
   | S8 | "In, last 7 days" | "$4,214.30" | "Out $1,862.75" |
   | S9 | "Net, last 7 days" | "$2,351.55" | "Tue 13 to Mon 19 Oct" |

   - A negative Net is "-$120.00" in `--g-ink`. Do not use red text.
   - Figures are `nowrap` and never ellipsised.
   - Notes wrap at " · " only.
6. **States:**
   - Loading: each cell has bars 14×110, then 40×200 (S6) or 24×120, then 14×140.
   - Zero values: "$0.00" or "0 jobs", with notes "No open invoices" and "Nothing waiting".
   - No overdue: the note is "3 invoices".
   - Error: per cell, the figure becomes "Not available" (R7 muted) with no pill.
   - If D6 is not approved: S9 is not rendered and S8's note is dropped. The grid becomes `1.35fr 1fr 1fr` (D) or 2+1 (T).
7. **Taps:**
   - S6 cell → `/invoices`.
   - S7 cell → `/jobs?status=completed` per brief S11. If that param does not filter on main, use `/jobs`; see A10.
   - S8 and S9 are not links.
   - Linked cells are full-cell `a` elements (≥44).
8. **768:** 2×2. **1024:** 4-up (S6 col 298, inner 274; the long-money fixture fits). See A5.
9. **A11y:** `dl` semantics. Linked cells use `aria-describedby` for the note.

### S10 Today's jobs. Crops 01, 03, 05, callout S10
1. **DOM:**
   - `section[aria-labelledby]` > `div.sec-h` (`h2` "Today's jobs", quiet link) > `table`.
   - The table has `caption.sr-only` "Today's jobs", `thead` (Time, Job, [Place], Status) and `tbody tr`.
   - Each Job cell holds an `a` (title) with a stretched `::after` over the row.
2. **Box:**
   - **D (table):** sec-h h44 with margin-bottom 6. Column widths at 1280: Time 120, Job 1fr (307), Place 134, Status 177.5 (right-aligned). The table is 739 wide.
     - th: padding 0 12 10 0, bottom hairline.
     - td: padding 14 12 14 0, bottom hairline, vertical-align top. Rows are 73 at 1 line of meta.
     - Place column only at ≥1200. Below that, place folds into meta.
   - **T:** Time 120 / Job 1fr / Status auto.
   - **P (M2 stack, binding rule over mockup):**
     - Each `tr` is `display:flex; flex-direction:column; align-items:flex-start; gap:2`, padding 14 0, hairline bottom.
     - time, title, meta and pill share **one left x** (16).
     - The pill has margin-top 6 and `align-self:flex-start`.
     - Rows are min-h 72; about 120 with one line of meta.
     - thead is `sr-only`. Keep table semantics with explicit `role=table/row/cell/columnheader`, because `display:flex` on `tr` drops them.
     - The mockup's 64px time column is not used; see A4.
3. **Tokens:** row hairline `--g-line`; time, title and amounts `--g-ink`; meta and th `--g-ink-muted`. Pills per D7:

   | Pill | Tokens |
   |---|---|
   | "Ready to invoice" | `--g-ok-bg` / `--g-ok` / `--g-ok-dot` |
   | "Needs crew" | warn |
   | "In progress" | `--g-live-bg` / `--g-live` / `--g-live-dot` |
   | "Booked" | sched (A6) |
   | "Done" | draft |

   Pill box: h26, padding 0 10 0 9, 7px dot, gap 6, radius pill, `nowrap`.
4. **Type:** time R7 600 tabular ink, e.g. "07:00–10:30", nowrap, "All day" when untimed. Title R5. Meta R7. th R8 500. Pill R8 600. Place R7.
5. **Content:**
   - Rows come from D (todaysDashboardJobs), in main's sort order.
   - Meta at P: "#0036 · Stafford · Dean, Tom" (ref · suburb · crew, as in the mockup).
   - Meta at T and D below 1200: "#0036 · Brooke Lawson · Stafford · Dean, Tom".
   - Meta at ≥1200: "#0036 · Brooke Lawson · Dean, Tom", plus the Place cell "Stafford".
   - With no crew, the crew segment reads "No crew yet" (D7).
   - Every meta segment is `nowrap` and breaks only after " · ". A single segment wider than the line may wrap (`overflow-wrap:anywhere`).
   - Title clamps at 2 lines and meta at 2 lines.
   - **Cap:** P 6 rows, T/D 8 rows. After that comes a final row "All 12 jobs in Schedule ›" (quiet link, h44) → `/schedule`.
6. **States:**
   - Loading: 3 skeleton rows. Each has a 14×80 bar, a 16×220 bar, a 14×160 bar and a 26×96 pill block, all in `--g-surface-2`, with hairlines kept.
   - Empty day: no table. Show "Nothing on today" (R5) and "No jobs are booked for today. The week is on the schedule." (R6 muted), left-aligned with padding 14 0. The sec-h link stays.
   - Long strings: as in 5. Pill never wraps or overflows.
   - Error: "Could not load today's jobs" R6 muted, plus a "Try again" quiet button (44).
7. **Taps:**
   - Row → `/jobs/:id` (scheduleJobHref). One tab stop per row.
   - Quiet link: "Week" at P, "Schedule" at T/D → `/schedule`. h44, padding 0 12, right edge flush (margin-right -12), chevron 16.
8. **768:** table without Place. **1024:** table 608 wide beside Needs you, without Place.
9. **A11y:**
   - Real `thead` at ≥640 and `sr-only` thead below 640, with `scope=col`.
   - Status is text in the pill; the dot is `aria-hidden`.
   - The "In progress" row has `aria-current="true"` if it is the D3 job.

### S11 Needs you. Crops 04 and 05, callout S11
1. **DOM:** `section[aria-labelledby]` > `div.sec-h` (`h2` "Needs you", D: `span.count`) > `ul` > `li` > `a` (dot, `div` (title, meta), caret).
2. **Box:**
   - P/T: full width, after S10 with a 28px gap (T 40).
   - D: second column of grid2: `grid-template-columns: minmax(0,1.9fr) minmax(280px,1fr); gap:40` (1024: gap 32). Column 389 at 1280 (x835), 320 at 1024.
   - Rows: `display:flex; gap:12; padding:14 0`, min-h 64 (71 measured), hairline bottom.
   - Dot: 8×8, margin-top 7. Caret: 20, `--g-ink-muted`, `align-self:center`.
3. **Tokens:** title `--g-ink`, meta `--g-ink-muted`. Dots by kind:

   | Kind | Dot |
   |---|---|
   | invoice_unpaid, overdue | `--g-warn-dot` |
   | invoice_unpaid, not overdue | `--g-sent-dot` |
   | ready_to_invoice | `--g-ink` |
   | quote_chase | `--g-sent-dot` |
   | jobs_tomorrow, leave_soon | `--g-sched-dot` |

4. **Type:** title R5. Meta R7. Count R9 muted, tabular.
5. **Content:**
   - Items are main's nudge strings, unchanged (brief Q4), plus the new ready_to_invoice item.
   - Amount segments are `nowrap`, which fixes the r12 nit where the amount wrapped at 390.
   - Title clamps at 2 lines and meta at 2 lines.
   - **Cap:** P 3, T/D 4. After that comes a quiet button "Show all 7" (h44) that expands in place. There is no route for nudges; see A11.
6. **States:**
   - Loading: 3 rows, each a dot block 8×8 and bars 16×200 and 14×160.
   - Empty: a single line "Nothing needs you right now" (R6 muted, padding 14 0). The count is hidden.
   - Error: "Could not load" with "Try again".
7. **Taps:** row → `n.href` (existing nudge hrefs). The whole row is the link; the caret is decorative.
8. **768:** full width. **1024:** side column.
9. **A11y:** `ul`/`li`. The count has `aria-label="4 items"`. Dot and caret are `aria-hidden`.

### S13 Outstanding list (T/D). Crop 06, callout S13
1. **DOM:** `section` > sec-h (`h2` "Outstanding", quiet "All") > `ul` > `li` > `a.mini-row`.
2. **Box:**
   - D: grid3 column 1: `repeat(3, minmax(0,1fr)); gap:40` (1024: 32), margin-top 48. Columns are 362.7 at 1280 and 298 at 1024.
   - Row: `grid-template-columns: 56px minmax(0,1fr) auto; gap:12; padding:12 0`, min-h 64, hairline bottom.
3. **Tokens:** ref and amount `--g-ink`, client `--g-ink`, due line `--g-ink-muted`, overdue pill warn.
4. **Type:** ref R7 600 tabular. Client R5 at 16/22. Due R9 muted. Amount R5 tabular, right-aligned.
5. **Content:**
   - Ordered by created_at desc, as in the brief, cap 3.
   - Each row: "#0112", "Sarah Whitfield", "Due Fri 30 Oct" or the pill "10 days overdue", "$1,929.65".
   - Client is 1 line with ellipsis.
   - Ref and amount are `nowrap`.
6. **States:**
   - Loading: 3 rows of skeleton.
   - Empty: "No open invoices" R6 muted.
   - Error: inline with "Try again".
7. **Taps:**
   - "All" → `/invoices`.
   - Row → `/invoices?id=<id>`, the existing param, without `send=1`.
8. **768:** full width, stacked. **1024:** column.
9. **A11y:** `ul`. The pill is text.

### S14 Cash flow (T/D). Crop 06, callout S14
1. **DOM:** `section` > sec-h (`h2` "Cash flow", `span` "7 days") > `dl.stats` (In, Out, Net) > `svg[role=img]` > `div.days` (7 labels) > `table.sr-only`.
2. **Box:**
   - stats: flex, gap 28, margin 6 0 16.
   - svg: width 100%, height 96, `preserveAspectRatio="none"`.
   - Plot: 7 equal day slots. Each slot has a centred pair of bars, 10 wide each with a 3px gap, top corners r2.
   - The max bar is 80, scaled to the max of In and Out over the 7 days.
   - Baseline: 1px `--g-line` at the bottom.
   - Day labels: HTML 7-col grid, 12/16 centred, margin-top 6. They are not SVG text, so they do not distort.
   - There is no y-axis.
3. **Tokens:** In `--g-chart-1`, Out `--g-chart-2`, baseline `--g-line`, labels `--g-ink-muted`. Each dt gets an 8×8 swatch, radius 2, in the series token; see A7.
4. **Type:** dt R8 500 muted. dd R5 tabular. Day labels R9.
5. **Content:**
   - Stats "In $4,214.30", "Out $1,862.75", "Net $2,351.55" (D5, D6).
   - Day labels Tue…Mon, ending today.
6. **States:**
   - Loading: 3 stat bars and a 96px block in `--g-surface-2`.
   - All zero: stats "$0.00", baseline only, and the aria-label says "No money in or out in the last 7 days".
   - D6 not approved: Out and Net are removed and only In bars show.
   - Error: inline with "Try again".
7. **Taps:** none (brief: the chart has no taps).
8. **768:** full width, so the bars spread across 720. **1024:** column.
9. **A11y:**
   - svg `aria-label="Money in and out, last 7 days. In $4,214.30, out $1,862.75."`
   - Plus `table.sr-only` with caption "Money in and out by day" and columns Day / In / Out, in 7 rows.
   - The Out bars are 2.35:1 against bg, below 3:1. The numbers are carried in text and the table.

### S15 Coming up (T/D). Crop 06, callout S15
1. **DOM:** `section` > sec-h (`h2` "Coming up", quiet "Week") > `ul` > `li` > `a` (date chip, `div` (title, meta), crew).
2. **Box:**
   - Row: `grid-template-columns: 48px minmax(0,1fr) auto; gap:12; padding:12 0`, min-h 72, hairline bottom.
   - Date chip: 48×48, radius md, `inset 0 0 0 1px --g-line-strong`, bg `--g-surface`.
   - Crew: max-width 96, ellipsis.
3. **Tokens:** chip day `--g-ink-muted`, chip number `--g-ink`, title `--g-ink`, meta and crew `--g-ink-muted`.
4. **Type:** chip day R9 and number R5 tabular. Title R5 at 16/22. Meta R9 at 13→12. Crew R9.
5. **Content:**
   - Next 3 jobs after today (Q-D).
   - Each row: "Tue" / "20", "Toilet cistern replacement", "07:30 · Gwen Albright · Kedron", "Tom".
   - Title is 1 line with ellipsis. Meta segments are `nowrap`, with 2 lines max.
6. **States:**
   - Loading: 3 rows with chip blocks.
   - Empty: "Nothing booked after today" R6 muted.
   - Error: inline.
7. **Taps:** row → `/jobs/:id`. "Week" → `/schedule`.
8. **768:** full width. **1024:** column.
9. **A11y:** the chip has `aria-label="Tuesday 20 October"`.

### S12 Reminders (existing, restyle only)
1. **DOM:** unchanged: `h2` "Reminders", "All" link, capture form, ReminderRow list.
2. **Box:** P after S11 with a 28px gap. T/D full width after grid3 with a 48px gap. Capture input h48, radius md. Rows have hairlines and no card.
3. **Tokens:**
   - Input: `--g-surface` with `--g-input-line`.
   - Add button: `--g-inverse` when enabled, `--g-disabled-*` when empty.
4. **Type:** title R5, meta R7, input 16 (`--g-fs-input`).
5. **Content:**
   - The live copy contains em dashes in user data only. That is allowed, but static copy must not.
   - Cap 5 rows, then "All" → `/reminders`.
6. **States:** existing empty state. Loading: 3 skeleton rows. Error: inline.
7. **Taps:** existing (`/reminders`, `/reminders/:id`). The check circle hit area is ≥44.
8. Full width at all bands.
9. **A11y:** h2. The form has a label "What do you need to remember?" (visible placeholder plus `aria-label`).

### S16 Your widgets (existing)
- `h2` "Your widgets", margin-top 48 (P 28), then the unchanged view grid.
- The edit mode is unchanged.
- In edit, S1–S15 stay visible above (brief §2).
- The only visual change is that the spinner is replaced by skeleton tiles in `--g-surface-2`.

---

## 5. Section → data source

| S | Data | Source on main | Status |
|---|---|---|---|
| S1 | Device date/time | dashboardHeadingDate + new HH:mm helper | ok |
| S3 | Jobs count | today jobs query | ok |
| S3 | Crew out | D2 over assigned_team | **DATA-CHECK** |
| S3 | Company | company context | ok |
| S5 | NOW job | D3 over today jobs | **DATA-CHECK** |
| S5 | Directions | job.address, else client.address (dashboardJobSite). `mapsHref` exists in `clientRecords.ts:178`. | A9 |
| S6 | Outstanding, overdue, count | invoices sent/overdue/part_paid, invoiceBalanceOwed (D1) | ok |
| S7 | Ready to invoice | completed jobs without a non-void invoice (D4, Q-A) | **DATA-CHECK** |
| S8 | In, last 7 days | invoice_payments (D5, Q-B), "payments" | ok, but definition **DATA-CHECK** |
| S8, S9, S14 | Out and Net | expenses (D6, Q-C). Expenses are not in the allowed list. | **DATA-CHECK** |
| S10 | Rows | today jobs + get_company_members | ok |
| S10 | Pill | D7 | "Needs crew" has no live data: **DATA-CHECK** |
| S11 | Nudges | deriveNudges | ok |
| S11 | ready_to_invoice | new kind (Q-A) | **DATA-CHECK** |
| S11 | "2 jobs tomorrow" rollup | rollup >3 on main | **DATA-CHECK** (Q4) |
| S12 | Reminders | listReminders | ok |
| S13 | Top 3 open invoices + clients | S6 query | ok |
| S14 | Daily buckets | Q-B, Q-C | **DATA-CHECK** (with D5/D6) |
| S15 | Next 3 jobs | Q-D | **DATA-CHECK** |
| S16 | Widgets | dashboard_widgets | ok |
| S16 | cash_flow widget | broken on main (F1) | **DATA-CHECK** |

## 6. LOOK acceptance

Fixtures are the brief's TODAY_FIXTURE, with the clock at Mon 19 Oct 2026 13:40. **Long** fixture:
- company "Northside Plumbing Gas and Drainage Services Pty Ltd." (53 characters)
- job title "Replace hot water system and relocate tempering valve to laundry wall"
- client "Body Corporate for Kedron Brook Riverside Apartments CTS 41872"
- Outstanding "$1,234,567.89"
- 9 jobs today and 7 nudges

### Frames (`docs/look/p1b/`)

| Frame | Width | Scroll | Fixture |
|---|---|---|---|
| L1 | 375 | top | default |
| L2 | 375 | scrolled to S11/S12 | default |
| L3 | 390 | top | default |
| L4 | 390 | scrolled | default |
| L5 | 768 | top | default |
| L6 | 768 | scrolled to S13–S15 | default |
| L7 | 1024 | top | default |
| L8 | 1024 | scrolled | default |
| L9 | 1280 | top | default |
| L10 | 1280 | scrolled to grid3/S12 | default |
| L11 | 390 | top | clock 23:00, no current job; NOW empty line. Also 1280 with clock 23:00. |
| L12 | 390 | top | empty day (0 jobs, 0 invoices, 0 payments). Also 1280. |
| L13 | 375 | top and scrolled | long |
| L14 | 1280 | top | long |
| L15 (optional) | 390 | | loading, network held |

### Pass criteria

**All frames:**
- `scrollWidth ≤ innerWidth`, and every node's right ≤ its clipping ancestor's right.
- Exactly 1 `h1`.
- No black bar, and no element with `--g-live-bg` background other than S5 and live pills.
- No em dash in static copy.
- Every `a` and `button` is ≥44×44.
- Green and amber pixels appear only inside `.pill` or dot or icon boxes.
- Muted text is ≥7:1 and CTAs are ≥4.5:1.
- There is no `box-shadow` on page sections.

| Section | Pass |
|---|---|
| S1–S3 | Eyebrow top = 60 at P (±1), 13px, uppercase. h1 is 40px at P/T and 56px at D. Sub has no ellipsis. In L14 the sub is ≤2 lines and the S4 buttons' bottom = text block bottom (±1). |
| S4 | Absent at P. 48h at T/D. Week board is before New job. New job bg = `--g-inverse`. |
| S5 | At P: x=16 and width = vw−32 (±0.5), radius 14, padding 18. Both buttons are h48 and equal width (±0.5). Absent at D. In L11 the card is absent and the line "Nothing on right now" is h48. |
| S6 P | Figure font-size 40 = the max font-size inside the block. Pill height 26. Hairline top and bottom. In L12: "$0.00" and no pill. In L13: the figure is on one line and the pill is under it. |
| S6–S9 T/D | 4 cells at D in ratio 1.35:1:1:1 (±1px). 2×2 at T. The S6 figure is 40 and > every other KPI figure (24). Top rule is 1px ink. |
| S10 P | For every row, the left x of time, title, meta and pill are equal (±0.5). Pill width < row width and pill right < row right. thead is `sr-only` (1×1 clip). |
| S10 T/D | Visible thead. Place column only at 1280. Status cell right-aligned. Rows are ≥72. In L14: title ≤2 lines, no overlap with the pill, and the cap row "All 9 jobs in Schedule" is present. |
| S11 | P shows ≤3 rows and D ≤4, plus "Show all". Rows ≥64. At D: column x = table right + 40 (1280) or + 32 (1024). Amounts are on one line. |
| S13–S15 | 3 equal columns at D (±1). Stacked at T. Absent at P. Chart has 7 slots, the svg aria-label is present, and an sr-only table with 7 rows exists. |
| S12/S16 | Below S15 (T/D) or below S11 (P). Rect tops are monotone in the §3 order. |
| L15 | No spinner element. Skeleton fills = `--g-surface-2`. Layout shift on data arrival ≤ 1 row height per section. |

---

## 7. AMBIGUOUS (recommended default in bold)
- **A1** `--g-well` does not exist. **Use `--g-surface-2`** for skeletons and wells (the alternative is `--g-skeleton`, #E4E4E7).
- **A2** The brief's "accent #183FB8" is `--g-link`/`--g-focus` on main, and `--g-accent` is ink. **Use `--g-link` for quiet links and `--g-focus` for rings.** Handoff block 4 also lists ink-muted #4A4A52; main is #3F3F46. **Use main.**
- **A3** 24px has no `--g-fs-*` token. **Use a literal 24px in the page stylesheet.** Do not add a token in P1b (tokens.css is untouched).
- **A4** The mockup phone has a 64px time column, which conflicts with the M2 rule. **M2 wins below 640:** single left x, with time on its own line.
- **A5** The mockup CSS makes the KPIs 2×2 at ≤1100. **4-up at ≥1024** (the snapped sizes fit) and 2×2 at 640–1023.
- **A6** The "Booked" pill colour is not in the mockup. **Use sched (purple).** "Done" uses draft.
- **A7** The chart has no legend in the mockup. **Add an 8px swatch before the In and Out labels.**
- **A8** The type snap is 15→16 (sub, nudge title, NOW meta), 15→14 (time, Place), 17→16, 28→24, 44→40. **Keep 56 at ≥1024** for h1 (`--g-fs-display`). The alternative is 40 everywhere.
- **A9** Directions URL. The brief proposes `google.com/maps/dir/?api=1&destination=`, but main already has `mapsHref` (`maps.google.com/?q=`). **Use the dir URL**, because the button says Directions.
- **A10** KPI and money taps. **S6 → `/invoices`, S7 → `/jobs?status=completed`** (fallback `/jobs` if the param is unsupported), and S8/S9 have no link. The phone money block is a link with no chevron.
- **A11** There is no route for "All" Needs you items. **Use an in-place "Show all N" expander.**
- **A12** Phone meta in S10 is **ref · suburb · crew** (mockup). The brief says ref · client · crew. 640–1199 shows all four segments.
- **A13** The empty-day header action: main shows "Open schedule" instead of "Week board". **Always show "Week board".** The empty state in S10 carries the schedule hint.
- **A14** Company name in the sub: **D only**, as in the mockup. At P/T it is omitted, and the shell shows the company at 768+.
- **A15** S10 caps are **P 6 / T and D 8**. S11 caps are P 3 / D 4. S13 and S15 show 3.
- **A16** The NOW card at T. **Shown** (brief Q2 proposal), with buttons capped at 220.
- **A17** The NOW-empty line in an empty day duplicates the S10 empty state. **Keep it** (brief K5 and K11).
- **A18** The S13 overdue line becomes a warn pill rather than amber text, and the S6 overdue likewise. This is a binding colour rule over the mockup.

## 8. DATA-CHECK for CoS
- **DC1** Crew out (D2): which job statuses count.
- **DC2** NOW job (D3): company-wide or viewer-only, untimed handling, and NEXT fallback.
- **DC3** Ready to invoice (D4): draft invoice counts as invoiced, the 30-day window, and child visits. It is also a new derived nudge kind.
- **DC4** In, last 7 days (D5): payments on void invoices, and device-local dates.
- **DC5** Out and Net (D6): **expenses are not in the allowed data list** (jobs, schedule, crew, quotes, invoices, payments, reminders). If refused, drop S9, the Out stat and the Out bars.
- **DC6** "Needs crew" has no live data on 40183ed1. A seed is needed to prove it (brief Live prove).
- **DC7** "N jobs tomorrow" rollup and Needs you copy (Q4).
- **DC8** Coming up Q-D: whether in_progress jobs on future dates count, and whether to exclude today.
- **DC9** Chart daily buckets by paid_at and expense_date.
- **DC10** The existing cash_flow widget is broken (F1): fix it or leave it (Q5). The duplicate widgets question is Q6.
- **DC11** Money visible to crew-role users (Q9).
