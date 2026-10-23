# P3 r15 mutants

Real-file mutants. Edit `src`, `npm run build`, run the named Chromium `it()`, revert. Timeouts, injected CSS, in-suite rebuilds, and tests that write tracked files do not count. Each kill cites `it()` in `src/pages/p3Jobs.chromium.kill.tsx`.

Portable mockup pin lives at `docs/look/p3/fixtures/{job-390-light.html,direction.css,tokens.css,app.css}`. `src/pages/job390Light.fixture.test.ts` sha256-checks those four files. No `/home/ubuntu` paths.

R15 applies Jack's phone type below 768 only. Desktop 1024/1280 stays r14 `1dd0d37b`. Jack 08:42 AEST: lock beats the mockup; re-pins stay exact `toBe`. Commands below run **outside** the suite.

## Jack 08:42 AEST re-pins (below 768 only)

r14 parent `1dd0d37b` → r15. Each is exact `toBe`, same selector, same real-file mutant still red. 1024/1280 stay r14.

| r14 file:line | old | new (current line) |
| --- | --- | --- |
| `p3Jobs.chromium.kill.tsx:1550` | `fontSize.toBeGreaterThanOrEqual(32)` | `fontSize.toBe(24)` at 375/390 (`:1572`) |
| `p3Jobs.chromium.kill.tsx:1552` | `lines.toBe(2)` at 390 | `lines.toBe(1)` at 375/390 (`:1574`) |
| `p3Jobs.chromium.kill.tsx:2044` | `near(head.titleSize, mockup.titleSize)` | `head.titleSize.toBe(24)` (`:2176`) + ADD `mockup.titleSize.toBe(34)` (`:2177`) |
| `p3Jobs.chromium.kill.tsx:2048` | `near(head.ctaY, mockup.ctaY)` | `head.ctaY.toBe(titleBottom + mock gap)` (`:2181`) + ADD fixture `ctaY.toBe(199)` at 375/390 (`:2184`, `:2941`) |
| `p3Jobs.chromium.kill.tsx:2062` | `tabFontWeight.toBe(600)` | `tabFontWeight.toBe(500)` (`:2198`) |
| `p3Jobs.chromium.kill.tsx:2070-2072` | `near(w, mockup.tabWidths[i])` / `near(w, mockTabTargets[i])` | exact kill-harness widths at 500/400 (`:2206` R9 390 `[81.390625, 81.390625, 97.53125, 83.6875]`; Jack 375 `[87.796875, 87.796875, 97.609375, 87.796875]` / 390 `[79.734375, 79.734375, 97.609375, 86.921875]`) + content-sized `width == (scrollWidth - pad) + pad ±1` + `--line-strong` ring `rgb(228,228,231)` |

ADD (not a re-pin): `R15 long title` `:1592` `'Hot water system replacement and backflow test'` wraps to `toBe(2)` at 375/390, `scrollHeight ≤ clientHeight`, `scrollWidth ≤ clientWidth`, `rect.right ≤ innerWidth`. Jack 08:42 AEST.

