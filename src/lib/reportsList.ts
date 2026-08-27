import { format, parseISO } from 'date-fns';
import { reportIsSent, reportSiteName, reportTemplateName } from './sendReport';

/** Existing report columns the /reports list already has — no new ledger. */
export const REPORT_LIST_REPORT_COLUMNS =
  'id, inspection_id, report_number, pdf_storage_path, sent_at, generated_at, folder_id, position_x, position_y';

export const REPORT_LIST_INSPECTION_COLUMNS =
  'id, meta, inspector_id, client_id, crm_job_id, status, template_snapshot';

export const REPORT_LIST_JOB_COLUMNS = 'id, address, title, job_number, client_id';
export const REPORT_LIST_CLIENT_COLUMNS = 'id, name';

/** Existing inspection report page — not a new report record path. */
export function reportOpenHref(inspectionId: string): string {
  const id = inspectionId.trim();
  return id ? `/inspections/${id}/report` : '/drive';
}

/** In-page open on the existing /drive list. Does not replace reportOpenHref. */
export function reportsListOpenHref(id: string): string {
  const trimmed = id.trim();
  return trimmed ? `/drive?id=${encodeURIComponent(trimmed)}` : '/drive';
}

export function parseReportsListOpenId(raw: string | null | undefined): string | null {
  const id = (raw ?? '').trim();
  return id || null;
}

export function reportsListOpened<T extends { id: string }>(
  rows: T[] | undefined,
  rawId: string | null | undefined,
): T | null {
  const id = parseReportsListOpenId(rawId);
  if (!id || !rows?.length) return null;
  return rows.find(row => row.id === id) ?? null;
}

