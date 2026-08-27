import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Compliance page due-or-open floor wiring', () => {
  const page = src('src/pages/CompliancePage.tsx');
  const helper = src('src/lib/complianceList.ts');
  const app = src('src/App.tsx');

  it('defaults to Due or open and opens on the existing /compliance?id= path', () => {
    expect(page).toContain('COMPLIANCE_LIST_DEFAULT_FILTER');
    expect(page).toContain('filterComplianceListFloor');
    expect(page).toContain('decorateComplianceList');
    expect(page).toContain('complianceListOpenHref');
    expect(page).toContain('parseComplianceListOpenId');
    expect(page).toContain('data-compliance-open');
    expect(page).toContain('data-compliance-href');
    expect(page).toContain('complianceListFloorLede');
    expect(page).toContain('hub-compliance-sheet');
    expect(page).toContain('>Open</Link>');
    expect(helper).toContain("export const COMPLIANCE_LIST_DEFAULT_FILTER: ComplianceListFilter = 'action'");
    expect(helper).toContain('return `/compliance?id=${encodeURIComponent(id)}`');
    expect(app).toContain('path="/compliance"');
    expect(app).toContain('<CompliancePage />');
    expect(page).not.toContain("useState<'all' | ComplianceStatus>('all')");
  });

  it('does not add a compliance module, audit product, or new path', () => {
    expect(app).not.toContain('path="/compliance/new"');
    expect(app).not.toContain('path="/audit"');
    expect(page).not.toContain('/compliance/export');
    expect(page).not.toContain('spreadsheet');
    expect(page).not.toContain('ComplianceAuditPage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ComplianceAuditPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/AuditPage.tsx'))).toBe(false);
  });

  it('stays on CompliancePage plus the list-owned helper', () => {
    expect(page).not.toContain('TimesheetsPage');
    expect(page).not.toContain('timesheetsList');
    expect(page).not.toContain('InspectionReviewPage');
    expect(page).not.toContain('InspectionsPage');
    expect(page).not.toContain('inspectionsList');
    expect(page).not.toContain('JhaDocumentsPage');
    expect(page).not.toContain('jhaList');
    expect(page).not.toContain('Take5ListPage');
    expect(page).not.toContain('take5List');
    expect(page).not.toContain('ReportsListPage');
    expect(page).not.toContain('reportsList');
    expect(page).not.toContain('DashboardPage');
    expect(page).not.toContain('dashboardHome');
    expect(page).not.toContain('ClientsPage');
    expect(page).not.toContain('clientsFloor');
    expect(page).not.toContain('SchedulePage');
    expect(page).not.toContain('scheduleBoard');
    expect(page).not.toContain('JobsPage');
    expect(helper).not.toContain('inspectionsList');
    expect(helper).not.toContain('jhaList');
    expect(helper).not.toContain('take5List');
    expect(helper).not.toContain('timesheetsList');
    expect(helper).not.toContain('clientsFloor');
    expect(helper).not.toContain('dashboardHome');
  });
});

