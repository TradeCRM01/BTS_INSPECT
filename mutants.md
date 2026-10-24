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

## M-hf-land-1-nowrap — put nowrap back on the hero h1

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """.hub-marketing-display {
  font-family: var(--g-font-title);
  font-weight: 700;
  font-size: clamp(1.85rem, 9vw, 4.5rem);
  line-height: 1.05;
  letter-spacing: 0.01em;
  color: var(--mkt-ink);
  white-space: normal;"""
new = old.replace('white-space: normal;', 'white-space: nowrap;')
if old not in t:
    raise SystemExit('hero wrap missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "hero h1 text wraps"
git checkout -- src/index.css
```

Mutates `src/index.css` `.hub-marketing-display` to `white-space: nowrap`.  
First red is measured: `hero h1 text wraps` `toBeGreaterThan(1)` AssertionError.

## M-hf-land-1-top-a — drop landing top env()

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
nav = 'padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 24px 8px;'
if nav not in t:
    raise SystemExit('landing top env missing')
p.write_text(t.replace(nav, 'padding: 16px 24px 8px;', 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "first nav text sits"
git checkout -- src/index.css
```

Mutates `.hub-marketing-nav` top padding.  
First red is measured: `first nav text sits` `toBeGreaterThanOrEqual(55)` AssertionError.

## M-hf-land-1-top-b — drop shell top env()

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
head = 'padding-top: env(safe-area-inset-top, 0px);'
if head not in t:
    raise SystemExit('shell top env missing')
p.write_text(t.replace(head, 'padding-top: 0;', 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "first nav text sits"
git checkout -- src/index.css
```

Mutates `.shell-header` top padding.  
First red is measured: `first nav text sits` `toBeGreaterThanOrEqual(55)` AssertionError.

## M-hf-land-1-top-legal — drop legal top env()

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = 'padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 20px 0;'
if old not in t:
    raise SystemExit('legal top env missing')
p.write_text(t.replace(old, 'padding: 16px 20px 0;', 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "first nav text sits"
git checkout -- src/index.css
```

Mutates `.hub-legal-nav` top padding.  
First red is measured: `first nav text sits` `toBeGreaterThanOrEqual(55)` AssertionError.

## M-hf-land-1-top-auth — drop auth top env()

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = 'padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 20px 40px;'
if old not in t:
    raise SystemExit('auth top env missing')
p.write_text(t.replace(old, 'padding: 16px 20px 40px;', 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "first nav text sits"
git checkout -- src/index.css
```

Mutates `.hub-auth` top padding.  
First red is measured: `first nav text sits` `toBeGreaterThanOrEqual(55)` AssertionError.

## M-hf-land-1-top-portal — drop portal top env()

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = 'padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 16px 32px;'
if old not in t:
    raise SystemExit('portal top env missing')
p.write_text(t.replace(old, 'padding: 16px 16px 32px;', 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "first nav text sits"
git checkout -- src/index.css
```

Mutates `#client-portal .portal-doc` top padding.  
First red is measured: `first nav text sits` `toBeGreaterThanOrEqual(55)` AssertionError.

## M-hf-land-1-flush — r2 flush max(existing, env) without +internal

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = 'padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 24px 8px;'
new = 'padding: max(16px, env(safe-area-inset-top)) 24px 8px;'
if old not in t:
    raise SystemExit('LOOK landing pad missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "first nav text sits"
git checkout -- src/index.css
```

Mutates `.hub-marketing-nav` to the r2 flush formula. Content top becomes 47.  
First red is measured: `first nav text sits` `toBeGreaterThanOrEqual(55)` AssertionError.

## M-hf-land-1-inset0 — shrink existing pad so inset-0 leaves aad2eef7

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = 'padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 24px 8px;'
new = 'padding: max(8px, calc(env(safe-area-inset-top) + 8px)) 24px 8px;'
if old not in t:
    raise SystemExit('LOOK landing pad missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "nav content top matches aad2eef7"
git checkout -- src/index.css
```

Mutates `.hub-marketing-nav` existing pad from 16 to 8.  
First red is measured: `nav content top matches aad2eef7` landing first nav top `16` AssertionError (`8`).

## M-hf-land-1-doubled — stack a second inset term

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = 'padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 24px 8px;'
new = 'padding: max(16px, calc(env(safe-area-inset-top) + env(safe-area-inset-top) + 16px)) 24px 8px;'
if old not in t:
    raise SystemExit('LOOK landing pad missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "first nav text sits"
git checkout -- src/index.css
```

Mutates `.hub-marketing-nav` to env+env. Content top becomes 110.  
First red is measured: `first nav text sits` `toBeLessThan(94)` AssertionError.

## M-hf-land-1-toast — unpin the toast host past the viewport

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """.ops-toast-host {
    position: fixed;
    left: 1rem;
    right: 1rem;
    bottom: 1rem;
    width: auto;
    max-width: calc(100vw - 2rem);
    min-width: 0;
    box-sizing: border-box;"""
new = """.ops-toast-host {
    position: fixed;
    left: 0;
    right: auto;
    bottom: 1rem;
    width: 120vw;
    max-width: none;
    min-width: 0;
    box-sizing: content-box;"""
if old not in t:
    raise SystemExit('toast host pin missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "ops-toast-host stays inside"
git checkout -- src/index.css
```

Mutates `.ops-toast-host` off the left/right pin to a 120vw used width (the prod WebKit overflow mode).  
First red is measured: `ops-toast-host stays inside` toast right or `body.scrollWidth` AssertionError.

## M-hf-land-1-bottom — drop the bottom env() padding

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = 'padding-bottom: env(safe-area-inset-bottom, 0px);'
h = '--shell-bottom-nav-h: calc(64px + env(safe-area-inset-bottom, 0px));'
if old not in t or h not in t:
    raise SystemExit('bottom env padding missing')
p.write_text(t.replace(old, 'padding-bottom: 0;', 1).replace(h, '--shell-bottom-nav-h: 64px;', 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "bottom tab content sits above"
git checkout -- src/index.css
```

Mutates `.shell-bottom-nav` height and padding.  
First red is measured: `bottom tab content sits above` `contentBottom` `toBeLessThanOrEqual` AssertionError.

## M-hf-land-1-env-shell — remove env() from the shell header (M4)

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '.shell-header {\n    color: var(--g-nav-ink);\n    background-color: var(--g-nav-bg);\n    border-bottom: 1px solid var(--g-glass-line);\n    backdrop-filter: saturate(180%) blur(16px);\n    -webkit-backdrop-filter: saturate(180%) blur(16px);\n    padding-top: env(safe-area-inset-top, 0px);'
new = old.replace('padding-top: env(safe-area-inset-top, 0px);', 'padding-top: 0;')
if old not in t:
    raise SystemExit('shell env() missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/hfLand1.chromium.kill.tsx -t "first nav text sits"
git checkout -- src/index.css
```

Removes `env()` from `.shell-header` only. The stand-in is a served-CSS rewrite of env(), so this goes red.  
First red is measured: `first nav text sits` `toBeGreaterThanOrEqual(55)` AssertionError.