| id | src edit | kill | red |
| --- | --- | --- | --- |
| m15 | `.job-sheet-tabs` forced to `grid-auto-flow:row; grid-template-columns:1fr 1fr` in `src/index.css` | `K7 four tabs one row` :1073 `expect(read.columns).toBe(4)` and :1074 `uniqueLefts`; geometry backstops :1074 and R9 tab widths :2206 (r14 :2070) | AssertionError `expected 2 to be 4`; tab 0 width 174 vs 81.390625 |
| m26 | `.job-sheet-more { display: none }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` | AssertionError `375 Actions display: expected 'none' not to be 'none'` |
| m26 visibility | `.job-sheet-more { visibility: hidden }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` :2267 | AssertionError `375 Actions visibility: expected 'hidden' not to be 'hidden'` **and** hit-test |
| m26 height:0 | `.job-sheet-more { height: 0; overflow: hidden }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` :2269 | AssertionError `375 Actions height: expected 0 to be greater than 0` **and** hit-test / summary rect |
| bill3-flat | `.job-sheet-bill3` `display:block` in `src/index.css` | `R9 job-390-light named elements` :2161 `bill3Display` (kept) and cell rects | AssertionError `expected 'block' to be 'grid'` **and** tops not same-row / lefts not left-to-right |
| bill-inset | `.job-sheet-bill-v` `margin-left: 8px` in `src/index.css` | `R9 job-390-light named elements` :2198 `head Budget value inset` | AssertionError `head Budget value inset 8: expected false to be true` |
| phone-title | r15 hero `24px` → `34px` | `R6-1` :1572 / R9 `titleSize` :2101 / `R15 Jack phone type` :2717 | AssertionError `expected 34 to be 24` at :1572 and :2101; `375 title size: expected 34 to be 24` at :2717 |
| fixture-title-wrap | r15 hero `max-width: 80px` at 24px | `R6-1` :1574 `fixture title lines` | AssertionError `375 fixture title lines: expected 4 to be 1` at :1574 |
| long-title-nowrap | r15 hero `white-space: nowrap` | `R15 long title` :1592 | AssertionError `375 long title lines: expected 1 to be 2` at :1592 |
| cta-gap | r15 hero `margin-bottom: 40px` | R9 :2106 formula / :2109 `head fixture ctaY at 390` / `R15 Jack` :2730 | AssertionError `head ctaY is titleBottom plus mock title-to-CTA gap: expected 239 to be 199` at :2106; `375 ctaY is titleBottom plus mock title-to-CTA gap: expected 239 to be 199` at :2730 |
| phone-kv-label | r15 label `400` → `700` | `R15 Jack phone type` :2720 | AssertionError `375 kv label weight: expected 700 to be 400` at :2720 |
| phone-section | r15 Scope/Notes `600` → `700` | `R15 Jack phone type` :2725 | AssertionError `375 Scope of works weight: expected 700 to be 600` at :2725 |
| phone-cta | r15 CTA `600` → `700` | `R15 Jack phone type` :2727 | AssertionError `375 CTA weight: expected 700 to be 600` at :2727 |
| phone-tab-on | r15 active tab `500` → `700` | R9 `tabFontWeight` :2123 / `R15 Jack phone type` :2728 | AssertionError `expected 700 to be 500` at :2123; `375 active tab weight: expected 700 to be 500` at :2728 |
| tab-pad | tab `padding: 0 8px` → `0 20px` | R9 :2131 `tab 0 width` / `R15 Jack` :2739 | AssertionError `tab 0 width head 101.296875: expected 101.296875 to be 81.390625` at :2131; `375 tab 0 width: expected 101.296875 to be 87.796875` at :2739 |
| desktop-title | hero `24px` without the 767 cap | `R15 1024 and 1280 type unchanged` :2763 | AssertionError `1024 title size: expected 24 to be 22` at :2763 |
| bl-subline-removed | drop `.job-sheet-bill-s` from `JobDetailPage.tsx` | `R9 job-390-light named elements` `billSubCount` | AssertionError `real line sub-lines: expected 0 to be greater than 0` |
| Go ring | drop the `#A1A1AA` inset on `.job-sheet-kv-act` | `R10 Go/Call ring paints line-strong on the edge` | painted edge pixel leaves `rgb(161,161,170)` |
| Site hair | remove the first `[data-job-kv-rule]` or its 1px fill | `R6-5 hairline rect sits between each Overview pair` :1638 / :1662 `hairCount` (not R10) | painted `#E4E4E7` miss or hairCount ≠ 4 |
| KV 400 | last `.job-sheet-kv-value` `font-weight: 400` → `700` | `R10 KV value paints ink at weight 400` computed **and** :2709 ink width / :2710 fixed ink; `R15 weight pins` :3009 | AssertionError `375 kv value ink 175.03125: expected 12.296875 to be <= 1` even if the computed expect is blanked |
| Tabs 11px | `font-size: 11px` on `.job-sheet-tabs .job-sheet-tab` | R9 `tabFontSize` | AssertionError `14` vs `11` |
| Fixture pin | rewrite any fixture byte | `job-390-light fixture pin` in `src/pages/job390Light.fixture.test.ts` | sha256 mismatch |
| actions-text-link | revert `.job-sheet-more > summary.btn-secondary` to grey text-link (no fill, no border) and the ≤768 `width:100%` to `width:auto` | `R12 Actions paints kit secondary border and fills the gutters` :2523 | AssertionError `390 Actions summary fills gutters: expected 73.546875 to be greater than or equal to 357` |
| note-weight | `.job-sheet-note p` `font-weight: 700` | `R9` :2241 `notePWeight` **and** :2396 `notePInk`; `R15 weight pins` :3015 | AssertionError `375 note p ink 95.765625: expected 4.890625 to be <= 1` even if the computed expect is blanked |
| ink-title | r15 hero `font-weight: 600` → `400` | `R15 weight pins have painted ink widths` :3007 | AssertionError `375 title ink 317.078125: expected 16.890625 to be <= 1` (no computed-style expect in this it) |
| ink-kv-label | r15 label `400` → `700` | `R15 weight pins have painted ink widths` :3008 | AssertionError `375 kv label ink 25.703125: expected 2.390625 to be <= 1` |
| ink-kv | last kv-value `400` → `700` | `R15 weight pins have painted ink widths` :3009 | AssertionError `375 kv value ink 175.03125: expected 12.296875 to be <= 1` |
| ink-scope | r15 Scope/Notes `600` → `400` | `R15 weight pins have painted ink widths` :3010 | AssertionError `375 scope ink 137.84375: expected 6.375 to be <= 1` |
| ink-cta | r15 CTA `600` → `400` | `R15 weight pins have painted ink widths` :3012 | AssertionError `375 cta ink 174.5625: expected 9.5625 to be <= 1` |
| ink-tab-on | r15 active tab `500` → `700` | `R15 weight pins have painted ink widths` :3013 | AssertionError `375 tab on ink 64.8125: expected 3.515625 to be <= 1` |
| ink-tab-off | r15 inactive tab `400` → `700` | `R15 weight pins have painted ink widths` :3014 | AssertionError `375 tab off ink 47.390625: expected 3.3125 to be <= 1` |
| ink-note | `.job-sheet-note p` `400` → `700` | `R15 weight pins have painted ink widths` :3015 | AssertionError `375 note p ink 95.765625: expected 4.890625 to be <= 1` |
| bill3-inner | drop r15 `.job-sheet-bill3 div` inner pad/border | `R15 Jack` :2961 | AssertionError `375 bill3 cell height: expected 50 to be 122` |
| tot-lh | r15 `.job-sheet-bill-tot` `lh 24` → `16` | `R15 Jack` :2965 | AssertionError `375 tot row height: expected 32 to be 40` |
| tot-big-lh | r15 `.job-sheet-bill-tot.is-big` `lh 24` → `16` | `R15 Jack` :2966 | AssertionError `375 tot.big row height: expected 37 to be 45` |
| note-by-lh | r15 `.job-sheet-note-by` `lh 24` → `16` | `R15 Jack` :2967 | AssertionError `375 note .by height: expected 16 to be 24` |
| desktop-bill3 | leak r15 bill3 inner pad to 1024+ | `R15 1024 and 1280 type unchanged` :3064 | AssertionError `1024 bill3 cell height stays r14: expected 122 to be 69.5` |
| photo-fill | `.job-sheet-photo` background `#eeeae3` | `R9 job-390-light named elements` :2158 painted fill ±3 | AssertionError `head photo fill 238,234,227 d15` vs `#EBEBEE` |
| photo-icon | drop `.job-sheet-photo-ic { margin-bottom: auto }` | `R9 job-390-light named elements` :2126 icon Y ±1 | AssertionError `photo icon Y head 74.328125 mock 8` |

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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2219
#   head note body weight 400: expected 700 to be 400
# painted backstop :2374 head note p ink still red if :2219 is blanked
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2158
#   head photo fill 238,234,227 d15: expected 15 to be less than or equal to 3
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2126
#   photo icon Y head 74.328125 mock 8: expected false to be true
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2523
#   390 Actions summary fills gutters: expected 73.546875 to be greater than or equal to 357
# assertActionsVisible :2281 is the same gutter expect
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