describe('compliance due-or-open cream paper look', () => {
  it('paints the open record as the document sheet, not a tile grid or DATE/STATUS table', () => {
    const page = src('src/pages/CompliancePage.tsx');
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* Compliance due-or-open floor look only.');
    const lookCss = css.slice(lookStart);

    expect(page).toContain('hub-compliance');
    expect(page).toContain('hub-compliance');
    expect(page).toContain('is-record-open');
    expect(page).toContain('hub-compliance-sheet');
    expect(page).toContain('hub-compliance-sheet-bar');
    expect(page).toContain('hub-compliance-sheet-body');
    expect(page).toContain('hub-compliance-hero');
    expect(page).toContain('hub-compliance-label');
    expect(page).toContain('hub-compliance-ledger');
    expect(page).toContain('hub-compliance-pill');
    expect(page).toContain('hub-compliance-next');
    expect(page).toContain('complianceListOpened');
    expect(page).toContain('complianceListSheetItem');
    expect(page).toContain('complianceListDueLabel');
    expect(page).toContain('>Open</Link>');
    expect(page).not.toContain('hub-compliance-kicker');
    expect(page).not.toMatch(/>COMPLIANCE</);
    expect(page).not.toContain('hub-compliance-tile');
    expect(page).not.toContain('hub-compliance-tiles');
    expect(page).not.toContain('hub-timesheets-days');
    expect(page).not.toContain('<table');
    expect(page).not.toContain('<thead');
    expect(page).not.toContain('ViewToggle');
    expect(page).not.toContain('SummaryCard');
    expect(page).not.toContain('>DATE<');
    expect(page).not.toContain('>STATUS<');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(lookCss).toContain('.hub-compliance.ops-page');
    expect(lookCss).toContain('.hub-compliance-sheet');
    expect(lookCss).toContain('.hub-compliance-sheet-bar');
    expect(lookCss).toContain('.hub-compliance-sheet-body');
    expect(lookCss).toContain('.hub-compliance-hero');
    expect(lookCss).toContain('.hub-compliance-label');
    expect(lookCss).toContain('.hub-compliance.is-record-open');
    expect(lookCss).toContain('--compliance-look-page: #F5F0E6');
    expect(lookCss).toContain('--compliance-look-sheet: #FFFDF8');
    expect(lookCss).toContain('--compliance-look-ink: #0A2540');
    expect(lookCss).toContain('--compliance-look-muted: #5B6B7C');
    expect(lookCss).toContain('--compliance-look-line: #E2D9CC');
    expect(lookCss).toContain('#2E75B6');
    expect(lookCss).toContain('box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(lookCss).toContain('box-shadow: inset 0 1px 0 #fff');
    expect(lookCss).toContain('font-size: 56px !important');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-variant-numeric: tabular-nums');
    expect(lookCss).not.toContain('.hub-compliance-kicker');
    expect(lookCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(lookCss).not.toMatch(/font-family:\s*ui-monospace|JetBrains Mono/);
    expect(lookCss).not.toContain('indigo-500');
    expect(lookCss).not.toMatch(/\.hub-compliance[\s\S]{0,80}#111|#000\b/);
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toContain('.hub-compliance-tiles');
    expect(lookCss).not.toMatch(/\.hub-compliance \.btn-primary/);
  });

  it('does not restyle the form, reminders, history, timesheets, or AppShell', () => {
    const page = src('src/pages/CompliancePage.tsx');
    expect(page).toContain('function ComplianceForm');
    expect(page).toContain('function ComplianceHistoryModal');
    expect(page).toContain('compliance-reminder');
    expect(page).not.toContain('TimesheetsPage');
    expect(page).not.toContain('hub-timesheet');
    expect(page).not.toContain('hub-jobs');
    expect(page).not.toContain('hub-take5');
    expect(page).not.toContain('hub-inspections');
    expect(page).not.toContain('hub-jha');
    expect(page).not.toContain('dashboard-home');

    const formChunk = page.slice(page.indexOf('function ComplianceForm'));
    expect(formChunk).not.toContain('hub-compliance-sheet');
    expect(formChunk).not.toContain('hub-compliance-pill');

    const historyChunk = page.slice(page.indexOf('function ComplianceHistoryModal'));
    expect(historyChunk).not.toContain('hub-compliance-sheet');

    const timesheets = src('src/pages/TimesheetsPage.tsx');
    expect(timesheets).not.toContain('hub-compliance');

    const reports = src('src/pages/ReportsListPage.tsx');
    expect(reports).not.toContain('hub-compliance');

    const dashboard = src('src/pages/DashboardPage.tsx');
    expect(dashboard).not.toContain('hub-compliance');

    const take5 = src('src/pages/Take5ListPage.tsx');
    expect(take5).not.toContain('hub-compliance');

    const jha = src('src/pages/JhaDocumentsPage.tsx');
    expect(jha).not.toContain('hub-compliance');

    const inspections = src('src/pages/InspectionsPage.tsx');
    expect(inspections).not.toContain('hub-compliance');

    const clients = src('src/pages/ClientsPage.tsx');
    expect(clients).not.toContain('hub-compliance');

    const schedule = src('src/pages/SchedulePage.tsx');
    expect(schedule).not.toContain('hub-compliance');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).not.toContain('hub-compliance');

    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).not.toContain('hub-compliance');

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).not.toContain('hub-compliance');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-compliance');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-compliance');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover the open-record document sheet desktop and phone only', () => {
    for (const rel of [
      'docs/look/compliance-list-desktop.png',
      'docs/look/compliance-list-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
