import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('schedule desktop 1280 — week board min height and capped needs-date rail', () => {
  it('reserves lg week/day board height and caps the needs-date rail scroll pane', () => {
    const css = src('src/index.css');
    const page = src('src/pages/SchedulePage.tsx');
    const lgBlock = css.slice(
      css.indexOf('@media (min-width: 1024px)'),
      css.indexOf('.hub-board-cal.is-week-doc .hub-week-document .hub-week-board,'),
    );
    expect(lgBlock).toContain('.hub-schedule-needs-date-rail');
    expect(lgBlock).toContain('min-height: 280px');
    expect(lgBlock).toContain('max-height: min(34vh, 300px)');
    expect(lgBlock).toContain('max-height: min(30vh, 260px)');
    expect(lgBlock).toContain('.hub-board-cal.is-week-doc .hub-week-sheet-body');
    expect(lgBlock).toMatch(/hub-week-sheet-body[\s\S]{0,120}overflow-y: auto/);
    expect(lgBlock).toContain('min-height: 0');
    expect(lgBlock).not.toContain('min(52vh, 480px)');
    expect(lgBlock).toMatch(/hub-week-mount\.lg\\:flex[\s\S]{0,120}flex: 0 0 auto/);
    expect(lgBlock).toMatch(/hub-week-board\.ops-board[\s\S]{0,160}flex: 0 0 auto/);
    expect(lgBlock).toContain('.hub-schedule-needs-date-rail > .ops-tray-head');
    expect(page).toContain('hub-schedule-needs-date-rail');
    expect(page).toContain('fix3aUnscheduledLookCount');
    expect(page).toContain("searchParams.get('unscheduled')");
  });

  it('supports 17 and 60 unscheduled LOOK seeds without changing phone layout classes', () => {
    const seed = src('src/lib/fix3aScheduleLookSeed.ts');
    expect(seed).toContain('fix3aUnscheduledLookCount');
    expect(seed).toContain('Array.from({ length: count }');
    const jobs17 = readFileSync(resolve(process.cwd(), 'src/lib/fix3aScheduleLookSeed.ts'), 'utf8');
    expect(jobs17).toContain('FIX3A_UNSCHEDULED_SEED.length');
    const css = src('src/index.css');
    expect(css).not.toMatch(/@media \(max-width: 639px\)[\s\S]{0,8000}hub-schedule-needs-date-rail/);
  });
});

describe('schedule phone week footer (soft 1)', () => {
  it('clears the phone week mount above the shell bottom nav', () => {
    const css = src('src/index.css');
    expect(css).toMatch(
      /\.hub-board-cal\.is-week-doc \.hub-week-mount\.lg\\:hidden[\s\S]{0,220}padding-bottom: var\(--shell-bottom-nav-h/,
    );
    expect(css).toContain('.hub-phone-week-list > .hub-week-agenda');
  });

  it('omits the bordered agenda footer when there are zero unscheduled jobs', () => {
    const board = src('src/components/crm/BoardViews.tsx');
    const phoneWeek = board.slice(
      board.indexOf('export const PhoneWeekList'),
      board.indexOf('// ── Day Board View'),
    );
    expect(phoneWeek).toContain('unscheduledCount > 0');
    expect(phoneWeek).toContain('unscheduledCount = 0');
    const page = src('src/pages/SchedulePage.tsx');
    expect(page).toContain('unscheduledCount={needsDate.length}');
  });
});
