import { describe, expect, it } from 'vitest';
import {
  AU_ADDRESS_PLACEHOLDER,
  AU_EMAIL_PLACEHOLDER,
  AU_PHONE_PLACEHOLDER,
  applyHubScope,
  clientHubRecordQueries,
  clientInspectionQuery,
  clientInvoiceMoney,
  clientListMoneyHint,
  clientListStatsQueries,
  clientMoneySummary,
  clientQuotedTotal,
  clientRecordHref,
  invoiceRecordHref,
  isCompanyAndClientScoped,
  isQuotedPipelineStatus,
  jobRecordHref,
  jobSiteAddressFromClient,
  mailtoHref,
  newInvoiceFromClientHref,
  newJobFromClientHref,
  newQuoteFromClientHref,
  quoteRecordHref,
  telHref,
} from './clientRecords';

describe('client record hrefs', () => {
  it('opens the client from the job hub chip', () => {
    expect(clientRecordHref('c1')).toBe('/clients/c1');
  });

  it('opens existing jobs, quotes, and invoices', () => {
    expect(jobRecordHref('job-1')).toBe('/jobs/job-1');
    expect(quoteRecordHref('q1')).toBe('/quotes?id=q1');
    expect(invoiceRecordHref('inv-1')).toBe('/invoices?id=inv-1');
  });

  it('starts quote, job, and invoice create with the client preselected', () => {
    expect(newQuoteFromClientHref('c1')).toBe('/quotes?client=c1');
    expect(newJobFromClientHref('c1')).toBe('/jobs?client=c1');
    expect(newInvoiceFromClientHref('c1')).toBe('/invoices?client=c1');
  });
});

describe('jobSiteAddressFromClient', () => {
  it('fills an empty job address from the client', () => {
    expect(jobSiteAddressFromClient('', '12 Site Rd')).toBe('12 Site Rd');
    expect(jobSiteAddressFromClient('   ', '12 Site Rd')).toBe('12 Site Rd');
  });

  it('does not overwrite an address already on the job', () => {
    expect(jobSiteAddressFromClient('Warehouse B', '12 Site Rd')).toBe('Warehouse B');
  });

  it('leaves the field empty when the client has no address', () => {
    expect(jobSiteAddressFromClient('', null)).toBe('');
    expect(jobSiteAddressFromClient('', undefined)).toBe('');
  });
});

describe('AU contact hrefs', () => {
  it('does not ship a US 555 placeholder', () => {
    expect(AU_PHONE_PLACEHOLDER).not.toMatch(/555/);
    expect(AU_PHONE_PLACEHOLDER).toMatch(/^04/);
    expect(AU_EMAIL_PLACEHOLDER).toMatch(/\.com\.au$/);
    expect(AU_ADDRESS_PLACEHOLDER).toMatch(/NSW|VIC|QLD|SA|WA|TAS|NT|ACT/);
  });

  it('builds tel: from spaced AU mobiles and +61 numbers', () => {
    expect(telHref('0412 345 678')).toBe('tel:0412345678');
    expect(telHref('+61 412 345 678')).toBe('tel:+61412345678');
    expect(telHref('  ')).toBeNull();
    expect(telHref(null)).toBeNull();
  });

  it('builds mailto: only for real emails', () => {
    expect(mailtoHref('alex@business.com.au')).toBe('mailto:alex@business.com.au');
    expect(mailtoHref('not-an-email')).toBeNull();
    expect(mailtoHref('')).toBeNull();
  });
});

describe('client money helpers', () => {
  const now = new Date(2026, 7, 20);

  it('quoted pipeline is draft + sent only', () => {
    expect(isQuotedPipelineStatus('draft')).toBe(true);
    expect(isQuotedPipelineStatus('sent')).toBe(true);
    expect(isQuotedPipelineStatus('accepted')).toBe(false);
    expect(isQuotedPipelineStatus('declined')).toBe(false);
    expect(isQuotedPipelineStatus('expired')).toBe(false);
  });

  it('sums quoted pipeline and ignores won or dead quotes', () => {
    expect(clientQuotedTotal([
      { status: 'draft', total: 100 },
      { status: 'sent', total: '250.50' },
      { status: 'accepted', total: 9000 },
      { status: 'declined', total: 40 },
      { status: 'expired', total: 40 },
    ])).toBe(350.5);
  });

  it('outstanding is unpaid sent + overdue; paid and draft stay off the card', () => {
    expect(clientInvoiceMoney([
      { status: 'draft', total: 50, due_date: '2026-08-01' },
      { status: 'sent', total: 200, due_date: '2026-08-25' },
      { status: 'sent', total: 75, due_date: '2026-08-19' },
      { status: 'paid', total: 999, due_date: '2026-08-01' },
      { status: 'overdue', total: 25, due_date: '2026-12-01' },
    ], now)).toEqual({ outstanding: 300, overdue: 100 });
  });

  it('treats NaN totals as zero so a supervisor figure does not become NaN', () => {
    expect(clientQuotedTotal([{ status: 'sent', total: 'nope' }])).toBe(0);
    expect(clientInvoiceMoney([{ status: 'sent', total: null, due_date: '2026-08-25' }], now))
      .toEqual({ outstanding: 0, overdue: 0 });
  });

  it('rolls quotes and invoices into the hub summary', () => {
    expect(clientMoneySummary(
      [{ status: 'sent', total: 400 }],
      [{ status: 'sent', total: 120, due_date: '2026-08-01' }],
      now,
    )).toEqual({ quoted: 400, outstanding: 120, overdue: 120 });
  });

  it('list hint prefers overdue, then outstanding, then quoted pipeline', () => {
    expect(clientListMoneyHint({ quoted: 50, outstanding: 10, overdue: 4 }))
      .toEqual({ label: 'Overdue', amount: 4, tone: 'overdue' });
    expect(clientListMoneyHint({ quoted: 50, outstanding: 10, overdue: 0 }))
      .toEqual({ label: 'Outstanding', amount: 10, tone: 'outstanding' });
    expect(clientListMoneyHint({ quoted: 50, outstanding: 0, overdue: 0 }))
      .toEqual({ label: 'Quoted', amount: 50, tone: 'quoted' });
    expect(clientListMoneyHint({ quoted: 0, outstanding: 0, overdue: 0 }))
      .toEqual({ label: 'Outstanding', amount: 0, tone: 'none' });
  });
});

