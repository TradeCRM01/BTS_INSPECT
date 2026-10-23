# P3 r13 mutants

Real-file mutants. Edit `src`, `npm run build`, run the named Chromium `it()`, revert. Timeouts, injected CSS, in-suite rebuilds, and tests that write tracked files do not count. Each kill cites `it()` in `src/pages/p3Jobs.chromium.kill.tsx`.

Portable mockup pin lives at `docs/look/p3/fixtures/{job-390-light.html,direction.css,tokens.css,app.css}`. `src/pages/job390Light.fixture.test.ts` sha256-checks those four files. No `/home/ubuntu` paths.

R13 keeps every r12 assert and ADDs note weight 400, Notes heading size/weight, disclosed `All notes`, photo fill/ring painted ±3, icon/caption geometry ±1, and a tight Actions border ±3 beside the standing `#E5E7EB ±18`. Commands below run **outside** the suite.

| id | src edit | kill | red |
| --- | --- | --- | --- |
| m15 | `.job-sheet-tabs` forced to `grid-auto-flow:row; grid-template-columns:1fr 1fr` in `src/index.css` | `K7 four tabs one row` :1057 `expect(read.columns).toBe(4)` and :1058 `uniqueLefts`; also `R9 job-390-light named elements` tab width | AssertionError `expected 2 to be 4`; tab 0 width 174 vs mock 79 |
| m26 | `.job-sheet-more { display: none }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` | AssertionError `375 Actions display: expected 'none' not to be 'none'` |
| m26 visibility | `.job-sheet-more { visibility: hidden }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` | AssertionError `375 Actions visibility: expected 'hidden' not to be 'hidden'` **and** `375 Actions hit-test at centre: expected false to be true` |
| m26 height:0 | `.job-sheet-more { height: 0; overflow: hidden }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` | AssertionError `375 Actions height: expected 0 to be greater than 0` **and** hit-test / summary rect |
| bill3-flat | `.job-sheet-bill3` `display:block` in `src/index.css` | `R9 job-390-light named elements` `bill3Display` (kept) and cell rects | AssertionError `expected 'block' to be 'grid'` **and** tops not same-row / lefts not left-to-right |
| bl-subline-removed | drop `.job-sheet-bill-s` from `JobDetailPage.tsx` | `R9 job-390-light named elements` `billSubCount` | AssertionError `real line sub-lines: expected 0 to be greater than 0` |
| Go ring | drop the `#A1A1AA` inset on `.job-sheet-kv-act` | `R10 Go/Call ring paints line-strong on the edge` | painted edge pixel leaves `rgb(161,161,170)` |
| Site hair | remove the first `[data-job-kv-rule]` or its 1px fill | `R10 Site hairline paints above the first KV row`; `R6-5` four hairs | painted `#E4E4E7` miss or hairCount ≠ 4 |
| KV 400 | `font-weight: 500` on `.job-sheet-kv-value` | `R10 KV value paints ink at weight 400` | AssertionError weight ≠ 400 |
| Tabs 11px | `font-size: 11px` on `.job-sheet-tabs .job-sheet-tab` | R9 `tabFontSize` | AssertionError `14` vs `11` |
| Fixture pin | rewrite any fixture byte | `job-390-light fixture pin` in `src/pages/job390Light.fixture.test.ts` | sha256 mismatch |
| actions-text-link | revert `.job-sheet-more > summary.btn-secondary` to grey text-link (no fill, no border) and the ≤768 `width:100%` to `width:auto` | `R12 Actions paints kit secondary border and fills the gutters` via `assertActionsVisible` | AssertionError `390 Actions summary fills gutters: expected 73.546875 to be greater than or equal to 357` |
| note-weight | `.job-sheet-note p` `font-weight: 700` | `R9 job-390-light named elements` `notePWeight` | AssertionError `head note body weight 400: expected 700 to be 400` |
| photo-fill | `.job-sheet-photo` background `#eeeae3` | `R9 job-390-light named elements` painted fill ±3 | AssertionError `head photo fill` dist > 3 vs `#EBEBEE` |
| photo-icon | drop `.job-sheet-photo-ic { margin-bottom: auto }` | `R9 job-390-light named elements` icon Y ±1 | AssertionError `photo icon Y` head vs mock |

m26 is a click-path kill: Playwright `page.click` on `summary`, then `[data-job-action="details"]`. No `open=true`, no JS `.click()`. Hidden Actions fails on kept `visibility` / non-zero viewport rect **and** on `document.elementFromPoint` at the summary centre.

## Outside-suite commands

Working directory is the repo root. Revert with `git checkout -- src/index.css` after each mutant. Do not leave a dirty tree.

