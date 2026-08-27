import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('reports list cream paper look', () => {
  it('paints /reports as cream paper rows, not a desktop canvas', () => {
    const list = src('src/pages/ReportsListPage.tsx');
    const css = src('src/index.css');

    expect(list).toContain('hub-reports');
    expect(list).toContain('hub-reports-sheet');
    expect(list).toContain('hub-reports-row');
    expect(list).toContain('hub-reports-pill');
    expect(list).toContain('Site');
    expect(list).toContain('Search by site, report number, job, or client');
    expect(list).not.toContain('radial-gradient');
    expect(list).not.toContain('cursor-grab');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-reports.ops-page');
    expect(css).toContain('--report-page: #F5F0E6');
    expect(css).toContain('--report-sheet: #FFFDF8');
    expect(css).toContain('--report-ink: #0A2540');
    expect(css).toContain('--report-muted: #5B6B7C');
    expect(css).toContain('--report-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toMatch(/\.hub-reports \.ops-page-title[\s\S]{0,160}Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).toContain('letter-spacing: 0.12em');
  });

  it('does not restyle stay-off floors, AppShell, or the PDF compose path', () => {
    const reports = src('src/pages/ReportsListPage.tsx');
    expect(reports).toContain('pageQueryBlocked');
    expect(reports).not.toContain('hub-clients');
    expect(reports).not.toContain('hub-jobs');
    expect(reports).not.toContain('hub-quotes');
    expect(reports).not.toContain('hub-invoices');
    expect(reports).not.toContain('generatePdf');
    expect(reports).not.toContain('DashboardPage');
    expect(reports).not.toContain('Take5ListPage');
    expect(reports).not.toContain('JhaDocumentsPage');
    expect(reports).not.toContain('InspectionsPage');

    expect(src('src/pages/DashboardPage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/Take5ListPage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/JhaDocumentsPage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/InspectionsPage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/ClientsPage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('hub-reports');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('hub-reports');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-reports');
    expect(src('src/reports/generatePdf.ts')).not.toContain('hub-reports');
  });
});

describe('reports list shows existing reports and opens the existing route', () => {
  it('loads company reports with sent_at and opens /inspections/:id/report', () => {
    const page = src('src/pages/ReportsListPage.tsx');
    expect(page).toContain('REPORT_LIST_REPORT_COLUMNS');
    expect(page).toContain('reportOpenHref');
    expect(page).toContain('uploadedPdfOpenHref');
    expect(page).toContain("queryKey: ['all-reports']");
    expect(page).toContain('.eq(\'company_id\', companyId)');
    expect(page).toContain('getAuditDriveUploads');
    expect(page).toContain('getAuditEmptyList');
    expect(page).toContain('getAuditReportSendBundle');
    expect(page).toContain('pageQueryBlocked(foldersError)');
    expect(page).toContain('pageQueryBlocked(uploadsError)');
    expect(page).toContain('pageQueryBlocked(reportsError)');
    expect(page).not.toContain('/reports/');
    expect(page).not.toContain('/reports-advanced');
  });

  it('keeps /reports on the existing drive route — no new path', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('ReportsListPage');
    expect(app).toContain('path="/drive"');
    expect(app).toContain('path="/reports"');
    expect(app).toContain('<Navigate to="/drive" replace />');
    expect(app).toContain('path="/inspections/:id/report"');
    expect(app).toContain('path="/uploaded-pdfs/:id"');
  });
});
