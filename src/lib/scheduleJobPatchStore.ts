import type { JobWithClient } from '../types/crm';
import { isDevFieldAuditAuth } from './devFieldAuditAuth';

const AUDIT_PATCH_KEY = 'grafter-schedule-job-patches';
const scheduleJobPatches = new Map<string, Partial<JobWithClient>>();

function hydrateAuditPatchesFromSession() {
  if (!isDevFieldAuditAuth() || typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(AUDIT_PATCH_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Partial<JobWithClient>>;
    for (const [id, patch] of Object.entries(parsed)) {
      scheduleJobPatches.set(id, { ...(scheduleJobPatches.get(id) ?? {}), ...patch });
    }
  } catch {
    // ignore corrupt session copy
  }
}

function persistAuditPatchesToSession() {
  if (!isDevFieldAuditAuth() || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      AUDIT_PATCH_KEY,
      JSON.stringify(Object.fromEntries(scheduleJobPatches.entries())),
    );
  } catch {
    // sessionStorage may be unavailable
  }
}

export function mergeScheduleJobPatch(jobId: string, patch: Partial<JobWithClient>) {
  hydrateAuditPatchesFromSession();
  scheduleJobPatches.set(jobId, { ...(scheduleJobPatches.get(jobId) ?? {}), ...patch });
  persistAuditPatchesToSession();
}

export function getScheduleJobPatch(jobId: string): Partial<JobWithClient> | undefined {
  return scheduleJobPatches.get(jobId);
}

export function withScheduleJobPatches<T extends { id: string }>(jobs: T[]): T[] {
  hydrateAuditPatchesFromSession();
  if (scheduleJobPatches.size === 0) return jobs;
  return jobs.map(j => {
    const patch = scheduleJobPatches.get(j.id);
    return patch ? { ...j, ...patch } : j;
  });
}
