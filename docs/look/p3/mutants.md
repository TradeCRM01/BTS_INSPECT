# P3 r17 mutants

Real-file mutants. Edit `src`, `npm run build`, run the named Chromium `it()`, revert. Timeouts, injected CSS, in-suite rebuilds, and tests that write tracked files do not count. Each kill cites `it()` in `src/pages/p3Jobs.chromium.kill.tsx`.

Portable mockup pin lives at `docs/look/p3/fixtures/{job-390-light.html,direction.css,tokens.css,app.css}`. `src/pages/job390Light.fixture.test.ts` sha256-checks those four files. No `/home/ubuntu` paths.

R17 rebases onto main `aad2eef7` (P1b Today #403). Jack 08:42 AEST still beats the mockup below 768; re-pins stay exact `toBe`. Desktop 1024/1280 stays r14 type, now with ink/paint backstops. Commands below run **outside** the suite.

Coach 12:38: do not bump `playwright` / `playwright-core` off **1.48.2**. Run WebKit on `mcr.microsoft.com/playwright:v1.48.2-jammy` or ubuntu-22.04. A WebKit that does not launch is a FAIL, never a skip. 0 WebKit tests run is a FAIL. A setup failure is a FAIL.

## Jack 08:42 AEST re-pins (below 768 only)

r14 parent `1dd0d37b` → r15 → r16 → r17. Each is exact `toBe`, same selector, same real-file mutant still red. 1024/1280 stay r14 type.

| r14 file:line | old | new (current line) |
| --- | --- | --- |
| `p3Jobs.chromium.kill.tsx:1550` | `fontSize.toBeGreaterThanOrEqual(32)` | `fontSize.toBe(24)` at 375/390 (`:1681`) |
| `p3Jobs.chromium.kill.tsx:1552` | `lines.toBe(2)` at 390 | `lines.toBe(1)` at 375/390 (`:1683`) |
| `p3Jobs.chromium.kill.tsx:2044` | `near(head.titleSize, mockup.titleSize)` | `head.titleSize.toBe(24)` (`:2306`) + ADD `mockup.titleSize.toBe(34)` (`:2307`) |
| `p3Jobs.chromium.kill.tsx:2048` | `near(head.ctaY, mockup.ctaY)` | `head.ctaY.toBe(titleBottom + mock gap)` (`:2311`) + ADD fixture `ctaY.toBe(199)` at 375/390 (`:2314`, `:3105`) |
| `p3Jobs.chromium.kill.tsx:2062` | `tabFontWeight.toBe(600)` | `tabFontWeight.toBe(500)` (`:2331`) |
| `p3Jobs.chromium.kill.tsx:2070-2072` | `near(w, mockup.tabWidths[i])` / `near(w, mockTabTargets[i])` | exact widths after `waitSettledLayout` (`:2351` R9 390 mock labels `[81.390625, 81.390625, 97.53125, 83.6875]`; Jack native 375 `[87.796875, 87.796875, 97.609375, 87.796875]` / 390 `[79.734375, 79.734375, 97.609375, 86.921875]`). 375 leftover tabs 0/1/3 share equally 87.797 (`:3111`); Paperwork stays content-min 97.609. Content-size is `width ≥ ink+pad` (`:2355` / `:3121`), not vacuous `\|width−scrollWidth\|≤1`. **Padding is caught by tab width `:2351` / `:3117`, not content-size.** Active tab ring is `--line` `rgb(228,228,231)` computed (`:2359` / `:3125`) plus painted sampled pixels (`:2361` / `:3126`). |

ADD (not a re-pin): `R15 long title` `:1687` `'Hot water system replacement and backflow test'` wraps to `toBe(2)` at 375/390 (`:1701`), `scrollHeight ≤ clientHeight`, `scrollWidth ≤ clientWidth`, `rect.right ≤ innerWidth`. Jack 08:42 AEST.

| id | src edit | kill | red |
| --- | --- | --- | --- |
| m15 | `.job-sheet-tabs` forced to `grid-auto-flow:row; grid-template-columns:1fr 1fr` in `src/index.css` | `K7 four tabs one row` :1178 `expect(read.columns).toBe(4)` and :1179 `uniqueLefts`; geometry backstops :1179 and R9 tab widths :2351 | AssertionError `expected 2 to be 4`; tab 0 width 174 vs 81.390625 |
| m26 | `.job-sheet-more { display: none }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` :2589 | AssertionError `375 Actions display: expected 'none' not to be 'none'` |
| m26 visibility | `.job-sheet-more { visibility: hidden }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` :2590 | AssertionError `375 Actions visibility: expected 'hidden' not to be 'hidden'` **and** hit-test |
| m26 height:0 | `.job-sheet-more { height: 0; overflow: hidden }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` :2592 | AssertionError `375 Actions height: expected 0 to be greater than 0` **and** hit-test / summary rect |
| bill3-flat | `.job-sheet-bill3` `display:block` in `src/index.css` | `R9 job-390-light named elements` :2449 `bill3Display` (kept) and cell rects | AssertionError `expected 'block' to be 'grid'` **and** tops not same-row / lefts not left-to-right |
| bill-inset | `.job-sheet-bill-v` `margin-left: 8px` in `src/index.css` | `R9 job-390-light named elements` :2486 `head Budget value inset` | AssertionError `head Budget value inset 8: expected false to be true` |
| phone-title | r15 hero `24px` → `34px` | `R6-1` :1681 / R9 `titleSize` :2306 / `R15 Jack phone type` :3084 | AssertionError `expected 34 to be 24` at :1681 and :2306; `375 title size: expected 34 to be 24` at :3084 |
| fixture-title-wrap | r15 hero `max-width: 80px` at 24px | `R6-1` :1683 `fixture title lines` | AssertionError `375 fixture title lines: expected 4 to be 1` at :1683 |
| long-title-nowrap | r15 hero `white-space: nowrap` | `R15 long title` :1701 | AssertionError `375 long title lines: expected 1 to be 2` at :1701 |
| cta-gap | r15 hero `margin-bottom: 40px` | R9 :2311 formula / :2314 `head fixture ctaY at 390` / `R15 Jack` :3102 | AssertionError `head ctaY is titleBottom plus mock title-to-CTA gap: expected 239 to be 199` at :2311 |
| phone-kv-label | r15 label `400` → `500` (the 500 revert; ink-kv-label stays 700) | `R15 Jack` :3140 / :3196 kv label ink ±0.3 / `R15 weight pins` :3191 painted dots 28 | AssertionError `375 kv label ink` Δ0.81 > ±0.3 or painted dots ≠ 28 |
| phone-section | r15 Scope/Notes `600` → `700` | `R15 Jack phone type` :3097 | AssertionError `375 Scope of works weight: expected 700 to be 600` at :3097 |
| phone-cta | r15 CTA `600` → `700` | `R15 Jack phone type` :3099 | AssertionError `375 CTA weight: expected 700 to be 600` at :3099 |
| phone-tab-on | r15 active tab `500` → `700` | R9 `tabFontWeight` :2331 / `R15 Jack phone type` :3100 | AssertionError `expected 700 to be 500` at :2331; `375 active tab weight: expected 700 to be 500` at :3100 |
| tab-pad | tab `padding: 0 8px` → `0 20px` | R9 :2351 `tab 0 width` / `R15 Jack` :3117 | AssertionError `tab 0 width head …: expected … to be 81.390625` at :2351. Padding is caught here, not by ink+pad `:2355` / `:3121`. |
| desktop-title | hero `24px` without the 767 cap | `R15 1024 and 1280 type unchanged` :3250 title ink **and** :3269 title size | AssertionError `1024 title ink 333.97` at :3250; size 24 vs 22 at :3269 |
| bl-subline-removed | drop `.job-sheet-bill-s` from `JobDetailPage.tsx` | `R9 job-390-light named elements` :2510 `billSubCount` | AssertionError `real line sub-lines: expected 0 to be greater than 0` |
| Go ring | drop the `#A1A1AA` inset on `.job-sheet-kv-act` | `R10 Go/Call ring paints line-strong on the edge` :2797 | painted edge pixel leaves `rgb(161,161,170)` |
| Site hair | remove the first `[data-job-kv-rule]` or its 1px fill | `R6-5 hairline rect sits between each Overview pair` :1771 `hairCount` (not R10) | painted `#E4E4E7` miss or hairCount ≠ 4 |
| KV 400 | last `.job-sheet-kv-value` `font-weight: 400` → `700` | `R10 KV value paints ink at weight 400` **and** Jack / `R15 weight pins` ink | AssertionError kv value ink even if the computed expect is blanked |
| Tabs 11px | `font-size: 11px` on `.job-sheet-tabs .job-sheet-tab` | R9 `tabFontSize` :2329 | AssertionError `14` vs `11` |
| Fixture pin | rewrite any fixture byte | `job-390-light fixture pin` in `src/pages/job390Light.fixture.test.ts` | sha256 mismatch |
| actions-text-link | revert `.job-sheet-more > summary.btn-secondary` to grey text-link (no fill, no border) and the ≤768 `width:100%` to `width:auto` | `R12 Actions paints kit secondary border and fills the gutters` :2866 | AssertionError `390 Actions summary fills gutters` |
| note-weight | `.job-sheet-note p` `font-weight: 700` | `R9` :2386 `notePWeight` **and** note p ink; `R15 weight pins` | AssertionError note p ink even if the computed expect is blanked |
| ink-title | r15 hero `font-weight: 600` → `400` | `R15 weight pins have painted ink widths` :3192 title dots / :3195 title ink | AssertionError `375 title painted dots` or title ink (no computed-style expect in this it) |
| ink-kv-label | r15 label `400` → `700` | `R15 weight pins have painted ink widths` :3191 painted dots / :3196 ink ±0.3 | AssertionError `375 kv label painted dots: expected … to be 28` |
| ink-kv | last kv-value `400` → `700` | `R15 weight pins have painted ink widths` :3197 | AssertionError `375 kv value ink` |
| ink-scope | r15 Scope/Notes `600` → `400` | `R15 weight pins have painted ink widths` :3198 | AssertionError `375 scope ink` |
| ink-cta | r15 CTA `600` → `400` | `R15 weight pins have painted ink widths` :3200 | AssertionError `375 cta ink` |
| ink-tab-on | r15 active tab `500` → `700` | `R15 weight pins have painted ink widths` :3201 | AssertionError `375 tab on ink` |
| ink-tab-off | r15 inactive tab `400` → `700` | `R15 weight pins have painted ink widths` :3202 | AssertionError `375 tab off ink` |
| ink-note | `.job-sheet-note p` `400` → `700` | `R15 weight pins have painted ink widths` :3203 | AssertionError `375 note p ink` |
| bill3-inner | drop r15 `.job-sheet-bill3 div` inner pad/border | `R15 Jack` :3131 | AssertionError `375 bill3 cell height: expected 50 to be 122` |
| tot-lh | r15 `.job-sheet-bill-tot` `lh 24` → `16` | `R15 Jack` :3135 | AssertionError `375 tot row height: expected 32 to be 40` |
| tot-big-lh | r15 `.job-sheet-bill-tot.is-big` `lh 24` → `16` | `R15 Jack` :3136 | AssertionError `375 tot.big row height: expected 37 to be 45` |
| note-by-lh | r15 `.job-sheet-note-by` `lh 24` → `16` | `R15 Jack` :3137 | AssertionError `375 note .by height: expected 16 to be 24` |
| desktop-bill3 | leak r15 bill3 inner pad to 1024+ | `R15 1024 and 1280 type unchanged` :3299 | AssertionError `1024 bill3 cell height stays r14: expected 122 to be 69.5` |
| photo-fill | `.job-sheet-photo` background `#eeeae3` | `R9 job-390-light named elements` :2446 painted fill ±3 | AssertionError `head photo fill … d15` vs `#EBEBEE` |
| photo-icon | drop `.job-sheet-photo-ic { margin-bottom: auto }` | `R9 job-390-light named elements` :2414 icon Y ±1 | AssertionError `photo icon Y head … mock …` |
| desk-title-400 | desktop hero `font-weight: 600` → `400` | `R15 1024 and 1280` :3250 title ink | AssertionError `1024 title ink 323.66: expected 15.48 to be <= 1` |
| desk-title-24 | same as desktop-title (24px leak) | `R15 1024 and 1280` :3250 title ink | AssertionError `1024 title ink 333.97: expected 5.17 to be <= 1` |
| desk-tabs-400 | desktop tab `font-weight: 600` → `400` | `R15 1024 and 1280` :3255 tab on ink | AssertionError `1024 tab on ink 59.56: expected 3.48 to be <= 1` |
| desk-kvlabel-400 | desktop label `500` → `400` | `R15 1024 and 1280` :3251 label ink ±0.3 | AssertionError `1024 kv label ink 23.3125: expected 0.81 to be <= 0.3` |
| desk-scope-500 | desktop Scope/Notes `600` → `500` | `R15 1024 and 1280` :3252 scope ink | AssertionError `1024 scope ink 141.05: expected 3.17 to be <= 1` |
| r16-text-walk | hero `white-space:nowrap; letter-spacing:80px` | `R16 text-node walk at 320 375 390` :3315 | AssertionError `chromium 320 text-node rights` not `[]` |
| r16-webkit | tab `letter-spacing:80px` | `R16 WebKit overflow` :3407 maxRight **and** :3315 text rights | AssertionError `webkit 375 maxRight` or bodySW |
| r16-safe-area | `.shell-bottom-nav { padding-bottom: 99px }` | `R16 standalone safe-area` :3367 / :3371 | AssertionError `main nav pad-bottom … expected 99 to be 0`. Injected-header 47/34 is **coverage only**. Once #405 squashes, re-pin to 47/34 on the real shell without injected CSS/HTML. Do not fake it now. |
| r16-chip-wrap | last `.hub-jobs-list-doc .hub-jobs-list-filters` `flex-wrap:nowrap; overflow-x:auto` and chips `flex: 0 0 auto` | `R16 Jobs filter chips wrap` :3579 `hits` **and** WebKit :3481 | AssertionError `chromium 320 overflow-x scrollers` not `[]` |
| ring-removed | drop `box-shadow` on `.hub-jobs-document .job-sheet-tab.is-on` (`box-shadow: none`) | Jack `:3125` computed `--line` ring. Painted `:3126` / R9 `:2361` is the backstop (`tabRingPaint` `:415`). | AssertionError `375 active tab --line ring: expected 'none' to match /rgb(228,228,231)/` at :3125 |
| flex-1-inert | `flex: 1` on `.job-sheet-tabs .job-sheet-tab` | **INERT** on grid items. Jack `R15 Jack phone type` stayed green. Not a width kill. | (no red) |
| minmax-0 | `.job-sheet-tabs` `minmax(auto, 1fr)` → `minmax(0, 1fr)` | Jack leftover `:3111`. Real kill for width ≥ ink+pad. | AssertionError `375 leftover tabs share equally: expected 90.25 to be 87.796875` at :3111 |
| 320-clip | 320 tab `min-width: 0; max-width: 40px` (Jack 14px kept; clip assert is first) | `R17 320 tabs stay 14px and labels are not clipped` :3625 | AssertionError `320 tab 0 label scrollWidth 53 > client 40` at :3625 |
| r17-sheet-scroller | same nowrap + overflow-x auto as r16-chip-wrap, asserted on the **job sheet** | Chromium `:3596` / WebKit `:3533` (per-element `scrollWidth ≤ clientWidth`, skip `.hub-day-track`) | AssertionError `chromium sheet 320 overflow-x scrollers` not `[]` |
| r17-webkit-edit | hero `letter-spacing:80px; white-space:nowrap` then open the edit form | `R17 WebKit edit form text-walk at 320 375 390` :3519 (settle on `[data-job-form="1"]` before the walk) | AssertionError `webkit-edit 320 text-node rights` not `[]` |


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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2386
#   head note body weight 400: expected 700 to be 400
# painted backstop note p ink still red if :2386 is blanked
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2446
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2414
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2866
#   390 Actions summary fills gutters: expected 73.546875 to be greater than or equal to 357
# assertActionsVisible :2605 is the same gutter expect
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2486
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:1681
#   expected 34 to be 24
# also :2306 head.titleSize and :3084 375 title size
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:1683
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:1701
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2311
#   head ctaY is titleBottom plus mock title-to-CTA gap: expected 239 to be 199
# also :3102 375 ctaY is titleBottom plus mock title-to-CTA gap
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2351
#   tab 0 width head 101.296875: expected 101.296875 to be 81.390625
# also Jack 375 tab 0 width :3117: expected 101.296875 to be 87.796875
git checkout -- src/index.css
```

### phone-kv-label

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    .hub-jobs-document .job-sheet-kv-row > .job-sheet-kv-label,\n    .hub-jobs-document .hub-jobs-contact-row > .job-sheet-kv-label {\n      font-weight: 400;\n    }'
new = '    .hub-jobs-document .job-sheet-kv-row > .job-sheet-kv-label,\n    .hub-jobs-document .hub-jobs-contact-row > .job-sheet-kv-label {\n      font-weight: 500;\n    }'
if old not in t:
    raise SystemExit('phone-kv-label anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated phone-kv-label 400→500')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type|R15 weight pins have painted ink widths"
# expected AssertionError at :3140 / :3196 kv label ink ±0.3 or :3191 painted dots 28
# 500 revert Δ0.81; ±1 would miss it
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:2331
#   expected 700 to be 500
# also :3100 375 active tab weight
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3269
#   1024 title size: expected 24 to be 22
# ink/paint backstops :3250 title ink / :3257 title dots
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3192
#   375 title painted dots / :3195 title ink
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3191
#   375 kv label painted dots / :3196 kv label ink ±0.3
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3197
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3198
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3200
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3201
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3202
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3203
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3131
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3135
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3136
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3137
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
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3299
#   1024 bill3 cell height stays r14: expected 122 to be 69.5
git checkout -- src/index.css
```

### desk-title-400

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .hub-jobs-document .hub-jobs-hero {\n    margin-top: 10px;\n    font-weight: 600;\n  }'
new = '  .hub-jobs-document .hub-jobs-hero {\n    margin-top: 10px;\n    font-weight: 400;\n  }'
if old not in t:
    raise SystemExit('desk-title-400 anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated desk-title-400')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 1024 and 1280 type unchanged"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3250
#   1024 title ink
git checkout -- src/index.css
```

### desk-tabs-400

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    font-size: 14px;\n    font-weight: 600;\n    letter-spacing: 0;\n    white-space: nowrap;\n    overflow: hidden;\n    box-shadow: none;\n  }'
new = '    font-size: 14px;\n    font-weight: 400;\n    letter-spacing: 0;\n    white-space: nowrap;\n    overflow: hidden;\n    box-shadow: none;\n  }'
if old not in t:
    raise SystemExit('desk-tabs-400 anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated desk-tabs-400')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 1024 and 1280 type unchanged"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3255
#   1024 tab on ink
git checkout -- src/index.css
```

### desk-kvlabel-400

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    color: var(--job-look-muted);\n    font-size: 13px;\n    font-weight: 500;\n  }'
new = '    color: var(--job-look-muted);\n    font-size: 13px;\n    font-weight: 400;\n  }'
if old not in t:
    raise SystemExit('desk-kvlabel-400 anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated desk-kvlabel-400')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 1024 and 1280 type unchanged"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3251
