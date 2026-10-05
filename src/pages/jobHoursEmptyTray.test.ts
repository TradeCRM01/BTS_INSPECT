import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function lookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* Job list + open job sheet only.');
  const lookEnd = css.indexOf('/* Signed-in home / only.');
  return css.slice(lookStart, lookEnd);
}

const HIDE_HEAD_ACTIONS =
  '.ops-tray:has(.ops-tray-empty) .ops-tray-head > :not(.ops-section-title)';

describe('empty time tray keeps Add hours', () => {
  it('does not hide #job-hours header actions when the tray is empty', () => {
    const css = lookCss();
    const page = src('src/pages/JobDetailPage.tsx');

    expect(page).toContain('id="job-hours"');
    expect(page).toContain('title="Time on this job"');
    expect(page).toContain('Add hours');
    expect(page).toContain('Clock on');

    expect(css).not.toContain(`.hub-jobs-document ${HIDE_HEAD_ACTIONS}`);
    expect(css).toContain(`.hub-jobs-document :not(#job-hours) > ${HIDE_HEAD_ACTIONS}`);
  });

  it('still hides header actions on the other empty job-sheet trays', () => {
    const css = lookCss();
    const page = src('src/pages/JobDetailPage.tsx');

    expect(css).toContain(`.hub-jobs-document :not(#job-hours) > ${HIDE_HEAD_ACTIONS}`);
    expect(css).toContain(
      `.hub-jobs-document :is(#job-swms, #job-insp) ${HIDE_HEAD_ACTIONS}`,
    );
    expect(css).toMatch(
      /\.hub-jobs-document :not\(#job-hours\) > \.ops-tray:has\(\.ops-tray-empty\) \.ops-tray-head > :not\(\.ops-section-title\),\s*\n\s*\.hub-jobs-document :is\(#job-swms, #job-insp\) \.ops-tray:has\(\.ops-tray-empty\) \.ops-tray-head > :not\(\.ops-section-title\) \{\s*\n\s*display: none;/,
    );

    const trays = [
      'title="Project stages"',
      'title="JHA / SWMS"',
      'title="Take 5"',
      'id="job-visit-notes"',
      'title="Inspections"',
      'id="job-gallery"',
      'id="job-testing-due"',
      'title="Quotes"',
      'title="Invoices"',
    ];
    for (const marker of trays) {
      expect(page).toContain(marker);
    }
    expect(page.indexOf('id="job-hours"')).toBeGreaterThan(page.indexOf('title="Invoices"'));
  });
});
