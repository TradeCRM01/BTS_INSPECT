import { timeToMinutes } from './dispatch';

export type DispatchRole = 'admin' | 'member';

export type DispatchConflictKind =
  | 'missing_qualification'
  | 'expired_qualification'
  | 'resource_out_of_service'
  | 'resource_overlap'
  | 'crew_timed_overlap'
  | 'required_resource_missing'
  | 'crew_count_short'
  | 'hours_unknown'
  | 'hours_unavailable'
  | 'hours_over_window'
  | 'legacy_no_requirements';

export type DispatchSeverity = 'hard' | 'soft';

export type DispatchConflict = {
  kind: DispatchConflictKind;
  severity: DispatchSeverity;
  message: string;
  overridable: boolean;
};

export type DispatchSkill = { id: string; name: string };
export type DispatchQualification = {
  memberId: string;
  skillId: string;
  issuedOn?: string | null;
  expiresOn?: string | null;
};
export type DispatchResource = {
  id: string;
  name: string;
  category: string;
  status: 'available' | 'out_of_service';
};
export type JobSkillRequirement = { skillId: string; minHolders?: number };
export type JobResourceRequirement = {
  resourceId?: string | null;
  category?: string | null;
  quantity?: number;
};
export type ResourceAllocation = { jobId: string; resourceId: string };

export type DispatchBookedJob = {
  id: string;
  status: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  assigned_team: string[] | null;
};

export type StaffHoursRow = {
  memberId: string;
  date: string;
  working: boolean;
  start?: string | null;
  end?: string | null;
};

export type DispatchSnapshot = {
  job: DispatchBookedJob;
  dispatchReady: boolean;
  requiredCrewCount: number;
  assignedTeam: string[];
  skillRequirements: JobSkillRequirement[];
  resourceRequirements: JobResourceRequirement[];
  allocations: ResourceAllocation[];
  skills: DispatchSkill[];
  qualifications: DispatchQualification[];
  resources: DispatchResource[];
  siblingJobs: DispatchBookedJob[];
  siblingAllocations: ResourceAllocation[];
  hours: StaffHoursRow[];
  names: Map<string, string>;
  today?: string;
};

function dateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function skillName(skills: DispatchSkill[], id: string): string {
  return skills.find(s => s.id === id)?.name ?? 'required ticket';
}

function resourceName(resources: DispatchResource[], id: string): string {
  return resources.find(r => r.id === id)?.name ?? 'required resource';
}

export function isPhysicallyImpossible(kind: DispatchConflictKind): boolean {
  return kind === 'resource_out_of_service'
    || kind === 'resource_overlap'
    || kind === 'crew_timed_overlap';
}

/** Soft issues that still require an admin reason before a write. Legacy empty requirements are display-only. */
export function isSoftWriteGate(conflict: DispatchConflict): boolean {
  if (conflict.severity !== 'soft') return false;
  return conflict.kind === 'hours_unknown'
    || conflict.kind === 'hours_unavailable'
    || conflict.kind === 'hours_over_window'
    || conflict.kind === 'crew_count_short'
    || conflict.kind === 'required_resource_missing';
}

export function qualificationHolds(
  row: DispatchQualification | undefined,
  today: string,
): 'ok' | 'missing' | 'expired' {
  if (!row) return 'missing';
  const expires = dateKey(row.expiresOn);
  if (expires && expires < today) return 'expired';
  return 'ok';
}

/** Legacy `profiles.licence_number` is display-only and never satisfies a skill requirement. */
export function licenceNumberSatisfiesSkill(_licence: string | null | undefined): false {
  return false;
}

function timedInterval(job: DispatchBookedJob): { start: number; end: number } | null {
  const start = timeToMinutes(job.start_time);
  if (start == null) return null;
  const end = timeToMinutes(job.end_time);
  return { start, end: end != null && end > start ? end : start + 60 };
}

export function timedCrewOverlap(a: DispatchBookedJob, b: DispatchBookedJob): boolean {
  if (a.id === b.id) return false;
  if (a.status === 'cancelled' || b.status === 'cancelled') return false;
  const da = dateKey(a.scheduled_date);
  const db = dateKey(b.scheduled_date);
  if (!da || !db || da !== db) return false;
  const ia = timedInterval(a);
  const ib = timedInterval(b);
  if (!ia || !ib) return false;
  return ia.start < ib.end && ia.end > ib.start;
}

export function sharedCrew(a: DispatchBookedJob, b: DispatchBookedJob): string[] {
  const left = new Set(a.assigned_team ?? []);
  return (b.assigned_team ?? []).filter(id => left.has(id));
}