### bill-inset

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .job-sheet-bill-v {\n    font-weight: 600;\n    font-size: 20px;\n    line-height: 26px;\n    font-variant-numeric: tabular-nums;\n  }'
new = '  .job-sheet-bill-v {\n    font-weight: 600;\n    font-size: 20px;\n    line-height: 26px;\n    font-variant-numeric: tabular-nums;\n    margin-left: 8px;\n  }'
if old not in t:
    raise SystemExit('bill-inset anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated bill-inset')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 job-390-light named elements"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2198
#   head Budget value inset 8: expected false to be true
git checkout -- src/index.css
```

### phone-title

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '      font-size: 24px !important;'
new = '      font-size: 34px !important;'
if old not in t:
    raise SystemExit('phone-title anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated phone-title')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R6-1 fixture title|R9 job-390-light named elements|R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:1572
#   expected 34 to be 24
# also :2101 head.titleSize and :2717 375 title size
git checkout -- src/index.css
```

### fixture-title-wrap

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '      font-size: 24px !important;\n      font-weight: 600;'
new = '      font-size: 24px !important;\n      max-width: 80px;\n      font-weight: 600;'
if old not in t:
    raise SystemExit('fixture-title-wrap anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated fixture-title-wrap')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R6-1 fixture title"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:1574
