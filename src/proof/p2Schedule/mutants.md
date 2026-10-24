# r11 real-file src mutants (outside the suite)

No test writes a tracked file. No in-test rebuild. Harvest is: patch the listed `find` → `replace` in the listed src file, `npm run build` when the kill reads dist, run the listed vitest command, confirm the AssertionError, then `git checkout -- <file>`.

Named harness `?mutant=` queries do not count.

## it() file:line (r11)

| kill | it() |
|---|---|
| P2-palette | `src/proof/p2Schedule/kill.ts:45` |
| P2-contrast | `src/proof/p2Schedule/kill.ts:55` |
| P2-taps | `src/proof/p2Schedule/kill.ts:65` |
| P2-lines | `src/proof/p2Schedule/kill.ts:76` |
| P2-m2 | `src/proof/p2Schedule/kill.ts:90` |
| P2-dark | `src/proof/p2Schedule/kill.ts:126` |
| P2-overflow | `src/proof/p2Schedule/kill.ts:134` |
| P2-text | `src/proof/p2Schedule/kill.ts:198` |
| P2-webkit | `src/proof/p2Schedule/kill.ts:204` |
| P2-day-track | `src/proof/p2Schedule/kill.ts:220` |
| P2-nav-phone | `src/proof/p2Schedule/kill.ts:236` |
| P2-nav-desktop | `src/proof/p2Schedule/kill.ts:249` |
| P2-mocks | `src/proof/p2Schedule/kill.ts:255` |
| P2-tracker | `src/proof/p2Schedule/kill.ts:268` |
| P2-chip | `src/proof/p2Schedule/kill.ts:288` |
| P2-focus | `src/proof/p2Schedule/kill.ts:310` |
| P2-now | `src/proof/p2Schedule/kill.ts:328` |
| P2-day-board | `src/proof/p2Schedule/kill.ts:350` |
| P2-scroller | `src/proof/p2Schedule/kill.ts:370` |
| P2-sheet | `src/proof/p2Schedule/kill.ts:387` |
| P2-tray | `src/proof/p2Schedule/kill.ts:415` |
| P2-status | `src/proof/p2Schedule/kill.ts:426` |
| K1 | `src/proof/p2Schedule/kill.ts:441` |
| K2 | `src/proof/p2Schedule/kill.ts:464` |
| K3 | `src/proof/p2Schedule/kill.ts:484` |
| K4 | `src/proof/p2Schedule/kill.ts:493` |
| K5 | `src/proof/p2Schedule/kill.ts:507` |
| K6 | `src/proof/p2Schedule/kill.ts:519` |
| K7 | `src/proof/p2Schedule/kill.ts:533` |
| K8 | `src/proof/p2Schedule/kill.ts:545` |
| K9 | `src/proof/p2Schedule/kill.ts:555` |
| K10 | `src/proof/p2Schedule/kill.ts:590` |
| K11 | `src/proof/p2Schedule/kill.ts:615` |
| K12 | `src/proof/p2Schedule/kill.ts:637` |
| K13 | `src/proof/p2Schedule/kill.ts:651` |
| K14 | `src/proof/p2Schedule/kill.ts:660` |
| K15 | `src/proof/p2Schedule/kill.ts:672` |
| K16 | `src/proof/p2Schedule/kill.ts:732` |
| K17 | `src/proof/p2Schedule/kill.ts:740` |
| K18 | `src/proof/p2Schedule/kill.ts:748` |
| K19 | `src/proof/p2Schedule/kill.ts:758` |
| K20 | `src/proof/p2Schedule/kill.ts:765` |
| K21 | `src/proof/p2Schedule/kill.ts:776` |
| K22 | `src/proof/p2Schedule/kill.ts:793` |
| K23 | `src/proof/p2Schedule/kill.ts:803` |
| K24 | `src/proof/p2Schedule/kill.ts:812` |
| K25 | `src/proof/p2Schedule/kill.ts:905` |
| K26 | `src/proof/p2Schedule/kill.ts:1010` |
| K15 jobs bounds | `src/proof/p2Schedule/kill.ts:672 / dated jobs read` |
| K15 more-jobs 200/201 | `src/proof/p2Schedule/kill.ts:672 / boardCap` |
| K25 search / today-beside-arrows | `src/proof/p2Schedule/kill.ts:919` |
| K25 today painted stroke | `src/proof/p2Schedule/kill.ts:922` |
| K25 Week/Day active fill/ink + Geist | `src/proof/p2Schedule/kill.ts:945` |
| K25 header-gutter | `src/proof/p2Schedule/kill.ts:983` |
| K25 phone-search | `src/proof/p2Schedule/kill.ts:986` |
| K25 New job accessible name | `src/proof/p2Schedule/kill.ts:1004` |
| K25 seg / range pins | `src/proof/p2Schedule/kill.ts:917` |
| K26 | `src/proof/p2Schedule/kill.ts:1010` |
| unit status | `src/lib/scheduleStatus.kill.test.ts` |
| unit board bounds | `src/lib/scheduleBoard.test.ts / jobsColumnsFromMigrations` |
| fixture pin | `src/pages/schedule1280Light.fixture.test.ts:16` |

## Commands (103 matrix mutants)

