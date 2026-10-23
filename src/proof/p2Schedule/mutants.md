# r8 real-file src mutants (outside the suite)

No test writes a tracked file. No in-test rebuild. Harvest is: patch the listed `find` → `replace` in the listed src file, `npm run build` when the kill reads dist, run the listed vitest command, confirm the AssertionError, then `git checkout -- <file>`.

Named harness `?mutant=` queries do not count.

Deleted grep (standing-rule exception): `src/pages/schedulePage.test.ts` `expect(page).toContain('countNeedCrewJobs')` — the void-shim grep. Named here because the standing rule allows that one deletion.

## it() file:line (r8)

| kill | it() |
|---|---|
| P2-overflow | `src/proof/p2Schedule/kill.ts:125` |
| P2-focus | `src/proof/p2Schedule/kill.ts:271` (inverse fill left unchanged) |
| K24 | `src/proof/p2Schedule/kill.ts:729` |
| K25 | `src/proof/p2Schedule/kill.ts:814` |
| K26 | `src/proof/p2Schedule/kill.ts:891` |
| unit status | `src/lib/scheduleStatus.kill.test.ts` (10 `it()`s) |
| fixture pin | `src/pages/schedule1280Light.fixture.test.ts:16` |

## Commands

```bash
# K24 drop-needcrew-guard — shared crewIds asTeamIds guard
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/scheduleNeedCrew.ts')
p.write_text(p.read_text().replace(
  'return asTeamIds(assigned).filter(id => id.trim());',
  'return (assigned as string[]).filter(id => id.length > 0);',
  1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K24:'
# expected AssertionError: malformed assigned_team pageerror: assigned.filter is not a function: expected [ 'assigned.filter is not a function' ] to deeply equal []
# harvested: src/proof/p2Schedule/kill.ts:729 K24 / kill.ts:780 pageerror expect
git checkout -- src/lib/scheduleNeedCrew.ts

# K26 unknown-as-scheduled
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/scheduleInvoiceStatus.ts')
p.write_text(p.read_text().replace(
  "if (status === 'scheduled') return { label: 'Scheduled', kind: 'scheduled' };\n  return { label: sentenceStatus(job.status), kind: 'status' };",
  "return { label: 'Scheduled', kind: 'scheduled' };",
  1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K26:'
# expected AssertionError: null status never Scheduled: expected 'Scheduled' not to be 'Scheduled'
# harvested: src/proof/p2Schedule/kill.ts:891 K26 / kill.ts:899
git checkout -- src/lib/scheduleInvoiceStatus.ts

# K26 date-stringify
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/scheduleNeedCrew.ts')
p.write_text(p.read_text().replace(
  "export function asDateText(value: unknown): string {\n  return typeof value === 'string' ? value.trim() : '';\n}",
  "export function asDateText(value: unknown): string {\n  return String(value ?? '').trim();\n}",
  1))
PY
npx vitest src/lib/scheduleStatus.kill.test.ts -t 'non-string scheduled_date'
# expected AssertionError: expected '20261019' to be '' // Object.is equality
# harvested: src/lib/scheduleStatus.kill.test.ts > non-string scheduled_date is undated and never throws
git checkout -- src/lib/scheduleNeedCrew.ts

# K26 clock-book-unknown
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/scheduleBoard.ts')
p.write_text(p.read_text().replace(
  'if (job && (isNeedCrewJob(job) || isUnknownScheduleStatus(job.status))) return when;',
  'if (job && isNeedCrewJob(job)) return when;',
  1))
PY
npx vitest src/lib/scheduleStatus.kill.test.ts -t 'null status'
# expected AssertionError: expected 'Booked Mon 19 Oct · Add a time' not to match /Booked/
# harvested: src/lib/scheduleStatus.kill.test.ts > null status is never Scheduled or Booked
git checkout -- src/lib/scheduleBoard.ts

# K26 status-fallback-scheduled
python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/scheduleInvoiceStatus.ts')
p.write_text(p.read_text().replace(
  'if (!raw) return STATUS_FALLBACK;',
  "if (!raw) return 'Scheduled';",
  1))
PY
npx vitest src/lib/scheduleStatus.kill.test.ts -t 'empty status'
# expected AssertionError: expected 'Scheduled' to be 'Status' // Object.is equality
# harvested: src/lib/scheduleStatus.kill.test.ts > empty status is never Scheduled or Booked
git checkout -- src/lib/scheduleInvoiceStatus.ts

# P2-overflow day-clock-clip (index.css clock max-width 100% → 2ch)
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
p.write_text(p.read_text().replace(
  '  .hub-week-chip-clock {\n    flex: 1 1 auto;\n    min-width: 0;\n    max-width: 100%;',
  '  .hub-week-chip-clock {\n    flex: 1 1 auto;\n    min-width: 0;\n    max-width: 2ch;\n    overflow: hidden;\n    text-overflow: clip;',
  1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'P2-overflow'
# expected AssertionError: clock "…" scrollWidth fits its own box: expected false to be true
git checkout -- src/index.css

# K25 today-beside-arrows (search-width pin)
python3 - <<'PY'
from pathlib import Path
p = Path('src/pages/SchedulePage.tsx')
old = """      </div>
      <div className="hub-week-search" data-schedule-search="1">
        {weekSearch}
      </div>
      <button type="button" className="hub-week-quiet hub-week-today" onClick={() => applySchedule(viewMode, new Date())}>
        Today
      </button>"""
new = """        <button type="button" className="hub-week-quiet hub-week-today" onClick={() => applySchedule(viewMode, new Date())}>
          Today
        </button>
      </div>
      <div className="hub-week-search" data-schedule-search="1">
        {weekSearch}
      </div>"""
t = p.read_text()
if old not in t: raise SystemExit('today-beside-arrows find missed')
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError: search width … vs fixture …
git checkout -- src/pages/SchedulePage.tsx

# K25 search-fixed-width
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
old = """    .hub-board-cal.is-week-doc .hub-week-search {
      flex: 1 1 755.265625px;
      min-width: 0;
      max-width: 755.265625px;
      width: 755.265625px;
      height: 48px;
      min-height: 48px;
    }"""
new = """    .hub-board-cal.is-week-doc .hub-week-search {
      flex: 0 0 200px;
      min-width: 0;
      max-width: 200px;
      width: 200px;
      height: 48px;
      min-height: 48px;
    }"""
t = p.read_text()
if old not in t: raise SystemExit('search-fixed-width find missed')
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError: search width … vs fixture …
git checkout -- src/index.css

# K25 today-no-stroke
python3 - <<'PY'
from pathlib import Path
p = Path('src/index.css')
old = """    .hub-board-cal.is-week-doc .hub-week-today {
      width: 85.25px;
      min-width: 85.25px;
      height: 48px;
      min-height: 48px;
      margin-left: auto;
      padding: 0 20px;"""
new = """    .hub-board-cal.is-week-doc .hub-week-today {
      width: auto;
      min-width: 0;
      height: 32px;
      min-height: 32px;
      margin-left: 0;
      padding: 0 20px;"""
t = p.read_text()
if old not in t: raise SystemExit('today-no-stroke find missed')
p.write_text(t.replace(old, new, 1))
PY
npm run build
TZ=Australia/Brisbane npx vitest --config vitest.p2-schedule.config.ts src/proof/p2Schedule/kill.ts -t 'K25:'
# expected AssertionError: Today width … vs fixture … / Today height …
git checkout -- src/index.css
```

r7b pageerror assert is kept. Restored K24 h1 / whisper / DOM card asserts are additions.

K25 hand-typed MOCKUP_* ranges were replaced with fixture-measured exact `toBe` values (tightened, never a range).