function allocationPeriod(job: DispatchBookedJob | undefined): { date: string; start: number; end: number } | null {
  if (!job || job.status === 'cancelled') return null;
  const date = dateKey(job.scheduled_date);
  if (!date) return null;
  const slot = timedInterval(job);
  if (slot) return { date, start: slot.start, end: slot.end };
  return { date, start: 0, end: 24 * 60 };
}

export function resourcePeriodsOverlap(
  a: { date: string; start: number; end: number },
  b: { date: string; start: number; end: number },
): boolean {
  if (a.date !== b.date) return false;
  return a.start < b.end && a.end > b.start;
}

export type DispatchCardTone = 'hard' | 'soft' | 'override' | null;

export function cardTone(conflicts: DispatchConflict[], overrideRecorded: boolean): DispatchCardTone {
  if (overrideRecorded) return 'override';
  if (conflicts.some(c => c.severity === 'hard')) return 'hard';
  if (conflicts.some(isSoftWriteGate)) return 'soft';
  return null;
}

export function cardBadge(conflicts: DispatchConflict[], overrideRecorded: boolean): string | null {
  if (overrideRecorded) return 'Override recorded';
  const hard = conflicts.find(c => c.severity === 'hard');
  if (!hard) return null;
  if (hard.kind === 'missing_qualification' || hard.kind === 'expired_qualification') {
    return 'Needs qualified crew';
  }
  if (hard.kind === 'resource_out_of_service' || hard.kind === 'resource_overlap' || hard.kind === 'required_resource_missing') {
    return 'Tester unavailable';
  }
  if (hard.kind === 'crew_timed_overlap') return 'Crew overlap';
  return hard.message;
}

function hoursFor(hours: StaffHoursRow[], memberId: string, date: string): StaffHoursRow | undefined {
  return hours.find(h => h.memberId === memberId && h.date === date);
}

