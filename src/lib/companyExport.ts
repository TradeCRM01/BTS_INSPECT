import JSZip from 'jszip';

/** Existing company tables a one-tap spreadsheet export can dump. */
export const COMPANY_EXPORT_TABLES = ['clients', 'jobs', 'invoices', 'timesheets'] as const;

export type CompanyExportTableName = (typeof COMPANY_EXPORT_TABLES)[number];

export const COMPANY_EXPORT_PAGE_SIZE = 1000;

export const COMPANY_EXPORT_NO_COMPANY = 'No company to export.';
export const COMPANY_EXPORT_FAILED = 'Could not download company records.';

export const COMPANY_EXPORT_COLUMNS: Record<CompanyExportTableName, readonly string[]> = {
  clients: ['id', 'name', 'contact_person', 'phone', 'email', 'address', 'notes', 'archived', 'created_at'],
  jobs: [
    'id',
    'job_number',
    'title',
    'description',
    'status',
    'priority',
    'client_id',
    'scheduled_date',
    'start_time',
    'end_time',
    'address',
    'assigned_team',
    'created_at',
  ],
  invoices: [
    'id',
    'invoice_number',
    'status',
    'client_id',
    'job_id',
    'quote_id',
    'subtotal',
    'tax_rate',
    'tax_amount',
    'total',
    'payment_terms',
    'due_date',
    'notes',
    'created_at',
  ],
  timesheets: [
    'id',
    'employee_id',
    'date',
    'clock_in',
    'clock_out',
    'break_minutes',
    'total_minutes',
    'status',
    'notes',
    'created_at',
  ],
};

export const COMPANY_EXPORT_SELECT: Record<CompanyExportTableName, string> = {
  clients: COMPANY_EXPORT_COLUMNS.clients.join(', '),
  jobs: COMPANY_EXPORT_COLUMNS.jobs.join(', '),
  invoices: COMPANY_EXPORT_COLUMNS.invoices.join(', '),
  timesheets: COMPANY_EXPORT_COLUMNS.timesheets.join(', '),
};

export type CompanyExportTables = Record<CompanyExportTableName, Array<Record<string, unknown>>>;

export type CompanyExportClient = {
  loadTablePage: (
    table: CompanyExportTableName,
    companyId: string,
    from: number,
    to: number,
  ) => Promise<{ rows: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
};

export type CompanyExportOk = {
  ok: true;
  blob: Blob;
  filename: string;
  counts: Record<CompanyExportTableName, number>;
};

export type CompanyExportMiss = {
  ok: false;
  message: string;
};

export function companyExportFilename(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `company-records-${y}-${m}-${d}.zip`;
}

export function csvCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const text = Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function rowsToCsv(columns: readonly string[], rows: Array<Record<string, unknown>>): string {
  const header = columns.join(',');
  const body = rows.map(row => columns.map(col => csvCell(row[col])).join(','));
  return [`\uFEFF${header}`, ...body].join('\n');
}

export async function loadCompanyExportTable(
  client: CompanyExportClient,
  table: CompanyExportTableName,
  companyId: string,
): Promise<{ ok: true; rows: Array<Record<string, unknown>> } | CompanyExportMiss> {
  const rows: Array<Record<string, unknown>> = [];
  let from = 0;
  for (;;) {
    const page = await client.loadTablePage(table, companyId, from, from + COMPANY_EXPORT_PAGE_SIZE - 1);
    if (page.error) {
      return { ok: false, message: page.error.message || `Could not load ${table}.` };
    }
    const batch = page.rows ?? [];
    rows.push(...batch);
    if (batch.length < COMPANY_EXPORT_PAGE_SIZE) break;
    from += COMPANY_EXPORT_PAGE_SIZE;
  }
  return { ok: true, rows };
}

export async function loadCompanyExportTables(
  client: CompanyExportClient,
  companyId: string,
): Promise<{ ok: true; tables: CompanyExportTables } | CompanyExportMiss> {
  const tables = {} as CompanyExportTables;
  for (const table of COMPANY_EXPORT_TABLES) {
    const loaded = await loadCompanyExportTable(client, table, companyId);
    if (!loaded.ok) return loaded;
    tables[table] = loaded.rows;
  }
  return { ok: true, tables };
}

export async function zipCompanyExportTables(tables: CompanyExportTables): Promise<Blob> {
  const zip = new JSZip();
  for (const table of COMPANY_EXPORT_TABLES) {
    zip.file(`${table}.csv`, rowsToCsv(COMPANY_EXPORT_COLUMNS[table], tables[table]));
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new Blob([bytes], { type: 'application/zip' });
}

export function downloadCompanyExportBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// supabase-js builders are wider than this client; we only call these methods.
export function companyExportClientFromSupabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
): CompanyExportClient {
  return {
    async loadTablePage(table, companyId, from, to) {
      const { data, error } = await supabase
        .from(table)
        .select(COMPANY_EXPORT_SELECT[table])
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .range(from, to);
      return { rows: data ?? null, error };
    },
  };
}

export async function buildCompanyExport(
  client: CompanyExportClient,
  args: { companyId: string; now?: Date },
): Promise<CompanyExportOk | CompanyExportMiss> {
  const companyId = args.companyId.trim();
  if (!companyId) return { ok: false, message: COMPANY_EXPORT_NO_COMPANY };
  const loaded = await loadCompanyExportTables(client, companyId);
  if (!loaded.ok) return loaded;
  const blob = await zipCompanyExportTables(loaded.tables);
  const counts = {
    clients: loaded.tables.clients.length,
    jobs: loaded.tables.jobs.length,
    invoices: loaded.tables.invoices.length,
    timesheets: loaded.tables.timesheets.length,
  };
  return { ok: true, blob, filename: companyExportFilename(args.now), counts };
}

export async function downloadCompanyExport(
  client: CompanyExportClient,
  args: { companyId: string; now?: Date },
): Promise<CompanyExportOk | CompanyExportMiss> {
  const built = await buildCompanyExport(client, args);
  if (!built.ok) return built;
  try {
    downloadCompanyExportBlob(built.blob, built.filename);
    return built;
  } catch {
    return { ok: false, message: COMPANY_EXPORT_FAILED };
  }
}
