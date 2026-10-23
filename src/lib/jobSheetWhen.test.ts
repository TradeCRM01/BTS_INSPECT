import { describe, expect, it } from 'vitest';
import { JOB_SHEET_NO_DATE_YET, jobSheetClockRange, jobSheetWhenLine } from './jobSheetWhen';

describe('job sheet when line', () => {
  it('prints Mon 19 Oct · 07:00–10:30 with no spaces around the en dash', () => {
    expect(jobSheetWhenLine({
      scheduled_date: '2026-10-19',
      start_time: '07:00',
      end_time: '10:30',
    })).toEqual({ text: 'Mon 19 Oct · 07:00–10:30', undated: false });
    expect(jobSheetClockRange('07:00:00', '10:30:00')).toBe('07:00–10:30');
    expect(jobSheetClockRange('07:00', '10:30')).not.toContain(' – ');
  });

  it('uses No date yet when the job has no day', () => {
    expect(jobSheetWhenLine({ scheduled_date: null })).toEqual({
      text: JOB_SHEET_NO_DATE_YET,
      undated: true,
    });
  });
});