#   1024 kv label ink ±0.3
git checkout -- src/index.css
```

### desk-scope-500

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    font-size: 20px;\n    line-height: 26px;\n    font-weight: 600;\n    letter-spacing: -0.015em;\n    color: #0A0A0B;\n  }'
new = '    font-size: 20px;\n    line-height: 26px;\n    font-weight: 500;\n    letter-spacing: -0.015em;\n    color: #0A0A0B;\n  }'
if old not in t:
    raise SystemExit('desk-scope-500 anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated desk-scope-500')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 1024 and 1280 type unchanged"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3252
#   1024 scope ink
git checkout -- src/index.css
```

### r16-text-walk

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '      font-size: 24px !important;\n      font-weight: 600;\n      line-height: 30px;\n      letter-spacing: -0.05em;'
new = '      font-size: 24px !important;\n      font-weight: 600;\n      line-height: 30px;\n      letter-spacing: 80px;\n      white-space: nowrap;'
if old not in t:
    raise SystemExit('r16-text-walk anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated r16-text-walk')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R16 text-node walk"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3315
#   chromium 320 text-node rights not []
git checkout -- src/index.css
```

### r16-webkit

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    font-size: 14px;\n    font-weight: 600;\n    letter-spacing: 0;\n    white-space: nowrap;'
new = '    font-size: 14px;\n    font-weight: 600;\n    letter-spacing: 80px;\n    white-space: nowrap;'
if old not in t:
    raise SystemExit('r16-webkit anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated r16-webkit')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R16 WebKit overflow"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3315
#   webkit 375 text-node rights not []
git checkout -- src/index.css
```

