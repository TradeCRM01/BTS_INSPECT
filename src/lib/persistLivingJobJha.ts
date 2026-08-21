import { supabase } from './supabase';
import {
  applyLivingJobToJha,
  livingJhaMetaPatches,
  type LivingJob,
  type LivingMember,
} from './livingJha';

export { applyLivingJobToJha, livingJhaMetaPatches };

/**
 * Keep every JHA/SWMS bound to this job current with the job's site and crew.
 * Scoped to this job_id only. Hazards stay on each document's steps.
 */
export async function persistLivingJobOnBoundJhas(jobId: string): Promise<{ updated: number }> {
  if (!jobId) return { updated: 0 };

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, title, address, assigned_team, company_id')
    .eq('id', jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) return { updated: 0 };

  const { data: docs, error: docErr } = await supabase
    .from('jha_documents')
    .select('id, meta')
    .eq('job_id', jobId);
  if (docErr) throw docErr;
  if (!docs?.length) return { updated: 0 };

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

  const livingJob: LivingJob = {
    id: job.id,
    title: job.title,
    address: job.address,
    assigned_team: Array.isArray(job.assigned_team) ? job.assigned_team : [],
  };
  const patches = livingJhaMetaPatches(docs, livingJob, members);
  for (const patch of patches) {
    const { error: upErr } = await supabase
      .from('jha_documents')
      .update({ meta: patch.meta })
      .eq('id', patch.id)
      .eq('job_id', jobId);
    if (upErr) throw upErr;
  }
  return { updated: patches.length };
}