### note-weight

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .job-sheet-note p {\n    margin: 4px 0 0;\n    font-size: 16px;\n    line-height: 24px;\n    font-weight: 400;\n  }'
new = '  .job-sheet-note p {\n    margin: 4px 0 0;\n    font-size: 16px;\n    line-height: 24px;\n    font-weight: 700;\n  }'
if old not in t:
    raise SystemExit('note-weight anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated note-weight')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 job-390-light named elements"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2079
#   head note body weight 400: expected 700 to be 400
git checkout -- src/index.css
```

### photo-fill

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """  .job-sheet-photo {
    position: relative;
    aspect-ratio: 1;
    padding: 0;
    border: none;
    border-radius: var(--r-control, 10px);
    background: var(--g-surface-2, #EBEBEE);"""
new = """  .job-sheet-photo {
    position: relative;
    aspect-ratio: 1;
    padding: 0;
    border: none;
    border-radius: var(--r-control, 10px);
    background: #eeeae3;"""
if old not in t:
    raise SystemExit('photo-fill anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated photo-fill')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 job-390-light named elements"
# expected AssertionError head photo fill dist > 3
git checkout -- src/index.css
```

### photo-icon

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .job-sheet-photo-ic {\n    display: block;\n    flex: none;\n    width: 18px;\n    height: 18px;\n    margin-bottom: auto;\n    color: var(--job-look-muted);\n  }'
new = '  .job-sheet-photo-ic {\n    display: block;\n    flex: none;\n    width: 18px;\n    height: 18px;\n    margin-bottom: 0;\n    color: var(--job-look-muted);\n  }'
if old not in t:
    raise SystemExit('photo-icon anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated photo-icon')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 job-390-light named elements"
# expected AssertionError photo icon Y head vs mock
git checkout -- src/index.css
```

### actions-text-link

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """  .hub-jobs-document .job-sheet-more > summary.btn-secondary,
  .job-sheet-more > summary.btn-secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    box-sizing: border-box;
    width: auto;
    height: auto;
    min-height: 0;
    padding: 0.5rem 0.75rem;
    list-style: none;
    cursor: pointer;
    text-align: center;
    background: #fff;
    color: #1A1A1A;
    border: 1px solid #E5E7EB;
    border-radius: 0.375rem;
    box-shadow: none;
    font-size: 0.875rem;
    line-height: 1.25rem;
    font-weight: 500;
  }"""
new = """  .hub-jobs-document .job-sheet-more > summary.btn-secondary,
  .job-sheet-more > summary.btn-secondary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    height: auto;
    min-height: 44px;
    list-style: none;
    cursor: pointer;
    text-align: center;
    background: none;
    border: none;
    color: #5B6B7C;
  }"""
if old not in t:
    raise SystemExit('actions-text-link paint anchor missing')
t = t.replace(old, new, 1)
width_old = """    .hub-jobs-document .job-sheet-more,
    .job-sheet-more,
    .hub-jobs-document .job-sheet-more > summary.btn-secondary,
    .job-sheet-more > summary.btn-secondary {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }"""
width_new = """    .hub-jobs-document .job-sheet-more,
    .job-sheet-more,
    .hub-jobs-document .job-sheet-more > summary.btn-secondary,
    .job-sheet-more > summary.btn-secondary {
      width: auto;
      max-width: none;
      box-sizing: border-box;
    }"""
if width_old not in t:
    raise SystemExit('actions-text-link width anchor missing')
p.write_text(t.replace(width_old, width_new, 1))
print('mutated actions-text-link')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R12 Actions paints kit secondary"
# expected AssertionError: 390 Actions summary fills gutters
git checkout -- src/index.css
```

### bill3-flat

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '.job-sheet-bill3 {\n    display: grid;\n    grid-template-columns: repeat(3, 1fr);'
new = '.job-sheet-bill3 {\n    display: block;\n    grid-template-columns: repeat(3, 1fr);'
if old not in t:
    raise SystemExit('bill3-flat anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated bill3-flat')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 job-390-light named elements"
# expected AssertionError: expected 'block' to be 'grid'
git checkout -- src/index.css
```

### m26 visibility

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .job-sheet-more {\n    position: relative;\n    margin-top: 28px;\n  }'
new = '  .job-sheet-more {\n    position: relative;\n    margin-top: 28px;\n    visibility: hidden;\n  }'
if old not in t:
    raise SystemExit('m26 visibility anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated m26 visibility')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 sheet actions stay reachable"
# expected AssertionError: 375 Actions visibility: expected 'hidden' not to be 'hidden'
git checkout -- src/index.css
```

### m26 height:0

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .job-sheet-more {\n    position: relative;\n    margin-top: 28px;\n  }'
new = '  .job-sheet-more {\n    position: relative;\n    margin-top: 28px;\n    height: 0;\n    overflow: hidden;\n  }'
if old not in t:
    raise SystemExit('m26 height:0 anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated m26 height:0')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 sheet actions stay reachable"
# expected AssertionError: 375 Actions height: expected 0 to be greater than 0
git checkout -- src/index.css
```