### r16-safe-area

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    padding-bottom: env(safe-area-inset-bottom);\n  }'
new = '    padding-bottom: 99px;\n  }'
if old not in t:
    raise SystemExit('r16-safe-area anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated r16-safe-area')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R16 standalone safe-area"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3371
#   main nav pad-bottom pinned: expected 99 to be 0
git checkout -- src/index.css
```

### r16-chip-wrap

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '''  .hub-jobs-list-doc .hub-jobs-list-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 2px;
    width: 100%;
    max-width: 100%;
    margin-top: 16px;
    padding: 3px;
    border: none;
    border-radius: 12px;
    background: #eeeae3;
    overflow: hidden;
    overflow-x: hidden;
    scroll-snap-type: none;
  }

  .hub-jobs-list-doc .hub-jobs-list-filter {
    flex: 1 1 calc(25% - 2px);'''
new = '''  .hub-jobs-list-doc .hub-jobs-list-filters {
    display: flex;
    flex-wrap: nowrap;
    align-items: stretch;
    gap: 2px;
    width: 100%;
    max-width: 100%;
    margin-top: 16px;
    padding: 3px;
    border: none;
    border-radius: 12px;
    background: #eeeae3;
    overflow: hidden;
    overflow-x: auto;
    scroll-snap-type: none;
  }

  .hub-jobs-list-doc .hub-jobs-list-filter {
    flex: 0 0 auto;'''
if old not in t:
    raise SystemExit('r16-chip-wrap anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated r16-chip-wrap')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R16 Jobs filter chips wrap"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3579
#   chromium 320 overflow-x scrollers not []
# WebKit same mutant: AssertionError at :3481 webkit 320 overflow-x scrollers not []
git checkout -- src/index.css
```

