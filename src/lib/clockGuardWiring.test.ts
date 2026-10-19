import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jobClockOffBlocked, jobClockOnBlocked } from './timesheetOverlapQuery';
import { formatClockFinishLabel, TIME_ENTRY_OVERLAP_MESSAGE, TIME_ENTRY_ZERO_LENGTH_MESSAGE } from './dateTimeIntegrity';

describe('clock guards used by Job and Timesheets pages', () => {
  it('JobDetailPage calls both clock guards', () => {
    const src = readFileSync('src/pages/JobDetailPage.tsx', 'utf8');
    expect(src).toContain('jobClockOnBlocked');
    expect(src).toContain('jobClockOffBlocked');
    expect(src).toMatch(/if \(clockErr\) throw new Error\(clockErr\)/);
    expect(src).toMatch(/if \(offErr\) throw new Error\(offErr\)/);
  });

  it('TimesheetsPage calls clock-off guard and (+1) finish label', () => {
    const src = readFileSync('src/pages/TimesheetsPage.tsx', 'utf8');
    expect(src).toContain('jobClockOffBlocked');
    expect(src).toContain('formatClockFinishLabel(entry.start_time, entry.end_time)');
    expect(src).toMatch(/if \(offErr\) throw new Error\(offErr\)/);
  });

  it('page guards stay wired to the shared helpers', async () => {
    expect(await jobClockOnBlocked({
      employeeId: 'emp-1',
      now: '2026-10-21T09:00:00+10:00',
      load: async () => [{ start_time: '2026-10-20T22:00:00+10:00', end_time: null }],
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
    expect(await jobClockOffBlocked({
      employeeId: 'emp-1',
      startIso: '2026-10-21T07:45:10+10:00',
      endIso: '2026-10-21T07:45:40+10:00',
      load: async () => [],
    })).toBe(TIME_ENTRY_ZERO_LENGTH_MESSAGE);
    expect(formatClockFinishLabel('2026-10-19T23:00:00', '2026-10-20T01:00:00')).toBe('01:00 (+1)');
  });
});
