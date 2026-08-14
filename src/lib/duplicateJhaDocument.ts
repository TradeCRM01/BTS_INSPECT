import { format } from 'date-fns';
import { supabase } from './supabase';
import { parseCrewSignOns, type JhaSignOff } from '../types/jha';

type SourceDoc = {
  id: string;
  template_id: string;
  template_snapshot: unknown;
  company_id: string;
  meta: Record<string, string> | null;
  steps: unknown;
  ppe: unknown;
  sign_offs: JhaSignOff[] | null;
  client_id: string | null;
  job_id: string | null;
};

function withCopySuffix(value: string | undefined | null): string {
  const base = (value ?? '').trim();
  if (!base) return 'Copy';
  if (/\(Copy\)$/i.test(base)) return base;
  return `${base} (Copy)`;
}

/** Build a draft payload cloned from an existing JHA (signatures cleared). */
export function buildJhaDuplicatePayload(source: SourceDoc, createdBy: string) {
  const meta = { ...(source.meta ?? {}) };
  const title = meta.documentTitle || meta.taskName || '';
  if (meta.documentTitle) {
    meta.documentTitle = withCopySuffix(meta.documentTitle);
  } else if (meta.taskName) {
    meta.taskName = withCopySuffix(meta.taskName);
  } else {
    meta.documentTitle = withCopySuffix(title || 'JHA');
  }
  meta.date = format(new Date(), 'yyyy-MM-dd');
  delete meta.amendmentReason;

  const crew = parseCrewSignOns(meta.crewSignOns).map(c => ({
    ...c,
    signature: undefined,
    signedAt: undefined,
    notifiedAt: undefined,
    date: meta.date,
  }));
  meta.crewSignOns = JSON.stringify(crew);

  const signOffs = (source.sign_offs ?? []).map(s => ({
    roleId: s.roleId,
    roleLabel: s.roleLabel,
    name: '',
    signature: '',
    date: '',
  }));

  return {
    template_id: source.template_id,
    template_snapshot: source.template_snapshot,
    company_id: source.company_id,
    created_by: createdBy,
    status: 'draft' as const,
    meta,
    steps: source.steps ?? [],
    ppe: source.ppe ?? [],
    sign_offs: signOffs,
    client_id: source.client_id,
    job_id: source.job_id,
    doc_version: 1,
    amended_from_id: null,
    amendment_reason: null,
    report_number: null,
    pdf_storage_path: null,
    completed_at: null,
  };
}

/** Fetch a JHA and insert a draft duplicate. Returns the new document id. */
export async function duplicateJhaDocument(sourceId: string, createdBy: string): Promise<string> {
  const { data: source, error: loadErr } = await supabase
    .from('jha_documents')
    .select('id, template_id, template_snapshot, company_id, meta, steps, ppe, sign_offs, client_id, job_id')
    .eq('id', sourceId)
    .maybeSingle();
  if (loadErr) throw loadErr;
  if (!source) throw new Error('JHA not found');

  const payload = buildJhaDuplicatePayload(source as SourceDoc, createdBy);
  const { data, error } = await supabase
    .from('jha_documents')
    .insert(payload)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Failed to duplicate JHA');
  return data.id;
}
