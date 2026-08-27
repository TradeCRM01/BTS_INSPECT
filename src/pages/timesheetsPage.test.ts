import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Timesheets page floor wiring', () => {
  const list = src('src/pages/TimesheetsPage.tsx');
  const helper = src('src/lib/timesheetsList.ts');
  const app = src('src/App.tsx');

  it('lists this week’s timesheets and opens one on the existing /timesheets path', () => {
    expect(list).toContain('TIMESHEET_LIST_DEFAULT_FILTER');
    expect(list).toContain('timesheetListVisibleItems');
    expect(list).toContain('timesheetListOpenHref');
    expect(list).toContain('timesheetListOpenId');
    expect(list).toContain('aria-label="Filter timesheets"');
    expect(list).toContain('TIMESHEET_LIST_FILTERS');
    expect(helper).toContain("export const TIMESHEET_LIST_DEFAULT_FILTER: TimesheetListFilter = 'all'");
    expect(helper).toContain('return `/timesheets?${params.toString()}`');
    expect(list).toContain('searchParams.get(\'id\')');
    expect(list).toContain('>Open</span>');
    expect(list).toContain('getAuditTeamMembers');
    expect(list).toContain('getAuditJobs');
    expect(list).toContain('getAuditTimesheets');
    expect(list).toContain('hub-timesheets');
    expect(list).toContain('hub-timesheets-row');
    expect(list).toContain('hub-timesheets-pill');
  });

  it('does not add a timesheet route, payroll product, or spreadsheet export', () => {
    expect(app).toContain('<Route path="/timesheets"');
    expect(app).not.toContain('path="/timesheets/:');
    expect(app).not.toContain('path="/payroll"');
    expect(list).not.toContain('/payroll');
    expect(list).not.toContain('spreadsheet');
    expect(list).not.toContain('xlsx');
    expect(helper).not.toContain('/payroll');
    expect(existsSync(resolve(process.cwd(), 'src/pages/PayrollPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/TimesheetExportPage.tsx'))).toBe(false);
  });

  it('stays on TimesheetsPage plus the list helper and does not import isolated floors', () => {
    expect(list).not.toContain('InspectionReviewPage');
    expect(list).not.toContain('InspectionsPage');
    expect(list).not.toContain('inspectionsList');
    expect(list).not.toContain('JhaDocumentsPage');
    expect(list).not.toContain('jhaList');
    expect(list).not.toContain('Take5ListPage');
    expect(list).not.toContain('take5List');
    expect(list).not.toContain('ReportsListPage');
    expect(list).not.toContain('reportsList');
    expect(list).not.toContain('DashboardPage');
    expect(list).not.toContain('dashboardHome');
    expect(list).not.toContain('ClientsPage');
    expect(list).not.toContain('clientsFloor');
    expect(list).not.toContain('SchedulePage');
    expect(list).not.toContain('scheduleBoard');
    expect(list).not.toContain('JobsPage');
    expect(helper).not.toContain('inspectionsList');
    expect(helper).not.toContain('take5List');
    expect(helper).not.toContain('jhaList');
    expect(helper).not.toContain('clientsFloor');
    expect(helper).not.toContain('dashboardHome');
    expect(helper).not.toContain('reportsList');
    expect(list).not.toContain('hub-reports');
    expect(list).not.toContain('hub-take5');
    expect(list).not.toContain('hub-jha');
    expect(list).not.toContain('hub-inspections');
  });
});
