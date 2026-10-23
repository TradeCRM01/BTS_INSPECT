# r10 mutants (CoS runs these outside the suite)

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

Red: `src/components/layout/p1Dashboard.chromium.kill.tsx:2683` `toBe('Today')` AssertionError (`Tonight`).

## M-chrome — absolute bars outside the card

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
inside = """.dashboard-home-edit-chrome {
    position: absolute;
    top: 6px;
    left: 6px;
    right: 6px;"""
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

Mutates `src/index.css:13210` (`top: 6px`) and `:13224` (`bottom: 0`).  
Red: `p1Dashboard.chromium.kill.tsx:2802` `elementFromPoint centre misses` AssertionError.

## M-paint-fill — edit card fill transparent

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """.dashboard-home-widget.is-editing {
    position: relative;
    background: var(--dashboard-home-sheet);
    border: 1px solid var(--dashboard-home-line);"""
new = """.dashboard-home-widget.is-editing {
    position: relative;
    background: transparent;
    border: 1px solid var(--dashboard-home-line);"""
if old not in t:
    raise SystemExit('is-editing fill missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-paint:"
git checkout -- src/index.css
```

Mutates `src/index.css:13203`.  
Red: `p1Dashboard.chromium.kill.tsx:2874` fill vs main `255,255,255` AssertionError.

## M-paint-sides — side borders removed

```bash
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """.dashboard-home-widget.is-editing {
    position: relative;
    background: var(--dashboard-home-sheet);
    border: 1px solid var(--dashboard-home-line);"""
new = """.dashboard-home-widget.is-editing {
    position: relative;
    background: var(--dashboard-home-sheet);
    border: 1px solid var(--dashboard-home-line);
    border-left: none;
    border-right: none;"""
if old not in t:
    raise SystemExit('is-editing border missing')
p.write_text(t.replace(old, new, 1))
PY
TZ=UTC npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts -t "P1b-edit-paint:"
git checkout -- src/index.css
```

Mutates `src/index.css:13204`.  
Red: `p1Dashboard.chromium.kill.tsx:2879` left/right vs main `228,228,231` AssertionError.

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

Red: `p1Dashboard.chromium.kill.tsx:2954` `390 jobs above needs` AssertionError.
