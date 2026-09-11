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

function visitNotesTray(): string {
  const page = src('src/pages/JobDetailPage.tsx');
  return page.slice(page.indexOf('id="job-visit-notes"'), page.indexOf('id="job-insp"'));
}

describe('job-sheet Job notes & photos LOOK', () => {
  it('reshapes the tray into the field flow: tabs, photos first, one question, a choice, the rest folded', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const tray = visitNotesTray();

    expect(page).toContain('JOB_VISIT_NOTES_LOOK_CSS');
    expect(page).toContain("const VISIT_NOTES_LOOK = 'visit-notes'");
    expect(page).toContain('lookVisitNotes');
    expect(page).toContain('is-visit-notes-look');
    expect(page).toContain('Fitted the new unit.');
    expect(page).toContain('Pulled the old unit.');
    expect(page).toContain('Site walk. Isolated the feed.');
    expect(page).toContain('Alex Reed');
    expect(page).toContain('Sam Cole');

    expect(tray).toContain('Job notes & photos');
    expect(tray).toContain('job-notes-tabs');
    expect(tray).toContain('New update');
    expect(tray).toContain('History');
    expect(tray).toContain('job-notes-tab-count');
    expect(tray).toContain('job-notes-compose');
    expect(tray).toContain('job-notes-primary');
    expect(tray).toContain('Take photos');
    expect(tray).toContain('Choose from gallery');
    expect(tray).toContain('One wide shot + a close-up');
    expect(tray).toContain('Show the finished work');
    expect(tray).toContain('What did you do?');
    expect(tray).toContain('A sentence or two');
    expect(tray).toContain('Anything left to do?');
    expect(tray).toContain('All done');
    expect(tray).toContain('More to do');
    expect(tray).toContain('Parts used & customer requests');
    expect(tray).toContain('optional');
    expect(tray).toContain('name & time added for you');
    expect(tray).toContain('Team only · not sent to the customer');
    expect(tray).toContain('Post update');
    expect(tray).toContain('job-notes-field');
    expect(tray).toContain('job-notes-choice-btn');
    expect(tray).toContain('job-visit-post');
    expect(tray).toContain('job-visit-log');
    expect(tray).toContain('job-visit-row');
    expect(tray).toContain('job-visit-stamp');
    expect(tray).toContain('job-visit-author');
    expect(tray).toContain('job-visit-time');
    expect(tray).toContain('job-visit-body');
    expect(tray).toContain('job-visit-block');
    expect(tray).toContain('job-visit-section-label');
    expect(tray).toContain('job-visit-photos');
    expect(tray).toContain('data-visit-photo');
    expect(tray).toContain('id="job-visit-photo-input"');
    expect(tray).toContain('id="job-visit-gallery-input"');
    expect(tray).not.toContain('job-visit-hairline');
    expect(tray).not.toContain('Post note');
    expect(tray).not.toContain('Visit notes');
    expect(tray).not.toContain('form-input-sm');
    expect(tray).not.toContain('btn-primary');
    expect(tray).not.toContain('ops-related-list');
    expect(tray).not.toContain('px-3 py-2.5');
    expect(tray).not.toContain('space-y-2');
  });

  it('shows the left-to-do and parts fields only after a choice or a disclosure', () => {
    const tray = visitNotesTray();
    const leftField = tray.indexOf('data-visit-section="left"');
    expect(tray.slice(0, leftField)).toContain("visitDraft.outcome === 'more_to_do' && (");
    const more = tray.indexOf('<details className="job-notes-more"');
    expect(more).toBeGreaterThan(-1);
    expect(tray.indexOf('data-visit-section="parts_used"')).toBeGreaterThan(more);
    expect(tray.indexOf('data-visit-section="parts_needed"')).toBeGreaterThan(more);
    expect(tray.indexOf('data-visit-section="customer_wants"')).toBeGreaterThan(more);
    expect(tray.indexOf('data-visit-section="done"')).toBeLessThan(tray.indexOf('data-outcome="all_done"'));
  });

  it('paints the flow in the paper kit: six tokens, 44px radius-10 controls, no gloss or green', () => {
    const lookCss = visitNotesLookCss();

    expect(lookCss).toContain('#job-visit-notes');
    expect(lookCss).toContain('--visit-page: #F5F0E6');
    expect(lookCss).toContain('--visit-sheet: #FFFDF8');
    expect(lookCss).toContain('--visit-ink: #0A2540');
    expect(lookCss).toContain('--visit-muted: #5B6B7C');
    expect(lookCss).toContain('--visit-line: #E2D9CC');
    expect(lookCss).toContain('--visit-action: #2E75B6');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('.job-notes-tabs');
    expect(lookCss).toContain('.job-notes-tab[aria-selected="true"]');
    expect(lookCss).toContain('.job-notes-primary');
    expect(lookCss).toContain('.job-notes-post');
    expect(lookCss).toContain('.job-notes-choice-btn');
    expect(lookCss).toContain('.job-notes-choice-btn[aria-pressed="true"]');
    expect(lookCss).toContain('.job-notes-field');
    expect(lookCss).toContain('.job-notes-more[open] .job-notes-more-chevron');
    expect(lookCss).toContain('.job-notes-strip img');
    expect(lookCss).toContain('.job-notes-avatar');
    expect(lookCss).toContain('.job-notes-team-only');
    expect(lookCss).toContain('height: 44px');
    expect(lookCss).toContain('border-radius: 10px');
    expect(lookCss).toContain('field-sizing: content');
    expect(lookCss).toContain('.hub-jobs.is-visit-notes-look');
    expect(lookCss).toContain('border-bottom: 1px solid var(--visit-line)');
    expect(lookCss).toContain('background: none');
    expect(lookCss).toContain('box-shadow: none');
    expect(lookCss).toContain('border-radius: 12px');
    expect(lookCss).toContain('background: var(--visit-sheet)');
    expect(lookCss).toContain('.job-visit-row');
    expect(lookCss).toContain('.job-visit-body .job-visit-section-label');
    expect(lookCss).toContain('.job-visit-photo-input');
    expect(lookCss).not.toContain('.job-visit-hairline');
    expect(lookCss).not.toContain('.job-visit-compose');
    expect(lookCss).not.toContain('.job-visit-photo-bar');
    expect(lookCss).not.toContain('.job-visit-photo-add');
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toMatch(/radial-gradient|linear-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(lookCss).not.toMatch(/gloss|lacquer|shine|glow/i);
    expect(lookCss).not.toContain('hub-jobs-tools .btn-primary');
    expect(lookCss).not.toContain('ops-next-control-block');
    expect(lookCss).not.toMatch(/\bute\b/i);
    expect(src('src/lib/devFieldAuditAuth.ts')).toContain("params.get('look') === 'visit-notes'");
  });

  it('keeps Arriving shortly as the one 44px #2E75B6 and does not rewrite persist', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const tray = visitNotesTray();
    const lookCss = visitNotesLookCss();
    const helper = src('src/lib/jobVisitNotes.ts');

    expect(page).toContain('postJobVisitNote');
    expect(page).toContain('decideJobVisitNotePost');
    expect(page).toContain('sortJobVisitNotesNewestFirst');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect(page).toContain('JOB_VISIT_NOTE_TABLE');
    expect(page).toContain('sections: visitUpdateSections(visitDraft)');
    expect(lookCss).toContain('.job-notes-primary.is-filled');
    expect(lookCss).toContain('.job-notes-post.is-filled');
    expect(tray).toContain("`job-notes-primary${visitReady ? '' : ' is-filled'}`");
    expect(tray).toContain("`job-visit-post job-notes-post${visitReady ? ' is-filled' : ''}`");
    expect(helper).toContain('postJobVisitNote');
    expect(helper).toContain('decideJobVisitNotePost');
    expect(helper).toContain('visitUpdateSections');
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
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('job-notes-field');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('job-notes-field');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('job-visit-notes');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('job-visit-notes');
    expect(src('src/components/jobs/JobDispatchPanel.tsx')).not.toContain('JOB_VISIT_NOTES_LOOK_CSS');
  });
});

describe('job-sheet Job notes & photos LOOK frames', () => {
  it('covers laptop 1280, phone 390, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/visit-notes-laptop-1280.png',
      'docs/look/visit-notes-phone-390.png',
      'docs/look/job-notes-photos-laptop-1280.png',
      'docs/look/job-notes-photos-phone-390.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
