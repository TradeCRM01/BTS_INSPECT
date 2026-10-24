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

## PHONE

Patch the phone edit bar class in `src/pages/DashboardPage.tsx`.

```
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/DashboardPage.tsx')
t = p.read_text()
n = 'className="dashboard-home-phone-edit-bar"'
m = 'className="dashboard-home-phone-edit-bar p1-phone-mutant"'
if n not in t: raise SystemExit('PHONE needle missing')
p.write_text(t.replace(n, m, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/components/layout/p1Dashboard.chromium.kill.tsx -t 'P1-phone-unchanged'
git checkout -- src/pages/DashboardPage.tsx
```

Expected AssertionError:

`src/components/layout/p1Dashboard.chromium.kill.tsx:5141` `phone chrome at 375 edit`

## Y200

Patch `src/pages/DashboardPage.tsx` at `top: widget.grid_y,` (FreeWidget).

```
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/DashboardPage.tsx')
t = p.read_text()
n = "top: widget.grid_y,"
m = "top: widget.id === 'w-compliance' ? widget.grid_y + 200 : widget.grid_y,"
if n not in t: raise SystemExit('Y200 needle missing')
p.write_text(t.replace(n, m, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/components/layout/p1Dashboard.chromium.kill.tsx -t 'P1-edit-cross-card'
git checkout -- src/pages/DashboardPage.tsx
```

Expected AssertionError:

`src/components/layout/p1Dashboard.chromium.kill.tsx:4725` `/?look=dashboard-repro 768 edit cross-card hits`

Dashboard-all cites on the same kill: grow-ran `:4754` (`768 edit grow ran on live cards`).

## CLIP

Turn grow off on the live 26-card set and restore inner scroll. No `|| true`.

```
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/DashboardPage.tsx')
t = p.read_text()
a = "? growDashboardEditHosts(shownWidgets, DASHBOARD_WIDGET_GAP, editContentH)"
b = "? shownWidgets"
c = "dashboard-home-widget h-full w-full overflow-hidden"
d = "dashboard-home-widget h-full w-full overflow-auto"
if a not in t or c not in t: raise SystemExit('CLIP needle missing')
p.write_text(t.replace(a, b, 1).replace(c, d, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/components/layout/p1Dashboard.chromium.kill.tsx -t 'P1-edit-content-clip'
git checkout -- src/pages/DashboardPage.tsx
```

Expected AssertionError:

`src/components/layout/p1Dashboard.chromium.kill.tsx:4985` `/?look=dashboard-repro 768 clipped or scrolling cards`

## BORDER

Drop the painted edit outline and the side borders. Rebuild dist CSS, then run the kill.

```
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
p.write_text(t + """
  .dashboard-home-widget.is-editing {
    outline: none !important;
    border-left: none !important;
    border-right: none !important;
  }
""")
PY
npm run build
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/components/layout/p1Dashboard.chromium.kill.tsx -t 'P1-edit-side-border'
git checkout -- src/index.css
npm run build
```

Expected AssertionError:

`src/components/layout/p1Dashboard.chromium.kill.tsx:5054` `768 cards missing painted edit outline`

## GAP

Push every conflicting card, including other columns.

```
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/dashboardWidgets.ts')
t = p.read_text()
n = "        if (!dashboardWidgetColumnsOverlap(row, other)) continue;\n"
if n not in t: raise SystemExit('GAP needle missing')
p.write_text(t.replace(n, '', 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/components/layout/p1Dashboard.chromium.kill.tsx -t 'P1-edit-grow-gap'
git checkout -- src/lib/dashboardWidgets.ts
```

Expected AssertionError:

`src/components/layout/p1Dashboard.chromium.kill.tsx:5735` `/?look=dashboard-all 1024 all-calendar-6 edit gap must match in-run stored`
