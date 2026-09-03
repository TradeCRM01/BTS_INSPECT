import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARRIVING_NEXT_LABEL, CLOCK_IN_NEXT_LABEL } from '../lib/jobReminder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function testingDueLookCss(): string {
  const page = src('src/pages/JobDetailPage.tsx');
  const start = page.indexOf('const JOB_TESTING_DUE_LOOK_CSS');
  const end = page.indexOf('export function JobDetailPage');
  return page.slice(start, end);
}

describe('job-sheet Testing due LOOK', () => {
  it('sits the tray on signed paper-kit chrome — not a second primary, not a card', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const lookCss = testingDueLookCss();
    const dueStart = page.indexOf('id="job-testing-due"');
    const dueEnd = page.indexOf('title="Project stages"');
    const dueBlock = page.slice(dueStart, dueEnd);

    expect(page).toContain('JOB_TESTING_DUE_LOOK_CSS');
    expect(page).toContain('id="job-testing-due"');
    expect(page).toContain('JOB_TESTING_DUE_EMPTY');
    expect(src('src/lib/jobTestingDue.ts')).toContain("JOB_TESTING_DUE_EMPTY = 'Nothing due on this job.'");
    expect(dueBlock).toContain('job-testing-due-open');
    expect(dueBlock).toContain('>Open<');
    expect(dueBlock).toContain('is-overdue');
    expect(dueBlock).not.toContain('btn-primary');
    expect(dueBlock).not.toContain('#2E75B6');

    expect(lookCss).toContain('#job-testing-due');
    expect(lookCss).toContain('--testing-due-page: #F5F0E6');
    expect(lookCss).toContain('--testing-due-sheet: #FFFDF8');
    expect(lookCss).toContain('--testing-due-ink: #0A2540');
    expect(lookCss).toContain('--testing-due-muted: #5B6B7C');
    expect(lookCss).toContain('--testing-due-line: #E2D9CC');
    expect(lookCss).toContain('--testing-due-fail: #B42318');
    expect(lookCss).toContain('#F5F0E6');
    expect(lookCss).toContain('#FFFDF8');
    expect(lookCss).toContain('#0A2540');
    expect(lookCss).toContain('#5B6B7C');
    expect(lookCss).toContain('#E2D9CC');
    expect(lookCss).toContain('#B42318');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-size: 12px');
    expect(lookCss).toContain('.job-testing-due-open');
    expect(lookCss).toContain('border: 1px solid var(--testing-due-line)');
    expect(lookCss).toContain('.ops-related-row.is-overdue .ops-meta');
    expect(lookCss).not.toContain('#2E75B6');
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(lookCss).not.toMatch(/gloss|lacquer|shine|glow/i);
    expect(lookCss).not.toContain('hub-jobs-tools .btn-primary');
    expect(lookCss).not.toContain('ops-next-control-block');
    expect(lookCss).not.toMatch(/\bute\b/i);
  });

  it('keeps Arriving shortly / Clock In as the one 44px #2E75B6 and does not rewrite due logic', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const helper = src('src/lib/jobTestingDue.ts');
    const next = src('src/lib/jobNextAction.ts');

    expect(page).toContain('jobOpenNext');
    expect(page).toContain('ARRIVING_NEXT_LABEL');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect(next).toContain(ARRIVING_NEXT_LABEL);
    expect(next).toContain(CLOCK_IN_NEXT_LABEL);
    expect(helper).toContain('jobTestingDueRows');
    expect(helper).toContain('resolveInspectionDueDate');
    expect(helper).not.toContain('JOB_TESTING_DUE_LOOK_CSS');
    expect(helper).not.toContain('testingDueLookKind');
    expect(helper).not.toContain("searchParams.get('look')");
  });

  it('gates the look harness to DEV and leaves stay-off floors alone', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    expect(page).toContain("if (!import.meta.env.DEV) return null");
    expect(page).toContain(".get('look')");
    expect(page).toContain('testing-due-empty');
    expect(page).toContain('testing-due-rows');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('hub-expenses');
    expect(page).not.toContain('hub-week-board');
    expect(page).not.toContain('Wayfinder');
    expect(page).not.toContain('wayfinder');
    expect(src('src/pages/ExpensesPage.tsx')).not.toContain('JOB_TESTING_DUE_LOOK_CSS');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('job-testing-due-open');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('job-testing-due-open');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('job-testing-due');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('job-testing-due');
    expect(src('src/components/jobs/JobDispatchPanel.tsx')).not.toContain('JOB_TESTING_DUE_LOOK_CSS');
  });
});

describe('job-sheet Testing due LOOK frames', () => {
  it('covers empty and rows on desktop and phone', () => {
    for (const rel of [
      'docs/look/job-sheet-testing-due-empty-desktop.png',
      'docs/look/job-sheet-testing-due-empty-phone.png',
      'docs/look/job-sheet-testing-due-rows-desktop.png',
      'docs/look/job-sheet-testing-due-rows-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
