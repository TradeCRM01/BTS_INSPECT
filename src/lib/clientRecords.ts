import { invoiceHref } from './invoiceFromQuote';
import { effectiveInvoiceStatus } from './invoiceStatus';

export function clientRecordHref(clientId: string): string {
  return `/clients/${clientId}`;
}

export function jobRecordHref(jobId: string): string {
  return `/jobs/${jobId}`;
}

export function quoteRecordHref(quoteId: string): string {
  return `/quotes?id=${encodeURIComponent(quoteId)}`;
}

export function invoiceRecordHref(invoiceId: string): string {
  return invoiceHref(invoiceId);
}

/** Opens the existing quote editor with this client already selected. */
export function newQuoteFromClientHref(clientId: string): string {
  return `/quotes?client=${encodeURIComponent(clientId)}`;
}

/** Opens the existing job create flow with this client already selected. */
export function newJobFromClientHref(clientId: string): string {
  return `/jobs?client=${encodeURIComponent(clientId)}`;
}

/** Opens the existing invoice editor with this client already selected. */
export function newInvoiceFromClientHref(clientId: string): string {
  return `/invoices?client=${encodeURIComponent(clientId)}`;
}

/** Copy the client's site onto a new job when the address field is still empty. */
export function jobSiteAddressFromClient(
  currentAddress: string,
  clientAddress: string | null | undefined,
): string {
  if (currentAddress.trim()) return currentAddress;
  return (clientAddress ?? '').trim();
}

export const AU_PHONE_PLACEHOLDER = '0412 345 678';
export const AU_EMAIL_PLACEHOLDER = 'name@business.com.au';
export const AU_ADDRESS_PLACEHOLDER = '12 Smith St, Suburb NSW 2000';

/** Digits (and a leading +) so `tel:` works with spaced AU numbers. */
export function telHref(phone: string | null | undefined): string | null {
  const raw = (phone ?? '').trim();
  if (!raw) return null;
  const compact = raw.replace(/[^\d+]/g, '');
  if (!compact || compact === '+') return null;
  return `tel:${compact}`;
}

export function mailtoHref(email: string | null | undefined): string | null {
  const raw = (email ?? '').trim();
  if (!raw || !raw.includes('@')) return null;
  return `mailto:${raw}`;
}

export type QuoteMoneyRow = {
  status: string;
  total?: number | string | null;
};

export type InvoiceMoneyRow = {
  status: string;
  total?: number | string | null;
  due_date?: string | null;
};

export type ClientMoneySummary = {
  quoted: number;
  outstanding: number;
  overdue: number;
};

/** Live quote pipeline — draft/sent only. Accepted is won work, not quoted. */
export function isQuotedPipelineStatus(status: string): boolean {
  return status === 'draft' || status === 'sent';
}