export function evaluateDispatch(snap: DispatchSnapshot): DispatchConflict[] {
  const today = snap.today ?? new Date().toISOString().slice(0, 10);
  const ready = snap.dispatchReady;
  const names = snap.names;
  const job = { ...snap.job, assigned_team: snap.assignedTeam };
  const conflicts: DispatchConflict[] = [];

  const hasRequirements = snap.skillRequirements.length > 0
    || snap.resourceRequirements.length > 0
    || snap.requiredCrewCount > 0;

  if (!hasRequirements) {
    conflicts.push({
      kind: 'legacy_no_requirements',
      severity: 'soft',
      message: 'No dispatch requirements on this job — planning only.',
      overridable: true,
    });
  }

  if (snap.requiredCrewCount > 0 && snap.assignedTeam.length < snap.requiredCrewCount) {
    conflicts.push({
      kind: 'crew_count_short',
      severity: ready ? 'hard' : 'soft',
      message: `Needs ${snap.requiredCrewCount} crew; ${snap.assignedTeam.length} assigned.`,
      overridable: !ready,
    });
  }

  for (const req of snap.skillRequirements) {
    const need = req.minHolders ?? 1;
    let ok = 0;
    let expired = 0;
    for (const memberId of snap.assignedTeam) {
      const row = snap.qualifications.find(q => q.memberId === memberId && q.skillId === req.skillId);
      const hold = qualificationHolds(row, today);
      if (hold === 'ok') ok += 1;
      if (hold === 'expired') expired += 1;
    }
    const label = skillName(snap.skills, req.skillId);
    if (ok >= need) continue;
    if (expired > 0 && ok + expired >= need) {
      conflicts.push({
        kind: 'expired_qualification',
        severity: 'hard',
        message: `${label} has expired.`,
        overridable: false,
      });
    } else {
      conflicts.push({
        kind: 'missing_qualification',
        severity: 'hard',
        message: `Needs qualified crew for ${label}.`,
        overridable: false,
      });
    }
  }

  const jobPeriod = allocationPeriod(job);
  const allocByJob = new Map<string, DispatchBookedJob>();
  allocByJob.set(job.id, job);
  for (const sibling of snap.siblingJobs) allocByJob.set(sibling.id, sibling);

  for (const req of snap.resourceRequirements) {
    const qty = req.quantity ?? 1;
    const matching = snap.allocations.filter(a => a.jobId === job.id).filter(a => {
      const res = snap.resources.find(r => r.id === a.resourceId);
      if (!res) return false;
      if (req.resourceId) return a.resourceId === req.resourceId;
      if (req.category) return res.category === req.category;
      return false;
    });
    if (matching.length < qty) {
      conflicts.push({
        kind: 'required_resource_missing',
        severity: ready ? 'hard' : 'soft',
        message: req.resourceId
          ? `${resourceName(snap.resources, req.resourceId)} is not allocated.`
          : `Needs ${qty} ${(req.category ?? 'resource')} on the job.`,
        overridable: !ready,
      });
      continue;
    }
  }

  for (const alloc of snap.allocations.filter(a => a.jobId === job.id)) {
    const res = snap.resources.find(r => r.id === alloc.resourceId);
    if (!res) continue;
    if (res.status === 'out_of_service') {
      conflicts.push({
        kind: 'resource_out_of_service',
        severity: 'hard',
        message: `${res.name} is out of service.`,
        overridable: false,
      });
    }
    if (!jobPeriod) continue;
    for (const other of snap.siblingAllocations) {
      if (other.resourceId !== alloc.resourceId || other.jobId === job.id) continue;
      const otherJob = allocByJob.get(other.jobId);
      const otherPeriod = allocationPeriod(otherJob);
      if (!otherPeriod) continue;
      if (resourcePeriodsOverlap(jobPeriod, otherPeriod)) {
        conflicts.push({
          kind: 'resource_overlap',
          severity: 'hard',
          message: `${res.name} is already booked on that slot.`,
          overridable: false,
        });
      }
    }
  }

  for (const other of snap.siblingJobs) {
    const people = sharedCrew(job, other);
    if (people.length === 0 || !timedCrewOverlap(job, other)) continue;
    const who = people.map(id => names.get(id) ?? 'Someone').join(', ');
    conflicts.push({
      kind: 'crew_timed_overlap',
      severity: 'hard',
      message: `${who} already has a timed booking on that slot.`,
      overridable: false,
    });
  }

  const date = dateKey(job.scheduled_date);
  const slot = timedInterval(job);
  if (date) {
    for (const memberId of snap.assignedTeam) {
      const row = hoursFor(snap.hours, memberId, date);
      const name = names.get(memberId) ?? 'Someone';
      if (!row) {
        conflicts.push({
          kind: 'hours_unknown',
          severity: 'soft',
          message: `${name} has no hours record that day — availability is unknown, not a confirmed day off.`,
          overridable: true,
        });
        continue;
      }
      if (!row.working) {
        conflicts.push({
          kind: 'hours_unavailable',
          severity: 'soft',
          message: `${name} is recorded as not working that day — confirmed unavailability, not an unknown hours record.`,
          overridable: true,
        });
        continue;
      }
      if (!slot || !row.start || !row.end) continue;
      const start = timeToMinutes(row.start);
      const end = timeToMinutes(row.end);
      if (start == null || end == null) continue;
      if (slot.start < start || slot.end > end) {
        conflicts.push({
          kind: 'hours_over_window',
          severity: 'soft',
          message: `${name} is outside recorded hours ${row.start.slice(0, 5)}–${row.end.slice(0, 5)}.`,
          overridable: true,
        });
      }
    }
  }

  const seen = new Set<string>();
  return conflicts.filter(c => {
    const key = `${c.kind}:${c.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function decideDispatchWrite(args: {
  role: DispatchRole;
  conflicts: DispatchConflict[];
  overrideReason?: string | null;
}): {
  ok: boolean;
  blocker: 'member_hard' | 'override_reason_required' | 'not_overridable' | null;
  overridden: boolean;
  message?: string;
} {
  const hard = args.conflicts.filter(c => c.severity === 'hard');
  if (hard.length > 0) {
    return {
      ok: false,
      blocker: 'not_overridable',
      overridden: false,
      message: hard[0].message,
    };
  }
  const softGate = args.conflicts.filter(isSoftWriteGate);
  if (softGate.length === 0) {
    return { ok: true, blocker: null, overridden: false };
  }
  if (args.role !== 'admin') {
    return {
      ok: false,
      blocker: 'member_hard',
      overridden: false,
      message: softGate[0].message,
    };
  }
  const reason = (args.overrideReason ?? '').trim();
  if (!reason) {
    return {
      ok: false,
      blocker: 'override_reason_required',
      overridden: false,
      message: 'Admin override needs a reason.',
    };
  }
  return { ok: true, blocker: null, overridden: true };
}

export function dispatchEventKind(overridden: boolean, reschedule: boolean): 'override' | 'reschedule' | 'assign' {
  if (overridden) return 'override';
  if (reschedule) return 'reschedule';
  return 'assign';
}

export const NEEDS_RESOURCES_EMPTY =
  'No jobs need resources or have a recorded override on this view. Turn off Needs resources to see the full board.';

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `dispatch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