#   375 fixture title lines: expected 4 to be 1
git checkout -- src/index.css
```

### long-title-nowrap

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '      font-size: 24px !important;\n      font-weight: 600;'
new = '      font-size: 24px !important;\n      white-space: nowrap;\n      font-weight: 600;'
if old not in t:
    raise SystemExit('long-title-nowrap anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated long-title-nowrap')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 long title"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:1592
#   375 long title lines: expected 1 to be 2
git checkout -- src/index.css
```

### cta-gap

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '      font-size: 24px !important;\n      font-weight: 600;\n      line-height: 30px;\n      letter-spacing: -0.05em;'
new = '      font-size: 24px !important;\n      font-weight: 600;\n      line-height: 30px;\n      letter-spacing: -0.05em;\n      margin-bottom: 40px;'
if old not in t:
    raise SystemExit('cta-gap anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated cta-gap')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 job-390-light named elements|R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2106
#   head ctaY is titleBottom plus mock title-to-CTA gap: expected 239 to be 199
# also :2730 375 ctaY is titleBottom plus mock title-to-CTA gap
git checkout -- src/index.css
```

### tab-pad

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .hub-jobs-document .job-sheet-tabs .job-sheet-tab {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    min-width: min-content;\n    min-height: 44px;\n    height: 44px;\n    padding: 0 8px;'
new = '  .hub-jobs-document .job-sheet-tabs .job-sheet-tab {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    min-width: min-content;\n    min-height: 44px;\n    height: 44px;\n    padding: 0 20px;'
if old not in t:
    raise SystemExit('tab-pad anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated tab-pad')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R9 job-390-light named elements|R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2131
#   tab 0 width head 101.296875: expected 101.296875 to be 81.390625
# also :2739 375 tab 0 width: expected 101.296875 to be 87.796875
git checkout -- src/index.css
```

### phone-kv-label

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-kv-row > .job-sheet-kv-label,\n    .hub-jobs-document .hub-jobs-contact-row > .job-sheet-kv-label {\n      font-weight: 400;\n    }'
new = '    .hub-jobs-document .job-sheet-kv-row > .job-sheet-kv-label,\n    .hub-jobs-document .hub-jobs-contact-row > .job-sheet-kv-label {\n      font-weight: 700;\n    }'
if old not in t:
    raise SystemExit('phone-kv-label anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated phone-kv-label')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError: 375 kv label weight: expected 700 to be 400
git checkout -- src/index.css
```

### phone-section

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-scope-h,\n    .hub-jobs-document .job-sheet-section-head h2 {\n      font-weight: 600;\n    }'
new = '    .hub-jobs-document .job-sheet-scope-h,\n    .hub-jobs-document .job-sheet-section-head h2 {\n      font-weight: 700;\n    }'
if old not in t:
    raise SystemExit('phone-section anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated phone-section')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError: 375 Scope of works weight: expected 700 to be 600
git checkout -- src/index.css
```

### phone-cta

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs.is-record-open .hub-jobs-sheet-body .hub-jobs-tools .ops-next-control-block {\n      font-weight: 600;\n    }'
new = '    .hub-jobs.is-record-open .hub-jobs-sheet-body .hub-jobs-tools .ops-next-control-block {\n      font-weight: 700;\n    }'
if old not in t:
    raise SystemExit('phone-cta anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated phone-cta')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError: 375 CTA weight: expected 700 to be 600
