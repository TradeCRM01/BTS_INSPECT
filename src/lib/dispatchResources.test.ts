import { describe, expect, it } from 'vitest';
import {
  cardBadge,
  decideDispatchWrite,
  evaluateDispatch,
  licenceNumberSatisfiesSkill,
  NEEDS_RESOURCES_EMPTY,
  qualificationHolds,
  resourcePeriodsOverlap,
  timedCrewOverlap,
  type DispatchSnapshot,
} from './dispatchResources';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const skill = { id: 'sk-test', name: 'Tester ticket' };
const tester = { id: 'res-fluke', name: 'Fluke tester', category: 'tester', status: 'available' as const };
const ewp = { id: 'res-ewp', name: 'EWP-1', category: 'ewp', status: 'out_of_service' as const };

function snap(over: Partial<DispatchSnapshot> = {}): DispatchSnapshot {
  const job = {
    id: 'job-1',
    status: 'scheduled',
    scheduled_date: '2026-09-14',
    start_time: '09:00:00',
    end_time: '11:00:00',
    assigned_team: ['alice'],
  };
  return {
    job,
    dispatchReady: false,
    requiredCrewCount: 0,
    assignedTeam: ['alice'],
    skillRequirements: [],
    resourceRequirements: [],
    allocations: [],
    skills: [skill],
    qualifications: [],
    resources: [tester, ewp],
    siblingJobs: [],
    siblingAllocations: [],
    hours: [],
    names: new Map([['alice', 'Alice'], ['bob', 'Bob']]),
    today: '2026-09-14',
    ...over,
  };
}

describe('legacy licence display', () => {
  it('does not let a profile licence bypass a required qualification', () => {
    expect(licenceNumberSatisfiesSkill('1506389')).toBe(false);
    expect(licenceNumberSatisfiesSkill(null)).toBe(false);
    const conflicts = evaluateDispatch(snap({
      skillRequirements: [{ skillId: 'sk-test' }],
    }));
    expect(conflicts.some(c => c.kind === 'missing_qualification' && c.severity === 'hard')).toBe(true);
  });
});

describe('qualifications', () => {
  it('accepts a valid dated qualification', () => {
    expect(qualificationHolds({
      memberId: 'alice',
      skillId: 'sk-test',
      issuedOn: '2025-01-01',
      expiresOn: '2027-01-01',
    }, '2026-09-14')).toBe('ok');
    const conflicts = evaluateDispatch(snap({
      skillRequirements: [{ skillId: 'sk-test' }],
      qualifications: [{ memberId: 'alice', skillId: 'sk-test', expiresOn: '2027-01-01' }],
    }));
    expect(conflicts.some(c => c.kind === 'missing_qualification' || c.kind === 'expired_qualification')).toBe(false);
  });

  it('blocks a missing or expired qualification', () => {
    expect(evaluateDispatch(snap({
      skillRequirements: [{ skillId: 'sk-test' }],
    })).some(c => c.kind === 'missing_qualification')).toBe(true);
    expect(evaluateDispatch(snap({
      skillRequirements: [{ skillId: 'sk-test' }],
      qualifications: [{ memberId: 'alice', skillId: 'sk-test', expiresOn: '2026-01-01' }],
    })).some(c => c.kind === 'expired_qualification')).toBe(true);
  });
});

describe('resources', () => {
  it('accepts a valid named allocation', () => {
    const conflicts = evaluateDispatch(snap({
      resourceRequirements: [{ resourceId: 'res-fluke' }],
      allocations: [{ jobId: 'job-1', resourceId: 'res-fluke' }],
    }));
    expect(conflicts.some(c => c.kind.startsWith('resource') || c.kind === 'required_resource_missing')).toBe(false);
  });

  it('blocks an out-of-service resource and does not allow override', () => {
    const conflicts = evaluateDispatch(snap({
      dispatchReady: true,
      resourceRequirements: [{ resourceId: 'res-ewp' }],
      allocations: [{ jobId: 'job-1', resourceId: 'res-ewp' }],
    }));
    const hard = conflicts.find(c => c.kind === 'resource_out_of_service');
    expect(hard?.severity).toBe('hard');
    expect(hard?.overridable).toBe(false);
    expect(decideDispatchWrite({ role: 'admin', conflicts, overrideReason: 'need it' }).ok).toBe(false);
  });

  it('blocks an overlapping resource booking', () => {
    const conflicts = evaluateDispatch(snap({
      dispatchReady: true,
      resourceRequirements: [{ resourceId: 'res-fluke' }],
      allocations: [{ jobId: 'job-1', resourceId: 'res-fluke' }],
      siblingJobs: [{
        id: 'job-2',
        status: 'scheduled',
        scheduled_date: '2026-09-14',
        start_time: '10:00:00',
        end_time: '12:00:00',
        assigned_team: ['bob'],
      }],
      siblingAllocations: [{ jobId: 'job-2', resourceId: 'res-fluke' }],
    }));
    expect(conflicts.some(c => c.kind === 'resource_overlap' && !c.overridable)).toBe(true);
    expect(resourcePeriodsOverlap(
      { date: '2026-09-14', start: 9 * 60, end: 11 * 60 },
      { date: '2026-09-14', start: 10 * 60, end: 12 * 60 },
    )).toBe(true);
  });
});