export function reportsListJobLine(args: {
  jobNumber?: number | null;
  jobTitle?: string | null;
  clientName?: string | null;
  templateName?: string | null;
}): string {
  const job = args.jobNumber != null ? `#${padReportJobNumber(args.jobNumber)}` : '';
  const title = (args.jobTitle ?? '').trim();
  if (job && title) return `${job} ${title}`;
  if (title) return title;
  if (job) return job;
  return [args.clientName, args.templateName]
    .map(part => (part ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

/** Existing uploaded PDF viewer. */
export function uploadedPdfOpenHref(id: string): string {
  const pdfId = id.trim();
  return pdfId ? `/uploaded-pdfs/${pdfId}` : '/drive';
}

export function inspectionDriveOpenHref(args: {
  id: string;
  status?: string | null;
}): string {
  const id = args.id.trim();
  if (!id) return '/drive';
  const status = (args.status ?? '').trim();
  if (status === 'completed' || status === 'issued') return `/inspections/${id}/report`;
  return `/inspections/${id}`;
}

export function folderOpenHref(folderId: string): string {
  const id = folderId.trim();
  return id ? `/drive/folder/${id}` : '/drive';
}

export type ReportListJob = {
  address?: string | null;
  title?: string | null;
  job_number?: number | null;
};

export function reportListTitle(args: {
  meta?: Record<string, string | null> | null;
  job?: ReportListJob | null;
  reportNumber?: string | null;
}): string {
  const site = reportSiteName(args.meta, args.job);
  if (site && site !== 'Site') return site;
  const number = (args.reportNumber ?? '').trim();
  if (number) return number;
  return 'Inspection report';
}

export type ReportListStatus = 'sent' | 'ready' | 'no_pdf';

export function reportListStatus(args: {
  sent_at?: string | null;
  pdf_storage_path?: string | null;
}): ReportListStatus {
  if (reportIsSent(args.sent_at)) return 'sent';
  if ((args.pdf_storage_path ?? '').trim()) return 'ready';
  return 'no_pdf';
}

export function reportListStatusLabel(status: ReportListStatus): string {
  if (status === 'sent') return 'Sent';
  if (status === 'ready') return 'Ready';
  return 'No PDF';
}

export function formatReportListDate(iso: string | null | undefined): string | null {
  const raw = iso?.trim();
  if (!raw) return null;
  const parsed = parseISO(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, 'd MMM yyyy');
}

export function padReportJobNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

export function reportListMeta(args: {
  reportNumber?: string | null;
  generatedAt?: string | null;
  templateName?: string | null;
  clientName?: string | null;
  jobNumber?: number | null;
}): string {
  const number = args.reportNumber?.trim();
  const date = formatReportListDate(args.generatedAt);
  const template = (args.templateName ?? '').trim() || undefined;
  const client = args.clientName?.trim();
  const job = args.jobNumber != null ? `#${padReportJobNumber(args.jobNumber)}` : null;
  return [number, date, template, client, job].filter(Boolean).join(' · ');
}

export function reportListTemplateName(snapshot: { name?: string } | null | undefined): string {
  return reportTemplateName(snapshot);
}

export function normalizeReportSearch(raw: string): string {
  return raw.replace(/^#+/, '').trim().toLowerCase();
}

export type ReportSearchRow = {
  report_number?: string | null;
  siteName?: string | null;
  clientName?: string | null;
  templateName?: string | null;
  jobTitle?: string | null;
  jobNumber?: number | null;
};

export function reportSearchHaystack(row: ReportSearchRow): string {
  const bits: string[] = [
    row.report_number ?? '',
    row.siteName ?? '',
    row.clientName ?? '',
    row.templateName ?? '',
    row.jobTitle ?? '',
  ];
  if (row.jobNumber != null) {
    const raw = String(row.jobNumber);
    const padded = padReportJobNumber(row.jobNumber);
    bits.push(raw, padded, `#${padded}`);
  }
  return bits
    .filter(part => part.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

export function reportMatchesSearch(row: ReportSearchRow, query: string): boolean {
  const q = normalizeReportSearch(query);
  if (!q) return true;
  return reportSearchHaystack(row).includes(q);
}

export function filterReportsForSearch<T extends ReportSearchRow>(
  rows: T[],
  query: string,
): T[] {
  if (!normalizeReportSearch(query)) return rows;
  return rows.filter(row => reportMatchesSearch(row, query));
}

export type ReportListFilter = 'all' | 'ready' | 'sent';

export function filterReportsByStatus<T extends { listStatus: ReportListStatus }>(
  rows: T[],
  filter: ReportListFilter,
): T[] {
  if (filter === 'all') return rows;
  if (filter === 'ready') return rows.filter(row => row.listStatus === 'ready');
  return rows.filter(row => row.listStatus === 'sent');
}

/** Newest generated first. Report number is a stable tie-break. */
export function sortReportsForList<T extends {
  generated_at?: string | null;
  report_number?: string | null;
}>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.generated_at ?? '';
    const db = b.generated_at ?? '';
    if (da !== db) return db.localeCompare(da);
    return (b.report_number ?? '').localeCompare(a.report_number ?? '');
  });
}

export function reportsListEmptyTitle(args: {
  error?: boolean;
  search?: string;
  filter?: ReportListFilter;
  count: number;
}): string {
  if (args.error) return 'Could not load reports';
  if (normalizeReportSearch(args.search ?? '')) return 'No reports match your search';
  if (args.filter === 'sent') return 'No sent reports';
  if (args.filter === 'ready') return 'No reports ready';
  if (args.count === 0) return 'No reports yet';
  return '';
}

export function reportsListEmptyMessage(args: {
  search?: string;
  filter?: ReportListFilter;
  count: number;
}): string {
  if (normalizeReportSearch(args.search ?? '')) return 'Try a site, report number, job, or client.';
  if (args.filter === 'sent') return 'Sent reports show here after you email an existing PDF.';
  if (args.filter === 'ready') return 'Generate a PDF on an inspection and it will show here.';
  if (args.count === 0) return 'Generate a PDF on an inspection and it will show here.';
  return '';
}

export function fileItemMatchesSearch(args: {
  name: string;
  subtitle?: string;
  query: string;
}): boolean {
  const q = normalizeReportSearch(args.query);
  if (!q) return true;
  return `${args.name} ${args.subtitle ?? ''}`.toLowerCase().includes(q);
}
