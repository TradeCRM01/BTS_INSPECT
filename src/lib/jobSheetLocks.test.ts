import { describe, expect, it } from 'vitest';
import { JOB_SHEET_HEAD_BAR, JOB_SHEET_LINK } from './jobSheetLocks';

describe('Jack 19 Oct job sheet locks', () => {
  it('keeps the navy head bar and link as one-line swaps', () => {
    expect(JOB_SHEET_HEAD_BAR).toBe('#0A2540');
    expect(JOB_SHEET_LINK).toBe('#296AA5');
  });
});