### ring-removed

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .hub-jobs-document .job-sheet-tab.is-on {\n    background: #fff;\n    color: var(--job-look-ink);\n    box-shadow: 0 1px 2px rgba(10, 10, 11, 0.06), 0 0 0 1px #E4E4E7;\n  }'
new = '  .hub-jobs-document .job-sheet-tab.is-on {\n    background: #fff;\n    color: var(--job-look-ink);\n    box-shadow: none;\n  }'
if old not in t:
    raise SystemExit('ring-removed anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated ring-removed')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3125
#   375 active tab --line ring: expected 'none' to match /rgb(228,228,231)/
# painted backstop :3126 still red if :3125 is blanked
git checkout -- src/index.css
```

### flex-1-inert

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '  .hub-jobs-document .job-sheet-tabs .job-sheet-tab {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    min-width: min-content;\n    min-height: 44px;\n    height: 44px;\n    padding: 0 8px;'
new = '  .hub-jobs-document .job-sheet-tabs .job-sheet-tab {\n    display: flex;\n    flex: 1;\n    align-items: center;\n    justify-content: center;\n    min-width: min-content;\n    min-height: 44px;\n    height: 44px;\n    padding: 0 8px;'
if old not in t:
    raise SystemExit('flex-1-inert anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated flex-1-inert')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# INERT: Jack stays green. Grid items ignore flex:1. Not a width kill.
# The real kill is minmax-0.
git checkout -- src/index.css
```

### minmax-0

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '    grid-auto-columns: minmax(auto, 1fr);\n    grid-template-columns: repeat(4, minmax(auto, 1fr));'
new = '    grid-auto-columns: minmax(0, 1fr);\n    grid-template-columns: repeat(4, minmax(0, 1fr));'
if old not in t:
    raise SystemExit('minmax-0 anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated minmax-0')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R15 Jack phone type"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3111
#   375 leftover tabs share equally: expected 90.25 to be 87.796875
git checkout -- src/index.css
```

### 320-clip

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '        font-size: 14px;\n        min-width: min-content;\n        padding: 0 2px;'
new = '        font-size: 14px;\n        min-width: 0;\n        max-width: 40px;\n        padding: 0 2px;'
if old not in t:
    raise SystemExit('320-clip anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated 320-clip')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R17 320 tabs stay 14px"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3625
#   320 tab 0 label scrollWidth 53 > client 40
# clip assert is first so a 14px pin does not hide the clip
git checkout -- src/index.css
```

### r17-sheet-scroller

Same src edit as r16-chip-wrap. Asserted on the job sheet, not only /jobs.

```sh
# use the r16-chip-wrap python block, then:
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R17 job sheet has no overflow-x scrollers"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3596
#   chromium sheet 320 overflow-x scrollers not []
# WebKit: :3533 webkit sheet 320 overflow-x scrollers not []
git checkout -- src/index.css
```

### r17-webkit-edit

```sh
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
t = p.read_text()
old = '      font-size: 24px !important;\n      font-weight: 600;\n      line-height: 30px;\n      letter-spacing: -0.05em;'
new = '      font-size: 24px !important;\n      font-weight: 600;\n      line-height: 30px;\n      letter-spacing: 80px;\n      white-space: nowrap;'
if old not in t:
    raise SystemExit('r17-webkit-edit anchor missing')
p.write_text(t.replace(old, new, 1))
print('mutated r17-webkit-edit')
PY
npm run build
npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "R17 WebKit edit form"
# expected AssertionError at src/pages/p3Jobs.chromium.kill.tsx:3519
#   webkit-edit 320 text-node rights not []
# settle wait on [data-job-form="1"] runs before the walk
git checkout -- src/index.css
```

### r16 WebKit on jammy (Coach 12:38)

Do not bump playwright. WebKit 18.0 is the 1.48.2 browser. Launch failure is a FAIL, never a skip.

```sh
sudo docker run --rm --ipc=host \
  -v "$PWD":/workspace -w /workspace \
  -e TZ=UTC \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.48.2-jammy \
  bash -lc 'npx vitest run --maxWorkers=2 -c vitest.s2-shell.config.ts src/pages/p3Jobs.chromium.kill.tsx -t "WebKit"'
# expected: WebKit 18.0; 6 WebKit its (5 coverage + launch pin); 0 skipped
# coverage: text-walk 320/375/390, safe-area 47/34 (coverage only; #405), chip wrap,
# R17 edit-form text-walk 320/375/390 with settle on [data-job-form="1"], sheet scrollers.
# Launch pin does not count as coverage. 0 run is a FAIL. Setup failure is a FAIL.
# #405 HF-LAND-1 OPEN: once it squashes, re-pin safe-area to 47/34 on the real shell
# without injected CSS/HTML. Do not fake it here.
```