export function sumMoney(amount: number | string | null | undefined): number {
  const n = Number(amount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function clientQuotedTotal(quotes: QuoteMoneyRow[]): number {
  return quotes.reduce((sum, quote) => (
    isQuotedPipelineStatus(quote.status) ? sum + sumMoney(quote.total) : sum
  ), 0);
}

export function clientInvoiceMoney(
  invoices: InvoiceMoneyRow[],
  now = new Date(),
): Pick<ClientMoneySummary, 'outstanding' | 'overdue'> {
  let outstanding = 0;
  let overdue = 0;
  for (const inv of invoices) {
    const status = effectiveInvoiceStatus(inv, now);
    const amount = sumMoney(inv.total);
    if (status === 'overdue') {
      overdue += amount;
      outstanding += amount;
    } else if (status === 'sent') {
      outstanding += amount;
    }
  }
  return { outstanding, overdue };
}

export function clientMoneySummary(
  quotes: QuoteMoneyRow[],
  invoices: InvoiceMoneyRow[],
  now = new Date(),
): ClientMoneySummary {
  const { outstanding, overdue } = clientInvoiceMoney(invoices, now);
  return {
    quoted: clientQuotedTotal(quotes),
    outstanding,
    overdue,
  };
}

/** Copy phone/email/site onto a job or quote form that can display them. */
export function clientContactCopiedOntoForm(client: {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
} | null | undefined): { phone: string; email: string; address: string } {
  return {
    phone: (client?.phone ?? '').trim(),
    email: (client?.email ?? '').trim(),
    address: (client?.address ?? '').trim(),
  };
}

export type VisibleClientContact = {
  kind: 'tel' | 'mailto' | 'map';
  label: string;
  href: string;
};

export function mapsHref(query: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

/** Readable identity lines a tradie can tap — not icon-only. */
export function visibleClientContacts(client: {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}): VisibleClientContact[] {
  const lines: VisibleClientContact[] = [];
  const phone = (client.phone ?? '').trim();
  const call = telHref(phone);
  if (call) lines.push({ kind: 'tel', label: phone, href: call });
  const email = (client.email ?? '').trim();
  const mail = mailtoHref(email);
  if (mail) lines.push({ kind: 'mailto', label: email, href: mail });
  const address = (client.address ?? '').trim();
  if (address) lines.push({ kind: 'map', label: address, href: mapsHref(address) });
  return lines;
}

/** Quote/invoice “to” line: site plus phone/email so they are not retyped. */
export function quoteClientDetailFromClient(
  client: { address?: string | null; phone?: string | null; email?: string | null } | null | undefined,
  site?: string | null,
): string | null {
  const copied = clientContactCopiedOntoForm(client);
  const parts = [((site ?? '').trim() || copied.address), copied.phone, copied.email].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export type ClientListMoneyHint = {
  label: 'Overdue' | 'Outstanding' | 'Quoted';
  amount: number;
  tone: 'overdue' | 'outstanding' | 'quoted' | 'none';
};

export type ClientListActivity = {
  money: ClientListMoneyHint;
  jobs: number;
  live: number;
};

export function clientListActivity(stats: {
  quoted: number;
  outstanding: number;
  overdue: number;
  jobCount: number;
  activeJobs: number;
}): ClientListActivity {
  return {
    money: clientListMoneyHint({
      quoted: stats.quoted,
      outstanding: stats.outstanding,
      overdue: stats.overdue,
    }),
    jobs: stats.jobCount,
    live: stats.activeJobs,
  };
}

export function clientHubStartAction(kind: 'job' | 'quote' | 'invoice', clientId: string): { href: string; label: string } {
  if (kind === 'quote') return { href: newQuoteFromClientHref(clientId), label: 'New quote' };
  if (kind === 'invoice') return { href: newInvoiceFromClientHref(clientId), label: 'New invoice' };
  return { href: newJobFromClientHref(clientId), label: 'New job' };
}

export type ClientHubStatusTone = 'overdue' | 'live' | 'quoted' | 'idle' | 'archived';

export type ClientHubStatus = {
  label: string;
  tone: ClientHubStatusTone;
  className: 'ops-status-bad' | 'ops-status-progress' | 'ops-status-info' | 'ops-status-wait';
};

/** Solid ops status for the client row — not a pastel pill. */
export function clientHubStatus(stats: {
  archived?: boolean;
  overdue: number;
  live: number;
  quoted: number;
}): ClientHubStatus {
  if (stats.archived) return { label: 'Archived', tone: 'archived', className: 'ops-status-wait' };
  if (stats.overdue > 0) return { label: 'Overdue', tone: 'overdue', className: 'ops-status-bad' };
  if (stats.live > 0) return { label: 'Live', tone: 'live', className: 'ops-status-progress' };
  if (stats.quoted > 0) return { label: 'Quoted', tone: 'quoted', className: 'ops-status-info' };
  return { label: 'Idle', tone: 'idle', className: 'ops-status-wait' };
}

/** Next on the client row: chase/open the card, or start a job when there is nothing on it. */
export function clientHubNext(args: {
  clientId: string;
  jobCount: number;
  overdue: number;
}): { label: string; href: string } {
  if (args.overdue > 0 || args.jobCount > 0) {
    return { label: 'Open', href: clientRecordHref(args.clientId) };
  }
  return clientHubStartAction('job', args.clientId);
}

/** List rows: who owes first, then who has live quotes. */
export function clientListMoneyHint(money: ClientMoneySummary): ClientListMoneyHint {
  if (money.overdue > 0) {
    return { label: 'Overdue', amount: money.overdue, tone: 'overdue' };
  }
  if (money.outstanding > 0) {
    return { label: 'Outstanding', amount: money.outstanding, tone: 'outstanding' };
  }
  if (money.quoted > 0) {
    return { label: 'Quoted', amount: money.quoted, tone: 'quoted' };
  }
  return { label: 'Outstanding', amount: 0, tone: 'none' };
}

export type HubQueryScope = {
  table: 'jobs' | 'quotes' | 'invoices' | 'inspections';
  columns: string;
  eq: Record<string, string>;
  inFilters: Record<string, string[]>;
};

type HubFilterBuilder = {
  eq: (column: string, value: string) => HubFilterBuilder;
  in: (column: string, values: readonly string[]) => HubFilterBuilder;
};

export function applyHubScope<T>(
  fromBuilder: { select: (columns: string) => T },
  scope: HubQueryScope,
): T {
  let q = fromBuilder.select(scope.columns) as T & HubFilterBuilder;
  for (const [column, value] of Object.entries(scope.eq)) {
    q = q.eq(column, value) as typeof q;
  }
  for (const [column, values] of Object.entries(scope.inFilters)) {
    q = q.in(column, values) as typeof q;
  }
  return q;
}

export function clientHubRecordQueries(args: {
  companyId: string;
  clientId: string;
}): { jobs: HubQueryScope; quotes: HubQueryScope; invoices: HubQueryScope } {
  const eq = { company_id: args.companyId, client_id: args.clientId };
  return {
    jobs: {
      table: 'jobs',
      columns: 'id, job_number, title, status, scheduled_date, start_time, address, assigned_team',
      eq,
      inFilters: {},
    },
    quotes: {
      table: 'quotes',
      columns: 'id, quote_number, status, total, description, job_id, client_id, line_items',
      eq,
      inFilters: {},
    },
    invoices: {
      table: 'invoices',
      columns: 'id, invoice_number, status, total, due_date, quote_id, client_id',
      eq,
      inFilters: {},
    },
  };
}

/**
 * Inspections for this client's jobs via inspections.crm_job_id.
 * Never jobs.inspection_id. Null when there are no jobs — do not scan the table.
 */
export function clientInspectionQuery(jobIds: string[]): HubQueryScope | null {
  if (jobIds.length === 0) return null;
  return {
    table: 'inspections',
    columns: 'id, status, started_at, template_snapshot, crm_job_id, meta, responses',
    eq: {},
    inFilters: { crm_job_id: jobIds },
  };
}

/**
 * List-page money/activity. Scoped to the rows on screen + company.
 * Null when there are no clients — do not select the whole company ledger.
 */
export function clientListStatsQueries(args: {
  companyId: string;
  clientIds: string[];
}): { jobs: HubQueryScope; quotes: HubQueryScope; invoices: HubQueryScope } | null {
  if (args.clientIds.length === 0) return null;
  const eq = { company_id: args.companyId };
  const inFilters = { client_id: args.clientIds };
  return {
    jobs: {
      table: 'jobs',
      columns: 'client_id, status, scheduled_date',
      eq,
      inFilters,
    },
    quotes: {
      table: 'quotes',
      columns: 'client_id, status, total',
      eq,
      inFilters,
    },
    invoices: {
      table: 'invoices',
      columns: 'client_id, status, total, due_date',
      eq,
      inFilters,
    },
  };
}

export function isCompanyAndClientScoped(scope: HubQueryScope): boolean {
  if (!scope.eq.company_id) return false;
  if (scope.eq.client_id) return true;
  return (scope.inFilters.client_id?.length ?? 0) > 0;
}

export function isNarrowProjection(scope: HubQueryScope): boolean {
  const columns = scope.columns.trim();
  return columns.length > 0 && columns !== '*';
}

/** True when a fetch would read the whole company table instead of this client set. */
export function wouldScanCompanyLedger(scope: HubQueryScope | null): boolean {
  if (scope == null) return false;
  return !isCompanyAndClientScoped(scope);
}
