import { supabase } from './supabase';
import { padQuoteNumber } from './quoteJobFields';
import { formatMoney } from '../types/fsm';

export type JobDocChip = {
  kind: 'quote' | 'invoice';
  id: string;
  href: string;
  label: string;
  amount: string;
};

export async function loadJobCardExtras(jobs: { id: string; inspection_id: string | null }[]): Promise<{
  photoByJob: Map<string, string>;
  docsByJob: Map<string, JobDocChip[]>;
}> {
  const photoByJob = new Map<string, string>();
  const docsByJob = new Map<string, JobDocChip[]>();
  if (jobs.length === 0) return { photoByJob, docsByJob };

  const jobIds = jobs.map(j => j.id);
  const inspectionToJob = new Map<string, string>();
  for (const job of jobs) {
    if (job.inspection_id) inspectionToJob.set(job.inspection_id, job.id);
  }

  const { data: inspections } = await supabase
    .from('inspections')
    .select('id, crm_job_id')
    .in('crm_job_id', jobIds);
  for (const row of inspections ?? []) {
    if (row.crm_job_id) inspectionToJob.set(row.id, row.crm_job_id as string);
  }

  const inspectionIds = [...inspectionToJob.keys()];
  if (inspectionIds.length > 0) {
    const { data: photos } = await supabase
      .from('photos')
      .select('inspection_id, storage_path, uploaded_at')
      .in('inspection_id', inspectionIds)
      .order('uploaded_at', { ascending: false });
    const seen = new Set<string>();
    const toSign: { jobId: string; path: string }[] = [];
    for (const photo of photos ?? []) {
      const jobId = inspectionToJob.get(photo.inspection_id);
      if (!jobId || seen.has(jobId)) continue;
      seen.add(jobId);
      toSign.push({ jobId, path: photo.storage_path });
    }
    await Promise.all(toSign.map(async ({ jobId, path }) => {
      const { data } = await supabase.storage.from('photos').createSignedUrl(path, 3600);
      if (data?.signedUrl) photoByJob.set(jobId, data.signedUrl);
    }));
  }

  const [{ data: quotes }, { data: invoices }] = await Promise.all([
    supabase.from('quotes').select('id, job_id, quote_number, status, total').in('job_id', jobIds),
    supabase.from('invoices').select('id, job_id, invoice_number, status, total').in('job_id', jobIds),
  ]);

  const push = (jobId: string | null, chip: JobDocChip) => {
    if (!jobId) return;
    const list = docsByJob.get(jobId) ?? [];
    list.push(chip);
    docsByJob.set(jobId, list);
  };

  for (const q of quotes ?? []) {
    push(q.job_id, {
      kind: 'quote',
      id: q.id,
      href: `/quotes?id=${q.id}`,
      label: `QT #${padQuoteNumber(q.quote_number)} · ${String(q.status)}`,
      amount: formatMoney(Number(q.total)),
    });
  }
  for (const inv of invoices ?? []) {
    const num = String(inv.invoice_number ?? 0).padStart(4, '0');
    push(inv.job_id, {
      kind: 'invoice',
      id: inv.id,
      href: `/invoices?id=${inv.id}`,
      label: `INV #${num} · ${String(inv.status)}`,
      amount: formatMoney(Number(inv.total)),
    });
  }

  return { photoByJob, docsByJob };
}
