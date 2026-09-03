import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function lookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* Team list document only.');
  const lookEnd = css.indexOf('/* End team list document', lookStart);
  return css.slice(lookStart, lookEnd);
}

describe('team list laptop LOOK — quote paper, overflow on the sheet', () => {
  it('paints the team list as one Looplet paper, not a stacked admin list', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    const css = lookCss();

    expect(page).toContain('hub-team-list-doc');
    expect(page).toContain('hub-team-list-bar');
    expect(page).toContain('hub-team-list-mark');
    expect(page).toContain('hub-team-list-body');
    expect(page).toContain('hub-team-list-whisper');
    expect(page).toContain('hub-team-list-tools');
    expect(page).toContain('hub-team-list-sheet');
    expect(page).toContain('hub-team-row');
    expect(page).toContain('<span>Name</span>');
    expect(page).toContain('<span>Role</span>');
    expect(page).toContain('hub-team-list-find');
    expect(page).toContain('hub-team-list-mark">List');
    expect(page).toContain('ops-page-title">Team');
    expect(page).toContain('aria-label="Open"');
    expect(page).toContain('className="btn-primary"');
    expect(page).toContain('Invite member');
    expect(page).toContain('placeTeamListMore');
    expect(page).toContain('inkFloor');
    expect(page).not.toContain('hub-look-eyebrow');
    expect(page).not.toContain('hub-team-list-mark">Team');
    expect(page).not.toContain('ops-page-title">Book');
    expect(page).not.toContain('ops-page-title">Team members');
    expect(page).not.toMatch(/>Book<|>Ledger<|>Register<|>Crew</);
    expect(page).toContain('placeMoreMenu');
    expect(page).toContain('is-flip');
    expect(page).toContain('is-shift');
    expect(page).toContain('--hub-team-list-more-shift');
    expect(page).toContain("look') === TEAM_LIST_LOOK");
    expect(page).toContain('Alex Nguyen');
    expect(page).toContain('Jordan Admin');
    expect(page).toContain('Sam Spark');
    expect(page).not.toContain('Northside Electrical');
    expect(page).not.toContain('Harbour Lights');
    expect(page).not.toContain('Midland Workshops');
    expect(page).not.toContain('hub-jobs-list-doc');
    expect(page).not.toContain('hub-inspections-list-doc');
    expect(page).not.toContain('hub-jha-list-doc');
    expect(page).not.toContain('hub-take5-list-doc');
    expect(page).not.toContain('hub-reports-list-doc');
    expect(page).not.toContain('hub-clients-list-doc');
    expect(page).not.toContain('hub-week-document');
    expect(page).not.toContain('hub-quote-editor');
    expect(page).not.toContain('dashboard-home-mark');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);
    const listDoc = page.slice(page.indexOf('hub-team-list-doc'), page.indexOf('function placeTeamListMore'));
    expect(listDoc).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(listDoc).not.toMatch(/\bute\b/i);

    const thead = page.slice(page.indexOf('hub-team-thead'), page.indexOf('visibleMembers.map'));
    expect(thead).toContain('Name');
    expect(thead).toContain('Role');
    expect(thead).not.toContain('Open');
    expect(thead).not.toContain('Site');
    expect(thead).not.toContain('Customer');

    expect((page.match(/hub-team-list-more/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/MoreHorizontal/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/className="btn-primary"/g) ?? []).length).toBe(1);

    expect(css).toContain('.hub-team-list-doc');
    expect(css).toContain('.hub-team-list-bar');
    expect(css).toContain('.hub-team-list-whisper');
    expect(css).toContain('.hub-team-list-tools');
    expect(css).toContain('background: #F5F0E6');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(css).toContain('color: #5B6B7C');
    expect(css).toContain('#E2D9CC');
    expect(css).toContain('background: #2E75B6');
    expect(css).toContain('overflow: visible');
    expect(css).toContain('.hub-team-list-more.is-flip');
    expect(css).toContain('.hub-team-list-more.is-shift');
    expect(css).toContain('font-size: 12px');
    expect(css).toContain('font-size: 56px !important');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(css).toContain('inset 0 1px 0 #fff');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('min-height: 620px');
    expect(css).toContain('text-transform: none');
    expect(css).toContain('letter-spacing: 0');
    expect(css).toContain('.form-input::placeholder');
    expect(css).not.toMatch(/letter-spacing:\s*0\.12em/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(css).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(css).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).not.toMatch(/\bute\b/i);
    expect(css).not.toContain('#FFFFFF');
  });

  it('does not rewrite persist, search, or convert writes', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain('filterTeamSettingsList');
    expect(page).toContain('teamSettingsMemberHref');
    expect(page).toContain('teamSettingsIsPending');
    expect(page).toContain('get_company_members');
    expect(page).toContain('Search by name, email, or licence');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('createInvoiceFromJobBill');
  });

  it('stays off landing, quotes, week-board, job sheet, sibling lists, Relovi, and AppShell', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('hub-quote-sheet');
    expect(page).not.toContain('hub-jobs-document');
    expect(page).not.toContain('hub-week-document');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/JobDetailPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/ClientsPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/ReportsListPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/InspectionsPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/JhaDocumentsPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/Take5ListPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/Take5Page.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/DashboardPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-team-list-doc');
    expect(src('src/pages/operator/OperatorOperatorsPage.tsx')).not.toContain('hub-team-list-doc');
  });
});

describe('team list laptop LOOK frames', () => {
  it('covers 1280 document, overflow, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/team-list-laptop-1280-document.png',
      'docs/look/team-list-laptop-1280-overflow.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
