import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  COMPANY_EXPORT_COLUMNS,
  COMPANY_EXPORT_FAILED,
  COMPANY_EXPORT_NO_COMPANY,
  COMPANY_EXPORT_PAGE_SIZE,
  COMPANY_EXPORT_SELECT,
  COMPANY_EXPORT_TABLES,
  buildCompanyExport,
  companyExportClientFromSupabase,
  companyExportFilename,
  csvCell,
  loadCompanyExportTable,
  loadCompanyExportTables,
  rowsToCsv,
  type CompanyExportClient,
  type CompanyExportTableName,
} from './companyExport';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function memoryClient(
  pages: Partial<Record<CompanyExportTableName, Array<Array<Record<string, unknown>>>>>,
  errors: Partial<Record<CompanyExportTableName, string>> = {},
): CompanyExportClient {
  return {
    async loadTablePage(table) {
      if (errors[table]) return { rows: null, error: { message: errors[table]! } };
      const queue = pages[table] ?? [[]];
      const rows = queue.shift() ?? [];
      return { rows, error: null };
    },
  };
}

describe('company export spreadsheet', () => {
  it('names one zip of the four existing tables', () => {
    expect(COMPANY_EXPORT_TABLES).toEqual(['clients', 'jobs', 'invoices', 'timesheets']);
    expect(companyExportFilename(new Date(2026, 7, 27))).toBe('company-records-2026-08-27.zip');
    expect(COMPANY_EXPORT_SELECT.clients).toContain('name');
    expect(COMPANY_EXPORT_SELECT.jobs).toContain('job_number');
    expect(COMPANY_EXPORT_SELECT.invoices).toContain('invoice_number');
    expect(COMPANY_EXPORT_SELECT.timesheets).toContain('total_minutes');
  });

  it('writes CSV cells Excel can open, including commas and objects', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('true');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell('Acme, Pty')).toBe('"Acme, Pty"');
    expect(csvCell('He said "go"')).toBe('"He said ""go"""');
    expect(csvCell(['a', 'b'])).toBe('["a","b"]');
    const csv = rowsToCsv(['id', 'name'], [{ id: 'c1', name: 'Northside, WA' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('id,name');
    expect(csv).toContain('c1,"Northside, WA"');
  });

  it('pages each table and stops when a page is short', async () => {
    const first = Array.from({ length: COMPANY_EXPORT_PAGE_SIZE }, (_, i) => ({ id: `c${i}` }));
    const loaded = await loadCompanyExportTable(
      memoryClient({ clients: [first, [{ id: 'c-last' }]] }),
      'clients',
      'co1',
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.rows).toHaveLength(COMPANY_EXPORT_PAGE_SIZE + 1);
    expect(loaded.rows.at(-1)).toEqual({ id: 'c-last' });
  });

  it('loads clients, jobs, invoices, and timesheets for this company', async () => {
    const loaded = await loadCompanyExportTables(
      memoryClient({
        clients: [[{ id: 'c1', name: 'Acme' }]],
        jobs: [[{ id: 'j1', title: 'Board' }]],
        invoices: [[{ id: 'i1', invoice_number: 12 }]],
        timesheets: [[{ id: 't1', total_minutes: 480 }]],
      }),
      'co1',
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.tables.clients).toHaveLength(1);
    expect(loaded.tables.jobs[0].title).toBe('Board');
    expect(loaded.tables.invoices[0].invoice_number).toBe(12);
    expect(loaded.tables.timesheets[0].total_minutes).toBe(480);
  });

  it('zips the four CSVs and refuses a blank company', async () => {
    const built = await buildCompanyExport(
      memoryClient({
        clients: [[{ id: 'c1', name: 'Acme' }]],
        jobs: [[]],
        invoices: [[{ id: 'i1', total: 110 }]],
        timesheets: [[]],
      }),
      { companyId: 'co1', now: new Date(2026, 7, 27) },
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.filename).toBe('company-records-2026-08-27.zip');
    expect(built.counts).toEqual({ clients: 1, jobs: 0, invoices: 1, timesheets: 0 });
    const zip = await JSZip.loadAsync(await built.blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['clients.csv', 'invoices.csv', 'jobs.csv', 'timesheets.csv']);
    const clients = await zip.file('clients.csv')!.async('string');
    expect(clients).toContain(COMPANY_EXPORT_COLUMNS.clients.join(','));
    expect(clients).toContain('Acme');
    const jobs = await zip.file('jobs.csv')!.async('string');
    expect(jobs).toContain('job_number');

    const miss = await buildCompanyExport(memoryClient({}), { companyId: '  ' });
    expect(miss).toEqual({ ok: false, message: COMPANY_EXPORT_NO_COMPANY });
    const fail = await buildCompanyExport(memoryClient({}, { invoices: 'permission denied' }), {
      companyId: 'co1',
    });
    expect(fail).toEqual({ ok: false, message: 'permission denied' });
    expect(COMPANY_EXPORT_FAILED).toMatch(/company records/);
  });

  it('reads each table through company_id on the existing supabase client', async () => {
    const calls: Array<{ table: string; columns: string; companyId: string; from: number; to: number }> = [];
    const client = companyExportClientFromSupabase({
      from(table: string) {
        return {
          select(columns: string) {
            return {
              eq(column: string, companyId: string) {
                expect(column).toBe('company_id');
                return {
                  order(col: string, opts: { ascending: boolean }) {
                    expect(col).toBe('created_at');
                    expect(opts.ascending).toBe(true);
                    return {
                      async range(from: number, to: number) {
                        calls.push({ table, columns, companyId, from, to });
                        return { data: [], error: null };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    });
    const loaded = await loadCompanyExportTables(client, 'co-9');
    expect(loaded.ok).toBe(true);
    expect(calls.map(c => c.table)).toEqual(['clients', 'jobs', 'invoices', 'timesheets']);
    expect(calls.every(c => c.companyId === 'co-9' && c.from === 0 && c.to === COMPANY_EXPORT_PAGE_SIZE - 1)).toBe(true);
    expect(calls[0].columns).toBe(COMPANY_EXPORT_SELECT.clients);
    expect(calls[2].columns).toBe(COMPANY_EXPORT_SELECT.invoices);
  });
});

describe('company export floor isolation', () => {
  const helper = src('src/lib/companyExport.ts');
  const settings = src('src/pages/CompanySettingsPage.tsx');
  const app = src('src/App.tsx');

  it('rides /settings/company with one admin download of those four tables', () => {
    expect(app).toContain('path="/settings/company"');
    expect(app).not.toContain('path="/settings/export"');
    expect(app).not.toContain('path="/export"');
    expect(app).not.toContain('path="/settings/backup"');
    expect(app).not.toContain('path="/settings/notifications"');
    expect(settings).toContain('downloadCompanyExport');
    expect(settings).toContain('companyExportClientFromSupabase');
    expect(settings).toContain('Download spreadsheet');
    expect(settings).toContain('isAdmin &&');
    expect(settings).toContain('clients, jobs, invoices, and timesheets');
    expect(helper).toContain('from(table)');
    expect(helper).toContain(".eq('company_id', companyId)");
    expect(helper).toContain('`${table}.csv`');
    expect(helper).toContain("'clients'");
    expect(helper).toContain("'jobs'");
    expect(helper).toContain("'invoices'");
    expect(helper).toContain("'timesheets'");
  });

  it('does not invent a backups product, Google sheet, or a new settings path', () => {
    expect(helper).not.toMatch(/google/i);
    expect(helper).not.toContain('spreadsheets.google');
    expect(helper).not.toContain('localBackup');
    expect(helper).not.toContain('downloadBackupFiles');
    expect(helper).not.toContain('/settings/backup');
    expect(helper).not.toContain('/settings/notifications');
    expect(settings).not.toMatch(/google/i);
    expect(settings).not.toContain('/settings/backup');
    expect(settings).not.toContain('/settings/notifications');
    expect(existsSync(resolve(process.cwd(), 'src/pages/BackupSettingsPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/NotificationsSettingsPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/CompanyExportPage.tsx'))).toBe(false);
  });

  it('stays on CompanySettingsPage plus this helper and does not restyle the company form', () => {
    expect(settings).toContain('Company Name');
    expect(settings).toContain('How clients pay');
    expect(settings).toContain('persistCompanyLogo');
    expect(settings).toContain('report_theme');
    expect(settings).toContain('Save Changes');
    expect(settings).not.toContain('className="col-span-2"');
    expect(helper).not.toContain('report_theme');
    expect(helper).not.toContain('logo_url');
    expect(helper).not.toContain('TimesheetsPage');
    expect(helper).not.toContain('timesheetsList');
    expect(helper).not.toContain('TeamSettingsPage');
    expect(helper).not.toContain('CompliancePage');
    expect(helper).not.toContain('GlobalSearch');
    expect(helper).not.toContain('AppShell');
    expect(helper).not.toContain('AccountingSettingsPage');
    expect(helper).not.toContain('DashboardPage');
    expect(helper).not.toContain('ReportsListPage');
    expect(helper).not.toContain('ProfileSettingsPage');
    expect(src('src/components/search/GlobalSearch.tsx')).not.toContain('companyExport');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('companyExport');
    expect(src('src/pages/TimesheetsPage.tsx')).not.toContain('companyExport');
    expect(src('src/lib/timesheetsList.ts')).not.toContain('companyExport');
    expect(src('src/pages/TeamSettingsPage.tsx')).not.toContain('companyExport');
    expect(src('src/pages/CompliancePage.tsx')).not.toContain('companyExport');
    expect(src('src/pages/ProfileSettingsPage.tsx')).not.toContain('companyExport');
    expect(src('src/pages/ManagedListsSettingsPage.tsx')).not.toContain('companyExport');
    expect(src('src/pages/AiSettingsPage.tsx')).not.toContain('companyExport');
    expect(src('src/pages/AccountingSettingsPage.tsx')).not.toContain('companyExport');
    expect(src('src/pages/ReportsListPage.tsx')).not.toContain('companyExport');
    expect(src('src/pages/DashboardPage.tsx')).not.toContain('companyExport');
    expect(src('src/index.css')).not.toContain('company-export');
    expect(src('src/index.css')).not.toContain('companyExport');
  });
});
