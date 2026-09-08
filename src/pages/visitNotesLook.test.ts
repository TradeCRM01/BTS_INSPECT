import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function visitNotesLookCss(): string {
  const page = src('src/pages/JobDetailPage.tsx');
  const start = page.indexOf('const JOB_VISIT_NOTES_LOOK_CSS');
  const end = page.indexOf('export function JobDetailPage');
  return page.slice(start, end);
}

describe('job-sheet Visit notes LOOK', () => {
  it('sits the tray on signed paper — hairline log, underline compose, not a second card', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const lookCss = visitNotesLookCss();
    const trayStart = page.indexOf('id="job-visit-notes"');
    const trayEnd = page.indexOf('id="job-insp"');
    const tray = page.slice(trayStart, trayEnd);

    expect(page).toContain('JOB_VISIT_NOTES_LOOK_CSS');
    expect(page).toContain("const VISIT_NOTES_LOOK = 'visit-notes'");
    expect(page).toContain('id="job-visit-notes"');
    expect(page).toContain('lookVisitNotes');
    expect(page).toContain('Fitted the new unit.');
    expect(page).toContain('Pulled the old unit.');
    expect(page).toContain('Site walk. Isolated the feed.');
    expect(page).toContain('Alex Reed');
    expect(page).toContain('Sam Cole');
    expect(tray).toContain('job-visit-compose');
    expect(tray).toContain('job-visit-hairline');
    expect(tray).toContain('job-visit-post');
    expect(tray).toContain('job-visit-log');
    expect(tray).toContain('job-visit-row');
    expect(tray).toContain('job-visit-stamp');
    expect(tray).toContain('job-visit-body');
    expect(tray).toContain('Visit notes');
    expect(tray).toContain('Post note');
    expect(tray).not.toContain('form-input-sm');
    expect(tray).not.toContain('btn-primary');
    expect(tray).not.toContain('ops-related-list');
    expect(tray).not.toContain('px-3 py-2.5');
    expect(tray).not.toContain('space-y-2');

    expect(lookCss).toContain('#job-visit-notes');
    expect(lookCss).toContain('--visit-page: #F5F0E6');
    expect(lookCss).toContain('--visit-sheet: #FFFDF8');
    expect(lookCss).toContain('--visit-ink: #0A2540');
    expect(lookCss).toContain('--visit-muted: #5B6B7C');
    expect(lookCss).toContain('--visit-line: #E2D9CC');
    expect(lookCss).toContain('--visit-action: #2E75B6');
    expect(lookCss).toContain('#F5F0E6');
    expect(lookCss).toContain('#FFFDF8');
    expect(lookCss).toContain('#0A2540');
    expect(lookCss).toContain('#5B6B7C');
    expect(lookCss).toContain('#E2D9CC');
    expect(lookCss).toContain('#2E75B6');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('.job-visit-hairline');
    expect(lookCss).toContain('border-bottom: 1px solid var(--visit-line)');
    expect(lookCss).toContain('.job-visit-post');
    expect(lookCss).toContain('background: none');
    expect(lookCss).toContain('box-shadow: none');
    expect(lookCss).not.toMatch(/\.job-visit-post[\s\S]{0,220}background:\s*#2E75B6/);
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(lookCss).not.toMatch(/gloss|lacquer|shine|glow/i);
    expect(lookCss).not.toContain('hub-jobs-tools .btn-primary');
    expect(lookCss).not.toContain('ops-next-control-block');
    expect(lookCss).not.toMatch(/\bute\b/i);
    expect(src('src/lib/devFieldAuditAuth.ts')).toContain("params.get('look') === 'visit-notes'");
  });

  it('keeps Arriving shortly as the one 44px #2E75B6 and does not rewrite persist', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const helper = src('src/lib/jobVisitNotes.ts');

    expect(page).toContain('postJobVisitNote');
    expect(page).toContain('decideJobVisitNotePost');
    expect(page).toContain('sortJobVisitNotesNewestFirst');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect(page).toContain('JOB_VISIT_NOTE_TABLE');
    expect(helper).toContain('postJobVisitNote');
    expect(helper).toContain('decideJobVisitNotePost');
    expect(helper).not.toContain('JOB_VISIT_NOTES_LOOK_CSS');
    expect(helper).not.toContain('visitNotesLookOn');
    expect(helper).not.toContain("searchParams.get('look')");
  });

  it('gates the look harness to DEV and leaves stay-off floors alone', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    expect(page).toContain("if (!import.meta.env.DEV) return null");
    expect(page).toContain(".get('look')");
    expect(page).toContain('visit-notes');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('hub-expenses');
    expect(page).not.toContain('hub-week-board');
    expect(page).not.toContain('Wayfinder');
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);
    expect(src('src/pages/ExpensesPage.tsx')).not.toContain('JOB_VISIT_NOTES_LOOK_CSS');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('job-visit-hairline');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('job-visit-hairline');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('job-visit-notes');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('job-visit-notes');
    expect(src('src/components/jobs/JobDispatchPanel.tsx')).not.toContain('JOB_VISIT_NOTES_LOOK_CSS');
  });
});

describe('job-sheet Visit notes LOOK frames', () => {
  it('covers laptop 1280, phone 390, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/visit-notes-laptop-1280.png',
      'docs/look/visit-notes-phone-390.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
