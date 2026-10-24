import { describe, expect, it } from 'vitest';
import { jobNeedsCrew } from './needCrew';

/** Dated crewless job. The `'done'→'Done'` map in needCrew.ts:45-51 is the pin. */
const datedCrewless = {
  scheduled_date: '2026-10-19',
  assigned_team: [] as string[],
};

describe('P3 jobNeedsCrew done→Done mapping', () => {
  it('jobNeedsCrew({status:\'done\'}) is false — finished via the done→Done map', () => {
    expect(jobNeedsCrew({ ...datedCrewless, status: 'done' })).toBe(false);
  });

  it('jobNeedsCrew({status:\'unknown\'}) is true — unknown is not mapped to Done', () => {
    expect(jobNeedsCrew({ ...datedCrewless, status: 'unknown' })).toBe(true);
  });
});
