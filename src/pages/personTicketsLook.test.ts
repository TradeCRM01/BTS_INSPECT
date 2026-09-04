import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function teamLookCss(): string {
  const page = src('src/pages/TeamSettingsPage.tsx');
  return page.slice(page.indexOf('const TEAM_LOOK_CSS'), page.indexOf('type TemplateAccess'));
}

describe('person tickets LOOK — same paper, hairline ledger, one Save ticket', () => {
  it('keeps tickets on the open person sheet with a look harness and quiet add fields', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    const app = src('src/App.tsx');
    const look = teamLookCss();

    expect(page).toContain("const PERSON_TICKETS_LOOK = 'person-tickets'");
    expect(page).toContain('id=look-team-alex');
    expect(page).toContain('look-team-alex');
    expect(page).toContain('personTicketsLookRows');
    expect(page).toContain('White Card');
    expect(page).toContain('Working at Heights');
    expect(page).toContain('lookTickets');
    expect(page).toContain('enabled: !lookMode && !!companyId && !!profileId');
    expect(page).toContain('hub-team-ledger');
    expect(page).toContain('hub-team-ledger-row');
    expect(page).toContain('hub-team-ledger-kicker');
    expect(page).toContain('hub-team-add');
    expect(page).toContain('hub-team-hairline');
    expect(page).toContain('hub-team-file');
    expect(page).toContain('Save ticket');
    expect(page).toContain('Open file');
    expect(page).toContain('Licence {openedLicence}');
    expect(page).toContain('id="team-member-tickets"');
    expect(page).toContain('hub-team-sheet');
    expect(page).toContain('max-width: 1100px');
    expect(page).not.toContain('--hub-list-sheet-max');
    expect(page).not.toMatch(/<label>\s*Name\s*<input/);
    expect(page).not.toMatch(/<label>\s*Number\s*<input/);
    expect(page).not.toMatch(/<label>\s*Expiry\s*<input/);
    expect(page).not.toMatch(/<label>\s*Notes\s*<input/);
    expect(page).not.toMatch(/<label>\s*File\s*<input/);
    expect(page).not.toContain('path: \'/settings/tickets');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);
    expect(app).toContain('<Route path="/settings/team"');
    expect(app).not.toContain('path="/settings/team/:id"');
    expect(app).not.toContain('path="/tickets"');
    expect(app).not.toContain('path="/hr"');
    expect(app).not.toContain('path="/accreditations"');

    expect(look).toContain('--team-look-page: #F5F0E6');
    expect(look).toContain('--team-look-sheet: #FFFDF8');
    expect(look).toContain('--team-look-ink: #0A2540');
    expect(look).toContain('--team-look-muted: #5B6B7C');
    expect(look).toContain('--team-look-line: #E2D9CC');
    expect(look).toContain('#2E75B6');
    expect(look).toContain('.hub-team-sheet {\n  max-width: 1100px;');
    expect(look).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(look).toContain('inset 0 1px 0 #fff');
    expect(look).toContain("font-family: Rajdhani, sans-serif");
    expect(look).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(look).toContain('.hub-team-hairline');
    expect(look).toContain('font-size: 12px');
    expect(look).toContain('border-radius: 12px');
    expect(look).toContain('height: 44px');
    expect(look).toContain('.hub-team-hero {\n  font-family: Rajdhani, sans-serif;\n  font-weight: 700;\n  font-size: 40px;');
    expect(look).not.toContain('font-size: 56px');
    expect(look).toContain('.hub-team-add-foot { justify-content: space-between; }');
    expect(src('src/lib/devFieldAuditAuth.ts')).toContain("params.get('look') === 'person-tickets'");
    expect(look).not.toContain('--hub-list-sheet-max');
    expect(look).not.toMatch(/emerald|#1B7F3A|#22c55e|#16a34a|#16A34A|#15803D/);
    expect(look).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(look).not.toMatch(/\bute\b/i);

    const ticketsFn = page.slice(
      page.indexOf('function TeamMemberTicketsLedger'),
      page.indexOf('function placeTeamListMore'),
    );
    expect(ticketsFn).toContain('hub-team-add');
    expect(ticketsFn).toContain('hub-team-hairline');
    expect(ticketsFn).toContain('className="hub-team-next"');
    expect((ticketsFn.match(/className="hub-team-next"/g) ?? []).length).toBe(1);
    expect(ticketsFn).not.toContain('className="form-input"');
    expect(ticketsFn).not.toContain('btn-primary');
  });

  it('does not restyle quote, week, job, or list sheet width', () => {
    const css = src('src/index.css');
    const page = src('src/pages/TeamSettingsPage.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    const week = src('src/pages/SchedulePage.tsx');
    const job = src('src/pages/JobDetailPage.tsx');

    expect(page).toContain('.hub-team-sheet {\n  max-width: 1100px;');
    expect(page).not.toContain('--hub-list-sheet-max');
    expect(css).toContain('--hub-list-sheet-max: none;');
    expect(css).toContain('.hub-week-document {\n    max-width: 1100px;');
    expect(css).toContain('.hub-jobs-document {\n    max-width: 1100px;');
    expect(css).toContain('.hub-team-list-doc .hub-team-list-sheet {');
    expect(css).toContain('.hub-quotes .ops-page-head {\n    max-width: 1100px;');
    expect(quotes).not.toContain('hub-team-hairline');
    expect(quotes).not.toContain('personTicketsLookRows');
    expect(week).not.toContain('hub-team-hairline');
    expect(week).not.toContain('person-tickets');
    expect(job).not.toContain('hub-team-hairline');
    expect(job).not.toContain('personTicketsLookRows');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('hub-team-hairline');
    expect(src('src/pages/DashboardPage.tsx')).not.toContain('hub-team-hairline');
  });

  it('leaves ticket persist, remove, and open-file writes on the live sheet', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain('memberTicketInsertRow');
    expect(page).toContain('memberTicketRemoveScope');
    expect(page).toContain('createSignedUrl');
    expect(page).toContain("from('member_tickets')");
    expect(page).toContain("from('uploaded-pdfs')");
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(page).not.toContain('createInvoiceFromJobBill');
  });
});

describe('person tickets LOOK frames', () => {
  it('covers laptop 1280, phone, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/person-tickets-laptop-1280.png',
      'docs/look/person-tickets-phone-390.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
