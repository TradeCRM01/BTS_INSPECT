import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('list-page quiet eyebrows (paper kit)', () => {
  it('paints list page-head eyebrows with one shared quiet label, not an 11px tracking kicker', () => {
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* List-page quiet eyebrows (paper kit).');
    expect(lookStart).toBeGreaterThan(-1);
    const lookCss = css.slice(lookStart);

    expect(lookCss).toContain('.hub-look-eyebrow');
    expect(lookCss).toContain('.hub-jobs .ops-page-head .hub-jobs-label');
    expect(lookCss).toContain('.hub-clients .ops-page-head .hub-clients-label');
    expect(lookCss).toContain('.hub-inspections .ops-page-head .hub-inspections-label');
    expect(lookCss).toContain('.hub-jha .ops-page-head .hub-jha-label');
    expect(lookCss).toContain('.hub-take5 .ops-page-head .hub-take5-label');
    expect(lookCss).toContain('.hub-reports .ops-page-head .hub-reports-label');
    expect(lookCss).toContain('.hub-timesheets .ops-page-head .hub-timesheets-label');
    expect(lookCss).toContain('.hub-compliance .ops-page-head .hub-compliance-label');
    expect(lookCss).toContain('.hub-quotes .ops-page-head .hub-quote-kicker');
    expect(lookCss).toContain('.dashboard-home .dashboard-home-label');
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-size: 13px');
    expect(lookCss).toContain('letter-spacing: 0');
    expect(lookCss).toContain('text-transform: none');
    expect(lookCss).toContain('color: #5B6B7C');
    expect(lookCss).not.toMatch(/letter-spacing:\s*0\.12em/);
    expect(lookCss).not.toMatch(/text-transform:\s*uppercase/);
    expect(lookCss).not.toMatch(/font-size:\s*11px/);
    expect(lookCss).not.toMatch(/Rajdhani/);
    expect(lookCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|gloss|glow/);

    const jobs = src('src/pages/JobsPage.tsx');
    const clients = src('src/pages/ClientsPage.tsx');
    const inspections = src('src/pages/InspectionsPage.tsx');
    const jha = src('src/pages/JhaDocumentsPage.tsx');
    const take5 = src('src/pages/Take5ListPage.tsx');
    const timesheets = src('src/pages/TimesheetsPage.tsx');
    const reports = src('src/pages/ReportsListPage.tsx');
    const compliance = src('src/pages/CompliancePage.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    const dashboard = src('src/pages/DashboardPage.tsx');

    expect(jobs).not.toContain('hub-look-eyebrow');
    expect(jobs).toContain('ops-page-title">Jobs');
    expect(jobs).toContain('hub-jobs-list-mark">List');
    expect(clients).not.toContain('hub-look-eyebrow');
    expect(clients).toContain('ops-page-title">Clients');
    expect(clients).toContain('hub-clients-list-mark">List');
    expect(inspections).not.toContain('hub-look-eyebrow');
    expect(inspections).toContain('ops-page-title">Inspections');
    expect(inspections).toContain('hub-inspections-list-mark">List');
    expect(jha).toContain('hub-look-eyebrow hub-jha-label');
    expect(take5).toContain('hub-look-eyebrow hub-take5-label');
    expect(timesheets).toContain('hub-look-eyebrow hub-timesheets-label');
    expect(reports).not.toContain('hub-look-eyebrow');
    expect(reports).toContain('ops-page-title">Reports');
    expect(reports).toContain('hub-reports-list-mark">List');
    expect(compliance).toContain('hub-look-eyebrow hub-compliance-label');
    expect(quotes).toContain('hub-look-eyebrow hub-quote-kicker');
    expect(dashboard).toContain('hub-look-eyebrow dashboard-home-label');

    expect(jobs).not.toMatch(/>JOBS</);
    expect(clients).not.toMatch(/>CLIENTS</);
    expect(inspections).not.toMatch(/>INSPECTIONS</);
    expect(timesheets).not.toContain('TIMESHEETS');
    expect(timesheets).not.toContain('hub-week-chip');
    expect(timesheets).not.toContain('hub-timesheets-kicker');
  });

  it('leaves invoices list, expenses, team, job sheet, fill pages, and stay-off floors alone', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    const expenses = src('src/pages/ExpensesPage.tsx');
    const team = src('src/pages/TeamSettingsPage.tsx');
    const jobSheet = src('src/pages/JobDetailPage.tsx');
    const inspFill = src('src/pages/InspectionFillPage.tsx');
    const jhaFill = src('src/pages/JhaFillPage.tsx');
    const take5Fill = src('src/pages/Take5Page.tsx');
    const marketing = src('src/pages/MarketingPage.tsx');
    const billing = src('src/pages/BillingSettingsPage.tsx');
    const login = src('src/pages/LoginPage.tsx');
    const signup = src('src/pages/SignupPage.tsx');
    const wayfinder = src('src/pages/SchedulePage.tsx');

    expect(invoices).not.toContain('hub-look-eyebrow');
    expect(expenses).not.toContain('hub-look-eyebrow');
    expect(team).not.toContain('hub-look-eyebrow');
    expect(jobSheet).not.toContain('hub-look-eyebrow');
    expect(jobSheet).toContain('hub-jobs-label');
    expect(inspFill).not.toContain('hub-look-eyebrow');
    expect(jhaFill).not.toContain('hub-look-eyebrow');
    expect(take5Fill).not.toContain('hub-look-eyebrow');
    expect(marketing).not.toContain('hub-look-eyebrow');
    expect(billing).not.toContain('hub-look-eyebrow');
    expect(login).not.toContain('hub-look-eyebrow');
    expect(signup).not.toContain('hub-look-eyebrow');
    expect(wayfinder).not.toContain('hub-look-eyebrow');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('JobDetailPage');
    expect(src('src/pages/TimesheetsPage.tsx')).not.toContain('hub-week-chip');
  });

  it('LOOK frames cover jobs, inspections, and timesheets list eyebrows, desktop and phone', () => {
    for (const rel of [
      'docs/look/list-eyebrow-jobs-desktop.png',
      'docs/look/list-eyebrow-jobs-phone.png',
      'docs/look/list-eyebrow-inspections-desktop.png',
      'docs/look/list-eyebrow-inspections-phone.png',
      'docs/look/list-eyebrow-timesheets-desktop.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
