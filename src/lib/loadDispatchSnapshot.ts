import { staffHoursFromRow, type StaffHours } from './booking';
import type {
  DispatchQualification,
  DispatchResource,
  DispatchSkill,
  DispatchSnapshot,
  JobResourceRequirement,
  JobSkillRequirement,
  ResourceAllocation,
} from './dispatchResources';
import { isMissingRelation } from './booking';
import { supabase } from './supabase';

export type DispatchPack = {
  skills: DispatchSkill[];
  qualifications: DispatchQualification[];
  resources: DispatchResource[];
  skillReqs: Array<JobSkillRequirement & { jobId: string }>;
  resourceReqs: Array<JobResourceRequirement & { jobId: string }>;
  allocations: ResourceAllocation[];
  missing: boolean;
};

export async function loadDispatchPack(jobIds: string[]): Promise<DispatchPack> {
  const empty: DispatchPack = {
    skills: [],
    qualifications: [],
    resources: [],
    skillReqs: [],
    resourceReqs: [],
    allocations: [],
    missing: false,
  };
  const [skills, quals, resources, skillReqs, resourceReqs, allocations] = await Promise.all([
    supabase.from('dispatch_skills').select('id, name'),
    supabase.from('dispatch_member_qualifications').select('member_id, skill_id, issued_on, expires_on'),
    supabase.from('dispatch_resources').select('id, name, category, status'),
    jobIds.length
      ? supabase.from('job_skill_requirements').select('job_id, skill_id, min_holders').in('job_id', jobIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase.from('job_resource_requirements').select('job_id, resource_id, category, quantity').in('job_id', jobIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase.from('job_resource_allocations').select('job_id, resource_id')
      : Promise.resolve({ data: [], error: null }),
  ]);
  const err = skills.error || quals.error || resources.error || skillReqs.error || resourceReqs.error || allocations.error;
  if (err && isMissingRelation(err)) return { ...empty, missing: true };
  if (err && /dispatch_|job_skill_|job_resource_/i.test(err.message ?? '')) return { ...empty, missing: true };
  if (err) throw err;
  return {
    missing: false,
    skills: (skills.data ?? []).map(s => ({ id: s.id, name: s.name })),
    qualifications: (quals.data ?? []).map(q => ({
      memberId: q.member_id,
      skillId: q.skill_id,
      issuedOn: q.issued_on,
      expiresOn: q.expires_on,
    })),
    resources: (resources.data ?? []).map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      status: r.status === 'out_of_service' ? 'out_of_service' : 'available',
    })),
    skillReqs: (skillReqs.data ?? []).map(r => ({
      jobId: r.job_id,
      skillId: r.skill_id,
      minHolders: r.min_holders,
    })),
    resourceReqs: (resourceReqs.data ?? []).map(r => ({
      jobId: r.job_id,
      resourceId: r.resource_id,
      category: r.category,
      quantity: r.quantity,
    })),
    allocations: (allocations.data ?? []).map(a => ({ jobId: a.job_id, resourceId: a.resource_id })),
  };
}

export function snapshotForJob(args: {
  job: DispatchSnapshot['job'] & {
    dispatch_ready?: boolean | null;
    required_crew_count?: number | null;
  };
  pack: DispatchPack;
  siblings: DispatchSnapshot['job'][];
  hours: StaffHours[];
  names: Map<string, string>;
}): DispatchSnapshot {
  const jobId = args.job.id;
  return {
    job: args.job,
    dispatchReady: !!args.job.dispatch_ready,
    requiredCrewCount: args.job.required_crew_count ?? 0,
    assignedTeam: args.job.assigned_team ?? [],
    skillRequirements: args.pack.skillReqs.filter(r => r.jobId === jobId),
    resourceRequirements: args.pack.resourceReqs.filter(r => r.jobId === jobId),
    allocations: args.pack.allocations.filter(a => a.jobId === jobId),
    skills: args.pack.skills,
    qualifications: args.pack.qualifications,
    resources: args.pack.resources,
    siblingJobs: args.siblings.filter(j => j.id !== jobId),
    siblingAllocations: args.pack.allocations.filter(a => a.jobId !== jobId),
    hours: args.hours,
    names: args.names,
  };
}