```bash
# cream-page → P2-palette — restore :6569 cream
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "background: var(--g-bg);"
new = "background: #F5F0E6;"
if old not in t: raise SystemExit("cream-page find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-palette:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:45
git checkout -- src/index.css

# navy-save → P2-palette — restore :7810 navy Save
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "background: var(--g-inverse);"
new = "background: #0A2540;"
if old not in t: raise SystemExit("navy-save find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-palette:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:45
git checkout -- src/index.css

# whisper-5b6b7c → P2-contrast — restore #5B6B7C on the eyebrow
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "color: var(--g-ink-subtle);"
new = "color: #5B6B7C;"
if old not in t: raise SystemExit("whisper-5b6b7c find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-contrast:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:55
git checkout -- src/index.css

# chip-ink-threshold → P2-contrast — low-contrast chip refs on white cards
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "color: var(--g-ink);"
new = "color: #C8C8C8;"
if old not in t: raise SystemExit("chip-ink-threshold find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-contrast:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:55
git checkout -- src/index.css

# quiet-24 → P2-taps — min-height 24px at :6965
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "min-height: 44px;"
new = "min-height: 24px;"
if old not in t: raise SystemExit("quiet-24 find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-taps:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:65
git checkout -- src/index.css

# seg-32 → P2-taps — min-height 32px at :6933
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "min-height: 44px;"
new = "min-height: 32px;"
if old not in t: raise SystemExit("seg-32 find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-taps:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:65
git checkout -- src/index.css

# meta-normal → P2-lines — agenda meta drops the dots
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "{[suburb, scheduleCrewLabel(job.assigned_team, teamMembers)].filter(Boolean).join(' · ')}"
new = "{[suburb, scheduleCrewLabel(job.assigned_team, teamMembers)].filter(Boolean).join(' ')}"
if old not in t: raise SystemExit("meta-normal find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-lines:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:76
git checkout -- src/components/crm/BoardViews.tsx

# flex-2col → P2-m2 — restore the flex 2-column row
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "display: grid;"
new = "display: flex;"
if old not in t: raise SystemExit("flex-2col find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-m2:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:90
git checkout -- src/index.css

# unguarded-dark → P2-dark — an unguarded prefers-color-scheme rule
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  @media (prefers-color-scheme: dark) { .hub-board-cal { background: #0A0A0B; } }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("unguarded-dark find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-dark:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:126
git checkout -- src/index.css

# agenda-min-width → P2-overflow — min-width on .hub-week-agenda-row (later min-width:0)
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "width: 100%;\n    max-width: 100%;\n    min-width: 0;"
new = "width: 100%;\n    max-width: 100%;\n    min-width: 420px;"
if old not in t: raise SystemExit("agenda-min-width find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-overflow:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:134
git checkout -- src/index.css

# fake-scroller → P2-overflow — non-allowlisted element past innerWidth inside a fake overflow-x:auto wrapper
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  .hub-week-agenda { overflow-x: auto; }\n  .hub-week-agenda-list { min-width: 520px; }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("fake-scroller find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-overflow:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:134
git checkout -- src/index.css

# track-no-scroll → P2-day-track — the day track stops scrolling sideways
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "overflow-x: auto;"
new = "overflow-x: hidden;"
if old not in t: raise SystemExit("track-no-scroll find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-day-track:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:220
git checkout -- src/index.css

# track-trap → P2-day-track — the day track traps vertical scroll
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "overflow-y: hidden;"
new = "overflow-y: auto;\n    max-height: 160px;\n    overscroll-behavior: contain;"
if old not in t: raise SystemExit("track-trap find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-day-track:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:220
git checkout -- src/index.css

# phone-tab-to → P2-nav-phone — reorder in a copy of the tab config
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/layout/appShellPhoneNav.ts")
t = p.read_text()
old = "{ id: 'schedule', label: NAV_WORDS.schedule, to: '/schedule' },"
new = "{ id: 'schedule', label: NAV_WORDS.schedule, to: '/jobs' },"
if old not in t: raise SystemExit("phone-tab-to find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-nav-phone:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:236
git checkout -- src/components/layout/appShellPhoneNav.ts

# field-order → P2-nav-desktop — Inspections ahead of Schedule in a copy of the Field config
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/layout/AppShell.tsx")
t = p.read_text()
old = "    { to: '/schedule', label: NAV_WORDS.schedule, icon: Calendar },\n    { to: '/inspections', label: 'Inspections', icon: ClipboardList },"
new = "    { to: '/inspections', label: 'Inspections', icon: ClipboardList },\n    { to: '/schedule', label: NAV_WORDS.schedule, icon: Calendar },"
if old not in t: raise SystemExit("field-order find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-nav-desktop:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:249
git checkout -- src/components/layout/AppShell.tsx

# fetch-leak → P2-mocks — a live request from the Schedule bundle
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "export const PhoneWeekList = memo(function PhoneWeekList({"
new = "void fetch('https://grafter.com.au/p2-leak');\nexport const PhoneWeekList = memo(function PhoneWeekList({"
if old not in t: raise SystemExit("fetch-leak find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-mocks:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:255
git checkout -- src/components/crm/BoardViews.tsx

# empty-days-hidden → P2-tracker — empty agenda days, week cells and lane hours stop drawing
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  .hub-week-agenda-day:not(:has(.hub-week-agenda-row)),\n  .hub-week-cell.is-empty,\n  [data-crew-lane]:not(:has(.hub-week-chip)) [data-day-grid] > .border-r { display: none !important; }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("empty-days-hidden find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-tracker:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:268
git checkout -- src/index.css

# chip-ref-clock → P2-chip — the week chip ref carries the clock
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "<span className=\"hub-week-chip-clock\">{clock}</span>\n        {' · '}\n        <span className=\"hub-week-chip-ref\">{chip.ref}</span>"
new = "<span className=\"hub-week-chip-clock\">{clock}</span>\n        {' · '}\n        <span className=\"hub-week-chip-ref\">{`${clock} · ${chip.ref}`}</span>"
if old not in t: raise SystemExit("chip-ref-clock find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-chip:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:288
git checkout -- src/components/crm/BoardViews.tsx

# ring-offset-0 → P2-focus — focus ring offset 0
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "outline-offset: 2px;"
new = "outline-offset: 0;"
if old not in t: raise SystemExit("ring-offset-0 find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-focus:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:310
git checkout -- src/index.css

# ring-none → P2-focus — no focus ring
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "outline: 2px solid var(--g-accent);"
new = "outline: none;"
if old not in t: raise SystemExit("ring-none find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-focus:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:310
git checkout -- src/index.css

# seg-on-unfilled → P2-focus — the on seg loses its inverse fill
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "background: var(--g-inverse);"
new = "background: none;"
if old not in t: raise SystemExit("seg-on-unfilled find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-focus:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:310
git checkout -- src/index.css

# now-1px → P2-now — a 1px now-line
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "    width: 2px;"
new = "    width: 1px;"
if old not in t: raise SystemExit("now-1px find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-now:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:328
git checkout -- src/index.css

# now-pulse → P2-now — the now dot pulses
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  .hub-day-now-dot { animation: p2-now-pulse 1s infinite; }\n  @keyframes p2-now-pulse { 50% { opacity: 0.4; } }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("now-pulse find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-now:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:328
git checkout -- src/index.css

# today-unmarked → P2-now — the Today column drops the Now label
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "{today ? <span className=\"hub-week-now\">Now {scheduleNowMark(now)}</span> : null}"
new = "{today ? null : null}"
if old not in t: raise SystemExit("today-unmarked find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-now:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:328
git checkout -- src/components/crm/BoardViews.tsx

# hour-lines-cream → P2-day-board — cream hour rules
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "border-color: var(--g-line);"
new = "border-color: #E2D9CC;"
if old not in t: raise SystemExit("hour-lines-cream find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-day-board:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:350
git checkout -- src/index.css

# zebra-flat → P2-day-board — every lane flat surface
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  .hub-week-document .hub-day-board .bg-zebra { background: var(--g-surface) !important; }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("zebra-flat find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-day-board:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:350
git checkout -- src/index.css

# unassigned-navy → P2-day-board — a navy unassigned rail
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "borderLeft: painted.isUnassigned ? '3px dashed var(--g-line-strong)'"
new = "borderLeft: painted.isUnassigned ? '3px dashed #0A2540'"
if old not in t: raise SystemExit("unassigned-navy find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-day-board:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:350
git checkout -- src/components/crm/BoardViews.tsx

# resize-hover-none → P2-day-board — no resize hover paint
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "background: color-mix(in srgb, var(--g-accent) 16%, transparent);"
new = "background: transparent;"
if old not in t: raise SystemExit("resize-hover-none find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-day-board:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:350
git checkout -- src/index.css

# fade-pointer → P2-scroller — the fade swallows clicks
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "pointer-events: none;"
new = "pointer-events: auto;"
if old not in t: raise SystemExit("fade-pointer find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-scroller:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:370
git checkout -- src/index.css

# fade-at-end → P2-scroller — the fade stays at the track end
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "opacity: 0;\n      background: none;"
new = "opacity: 1;\n      background: linear-gradient(to right, transparent, var(--g-surface));"
if old not in t: raise SystemExit("fade-at-end find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-scroller:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:370
git checkout -- src/index.css

# scrim-bg → P2-sheet — an opaque bg scrim
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "background: rgba(10, 10, 11, 0.4) !important;"
new = "background: var(--g-bg) !important;"
if old not in t: raise SystemExit("scrim-bg find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-sheet:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:387
git checkout -- src/index.css

# footer-no-safe-area → P2-sheet — the footer ignores the safe area
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "padding: 12px 16px max(16px, env(safe-area-inset-bottom));"
new = "padding: 12px 16px 16px;"
if old not in t: raise SystemExit("footer-no-safe-area find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-sheet:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:387
git checkout -- src/index.css

# tray-noop → P2-tray — the tray chip toggle does nothing
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "setExpanded(open => !open);"
new = "setExpanded(open => open);"
if old not in t: raise SystemExit("tray-noop find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-tray:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:415
git checkout -- src/components/crm/BoardViews.tsx

# agenda-time-ink → P2-m2 — the agenda time line in full ink
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "color: var(--g-ink-muted);"
new = "color: var(--g-ink);"
if old not in t: raise SystemExit("agenda-time-ink find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-m2:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:90
git checkout -- src/index.css

# pill-amber → P2-status — amber scheduled pills
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "background: var(--g-sched-bg);"
new = "background: var(--g-warn-bg);"
if old not in t: raise SystemExit("pill-amber find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-status:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:426
git checkout -- src/index.css

# hide-header → K1 — hide the live header (restore F1)
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "max-width: none;"
new = "display: none;\n    max-width: none;"
if old not in t: raise SystemExit("hide-header find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K1:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:441
git checkout -- src/index.css

# need-crew-all → K1 — count crewed jobs as need-crew
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleNeedCrew.ts")
t = p.read_text()
old = "return crewIds(job.assigned_team).length === 0;"
new = "return true;"
if old not in t: raise SystemExit("need-crew-all find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K1:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:441
git checkout -- src/lib/scheduleNeedCrew.ts

# need-crew-undated → K19 — restore || in_progress without a date gate
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleNeedCrew.ts")
t = p.read_text()
old = "if (!asDateText(job.scheduled_date)) return false;\n  if (isFinishedCrewStatus(job.status)) return false;\n  return crewIds(job.assigned_team).length === 0;"
new = "if (isFinishedCrewStatus(job.status)) return false;\n  if (asTeamIds(job.assigned_team).length > 0) return false;\n  return job.status === 'scheduled' || job.status === 'in_progress';"
if old not in t: raise SystemExit("need-crew-undated find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K19:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:758
git checkout -- src/lib/scheduleNeedCrew.ts

# next-backwards → K2 — next week walks backwards
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = "addWeeks(currentDate, 1)"
new = "addWeeks(currentDate, -1)"
if old not in t: raise SystemExit("next-backwards find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K2:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:464
git checkout -- src/pages/SchedulePage.tsx

# skip-empty-cells → K3 — skip cells with no jobs
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleBoard.ts")
t = p.read_text()
old = "cells: days.map(date => {"
new = "cells: days.filter(date => jobsForCrewOnDay(visible, crew.id, date).length > 0).map(date => {"
if old not in t: raise SystemExit("skip-empty-cells find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K3:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:484
git checkout -- src/lib/scheduleBoard.ts

# count-days → K4 — lane counts say bookings
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleBoard.ts")
t = p.read_text()
old = "return count === 1 ? '1 job' : `${count} jobs`;"
new = "return count === 1 ? '1 booking' : `${count} bookings`;"
if old not in t: raise SystemExit("count-days find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K4:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:493
git checkout -- src/lib/scheduleBoard.ts

# ref-ellipsis → K5 — ellipsis on the ref span
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "overflow: visible;"
new = "overflow: hidden;\n    max-width: 4ch;\n    text-overflow: ellipsis;"
if old not in t: raise SystemExit("ref-ellipsis find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K5:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:507
git checkout -- src/index.css

# first-crew-only → K5 — jobOnCrewRow checks only team[0]
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleBoard.ts")
t = p.read_text()
old = "return team.includes(crewId);"
new = "return team[0] === crewId;"
if old not in t: raise SystemExit("first-crew-only find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K5:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:507
git checkout -- src/lib/scheduleBoard.ts

# invoice-no-void → K6 — drop status <> void
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".neq('status', 'void');"
new = ";"
if old not in t: raise SystemExit("invoice-no-void find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K6:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:519
git checkout -- src/pages/SchedulePage.tsx

# invoice-no-company → K6 — drop the company_id filter
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".eq('company_id', profile!.company_id)"
new = ""
if old not in t: raise SystemExit("invoice-no-company find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K6:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:519
git checkout -- src/pages/SchedulePage.tsx

# track-14h → K7 — divide the day by 14h
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleBoard.ts")
t = p.read_text()
old = "const span = DAY_HOUR_COUNT * 60;"
new = "const span = 14 * 60;"
if old not in t: raise SystemExit("track-14h find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K7:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:533
git checkout -- src/lib/scheduleBoard.ts

# now-12h → K8 — format Now as 12-hour hh:mm
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleBoard.ts")
t = p.read_text()
old = "return format(now, 'HH:mm');"
new = "return format(now, 'hh:mm');"
if old not in t: raise SystemExit("now-12h find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K8:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:545
git checkout -- src/lib/scheduleBoard.ts

# drop-keeps-date → K9 — drop handler writes nothing
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "onDrop={e => handleDrop(e, cell.date, row.crewId)}"
new = "onDrop={e => e.preventDefault()}"
if old not in t: raise SystemExit("drop-keeps-date find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K9:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:555
git checkout -- src/components/crm/BoardViews.tsx

# hide-empty-hours → K10 — hide hours with no jobs
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "<div className=\"hub-day-hours-head flex border-b border-rule\">\n            {hours.map(h => ("
new = "<div className=\"hub-day-hours-head flex border-b border-rule\">\n            {hours.filter(h => paintedRows.some(p => p.rowJobs.some(j => (j.start_time ?? \"\").startsWith(String(h).padStart(2, \"0\"))))).map(h => ("
if old not in t: raise SystemExit("hide-empty-hours find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K10:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:590
git checkout -- src/components/crm/BoardViews.tsx

# track-overflow-hidden → K10 — the day track stops scrolling sideways
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "overflow-x: auto;"
new = "overflow-x: hidden;"
if old not in t: raise SystemExit("track-overflow-hidden find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K10:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:590
git checkout -- src/index.css

# fade-auto-k10 → K10 — resize handles never mount
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "{!phone && onJobResize && plot.stored ? ("
new = "{false && !phone && onJobResize && plot.stored ? ("
if old not in t: raise SystemExit("fade-auto-k10 find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K10:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:590
git checkout -- src/components/crm/BoardViews.tsx

# tray-slice → K11 — needsDate.slice(0,2)
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "function UnscheduledJobCards({\n  jobs, teamMembers, onJobClick, onDragStart, selectedId = null, onOpenJob, onSetScheduleDate,\n  invoicedJobIds = NO_INVOICED,\n}: UnscheduledRailProps) {\n  return (\n    <>\n      {jobs.map(job => {"
new = "function UnscheduledJobCards({\n  jobs, teamMembers, onJobClick, onDragStart, selectedId = null, onOpenJob, onSetScheduleDate,\n  invoicedJobIds = NO_INVOICED,\n}: UnscheduledRailProps) {\n  return (\n    <>\n      {jobs.slice(0, 2).map(job => {"
if old not in t: raise SystemExit("tray-slice find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K11:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:615
git checkout -- src/components/crm/BoardViews.tsx

# hide-empty-agenda → K12 — filter out zero-job days
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "{days.map(day => {\n        const date = parseISO(`${day.date}T00:00:00`);"
new = "{days.filter(day => day.jobs.length > 0).map(day => {\n        const date = parseISO(`${day.date}T00:00:00`);"
if old not in t: raise SystemExit("hide-empty-agenda find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K12:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:637
git checkout -- src/components/crm/BoardViews.tsx

# quickbook-desk-only → K13 — hide the header Quick book control
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  [data-schedule-quickbook-toggle] { display: none !important; }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("quickbook-desk-only find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K13:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:651
git checkout -- src/index.css

# drop-today → K14 — delete Today from the tools row
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = "<button type=\"button\" className=\"hub-week-quiet hub-week-today\" onClick={() => applySchedule(viewMode, new Date())}>\n        Today\n      </button>"
new = ""
if old not in t: raise SystemExit("drop-today find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K14:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:660
git checkout -- src/pages/SchedulePage.tsx

# invoice-paid-at → K15 — add invoices.paid_at to Q-S1
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".select('id, job_id, status')"
new = ".select('id, job_id, status, paid_at')"
if old not in t: raise SystemExit("invoice-paid-at find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# jobs-drop-limit → K15 — drop the dated jobs .limit() bound
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".gte('scheduled_date', rangeStart)\n          .lte('scheduled_date', rangeEnd)\n          .order('start_time', { ascending: true, nullsFirst: false })\n          .limit(SCHEDULE_BOARD_LIMIT)"
new = ".gte('scheduled_date', rangeStart)\n          .lte('scheduled_date', rangeEnd)\n          .order('start_time', { ascending: true, nullsFirst: false })"
if old not in t: raise SystemExit("jobs-drop-limit find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# jobs-drop-company → K15 — drop the dated jobs company_id eq
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".eq('company_id', profile.company_id)\n          .gte('scheduled_date', rangeStart)"
new = ".gte('scheduled_date', rangeStart)"
if old not in t: raise SystemExit("jobs-drop-company find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# jobs-drop-gte → K15 — drop the dated jobs week-start gte
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".gte('scheduled_date', rangeStart)\n          .lte('scheduled_date', rangeEnd)"
new = ".lte('scheduled_date', rangeEnd)"
if old not in t: raise SystemExit("jobs-drop-gte find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# jobs-drop-lte → K15 — drop the dated jobs week-end lte
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".gte('scheduled_date', rangeStart)\n          .lte('scheduled_date', rangeEnd)"
new = ".gte('scheduled_date', rangeStart)"
if old not in t: raise SystemExit("jobs-drop-lte find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# jobs-select-star → K15 — dated jobs select *
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".select(SCHEDULE_BOARD_COLUMNS)\n          .eq('company_id', profile.company_id)\n          .gte('scheduled_date', rangeStart)"
new = ".select('*')\n          .eq('company_id', profile.company_id)\n          .gte('scheduled_date', rangeStart)"
if old not in t: raise SystemExit("jobs-select-star find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# jobs-bogus-column → K15 — add a bogus jobs column to SCHEDULE_BOARD_COLUMNS
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleBoard.ts")
t = p.read_text()
old = "'id, company_id, client_id, title, description, status, scheduled_date, start_time, end_time, address, assigned_team, job_number, parent_job_id, color, cost_code'"
new = "'id, company_id, client_id, title, description, status, scheduled_date, start_time, end_time, address, assigned_team, job_number, parent_job_id, color, cost_code, not_a_column'"
if old not in t: raise SystemExit("jobs-bogus-column find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/lib/scheduleBoard.ts

# undated-drop-company → K15 — drop the undated jobs company_id eq
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".eq('company_id', profile.company_id)\n          .is('scheduled_date', null)"
new = ".is('scheduled_date', null)"
if old not in t: raise SystemExit("undated-drop-company find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# undated-select-star → K15 — undated jobs select *
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".select(SCHEDULE_BOARD_COLUMNS)\n          .eq('company_id', profile.company_id)\n          .is('scheduled_date', null)"
new = ".select('*')\n          .eq('company_id', profile.company_id)\n          .is('scheduled_date', null)"
if old not in t: raise SystemExit("undated-select-star find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# undated-drop-limit → K15 — drop the undated jobs .limit() bound
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = ".is('scheduled_date', null)\n          .in('status', ['scheduled', 'in_progress'])\n          .limit(SCHEDULE_BOARD_LIMIT)"
new = ".is('scheduled_date', null)\n          .in('status', ['scheduled', 'in_progress'])"
if old not in t: raise SystemExit("undated-drop-limit find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# hide-more-jobs-line → K15 — remove the more-jobs line
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = "            {(moreDated || moreUndated) ? (\n              <p className=\"ops-meta mt-2\" data-schedule-more-jobs=\"1\">\n                <Link to=\"/jobs\">{MORE_JOBS_THIS_WEEK}</Link>\n              </p>\n            ) : null}"
new = ""
if old not in t: raise SystemExit("hide-more-jobs-line find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K15:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:672
git checkout -- src/pages/SchedulePage.tsx

# rename-new-job-choice → K25 — rename the New job choice visible text
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/ScheduleBookByVoice.tsx")
t = p.read_text()
old = "{hints?.job ? 'New job from this' : 'New job'}"
new = "{hints?.job ? 'New job from this' : 'Create job'}"
if old not in t: raise SystemExit("rename-new-job-choice find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/components/crm/ScheduleBookByVoice.tsx

# text-nowrap-320 → P2-text — Schedule title text paints past the 320 viewport
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  html, body, #root, main, .shell-root, .hub-board-cal.is-week-doc.ops-page, .ops-page-head { overflow: visible !important; }\n  html body .hub-board-cal.is-week-doc .ops-page-title { white-space: nowrap !important; font-size: 96px !important; overflow: visible !important; max-width: none !important; }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("text-nowrap-320 find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-text:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:198
git checkout -- src/index.css

# range-short-nowrap → P2-text — phone week range short text node paints past the 320 viewport
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  .hub-week-track .hub-week-range-short { display: inline !important; white-space: nowrap !important; font-size: 48px !important; overflow: visible !important; max-width: none !important; }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("range-short-nowrap find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-text:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:202
git checkout -- src/index.css

# webkit-wide-agenda → P2-webkit — phone agenda row wider than the 375 viewport
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-agenda-meta-part {"
new = "  .hub-week-agenda-row { min-width: 520px; }\n  .hub-week-agenda-meta-part {"
if old not in t: raise SystemExit("webkit-wide-agenda find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-webkit:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:204
git checkout -- src/index.css

# swap-tray-board → K17 — label the board section as tray
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = "<div data-schedule-section=\"board\">"
new = "<div data-schedule-section=\"tray\">"
if old not in t: raise SystemExit("swap-tray-board find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K17:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:740
git checkout -- src/pages/SchedulePage.tsx

# hardcode-count → K18 — hardcode a fallback board count
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleBoard.ts")
t = p.read_text()
old = "`${parts.onBoard} on the board`"
new = "`14 on the board`"
if old not in t: raise SystemExit("hardcode-count find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K18:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:748
git checkout -- src/lib/scheduleBoard.ts

# unknown-excluded → K22 — unknown status no longer counts as need-crew
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleNeedCrew.ts")
t = p.read_text()
old = "if (isFinishedCrewStatus(job.status)) return false;\n  return crewIds(job.assigned_team).length === 0;"
new = "if (isFinishedCrewStatus(job.status)) return false;\n  if ((job.status ?? '') !== 'scheduled' && job.status !== 'in_progress') return false;\n  return crewIds(job.assigned_team).length === 0;"
if old not in t: raise SystemExit("unknown-excluded find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K22:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:793
git checkout -- src/lib/scheduleNeedCrew.ts

# crew-untrimmed → K4 — whitespace crew ids count as crew
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleNeedCrew.ts")
t = p.read_text()
old = "return asTeamIds(assigned).filter(id => id.trim());"
new = "return asTeamIds(assigned);"
if old not in t: raise SystemExit("crew-untrimmed find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K4:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:493
git checkout -- src/lib/scheduleNeedCrew.ts

# cancelled-counted → K4 — cancelled dated crewless counts as need-crew
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleNeedCrew.ts")
t = p.read_text()
old = "return raw === 'completed' || raw === 'Done' || raw === 'cancelled';"
new = "return raw === 'completed' || raw === 'Done';"
if old not in t: raise SystemExit("cancelled-counted find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K4:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:493
git checkout -- src/lib/scheduleNeedCrew.ts

# nodate-pill-gone → K11 — rename the No date pill
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleInvoiceStatus.ts")
t = p.read_text()
old = "if (!asDateText(job.scheduled_date)) return { label: 'No date', kind: 'nodate' };"
new = "if (!asDateText(job.scheduled_date)) return { label: 'Undated', kind: 'nodate' };"
if old not in t: raise SystemExit("nodate-pill-gone find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K11:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:615
git checkout -- src/lib/scheduleInvoiceStatus.ts

# unknown-as-scheduled → K26 — unknown and non-string status paint as Scheduled
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleInvoiceStatus.ts")
t = p.read_text()
old = "if (status === 'scheduled') return { label: 'Scheduled', kind: 'scheduled' };\n  return { label: sentenceStatus(job.status), kind: 'status' };"
new = "return { label: 'Scheduled', kind: 'scheduled' };"
if old not in t: raise SystemExit("unknown-as-scheduled find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K26:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:1010
git checkout -- src/lib/scheduleInvoiceStatus.ts

# date-stringify → K26 — non-string scheduled_date becomes a dated string
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleNeedCrew.ts")
t = p.read_text()
old = "export function asDateText(value: unknown): string {\n  return typeof value === 'string' ? value.trim() : '';\n}"
new = "export function asDateText(value: unknown): string {\n  return String(value ?? '').trim();\n}"
if old not in t: raise SystemExit("date-stringify find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K26:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:1010
git checkout -- src/lib/scheduleNeedCrew.ts

# clock-book-unknown → K26 — unknown status still shows a Booked clock
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleBoard.ts")
t = p.read_text()
old = "if (job && (isNeedCrewJob(job) || isUnknownScheduleStatus(job.status))) return when;"
new = "if (job && isNeedCrewJob(job)) return when;"
if old not in t: raise SystemExit("clock-book-unknown find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K26:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:1010
git checkout -- src/lib/scheduleBoard.ts

# status-fallback-scheduled → K26 — empty status sentence-cases to Scheduled
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleInvoiceStatus.ts")
t = p.read_text()
old = "if (!raw) return STATUS_FALLBACK;"
new = "if (!raw) return 'Scheduled';"
if old not in t: raise SystemExit("status-fallback-scheduled find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K26:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:1010
git checkout -- src/lib/scheduleInvoiceStatus.ts

# set-date-on-card → K11 — put Set a date back on the undated card
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "<span className=\"hub-schedule-pill\" data-kind={pill.kind}>{pill.label}</span>\n              <div className=\"ops-card-footer\">"
new = "<span className=\"hub-schedule-pill\" data-kind={pill.kind}>{pill.label}</span>\n              <button type=\"button\" className=\"hub-schedule-set-date\" data-schedule-set-date={job.id}>Set a date</button>\n              <div className=\"ops-card-footer\">"
if old not in t: raise SystemExit("set-date-on-card find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K11:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:615
git checkout -- src/components/crm/BoardViews.tsx

# clock-narrow-col → K20 — narrow the clock with ellipsis
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "max-width: 100%;"
new = "max-width: 6ch;\n    overflow: hidden;\n    text-overflow: ellipsis;"
if old not in t: raise SystemExit("clock-narrow-col find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K20:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:765
git checkout -- src/index.css

# page-height-lock → K21 — lock the week page to 100dvh and clip
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "height: auto;\n    padding: 12px 16px 16px;\n    overflow: visible;"
new = "height: calc(100dvh - 3.5rem);\n    padding: 12px 16px 16px;\n    overflow: hidden;"
if old not in t: raise SystemExit("page-height-lock find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K21:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:776
git checkout -- src/index.css

# agenda-min-zero → K21 — 390 agenda collapses to 0
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "{days.map(day => {\n        const date = parseISO(`${day.date}T00:00:00`);"
new = "{days.slice(0, 0).map(day => {\n        const date = parseISO(`${day.date}T00:00:00`);"
if old not in t: raise SystemExit("agenda-min-zero find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K21:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:776
git checkout -- src/components/crm/BoardViews.tsx

# quoted-as-scheduled → K23 — unknown status paints as Scheduled
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleInvoiceStatus.ts")
t = p.read_text()
old = "return { label: sentenceStatus(job.status), kind: 'status' };"
new = "return { label: 'Scheduled', kind: 'scheduled' };"
if old not in t: raise SystemExit("quoted-as-scheduled find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K23:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:803
git checkout -- src/lib/scheduleInvoiceStatus.ts

# drop-needcrew-guard → K24 — drop the shared crewIds asTeamIds guard so .filter throws
python3 - <<'PY'
from pathlib import Path
p = Path("src/lib/scheduleNeedCrew.ts")
t = p.read_text()
old = "return asTeamIds(assigned).filter(id => id.trim());"
new = "return (assigned as string[]).filter(id => id.length > 0);"
if old not in t: raise SystemExit("drop-needcrew-guard find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K24:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:812
git checkout -- src/lib/scheduleNeedCrew.ts

# head-short-hidden → K25 — hide the one-line laptop day heads
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "    .hub-week-head-short {\n      display: inline-flex;\n      flex-direction: row;\n      align-items: center;\n      gap: 6px;\n    }"
new = "    .hub-week-head-short {\n      display: none;\n      flex-direction: row;\n      align-items: center;\n      gap: 6px;\n    }"
if old not in t: raise SystemExit("head-short-hidden find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# tray-kicker-tiny → K25 — shrink the tray heading back to an 11px kicker
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "      height: 26px;\n      min-height: 26px;\n      font-family: var(--g-font-title);\n      font-size: 20px;\n      font-weight: 600;\n      line-height: 26px;\n      letter-spacing: 0;\n      text-transform: none;\n      color: var(--g-ink);"
new = "      height: auto;\n      min-height: 0;\n      font-family: var(--g-font-title);\n      font-size: 11px;\n      font-weight: 700;\n      letter-spacing: 0.12em;\n      text-transform: uppercase;\n      color: var(--g-ink-muted);"
if old not in t: raise SystemExit("tray-kicker-tiny find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# untimed-span-track → K25 — untimed day card spans the whole track
python3 - <<'PY'
from pathlib import Path
p = Path("src/components/crm/BoardViews.tsx")
t = p.read_text()
old = "width: Math.min(220, hourWidth * 2.2),"
new = "width: hourWidth * hours.length,"
if old not in t: raise SystemExit("untimed-span-track find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/components/crm/BoardViews.tsx

# today-off-range → K25 — Today leaves the 390 range row
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "    .hub-week-track .hub-week-today { order: 2; flex: 0 0 auto; }"
new = "    .hub-week-track .hub-week-today { order: 20; flex: 1 1 100%; }"
if old not in t: raise SystemExit("today-off-range find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# title-one-line → K25 — titles collapse to one line
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-chip-desc {\n    display: -webkit-box;\n    -webkit-line-clamp: 2;\n    -webkit-box-orient: vertical;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: normal;\n    font-family: var(--g-font-ui);\n    font-size: 14px;\n    font-weight: 600;\n    line-height: 18px;\n    opacity: 1;\n  }"
new = "  .hub-week-chip-desc {\n    display: block;\n    -webkit-line-clamp: 1;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n    max-height: 18px;\n    font-family: var(--g-font-ui);\n    font-size: 14px;\n    font-weight: 600;\n    line-height: 18px;\n    opacity: 1;\n  }"
if old not in t: raise SystemExit("title-one-line find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# crew-name-wrap → K25 — crew names wrap onto two lines
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-board-cal .hub-schedule-crew-name,\n  .hub-week-crew-name,\n  .hub-week-document .hub-week-crew .hub-schedule-crew-name,\n  .hub-week-document .hub-day-crew-lock .hub-schedule-crew-name {\n    white-space: nowrap;\n  }"
new = "  .hub-board-cal .hub-schedule-crew-name,\n  .hub-week-crew-name,\n  .hub-week-document .hub-week-crew .hub-schedule-crew-name,\n  .hub-week-document .hub-day-crew-lock .hub-schedule-crew-name {\n    white-space: normal;\n    max-width: 36px;\n  }"
if old not in t: raise SystemExit("crew-name-wrap find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# seg-no-stroke → K25 — pill seg loses its painted stroke and radius
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-seg {\n    display: inline-flex;\n    align-items: stretch;\n    flex: 0 0 auto;\n    gap: 2px;\n    border: 1px solid var(--g-line-strong);\n    border-radius: 14px;"
new = "  .hub-week-seg {\n    display: inline-flex;\n    align-items: stretch;\n    flex: 0 0 auto;\n    gap: 2px;\n    border: none;\n    border-radius: 0;"
if old not in t: raise SystemExit("seg-no-stroke find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# nav-no-stroke → K25 — nav boxes lose their painted stroke
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-nav-box {\n    border: 1px solid var(--g-line-strong);\n    border-radius: 10px;"
new = "  .hub-week-nav-box {\n    border: none;\n    border-radius: 0;"
if old not in t: raise SystemExit("nav-no-stroke find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# today-no-stroke → K25 — Today loses its painted border/ring at :7340
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-week-today {\n    flex: 0 0 auto;\n    width: auto;\n    min-width: 44px;\n    height: 44px;\n    min-height: 44px;\n    border: 1px solid var(--g-line-strong);\n    border-radius: 10px;"
new = "  .hub-week-today {\n    flex: 0 0 auto;\n    width: auto;\n    min-width: 44px;\n    height: 44px;\n    min-height: 44px;\n    border: none;\n    border-radius: 10px;"
if old not in t: raise SystemExit("today-no-stroke find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# search-fixed-width → K25 — fix the laptop search at 200px
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "    .hub-board-cal.is-week-doc .hub-week-search {\n      flex: 1 1 755.265625px;\n      min-width: 755.265625px;\n      max-width: 755.265625px;\n      width: 755.265625px;\n      height: 48px;\n      min-height: 48px;\n    }"
new = "    .hub-board-cal.is-week-doc .hub-week-search {\n      flex: 0 0 200px;\n      min-width: 0;\n      max-width: 200px;\n      width: 200px;\n      height: 48px;\n      min-height: 48px;\n    }"
if old not in t: raise SystemExit("search-fixed-width find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# today-beside-arrows → K25 — Today sits beside the arrows
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = "      </div>\n      <div className=\"hub-week-search\" data-schedule-search=\"1\">\n        {weekSearch}\n      </div>\n      <button type=\"button\" className=\"hub-week-quiet hub-week-today\" onClick={() => applySchedule(viewMode, new Date())}>\n        Today\n      </button>"
new = "        <button type=\"button\" className=\"hub-week-quiet hub-week-today\" onClick={() => applySchedule(viewMode, new Date())}>\n          Today\n        </button>\n      </div>\n      <div className=\"hub-week-search\" data-schedule-search=\"1\">\n        {weekSearch}\n      </div>"
if old not in t: raise SystemExit("today-beside-arrows find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/pages/SchedulePage.tsx

# quickbook-keeps-gap → K25 — closed Quick book keeps a row under the toolbar
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "  .hub-schedule-quickbook:not([data-open=\"1\"]) {\n    display: none;\n  }"
new = "  .hub-schedule-quickbook:not([data-open=\"1\"]) {\n    display: block;\n    min-height: 72px;\n  }"
if old not in t: raise SystemExit("quickbook-keeps-gap find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# newjob-opens-form → K25 — header New job opens the form instead of Quick book
python3 - <<'PY'
from pathlib import Path
p = Path("src/pages/SchedulePage.tsx")
t = p.read_text()
old = "onClick={() => setQuickBookOpen(open => !open)}"
new = "onClick={openNewJob}"
if old not in t: raise SystemExit("newjob-opens-form find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/pages/SchedulePage.tsx

# page-pad-16 → K25 — laptop page pad drops from 32/0 to 16
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "padding: 32px 0 20px;"
new = "padding: 12px 16px 16px;"
if old not in t: raise SystemExit("page-pad-16 find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:905
git checkout -- src/index.css

# day-clock-clip → P2-overflow — clip day-board clock labels inside the card
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "max-width: 100%;\n      overflow: hidden;\n      white-space: normal;\n      overflow-wrap: anywhere;"
new = "max-width: 2ch;\n      overflow: hidden;\n      white-space: nowrap;\n      overflow-wrap: normal;"
if old not in t: raise SystemExit("day-clock-clip find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-overflow:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:134
git checkout -- src/index.css

# own-clock-clip-dayboard → P2-overflow — day-board clock max-width 2ch
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "min-width: 0;\n      max-width: 100%;\n      overflow: hidden;\n      white-space: normal;"
new = "min-width: 0;\n      max-width: 2ch;\n      overflow: hidden;\n      white-space: nowrap;"
if old not in t: raise SystemExit("own-clock-clip-dayboard find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-overflow:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:134
git checkout -- src/index.css

# clock-nowrap-spill → P2-overflow — nowrap clock with no ellipsis or overflow handling
python3 - <<'PY'
from pathlib import Path
p = Path("src/index.css")
t = p.read_text()
old = "white-space: normal;\n    overflow: hidden;\n    overflow-wrap: anywhere;"
new = "white-space: nowrap;\n    overflow: visible;\n    overflow-wrap: normal;"
if old not in t: raise SystemExit("clock-nowrap-spill find missed")
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-overflow:'
# expected AssertionError at src/proof/p2Schedule/kill.ts:134
git checkout -- src/index.css

```

Every re-pin is an exact `toBe`. Search MATCH in compare.md is exact, not ±1.
