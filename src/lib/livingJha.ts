import { parseCrewSignOns, type JhaCrewMember } from '../types/jha';

export type LivingJob = {
  id: string;
  title?: string | null;
  address?: string | null;
  assigned_team?: string[] | null;
};

export type LivingMember = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export type LivingJhaApplyOpts = {
  today?: string;
  currentUserId?: string;
  /** When team members have not loaded yet, do not invent empty crew slots. */
  skipCrew?: boolean;
};

function todayYmd(value?: string): string {
  if (value) return value;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function asMeta(meta: Record<string, string | undefined> | null | undefined): Record<string, string> {
  const next: Record<string, string> = {};
  if (!meta) return next;
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function crewFingerprint(crew: JhaCrewMember[]): string {
  return JSON.stringify(crew.map(c => ({
    id: c.id,
    profileId: c.profileId ?? '',
    name: c.name,
    role: c.role,
    email: c.email ?? '',
    signMode: c.signMode ?? '',
    signature: c.signature ?? '',
    signedAt: c.signedAt ?? '',
    notifiedAt: c.notifiedAt ?? '',
    date: c.date,
  })));
}

/** Job site is the living SWMS site: address first, then job title. */
export function livingJobSite(job: LivingJob | null | undefined): string {
  if (!job) return '';
  return (job.address ?? '').trim() || (job.title ?? '').trim();
}

export function assignedTeamIds(job: LivingJob | null | undefined): string[] {
  if (!job?.assigned_team) return [];
  return job.assigned_team.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/** Stable crew row id so sign links survive re-merge. */
export function livingCrewSlotId(profileId: string): string {
  return `job-${profileId}`;
}

/**
 * Job assigned_team is the living crew. Walk-ons (no profileId) stay.
 * Signatures stay on people still assigned, and on anyone already signed
 * after they leave the job. Unsigned assigned people who were removed drop off.
 */
export function mergeLivingCrew(
  existing: JhaCrewMember[],
  assignedIds: string[] | null | undefined,
  members: LivingMember[],
  opts?: LivingJhaApplyOpts,
): JhaCrewMember[] {
  const assigned = (assignedIds ?? []).filter((id): id is string => typeof id === 'string' && id.length > 0);
  const assignedSet = new Set(assigned);
  const memberById = new Map(members.map(m => [m.id, m]));
  const today = todayYmd(opts?.today);
  const kept: JhaCrewMember[] = [];
  const seen = new Set<string>();

  for (const person of existing) {
    const profileId = person.profileId;
    if (profileId && assignedSet.has(profileId)) {
      const member = memberById.get(profileId);
      kept.push({
        ...person,
        name: person.name.trim() || (member?.name ?? '').trim() || (member?.email ?? '').trim(),
        email: person.email || member?.email || undefined,
        role: person.role || (member?.role === 'admin' ? 'Supervisor' : person.role),
      });
      seen.add(profileId);
      continue;
    }
    if (profileId && !assignedSet.has(profileId)) {
      if ((person.signature ?? '').trim()) {
        kept.push(person);
        seen.add(profileId);
      }
      continue;
    }
    kept.push(person);
  }

  for (const profileId of assigned) {
    if (seen.has(profileId)) continue;
    const member = memberById.get(profileId);
    const name = (member?.name ?? '').trim() || (member?.email ?? '').trim();
    kept.push({
      id: livingCrewSlotId(profileId),
      name,
      role: member?.role === 'admin' ? 'Supervisor' : 'Worker',
      date: today,
      profileId,
      email: member?.email || undefined,
      signMode: opts?.currentUserId === profileId ? 'on_device' : 'remote',
    });
    seen.add(profileId);
  }

  return kept;
}

export function applyLivingJobToJha(
  meta: Record<string, string | undefined> | null | undefined,
  job: LivingJob | null | undefined,
  members: LivingMember[],
  opts?: LivingJhaApplyOpts,
): {
  meta: Record<string, string>;
  crew: JhaCrewMember[];
  siteName: string;
  changed: boolean;
} {
  const current = asMeta(meta);
  const existingCrew = parseCrewSignOns(current.crewSignOns);
  if (!job) {
    return {
      meta: current,
      crew: existingCrew,
      siteName: current.siteName ?? '',
      changed: false,
    };
  }

  const siteName = livingJobSite(job);
  const crew = opts?.skipCrew
    ? existingCrew
    : mergeLivingCrew(existingCrew, job.assigned_team, members, opts);

  const next = { ...current };
  if (siteName) next.siteName = siteName;
  next.crewSignOns = JSON.stringify(crew);

  const changed =
    (next.siteName ?? '') !== (current.siteName ?? '')
    || crewFingerprint(crew) !== crewFingerprint(existingCrew);

  return {
    meta: next,
    crew,
    siteName: next.siteName ?? '',
    changed,
  };
}

export function livingJhaMetaPatches(
  docs: Array<{ id: string; meta?: Record<string, string> | null }>,
  job: LivingJob,
  members: LivingMember[],
  opts?: LivingJhaApplyOpts,
): Array<{ id: string; meta: Record<string, string> }> {
  const patches: Array<{ id: string; meta: Record<string, string> }> = [];
  for (const doc of docs) {
    const applied = applyLivingJobToJha(doc.meta ?? {}, job, members, opts);
    if (applied.changed) patches.push({ id: doc.id, meta: applied.meta });
  }
  return patches;
}

export function livingHazardLines(
  steps: Array<{ hazards?: string | null; description?: string | null }> | null | undefined,
): string[] {
  if (!steps?.length) return [];
  const lines: string[] = [];
  for (const step of steps) {
    const hazards = (step.hazards ?? '').trim();
    if (hazards) {
      lines.push(hazards);
      continue;
    }
    const description = (step.description ?? '').trim();
    if (description) lines.push(description);
  }
  return lines;
}

export function livingCrewLabel(crew: JhaCrewMember[]): string {
  const names = crew.map(c => c.name.trim()).filter(Boolean);
  if (names.length === 0) return '';
  return names.join(', ');
}

export function livingHazardLabel(lines: string[], limit = 2): string {
  if (lines.length === 0) return '';
  const shown = lines.slice(0, limit);
  const extra = lines.length - shown.length;
  return extra > 0 ? `${shown.join('; ')} +${extra} more` : shown.join('; ');
}

export function livingSwmsSummary(input: {
  meta?: Record<string, string> | null;
  steps?: Array<{ hazards?: string | null; description?: string | null }> | null;
  job: LivingJob | null | undefined;
  members: LivingMember[];
}): {
  site: string;
  crew: JhaCrewMember[];
  crewLabel: string;
  hazards: string[];
  hazardLabel: string;
  meta: Record<string, string>;
} {
  const applied = applyLivingJobToJha(input.meta ?? {}, input.job, input.members);
  const hazards = livingHazardLines(input.steps);
  return {
    site: applied.siteName,
    crew: applied.crew,
    crewLabel: livingCrewLabel(applied.crew),
    hazards,
    hazardLabel: livingHazardLabel(hazards),
    meta: applied.meta,
  };
}
