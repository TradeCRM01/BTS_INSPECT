import { supabase } from './supabase';
import { padQuoteNumber } from './quoteJobFields';
import { formatMoney } from '../types/fsm';
import { chunkIds, JOB_ID_BATCH } from './jobIdBatch';

export type JobDocChip = {
  kind: 'quote' | 'invoice';
  id: string;
  href: string;
  label: string;
  amount: string;
  status?: string;
  due_date?: string | null;
};

export { JOB_ID_BATCH };

export const JOB_EXTRAS_QUOTE_SELECT = 'id, job_id, quote_number, status, total';
export const JOB_EXTRAS_INVOICE_SELECT = 'id, job_id, invoice_number, status, total, due_date';
export const JOB_EXTRAS_QUOTE_COLUMNS = ['id', 'job_id', 'quote_number', 'status', 'total'] as const;
export const JOB_EXTRAS_INVOICE_COLUMNS = ['id', 'job_id', 'invoice_number', 'status', 'total', 'due_date'] as const;

type ExtrasRow = Record<string, unknown> & { job_id?: string | null };

type ExtrasInBuilder = {
  in: (column: string, ids: string[]) => Promise<{
    data: ExtrasRow[] | null;
    error: { message: string } | null;
  }>;
};

export type JobExtrasClient = {
  from: (table: string) => {
    select: (columns: string) => ExtrasInBuilder;
  };
};

async function selectInBatches(
  client: JobExtrasClient,
  table: string,
  columns: string,
  filterCol: string,
  ids: string[],
): Promise<ExtrasRow[]> {
  const rows: ExtrasRow[] = [];
  for (const batch of chunkIds(ids)) {
    const { data, error } = await client.from(table).select(columns).in(filterCol, batch);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

export async function loadJobCardExtras(
  jobs: { id: string; inspection_id?: string | null }[],
  client: JobExtrasClient = supabase as unknown as JobExtrasClient,
): Promise<{ docsByJob: Map<string, JobDocChip[]> }> {
  const docsByJob = new Map<string, JobDocChip[]>();
  if (jobs.length === 0) return { docsByJob };

  const jobIds = jobs.map((job) => job.id);
  const [quotes, invoices] = await Promise.all([
    selectInBatches(client, 'quotes', JOB_EXTRAS_QUOTE_SELECT, 'job_id', jobIds),
    selectInBatches(client, 'invoices', JOB_EXTRAS_INVOICE_SELECT, 'job_id', jobIds),
  ]);

  const push = (jobId: string | null | undefined, chip: JobDocChip) => {
    if (!jobId) return;
    const list = docsByJob.get(jobId) ?? [];
    list.push(chip);
    docsByJob.set(jobId, list);
  };

  for (const quote of quotes) {
    push(quote.job_id as string | null, {
      kind: 'quote',
      id: String(quote.id),
      href: `/quotes?id=${quote.id}`,
      label: `QT #${padQuoteNumber(quote.quote_number as number | null)} · ${String(quote.status)}`,
      amount: formatMoney(Number(quote.total)),
    });
  }
  for (const inv of invoices) {
    const num = String(inv.invoice_number ?? 0).padStart(4, '0');
    push(inv.job_id as string | null, {
      kind: 'invoice',
      id: String(inv.id),
      href: `/invoices?id=${inv.id}`,
      label: `INV #${num} · ${String(inv.status)}`,
      amount: formatMoney(Number(inv.total)),
      status: String(inv.status),
      due_date: (inv.due_date as string | null) ?? null,
    });
  }

  return { docsByJob };
}