describe('client hub query scopes', () => {
  it('detail jobs/quotes/invoices filter by this client and company', () => {
    const scopes = clientHubRecordQueries({ companyId: 'co1', clientId: 'c1' });
    expect(isCompanyAndClientScoped(scopes.jobs)).toBe(true);
    expect(isCompanyAndClientScoped(scopes.quotes)).toBe(true);
    expect(isCompanyAndClientScoped(scopes.invoices)).toBe(true);
    expect(scopes.jobs.eq).toEqual({ company_id: 'co1', client_id: 'c1' });
    expect(scopes.invoices.inFilters).toEqual({});
  });

  it('list stats queries are scoped to listed clients and company', () => {
    const scopes = clientListStatsQueries({ companyId: 'co1', clientIds: ['c1', 'c2'] });
    expect(scopes).not.toBeNull();
    for (const scope of [scopes!.jobs, scopes!.quotes, scopes!.invoices]) {
      expect(isCompanyAndClientScoped(scope)).toBe(true);
      expect(scope.eq.company_id).toBe('co1');
      expect(scope.inFilters.client_id).toEqual(['c1', 'c2']);
      expect(scope.eq.client_id).toBeUndefined();
    }
  });

  it('does not select the company ledger when the list is empty', () => {
    expect(clientListStatsQueries({ companyId: 'co1', clientIds: [] })).toBeNull();
  });

  it('applies company_id eq and client_id in — never an unscoped select', () => {
    const calls: string[] = [];
    const builder = {
      select(columns: string) {
        calls.push(`select:${columns}`);
        return this;
      },
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
      in(column: string, values: readonly string[]) {
        calls.push(`in:${column}:${values.join(',')}`);
        return this;
      },
    };
    const scopes = clientListStatsQueries({ companyId: 'co1', clientIds: ['c1', 'c2'] })!;
    applyHubScope(builder, scopes.invoices);
    expect(calls).toContain('eq:company_id:co1');
    expect(calls).toContain('in:client_id:c1,c2');
    expect(calls.some(call => call.startsWith('select:') && !call.includes('company_id'))).toBe(true);
    expect(calls.filter(call => call.startsWith('eq:client_id'))).toHaveLength(0);
  });
});

describe('client inspection query', () => {
  it('lists inspections by crm_job_id on the client jobs, not jobs.inspection_id', () => {
    const scope = clientInspectionQuery(['job-a', 'job-b']);
    expect(scope).not.toBeNull();
    expect(scope!.table).toBe('inspections');
    expect(scope!.inFilters).toEqual({ crm_job_id: ['job-a', 'job-b'] });
    expect(scope!.inFilters.id).toBeUndefined();
    expect(scope!.eq.id).toBeUndefined();
    expect(JSON.stringify(scope)).not.toContain('inspection_id');
  });

  it('does not scan inspections when the client has no jobs', () => {
    expect(clientInspectionQuery([])).toBeNull();
  });

  it('applies crm_job_id in when fetching', () => {
    const calls: string[] = [];
    const builder = {
      select(columns: string) {
        calls.push(`select:${columns}`);
        return this;
      },
      eq(column: string, value: string) {
        calls.push(`eq:${column}:${value}`);
        return this;
      },
      in(column: string, values: readonly string[]) {
        calls.push(`in:${column}:${values.join(',')}`);
        return this;
      },
    };
    applyHubScope(builder, clientInspectionQuery(['job-a'])!);
    expect(calls).toContain('in:crm_job_id:job-a');
    expect(calls.some(call => call.startsWith('in:id:'))).toBe(false);
  });
});