git checkout -- src/index.css
```

### phone-tab-on

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-tab.is-on,\n    .hub-jobs-document .job-sheet-tabs .job-sheet-tab.is-on {\n      font-weight: 500;\n    }'
new = '    .hub-jobs-document .job-sheet-tab.is-on,\n    .hub-jobs-document .job-sheet-tabs .job-sheet-tab.is-on {\n      font-weight: 700;\n    }'
if old not in t:
    raise SystemExit('phone-tab-on anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated phone-tab-on')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type|R9 job-390-light named elements"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2123
#   expected 700 to be 500
# also :2728 375 active tab weight
git checkout -- src/index.css
```

### desktop-title

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  @media (max-width: 767px) {\n    .hub-jobs-document .hub-jobs-hero {\n      font-size: 24px !important;'
new = '  @media (min-width: 1px) {\n    .hub-jobs-document .hub-jobs-hero {\n      font-size: 24px !important;'
if old not in t:
    raise SystemExit('desktop-title anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated desktop-title')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 1024 and 1280 type unchanged"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2960
#   1024 title size: expected 24 to be 22
git checkout -- src/index.css
```

### ink-title

Painted/geometry kill. `R15 weight pins have painted ink widths` has no computed-style expects.

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '      font-size: 24px !important;\n      font-weight: 600;'
new = '      font-size: 24px !important;\n      font-weight: 400;'
if old not in t:
    raise SystemExit('ink-title anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated ink-title')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 weight pins have painted ink widths"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2941
#   375 title ink …: expected … to be <= 1
git checkout -- src/index.css
```

### ink-kv-label

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-kv-row > .job-sheet-kv-label,\n    .hub-jobs-document .hub-jobs-contact-row > .job-sheet-kv-label {\n      font-weight: 400;\n    }'
new = '    .hub-jobs-document .job-sheet-kv-row > .job-sheet-kv-label,\n    .hub-jobs-document .hub-jobs-contact-row > .job-sheet-kv-label {\n      font-weight: 700;\n    }'
if old not in t:
    raise SystemExit('ink-kv-label anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated ink-kv-label')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 weight pins have painted ink widths"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2942
#   375 kv label ink …: expected … to be <= 1
git checkout -- src/index.css
```

### ink-kv

Mutate the **last** kv-value 400 block. The first of the two identical 400 blocks stays green.

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """  .hub-jobs-document .job-sheet-kv-row > .job-sheet-kv-value,
  .hub-jobs-document .hub-jobs-contact-row > .job-sheet-kv-value,
  .hub-jobs-document .job-sheet-kv-name,
  .hub-jobs-document a.job-sheet-kv-name {
    font-weight: 400;
  }"""
new = """  .hub-jobs-document .job-sheet-kv-row > .job-sheet-kv-value,
  .hub-jobs-document .hub-jobs-contact-row > .job-sheet-kv-value,
  .hub-jobs-document .job-sheet-kv-name,
  .hub-jobs-document a.job-sheet-kv-name {
    font-weight: 700;
  }"""
if t.count(old) < 2:
    raise SystemExit('ink-kv last-400 anchor missing')
p.write_text(t[::-1].replace(old[::-1], new[::-1], 1)[::-1])
print('mutated ink-kv last 400')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 weight pins have painted ink widths"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2943
#   375 kv value ink …: expected … to be <= 1
git checkout -- src/index.css
```

### ink-scope

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-scope-h,\n    .hub-jobs-document .job-sheet-section-head h2 {\n      font-weight: 600;\n    }'
new = '    .hub-jobs-document .job-sheet-scope-h,\n    .hub-jobs-document .job-sheet-section-head h2 {\n      font-weight: 400;\n    }'
if old not in t:
    raise SystemExit('ink-scope anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated ink-scope')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 weight pins have painted ink widths"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2944
#   375 scope ink …: expected … to be <= 1
git checkout -- src/index.css
```

### ink-cta

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs.is-record-open .hub-jobs-sheet-body .hub-jobs-tools .ops-next-control-block {\n      font-weight: 600;\n    }'
new = '    .hub-jobs.is-record-open .hub-jobs-sheet-body .hub-jobs-tools .ops-next-control-block {\n      font-weight: 400;\n    }'
if old not in t:
    raise SystemExit('ink-cta anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated ink-cta')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 weight pins have painted ink widths"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2946
#   375 cta ink …: expected … to be <= 1
git checkout -- src/index.css
```

### ink-tab-on

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-tab.is-on,\n    .hub-jobs-document .job-sheet-tabs .job-sheet-tab.is-on {\n      font-weight: 500;\n    }'
new = '    .hub-jobs-document .job-sheet-tab.is-on,\n    .hub-jobs-document .job-sheet-tabs .job-sheet-tab.is-on {\n      font-weight: 700;\n    }'
if old not in t:
    raise SystemExit('ink-tab-on anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated ink-tab-on')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 weight pins have painted ink widths"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2947
#   375 tab on ink …: expected … to be <= 1
git checkout -- src/index.css
```

### ink-tab-off

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-tabs .job-sheet-tab,\n    .hub-jobs-document .job-sheet-tab {\n      font-weight: 400;\n    }'
new = '    .hub-jobs-document .job-sheet-tabs .job-sheet-tab,\n    .hub-jobs-document .job-sheet-tab {\n      font-weight: 700;\n    }'
if old not in t:
    raise SystemExit('ink-tab-off anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated ink-tab-off')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 weight pins have painted ink widths"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2948
#   375 tab off ink …: expected … to be <= 1
git checkout -- src/index.css
```

### ink-note

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .job-sheet-note p {\n    margin: 4px 0 0;\n    font-size: 16px;\n    line-height: 24px;\n    font-weight: 400;\n  }'
new = '  .job-sheet-note p {\n    margin: 4px 0 0;\n    font-size: 16px;\n    line-height: 24px;\n    font-weight: 700;\n  }'
if old not in t:
    raise SystemExit('ink-note anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated ink-note')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 weight pins have painted ink widths"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2949
#   375 note p ink …: expected … to be <= 1
git checkout -- src/index.css
```

### bill3-inner

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = """    .hub-jobs-document .job-sheet-bill3 div {
      padding: 12px 0 12px 12px;
      border-left: 1px solid var(--job-look-line);
    }"""
new = """    .hub-jobs-document .job-sheet-bill3 div {
      padding: 0;
      border-left: 0;
    }"""
if old not in t:
    raise SystemExit('bill3-inner anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated bill3-inner')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2904
#   375 bill3 cell height: expected 69.5 to be 122
git checkout -- src/index.css
```

### tot-lh

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-bill-tot {\n      line-height: 24px;\n    }'
new = '    .hub-jobs-document .job-sheet-bill-tot {\n      line-height: 16px;\n    }'
if old not in t:
    raise SystemExit('tot-lh anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated tot-lh')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2908
#   375 tot row height: expected … to be 40
git checkout -- src/index.css
```

### tot-big-lh

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-bill-tot.is-big {\n      line-height: 24px;\n    }'
new = '    .hub-jobs-document .job-sheet-bill-tot.is-big {\n      line-height: 16px;\n    }'
if old not in t:
    raise SystemExit('tot-big-lh anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated tot-big-lh')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2909
#   375 tot.big row height: expected … to be 45
git checkout -- src/index.css
```

### note-by-lh

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-note-by {\n      line-height: 24px;\n    }'
new = '    .hub-jobs-document .job-sheet-note-by {\n      line-height: 16px;\n    }'
if old not in t:
    raise SystemExit('note-by-lh anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated note-by-lh')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2910
#   375 note .by height: expected … to be 24
git checkout -- src/index.css
```

### desktop-bill3

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    /* r15: mock .bill3 div also pads inner label/value; label inherits lh 24. */\n    .hub-jobs-document .job-sheet-bill3 div {\n      padding: 12px 0 12px 12px;\n      border-left: 1px solid var(--job-look-line);\n    }'
new = '  }\n  @media (min-width: 1px) {\n    /* r15 leak: bill3 inner pad on desktop */\n    .hub-jobs-document .job-sheet-bill3 div {\n      padding: 12px 0 12px 12px;\n      border-left: 1px solid var(--job-look-line);\n    }'
if old not in t:
    raise SystemExit('desktop-bill3 anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated desktop-bill3')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 1024 and 1280 type unchanged"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2989
#   1024 bill3 cell height stays r14: expected 122 to be 69.5
git checkout -- src/index.css
```
