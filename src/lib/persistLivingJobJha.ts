import { supabase } from './supabase';
import {
  applyLivingJobToInspection,
  applyLivingJobToJha,
  applyLivingJobToTake5,
  livingInspectionPatches,
  livingJhaMetaPatches,
  livingTake5MetaPatches,
  type LivingJob,
  type LivingMember,
} from './livingJha';

export {
  applyLivingJobToInspection,
  applyLivingJobToJha,
  applyLivingJobToTake5,
  livingInspectionPatches,
  livingJhaMetaPatches,
  livingTake5MetaPatches,
};

/**
 * Keep every JHA/SWMS, Take 5, and inspection bound to this job current with
 * the job's site, crew, and client. Scoped to this job_id / crm_job_id only.
 * JHA hazards stay on steps; Take 5 checks and inspection answers stay on
 * their rows.
 */
export async function persistLivingJobOnBoundJhas(jobId: string): Promise<{ updated: number }> {
  if (!jobId) return { updated: 0 };

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, title, address, assigned_team, company_id, client_id, inspection_id')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) return { updated: 0 };

  let members: LivingMember[] = [];
  if (job.company_id) {
    const { data, error: memErr } = await supabase.rpc('get_company_members', {
      p_company_id: job.company_id,
    });
    if (memErr) throw memErr;
    members = (data ?? []).map((row: LivingMember) => ({
      id: String(row.id),
      name: row.name ?? '',
      email: row.email ?? '',
      role: row.role ?? '',
    }));
  }

  let clientName = '';
  if (job.client_id) {
    const { data: client, error: clientErr } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', job.client_id)
      .maybeSingle();
    if (clientErr) throw clientErr;
    clientName = (client?.name ?? '').trim();
  }

  const livingJob: LivingJob = {
    id: job.id,
    title: job.title,
    address: job.address,
    assigned_team: Array.isArray(job.assigned_team) ? job.assigned_team : [],
    client_id: job.client_id ?? null,
    client_name: clientName,
  };

  let updated = 0;

  const { data: docs, error: docErr } = await supabase
    .from('jha_documents')
    .select('id, meta')
    .eq('job_id', jobId);
  if (docErr) throw docErr;

  if (docs?.length) {
    const patches = livingJhaMetaPatches(docs, livingJob, members);
    for (const patch of patches) {
      const { error: upErr } = await supabase
        .from('jha_documents')
        .update({ meta: patch.meta })
        .eq('id', patch.id)
        .eq('job_id', jobId);
      if (upErr) throw upErr;
    }
    updated += patches.length;

    const jhaIds = docs.map(doc => doc.id);
    const { data: take5s, error: take5Err } = await supabase
      .from('jha_take5')
      .select('id, meta')
      .in('jha_document_id', jhaIds);
    if (take5Err) throw take5Err;

    const take5Patches = livingTake5MetaPatches(take5s ?? [], livingJob, members);
    for (const patch of take5Patches) {
      const { error: upErr } = await supabase
        .from('jha_take5')
        .update({ meta: patch.meta, updated_at: new Date().toISOString() })
        .eq('id', patch.id);
      if (upErr) throw upErr;
    }
    updated += take5Patches.length;
  }

  const { data: inspections, error: inspErr } = await supabase
    .from('inspections')
    .select('id, meta, client_id')
    .eq('crm_job_id', jobId);
  if (inspErr) throw inspErr;

  const bound = [...(inspections ?? [])];
  const extraId = typeof job.inspection_id === 'string' ? job.inspection_id : '';
  if (extraId && !bound.some(row => row.id === extraId)) {
    const { data: extra, error: extraErr } = await supabase
      .from('inspections')
      .select('id, meta, client_id')
      .eq('id', extraId)
      .maybeSingle();
    if (extraErr) throw extraErr;
    if (extra) bound.push(extra);
  }

  const crmBoundIds = new Set((inspections ?? []).map(row => row.id));
  const inspectionPatches = livingInspectionPatches(bound, livingJob);
  for (const patch of inspectionPatches) {
    let q = supabase
      .from('inspections')
      .update({ meta: patch.meta, client_id: patch.clientId })
      .eq('id', patch.id);
    if (crmBoundIds.has(patch.id)) q = q.eq('crm_job_id', jobId);
    const { error: upErr } = await q;
    if (upErr) throw upErr;
  }
  updated += inspectionPatches.length;

  return { updated };
}
