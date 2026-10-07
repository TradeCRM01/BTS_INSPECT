import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crewAssignmentHelper, nextAssignedTeam } from './jobDispatchCrew';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

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

  it('JobDispatchPanel uses optimistic crew draft before mutate settles', () => {
    const panel = src('src/components/jobs/JobDispatchPanel.tsx');
    expect(panel).toContain('crewDraft');
    expect(panel).toContain('nextAssignedTeam');
    expect(panel).toContain('persistCrew');
    expect(panel).toContain('data-crew-assignment-helper');
    expect(panel).not.toContain('disabled={save.isPending}');
  });

  it('syncs helper copy with assigned crew names', () => {
    expect(crewAssignmentHelper([], team)).toContain('Tap a name');
    expect(crewAssignmentHelper(['crew2-cos'], team)).toBe('Grafter CoS Test');
    expect(crewAssignmentHelper(['crew2-cos', 'crew2-invitee'], team)).toBe(
      'Grafter CoS Test · CoS Invitee Test',
    );
  });
});
