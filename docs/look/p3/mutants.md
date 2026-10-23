# P3 r11 mutants

Real-file mutants. Edit `src`, `npm run build`, run the normal Chromium suite, revert. Timeouts and injected CSS do not count. Each kill cites `it()` in `src/pages/p3Jobs.chromium.kill.tsx`.

Portable mockup pin lives at `docs/look/p3/fixtures/{job-390-light.html,direction.css,tokens.css,app.css}`. `src/pages/job390Light.fixture.test.ts` sha256-checks those four files. No `/home/ubuntu` paths.

| id | src edit | kill | red |
| --- | --- | --- | --- |
| m15 | `.job-sheet-tabs` forced to `grid-auto-flow:row; grid-template-columns:1fr 1fr` in `src/index.css` | `K7 four tabs one row` :1057 `expect(read.columns).toBe(4)` and :1058 `uniqueLefts`; also `R9 job-390-light named elements` :1946 tab width | AssertionError `expected 2 to be 4`; tab 0 width 174 vs mock 79 |
| m26 | `.job-sheet-more { display: none }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` :2090; also `R9 existing job edit save` | AssertionError `375 Actions display: expected 'none' not to be 'none'` |
| m26 visibility | `.job-sheet-more { visibility: hidden }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` :2091 | AssertionError `375 Actions visibility: expected 'hidden' not to be 'hidden'` |
| m26 height:0 | `.job-sheet-more { height: 0; overflow: hidden }` in `src/index.css` | `R9 sheet actions stay reachable at 375 390 768` via `assertActionsVisible` :2093 | AssertionError `375 Actions height: expected 0 to be greater than 0` |
| bill3-flat | `.job-sheet-bill3` `display:block` / one column in `src/index.css` | `R9 job-390-light named elements` :2032 `bill3Display` and :2034 `bill3Cols` | AssertionError `expected 'block' to be 'grid'` |
| bl-subline-removed | drop `.job-sheet-bill-s` from `JobDetailPage.tsx` | `R9 job-390-light named elements` :2050 `billSubCount` | AssertionError `real line sub-lines: expected 0 to be greater than 0` |
| Go ring | drop the `#A1A1AA` inset on `.job-sheet-kv-act` | `R10 Go/Call ring paints line-strong on the edge` :2133 | painted edge pixel leaves `rgb(161,161,170)` |
| Site hair | remove the first `[data-job-kv-rule]` or its 1px fill | `R10 Site hairline paints above the first KV row` :2144; `R6-5` four hairs | painted `#E4E4E7` miss or hairCount ≠ 4 |
| KV 400 | `font-weight: 500` on `.job-sheet-kv-value` | `R10 KV value paints ink at weight 400` :2159 | AssertionError weight ≠ 400 |
| Tabs 11px | `font-size: 11px` on `.job-sheet-tabs .job-sheet-tab` | R9 `tabFontSize` | AssertionError `14` vs `11` |
| Fixture pin | rewrite any fixture byte | `job-390-light fixture pin` in `src/pages/job390Light.fixture.test.ts` | sha256 mismatch |

m26 is a click-path kill: Playwright `page.click` on `summary`, then `[data-job-action="details"]`. No `open=true`, no JS `.click()`. Hidden Actions fails on `visibility` / non-zero viewport rect, not a timeout. R11 added `visibility:hidden` and `height:0; overflow:hidden` self-checks; both red with AssertionError.
