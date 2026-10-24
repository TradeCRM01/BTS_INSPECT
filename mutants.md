# r10 + r11 mutants (CoS runs these outside the suite)

The suite never writes a tracked file. Apply one command, run the named test, restore with `git checkout -- <file>`.

Main widget fixture: `src/components/layout/fixtures/main-0898c3b9-widget-1280.json`  
sha256 `869028a58f7c517660a78df15e448422d8a35786a5d34e65ebda13112ff20adb`  
Digest is SHA-256 of `json.dumps({edit,path,sha,view,viewport}, separators=(',', ':'), sort_keys=True)` (`produced` excluded).  
Produced from DEV vite of `0898c3b9` at 1280×4000, `/?look=dashboard`, Frozen Date `2026-10-19T03:40:00.000Z`. Production look-proof on that SHA is DEV-gated.

## M1 — drop the countNeedsCrew array guard

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/needCrew.ts')
t = p.read_text()
old = '  if (!Array.isArray(jobs)) return 0;\n'
if old not in t:
    raise SystemExit('M1 guard missing')
p.write_text(t.replace(old, '', 1))
PY
npx vitest run --maxWorkers=2 src/lib/needCrew.test.ts -t "returns 0 for a missing jobs array"
git checkout -- src/lib/needCrew.ts
```

Red: `src/lib/needCrew.test.ts:71` `expect(() => countNeedsCrew(null)).not.toThrow()` — AssertionError, not TypeError.

## M-nav — NAV_WORDS.today Tonight

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/brand.ts')
t = p.read_text()
old = "  today: 'Today',"
new = "  today: 'Tonight',"
if old not in t:
    raise SystemExit('NAV_WORDS.today missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1-today-mark"
git checkout -- src/lib/brand.ts
```

Red: `src/components/layout/p1Dashboard.chromium.kill.tsx:2819` `toBe('Today')` AssertionError (`Tonight`).

## M-chrome — absolute bars outside the card

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
inside = """.dashboard-home-edit-chrome {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;"""
outside = """.dashboard-home-edit-chrome {
    position: absolute;
    top: -52px;
    left: 0;
    right: 0;"""
foot_in = """.dashboard-home-edit-foot {
    position: absolute;
    right: 0;
    bottom: 0;"""
foot_out = """.dashboard-home-edit-foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -48px;"""
if inside not in t or foot_in not in t:
    raise SystemExit('inside chrome missing')
p.write_text(t.replace(inside, outside).replace(foot_in, foot_out))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-chrome: view"
git checkout -- src/index.css
```

Mutates `src/index.css:13238` (`top: 8px`) and `:13251` (`bottom: 0`).  
Red: `p1Dashboard.chromium.kill.tsx:2938` `elementFromPoint centre misses` AssertionError.

## M-paint-fill — edit card fill transparent

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """    overflow: hidden;
    background: var(--dashboard-home-sheet);
    border: 1px solid var(--dashboard-home-line);"""
new = """    overflow: hidden;
    background: transparent;
    border: 1px solid var(--dashboard-home-line);"""
if old not in t:
    raise SystemExit('is-editing fill missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-paint:"
git checkout -- src/index.css
```

Mutates `src/index.css:13231` (`background: var(--dashboard-home-sheet)`).  
Red: `p1Dashboard.chromium.kill.tsx:3120` fill vs main `255,255,255` AssertionError.

## M-paint-sides — side borders removed

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """    background: var(--dashboard-home-sheet);
    border: 1px solid var(--dashboard-home-line);
    outline: 1px solid color-mix(in srgb, var(--g-accent) 35%, var(--dashboard-home-line));"""
new = """    background: var(--dashboard-home-sheet);
    border: 1px solid var(--dashboard-home-line);
    border-left: none;
    border-right: none;
    outline: 1px solid color-mix(in srgb, var(--g-accent) 35%, var(--dashboard-home-line));"""
