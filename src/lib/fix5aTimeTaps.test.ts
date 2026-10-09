/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyTimeFieldDigitKey, shouldBlockTimeFieldEnter } from './timeFieldInput';
import {
  TIMESHEET_ENTRY_DELETE_BILLED,
  timesheetEntryDeleteBlockedReason,
} from './timesheetEntryDelete';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-5a — phone time taps', () => {
  it('blocks Enter in the time picker from submitting Add Time', () => {
    expect(shouldBlockTimeFieldEnter('Enter')).toBe(true);
    const form = src('src/components/timesheets/TimeEntryForm.tsx');
    expect(form).toContain('TimeFieldInput');
    expect(form).toContain('saveLock.current');
    expect(form).toContain('if (saveLock.current || saving) return');
    expect(src('src/lib/timeFieldInput.ts')).toContain("key === 'Enter'");
  });

  it('types digits key by key into 09:30', () => {
    let v = '';
    for (const d of ['0', '9', '3', '0']) v = applyTimeFieldDigitKey(v, d);
    expect(v).toBe('09:30');
  });

  it('guards double submit so one save makes one entry', () => {
    const form = src('src/components/timesheets/TimeEntryForm.tsx');
    expect(form).toContain('saveLock.current = true');
    expect(form.indexOf('saveLock.current = true')).toBeLessThan(form.indexOf("from('timesheet_entries').insert"));
    expect(form).toContain('saveLock.current = false');
  });

  it('allows unbilled delete and blocks billed with a plain reason', () => {
    expect(timesheetEntryDeleteBlockedReason('e1', new Set())).toBeNull();
    expect(timesheetEntryDeleteBlockedReason('e2', new Set(['e2']))).toBe(TIMESHEET_ENTRY_DELETE_BILLED);
    const page = src('src/pages/TimesheetsPage.tsx');
    expect(page).toContain('deleteUnbilledTimesheetEntry');
    expect(page).toContain('timesheetEntryDeleteBlockedReason');
    expect(page).toContain('hub-timesheets-delete-btn');
    expect(src('src/lib/timesheetEntryDelete.ts')).toContain(TIMESHEET_ENTRY_DELETE_BILLED);
  });

  it('toast Open navigates on a fast tap and action toasts last 15s', () => {
    const toast = src('src/components/ui/Toast.tsx');
    expect(toast).toContain('action ? 15000 : 3500');
    expect(toast).toContain('onPointerDown');
    expect(toast).toContain('touch-manipulation');
    expect(toast.indexOf('onPointerDown')).toBeLessThan(toast.indexOf('onClick={e => e.preventDefault()}'));
  });
});