describe('crew overlap and planning vs ready', () => {
  it('blocks an overlapping timed crew booking', () => {
    const other = {
      id: 'job-2',
      status: 'scheduled',
      scheduled_date: '2026-09-14',
      start_time: '10:30:00',
      end_time: '12:00:00',
      assigned_team: ['alice'],
    };
    expect(timedCrewOverlap({
      id: 'job-1',
      status: 'scheduled',
      scheduled_date: '2026-09-14',
      start_time: '09:00:00',
      end_time: '11:00:00',
      assigned_team: ['alice'],
    }, other)).toBe(true);
    const conflicts = evaluateDispatch(snap({ siblingJobs: [other] }));
    expect(conflicts.some(c => c.kind === 'crew_timed_overlap' && !c.overridable)).toBe(true);
  });

  it('warns when a required resource is missing in planning and blocks when ready', () => {
    const planning = evaluateDispatch(snap({
      resourceRequirements: [{ resourceId: 'res-fluke' }],
      allocations: [],
      dispatchReady: false,
    }));
    expect(planning.find(c => c.kind === 'required_resource_missing')?.severity).toBe('soft');
    const ready = evaluateDispatch(snap({
      resourceRequirements: [{ resourceId: 'res-fluke' }],
      allocations: [],
      dispatchReady: true,
    }));
    expect(ready.find(c => c.kind === 'required_resource_missing')?.severity).toBe('hard');
    expect(decideDispatchWrite({ role: 'member', conflicts: ready }).ok).toBe(false);
  });

  it('warns on short crew while planning and blocks when ready', () => {
    const planning = evaluateDispatch(snap({
      requiredCrewCount: 2,
      assignedTeam: ['alice'],
      dispatchReady: false,
    }));
    expect(planning.find(c => c.kind === 'crew_count_short')?.severity).toBe('soft');
    const ready = evaluateDispatch(snap({
      requiredCrewCount: 2,
      assignedTeam: ['alice'],
      dispatchReady: true,
    }));
    expect(ready.find(c => c.kind === 'crew_count_short')?.severity).toBe('hard');
  });

  it('keeps a legacy job with no requirements readable', () => {
    const conflicts = evaluateDispatch(snap());
    expect(conflicts.every(c => c.severity === 'soft')).toBe(true);
    expect(conflicts.some(c => c.kind === 'legacy_no_requirements')).toBe(true);
    expect(conflicts.every(c => c.kind === 'legacy_no_requirements' || c.kind === 'hours_unknown')).toBe(true);
  });
});

describe('override and write gates', () => {
  it('blocks missing qualifications even for an admin with a reason', () => {
    const conflicts = evaluateDispatch(snap({
      skillRequirements: [{ skillId: 'sk-test' }],
    }));
    expect(decideDispatchWrite({ role: 'member', conflicts, overrideReason: 'please' }).blocker).toBe('not_overridable');
    expect(decideDispatchWrite({ role: 'admin', conflicts, overrideReason: 'paper ticket on site' }).ok).toBe(false);
  });

  it('requires an admin reason for a soft planning warning', () => {
    const conflicts = evaluateDispatch(snap({
      requiredCrewCount: 2,
      assignedTeam: ['alice'],
      dispatchReady: false,
      hours: [{ memberId: 'alice', date: '2026-09-14', working: true, start: '07:00', end: '16:00' }],
    }));
    expect(conflicts.find(c => c.kind === 'crew_count_short')?.severity).toBe('soft');
    expect(decideDispatchWrite({ role: 'member', conflicts, overrideReason: 'please' }).blocker).toBe('member_hard');
    expect(decideDispatchWrite({ role: 'admin', conflicts, overrideReason: '' }).blocker).toBe('override_reason_required');
    expect(decideDispatchWrite({ role: 'admin', conflicts, overrideReason: 'second tech arriving later' })).toEqual({
      ok: true,
      blocker: null,
      overridden: true,
    });
  });

  it('shows Override recorded ahead of other badges', () => {
    const conflicts = evaluateDispatch(snap({
      skillRequirements: [{ skillId: 'sk-test' }],
    }));
    expect(cardBadge(conflicts, true)).toBe('Override recorded');
    expect(cardBadge(conflicts, false)).toBe('Needs qualified crew');
  });
});

describe('needs-resources empty state', () => {
  it('tells the dispatcher why the board is empty and how to leave the filter', () => {
    expect(NEEDS_RESOURCES_EMPTY).toMatch(/Turn off Needs resources/i);
    expect(NEEDS_RESOURCES_EMPTY).toMatch(/recorded override/i);
    const schedule = readFileSync(resolve(process.cwd(), 'src/pages/SchedulePage.tsx'), 'utf8');
    expect(schedule).toContain('NEEDS_RESOURCES_EMPTY');
    expect(schedule).toContain('emptyMessage={attentionEmpty}');
    expect(schedule).toContain('aria-pressed={attentionOnly}');
  });
});

describe('hours are unknown, not a hard block', () => {
  it('soft-warns when staff_hours is absent', () => {
    const conflicts = evaluateDispatch(snap());
    expect(conflicts.find(c => c.kind === 'hours_unknown')?.severity).toBe('soft');
    expect(decideDispatchWrite({ role: 'member', conflicts }).ok).toBe(false);
    expect(decideDispatchWrite({ role: 'admin', conflicts, overrideReason: 'usual pattern' }).ok).toBe(true);
  });
});
