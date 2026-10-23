# r7b K24 — AssertionError names the thrown error

Named harness mutants do not count. K24 harvest: real-file mutant at `src/pages/SchedulePage.tsx:1218` (`drop-needcrew-guard`), rebuild, normal Chromium suite (`vitest.p2-schedule.config.ts`, no mutant query), then revert. Timeouts and `p2 page never settled` do not count as kills.

K24 `it()` is `src/proof/p2Schedule/kill.ts:723`. Collects `pageerror` and console `error` **before** navigate. Bounded settle (3s) does not throw. Then `pageErrors == []` and console errors `== []`, then each malformed-crew card (null, string, object, number, whitespace) renders its `Needs crew` pill.

Mutant red (not a timeout):

| it() file:line | src file:line mutated | red line |
|---|---|---|
| `src/proof/p2Schedule/kill.ts:723` `K24` assert `:772` | `src/pages/SchedulePage.tsx:1218` local `needCrewOf` drops `if (!Array.isArray(job.assigned_team)) return true` + trim/typeof filter → `(job.assigned_team as string[]).filter(id => id.length > 0)` | `AssertionError: malformed assigned_team pageerror: job2.assigned_team.filter is not a function: expected [ Array(1) ] to deeply equal []` |

r6/r7 real-file rows kept (K25 `it()` moved to `:792` after the K24 rewrite):

| it() file:line | src file:line mutated | red line |
|---|---|---|
| `src/proof/p2Schedule/kill.ts:124` `P2-overflow` assert `:164` | `src/index.css:7901` `.hub-week-chip-clock` `white-space:normal; overflow:hidden; overflow-wrap:anywhere` → `white-space:nowrap; overflow:visible; overflow-wrap:normal` (no ellipsis) | `AssertionError: week-1024 track label "Booked Mon 19 Oct · Add a time · #0061" past card div.hub-week-chip: expected false to be true` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:796` | `src/index.css:6643` `@media 1024` page pad `32px 32px 20px` → `12px 16px 16px` | `AssertionError: Schedule h1 left 16 vs mockup 32 (page 0 pad 16 parent 16): expected 16 to be less than or equal to 1` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:803` | `src/index.css:7194` `.hub-week-search` `flex: 1 1 auto; min-width: 0` → `flex: 0 0 200px; width: 200px; max-width: 200px` | `AssertionError: search width 200 vs mockup 772.55: expected 572.55 to be less than or equal to 2` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:803` | `src/pages/SchedulePage.tsx:965` move Today into the range row (beside the arrows) | `AssertionError: search width 779.453125 vs mockup 772.55: expected 6.9031250000000455 to be less than or equal to 2` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:808` | `src/index.css:6164` `.hub-schedule-quickbook:not([data-open="1"])` `display:none` → `display:block; min-height:72px` | `AssertionError: toolbar.bottom 292.5 vs board.top 409.5: expected 117 to be less than or equal to 1` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:835` | `src/pages/SchedulePage.tsx:993` `onClick={() => setQuickBookOpen(open => !open)}` → `onClick={openNewJob}` | `AssertionError: header New job opens Quick book: expected 0 to be greater than 0` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:818` | `src/index.css:6746` tray kicker `height/min-height/font 32/28/700` → `11px uppercase muted` | `AssertionError: tray heading 16.5 vs measured mockup 32: expected 15.5 to be less than or equal to 1` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:799` | `src/index.css:6990` `.hub-week-seg` `border: 1px solid var(--g-line-strong); border-radius: 999px` → `border: none; border-radius: 0` | `AssertionError: pill seg radius cuts the corner: expected false to be true` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:800` | `src/index.css:7169` `.hub-week-nav-box` `border: 1px solid var(--g-line-strong); border-radius: 10px` → `border: none; border-radius: 0` | `AssertionError: boxed ‹ › paint a border: expected 0 to be greater than or equal to 4` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:806` | `src/index.css:7176` `.hub-week-today` `border: 1px solid var(--g-line-strong)` → `border: 1px solid transparent` (radius 0) | `AssertionError: Today paints an outline: expected 0 to be greater than or equal to 4` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:814` | `src/index.css:7938` `.hub-week-chip-desc` `-webkit-line-clamp: 2; white-space: normal` → `display:block; -webkit-line-clamp: 1; white-space: nowrap; max-height: 18px` | `AssertionError: titles wrap to 2 lines: expected 1 to be 2` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:815` | `src/index.css:7225` crew-name `white-space: nowrap` → `white-space: normal; max-width: 36px` | `AssertionError: week crew names stay one line: expected 2 to be 1` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:824` | `src/components/crm/BoardViews.tsx:833` untimed width `Math.min(220, hourWidth * 2.2)` → `hourWidth * hours.length` | `AssertionError: untimed card does not span the track: expected false to be true` |
| `src/proof/p2Schedule/kill.ts:792` `K25` assert `:809` | `src/index.css:7692` `.hub-week-head-short` `display: inline-flex` → `display: none` | `AssertionError: day headers one left-aligned line: expected +0 to be 7` |
