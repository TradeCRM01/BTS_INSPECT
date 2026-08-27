import { describe, expect, it } from 'vitest';
import { formatJobRef, nextCostCode, normalizeCostCode, withParentJobNumbers } from './jobRef';

describe('formatJobRef', () => {
  it('shows the padded job number on its own', () => {
    expect(formatJobRef({ job_number: 42 })).toBe('#0042');
  });

  it('appends a cost code like Simpro', () => {
    expect(formatJobRef({ job_number: 42, cost_code: '01' })).toBe('#0042.01');
    expect(formatJobRef({ job_number: 42, cost_code: ' LAB ' })).toBe('#0042.LAB');
  });

  it('uses the parent job number for a stage', () => {
    expect(formatJobRef({
      job_number: 44,
      parent_job_number: 42,
      cost_code: '01',
    })).toBe('#0042.01');
  });

  it('stays JOB when nothing is numbered', () => {
    expect(formatJobRef({})).toBe('JOB');
    expect(formatJobRef({ cost_code: '01' })).toBe('JOB.01');
  });
});

describe('nextCostCode', () => {
  it('starts at 01 and skips used codes', () => {
    expect(nextCostCode([])).toBe('01');
    expect(nextCostCode(['01', 'LAB', '02'])).toBe('03');
  });
});

describe('normalizeCostCode', () => {
  it('strips a leading dot and caps length', () => {
    expect(normalizeCostCode('.01')).toBe('01');
    expect(normalizeCostCode(' 01 ')).toBe('01');
  });
});

describe('withParentJobNumbers', () => {
  it('fills parent_job_number from the same list or extras', () => {
    const rows = withParentJobNumbers([
      { id: 'p', job_number: 42, parent_job_id: null },
      { id: 'c', job_number: 44, parent_job_id: 'p' },
      { id: 'other', job_number: 50, parent_job_id: 'missing' },
    ], [{ id: 'missing', job_number: 9 }]);
    expect(rows[1].parent_job_number).toBe(42);
    expect(rows[2].parent_job_number).toBe(9);
    expect(rows[0].parent_job_number).toBe(null);
  });
});