if old not in t:
    raise SystemExit('is-editing border missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-paint:"
git checkout -- src/index.css
```

Mutates `src/index.css:13232`.  
Red: `p1Dashboard.chromium.kill.tsx:3125` left/right vs main `228,228,231` AssertionError.

## M-layout — swap jobs and needs

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/TodayBoardView.tsx')
t = p.read_text()
jobs = """        <JobsSection
          jobs={jobs}
          team={team}
          readyIds={readyIds}
          width={width}
          band={band}
          nowId={nowPick.job?.id ?? null}
          loading={jobsLoading}
          error={jobsError}
          onRetry={onRetryJobs}
          showPlace={showPlace}
        />
        <NeedsSection nudges={nudges} band={band} />"""
needs = """        <NeedsSection nudges={nudges} band={band} />
        <JobsSection
          jobs={jobs}
          team={team}
          readyIds={readyIds}
          width={width}
          band={band}
          nowId={nowPick.job?.id ?? null}
          loading={jobsLoading}
          error={jobsError}
          onRetry={onRetryJobs}
          showPlace={showPlace}
        />"""
if jobs not in t:
    raise SystemExit('jobs/needs block missing')
p.write_text(t.replace(jobs, needs, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-layout: painted"
git checkout -- src/pages/TodayBoardView.tsx
```

Red: `p1Dashboard.chromium.kill.tsx:3197` `390 jobs above needs` AssertionError.

## M-pad — revert ink padding to 56/52/48/0

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """.dashboard-home-widget-ink.is-editing {
    padding: 60px 16px 16px;"""
new = """.dashboard-home-widget-ink.is-editing {
    padding: 56px 52px 48px 0;"""
if old not in t:
    raise SystemExit('edit ink padding missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-pad:"
git checkout -- src/index.css
```

Mutates `src/index.css:13067`.  
Red: `p1Dashboard.chromium.kill.tsx:2959` title/icon inset `≥16` AssertionError (`0`).

## M-pin — chrome flush to the card edge

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """.dashboard-home-edit-chrome {
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;"""
new = """.dashboard-home-edit-chrome {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;"""
if old not in t:
    raise SystemExit('edit chrome pin missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-pin:"
git checkout -- src/index.css
```

Mutates `src/index.css:13238` (`top: 8px`).  
Red: `p1Dashboard.chromium.kill.tsx:2978` Drag top `8±1` AssertionError.

## M-clip — freeze edit cards at the saved grid height

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """  .dashboard-home-widget.is-editing {
    position: relative;
    height: auto !important;
    min-height: calc(168px + 60px + 16px + 32px);
    padding-bottom: 32px;
    box-sizing: border-box;
    overflow: hidden;"""
new = """  .dashboard-home-widget.is-editing {
    position: relative;
    height: 120px !important;
    max-height: 120px;
    min-height: 0;
    padding-bottom: 0;
    box-sizing: border-box;
    overflow: hidden;"""
if old not in t:
    raise SystemExit('edit card grow missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-rows:"
git checkout -- src/index.css
```

Mutates `src/index.css:13224` to a 120px freeze.  
Red: `p1Dashboard.chromium.kill.tsx:3012` partial rows AssertionError, or `:3049` Plant ticket clip.

## M6 — cap Needs you at 3

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/TodayBoardView.tsx')
t = p.read_text()
old = '{nudges.map(nudge =>'
new = '{nudges.slice(0, 3).map(nudge =>'
if old not in t:
    raise SystemExit('nudges.map missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-needs-count:"
git checkout -- src/pages/TodayBoardView.tsx
```

Mutates `src/pages/TodayBoardView.tsx` `{nudges.map(nudge =>` → `slice(0, 3)`.  
Red: `p1Dashboard.chromium.kill.tsx:3752` `390 paints every seeded look Need` AssertionError (`3`).

## M-plant — freeze the Compliance list at 122px

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """  .dashboard-home-widget-ink.is-editing .h-full,
  .dashboard-home-widget-ink.is-editing .flex-1 {
    height: auto !important;
    flex: 0 0 auto !important;
    min-height: min-content !important;
  }

  .dashboard-home-widget-ink.is-editing .overflow-auto,
  .dashboard-home-widget-ink.is-editing [data-compliance-deadlines] {
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    flex: 0 0 auto !important;
    min-height: min-content !important;
  }"""
new = """  .dashboard-home-widget-ink.is-editing .h-full,
  .dashboard-home-widget-ink.is-editing .flex-1 {
    height: auto !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
  }

  .dashboard-home-widget-ink.is-editing .overflow-auto,
  .dashboard-home-widget-ink.is-editing [data-compliance-deadlines] {
    overflow: auto !important;
    max-height: 48px !important;
  }"""
if old not in t:
    raise SystemExit('edit list grow missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-rows:"
git checkout -- src/index.css
```

Mutates `src/index.css:13080` to a 48px list clip (and drops `.flex-1` `min-height: min-content`, which otherwise beats `max-height`).  
Red: `p1Dashboard.chromium.kill.tsx:3012` partial rows AssertionError, or `:3049` Plant ticket clip.

## M-hf403-768-clamp — restore aad2eef7's edit clamp

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/DashboardPage.tsx')
t = p.read_text()
old = """  const displayWidgets = useMemo(() => {
    const rows = widgets ?? [];
    if (editMode && dashboardWidgetsShouldDisplayReflow(rows, canvasW)) {
      return reflowDashboardWidgetsToCanvas(rows, canvasW);
    }
    return clampDashboardWidgetsToCanvas(rows, canvasW);
  }, [widgets, canvasW, editMode]);"""
new = """  const displayWidgets = useMemo(
    () => clampDashboardWidgetsToCanvas(widgets ?? [], canvasW),
    [widgets, canvasW],
  );"""
if old not in t:
    raise SystemExit('display reflow missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-r2:"
git checkout -- src/pages/DashboardPage.tsx
```

Red: `src/components/layout/p1Dashboard.chromium.kill.tsx:4317` `768 full-recent_inspections clientWidth 178 >= min-content 191`.

## M-hf403-768-scroller — restore the 1100 scroll canvas

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/DashboardPage.tsx')
t = p.read_text()
old = """  const displayWidgets = useMemo(() => {
    const rows = widgets ?? [];
    if (editMode && dashboardWidgetsShouldDisplayReflow(rows, canvasW)) {
      return reflowDashboardWidgetsToCanvas(rows, canvasW);
    }
    return clampDashboardWidgetsToCanvas(rows, canvasW);
  }, [widgets, canvasW, editMode]);"""
new = """  const displayWidgets = useMemo(() => {
    const rows = widgets ?? [];
    let width = canvasW;
    if (editMode) width = Math.max(canvasW, DASHBOARD_WIDGET_CANVAS_W);
    return clampDashboardWidgetsToCanvas(rows, width);
  }, [widgets, canvasW, editMode]);"""
if old not in t:
    raise SystemExit('display reflow missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-r2:"
git checkout -- src/pages/DashboardPage.tsx
```

Red: `src/components/layout/p1Dashboard.chromium.kill.tsx:4313` `768 full-weather-a text past viewport`.

## M-hf403-768-mincontent — narrow a Customize card below min-content

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """  .dashboard-home-widget.is-editing {
    position: relative;
    height: auto !important;
    min-height: calc(168px + 60px + 16px + 32px);
    padding-bottom: 32px;
    box-sizing: border-box;
    overflow: hidden;"""
new = """  .dashboard-home-widget.is-editing {
    position: relative;
    height: auto !important;
    min-height: calc(168px + 60px + 16px + 32px);
    padding-bottom: 32px;
    box-sizing: border-box;
    width: 80px !important;
    max-width: 80px !important;
    overflow: hidden;"""
if old not in t:
    raise SystemExit('edit card rule missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-r2:"
git checkout -- src/index.css
```

Red: `src/components/layout/p1Dashboard.chromium.kill.tsx:4312` `768 full-upcoming_jobs text past card` (80px card is below min-content).

## M-hf403-768-a — push dashboard text past the viewport at 320

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """  .dashboard-home-widget-stack .dashboard-home-widget-ink {"""
new = """  [data-dashboard-home] {
    overflow: visible !important;
  }
  [data-dashboard-home] .dashboard-home-widget,
  [data-dashboard-phone-stack] .dashboard-home-widget {
    min-width: 900px !important;
    overflow: visible !important;
  }
  [data-dashboard-home] .dashboard-home-widget-ink {
    white-space: nowrap !important;
  }
  .dashboard-home-widget-stack .dashboard-home-widget-ink {"""
if old not in t:
    raise SystemExit('phone stack ink rule missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-a:"
git checkout -- src/index.css
```

Red: `src/components/layout/p1Dashboard.chromium.kill.tsx:4422` `gate a text walk view 320` AssertionError (`View all` textRight 900 > innerWidth 320). Same mutant reds WebKit `p1Dashboard.webkit.kill.tsx:360` `webkit gate a text walk view 320`.

## M-hf403-768-overflow320 — restore nowrap today-seg at 320

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/styles/todayBoard.css')
t = p.read_text()
old = """@media (max-width: 374px) {
  p.today-job-meta {
    white-space: normal;
  }

  p.today-job-meta .today-seg {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }
}
"""
if old not in t:
    raise SystemExit('320 today-seg wrap missing')
p.write_text(t.replace(old, '', 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1-overflow:"
git checkout -- src/styles/todayBoard.css
```

Red: `src/components/layout/p1Dashboard.chromium.kill.tsx` `max rect.right at 320 view` AssertionError (`Kayla Shore, Josh Perm` today-seg right 355 > 320.5).

## M-hf403-768-webkit — 375 overflow on WebKit

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """  .dashboard-home-widget-stack .dashboard-home-widget-ink {"""
new = """  [data-dashboard-home] {
    min-width: 900px !important;
  }
  .dashboard-home-widget-stack .dashboard-home-widget-ink {"""
if old not in t:
    raise SystemExit('phone stack ink rule missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-webkit"
git checkout -- src/index.css
```

Red: `src/components/layout/p1Dashboard.webkit.kill.tsx` `webkit maxRight view 375` AssertionError (run cites the line).
Run WebKit on `mcr.microsoft.com/playwright:v1.48.2-jammy`. A launcher that does not start is a FAIL. 0 skips.

## M-hf403-768-twoup — collapse 768 Customize to one left column

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/dashboardWidgets.ts')
t = p.read_text()
old = """  if (widgets.length < 2) return false;
  if (width < 800) return true;"""
new = """  if (widgets.length < 2) return false;
  if (width < 800) return false;"""
if old not in t:
    raise SystemExit('768 two-up gate missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-r4: 768 Customize two-up"
git checkout -- src/lib/dashboardWidgets.ts
```

Red (measured): `p1Dashboard.chromium.kill.tsx` `768 right empty strip` — clamp leaves a ≥310px empty right column over more than one card height (720 canvas, cards ≤410). Same mutant reds WebKit `webkit 768 right empty strip`.

## M-hf403-768-height — 1-col pack blows past 1.15× view height

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/dashboardWidgets.ts')
t = p.read_text()
old = """export function dashboardWidgetDisplayColumns(canvasW: number): 0 | 1 | 2 {
  if (canvasW < 1100) return 2;
  return 0;
}"""
new = """export function dashboardWidgetDisplayColumns(canvasW: number): 0 | 1 | 2 {
  if (canvasW < 800) return 1;
  if (canvasW < 1100) return 2;
  return 0;
}"""
if old not in t:
    raise SystemExit('display columns missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-r4: Customize page height"
git checkout -- src/lib/dashboardWidgets.ts
```

Red (measured): `p1Dashboard.chromium.kill.tsx` `768 Customize height 10088 <= 1.15 × view` — 1-col pack is ~10088 vs view ~7024. Same mutant reds WebKit height assert.

## M-hf403-768-order — pack stored order instead of view order

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/dashboardWidgets.ts')
t = p.read_text()
old = """  const ordered = sortDashboardWidgetsForView(widgets);"""
new = """  const ordered = [...widgets];"""
if old not in t:
    raise SystemExit('view-order pack missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-r4: Customize column assignment"
git checkout -- src/lib/dashboardWidgets.ts
```

Red (measured): `p1Dashboard.chromium.kill.tsx` `768 Customize order equals view` — stored order starts `full-upcoming_jobs` / `full-weather-a`; view order starts money (`full-outstanding_invoices`). Same mutant reds WebKit order assert.

## M-hf403-768-display-persist — persist the reflowed drawn rect

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/DashboardPage.tsx')
t = p.read_text()
old = """    const next = dashboardWidgetDisplayIsReflow(shown, stored, canvasW)
      ? applyDashboardWidgetSavedDrag(stored, delta)
      : applyDashboardWidgetDrag(shown, delta, canvasW);"""
new = """    const next = applyDashboardWidgetDrag(shown, delta, canvasW);"""
if old not in t:
    raise SystemExit('saved-drag guard missing')
p.write_text(t.replace(old, new, 1))
PY
npx vitest run --maxWorkers=2 src/pages/dashboardPhonePersist.test.tsx -t "vertical-only drag"
git checkout -- src/pages/DashboardPage.tsx
```

Red (measured): `src/pages/dashboardPhonePersist.test.tsx` `expect(payload.grid_x).toBe(540)` — clamp-on-drawn writes x=20 (or 460 on a 720 clamp). Chromium kill `vertical drag keeps saved x` first red is the same measured savedX. P1-A stays untouched and stays green (910 is clamp, not reflow).

## M-hf403-768-scroller-branch — accept a 1100 scroller again

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/components/layout/p1Dashboard.chromium.kill.tsx')
t = p.read_text()
old = """        expect(reach.scrollWidth, `edit canvas scrollWidth at ${width}`).toBeLessThanOrEqual(reach.clientWidth);"""
new = """        if (reach.scroller) {
          expect(reach.cards.length, `reachable cards at ${width}`).toBe(26);
          continue;
        }
        expect(reach.scrollWidth, `edit canvas scrollWidth at ${width}`).toBeLessThanOrEqual(reach.clientWidth);"""
if old not in t:
    raise SystemExit('canvas scrollWidth assert missing')
p.write_text(t.replace(old, new, 1))
PY
```

This mutant loosens the kill (forbidden). The live assert is `edit canvas scrollWidth at ${width}` ≤ clientWidth. A product mutant that restores `Math.max(canvasW, DASHBOARD_WIDGET_CANVAS_W)` (M-hf403-768-scroller above) is the measured first red.

## M-hf403-768-1024-gap — restore clamp crush gaps at 1024

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/dashboardWidgets.ts')
t = p.read_text()
old = """  if (width < 800) return true;
  return dashboardWidgetsNeedDisplayReflow(widgets, width);"""
new = """  if (width < 800) return true;
  return false;"""
if old not in t:
    raise SystemExit('1024 reflow gate missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-r4: 1024 neighbor gaps"
git checkout -- src/lib/dashboardWidgets.ts
```

Red (measured): `p1Dashboard.chromium.kill.tsx` `1024 gap` — clamp-in-place leaves a neighbor gap > 40 (empty strip beside crushed 4-cell cards). Same mutant reds WebKit 1024 gap.

## M-hf403-768-1280-aad2 — rewrite 1280 stored x

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/dashboardWidgets.ts')
t = p.read_text()
old = """export function dashboardWidgetDisplayColumns(canvasW: number): 0 | 1 | 2 {
  if (canvasW < 1100) return 2;
  return 0;
}"""
new = """export function dashboardWidgetDisplayColumns(canvasW: number): 0 | 1 | 2 {
  if (canvasW < 1400) return 2;
  return 0;
}"""
if old not in t:
    raise SystemExit('1280 clamp columns missing')
p.write_text(t.replace(old, new, 1))
PY
VITE_LOOK_PROOF=1 npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "HF-403-768-r4: 1024 neighbor gaps are"
git checkout -- src/lib/dashboardWidgets.ts
```

Red (measured): `p1Dashboard.chromium.kill.tsx` `1280 Customize equals in-run aad2eef7` — two-up at 1280 moves `full-outstanding_invoices` off stored x=800. Same mutant reds WebKit 1280 aad2.
