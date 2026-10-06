import { describe, expect, it } from 'vitest';
import { crewAssignmentHelper, nextAssignedTeam } from './jobDispatchCrew';

describe('jobDispatchCrew optimistic helpers', () => {
  const team = [
    { id: 'crew2-cos', name: 'Grafter CoS Test' },
    { id: 'crew2-invitee', name: 'CoS Invitee Test' },
  ];

  it('toggles crew membership for optimistic chip state', () => {
    expect(nextAssignedTeam([], 'crew2-cos')).toEqual(['crew2-cos']);
    expect(nextAssignedTeam(['crew2-cos'], 'crew2-cos')).toEqual([]);
    expect(nextAssignedTeam(['crew2-cos'], 'crew2-invitee')).toEqual(['crew2-cos', 'crew2-invitee']);
  });

  it('syncs helper copy with assigned crew names', () => {
    expect(crewAssignmentHelper([], team)).toContain('Unassigned');
    expect(crewAssignmentHelper(['crew2-cos'], team)).toBe('Grafter CoS Test');
    expect(crewAssignmentHelper(['crew2-cos', 'crew2-invitee'], team)).toBe(
      'Grafter CoS Test · CoS Invitee Test',
    );
  });
});
