/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidCompleteTimeValue, shouldBlockTimeFieldEnter, timeFieldValidationMessage } from './timeFieldInput';
import {
  TIMESHEET_ENTRY_DELETE_BILLED,
  timesheetEntryDeleteUiState,
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

  it('does not hijack native digit typing on prefilled type=time fields', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).not.toContain('applyTimeFieldDigitKey');
    expect(field).not.toContain('timeFieldInputKeyDown');
    expect(src('src/lib/timeFieldInput.ts')).not.toContain('applyTimeFieldDigitKey');
    expect(isValidCompleteTimeValue('09:30')).toBe(true);
    expect(isValidCompleteTimeValue('24:00')).toBe(false);
    expect(timeFieldValidationMessage('9')).toMatch(/valid time/i);
  });

  it('dispatch persists job times on blur, not each keystroke', () => {
    const panel = src('src/components/jobs/JobDispatchPanel.tsx');
    expect(panel).toContain('onBlurCommit');
    expect(panel).not.toMatch(/onChange=\{v => save\.mutate/);
  });

  it('guards double submit so one save makes one entry', () => {
    const form = src('src/components/timesheets/TimeEntryForm.tsx');
    expect(form).toContain('saveLock.current = true');
    expect(form.indexOf('saveLock.current = true')).toBeLessThan(form.indexOf("from('timesheet_entries').insert"));
    expect(form).toContain('saveLock.current = false');
  });

  it('allows unbilled delete and blocks billed with a plain reason', () => {
    const deleteCtl = src('src/components/timesheets/TimesheetEntryDeleteControl.tsx');
    expect(deleteCtl).toContain('Delete this time entry?');
    expect(deleteCtl).toContain('billedGate');
    expect(src('src/lib/timesheetEntryDelete.ts')).toContain('recomputeTimesheetTotalMinutes');
    expect(src('src/lib/timesheetEntryDelete.ts')).toContain('job_costs');
    expect(
      timesheetEntryDeleteUiState(
        { id: 'e2', end_time: '2026-10-06T10:00:00.000Z' },
        { loaded: true, billingCheckOk: true, ids: new Set(['e2']) },
      ).lockMessage,
    ).toBe(TIMESHEET_ENTRY_DELETE_BILLED);
  });

  it('FIX-5a C2 — job page lists hours with delete where phone users fix duplicates', () => {
    const job = src('src/pages/JobDetailPage.tsx');
    expect(job).toContain('id="job-hours"');
    expect(job).toContain('Time on this job');
    expect(job).toMatch(/id="job-hours"[\s\S]*TimesheetEntryDeleteControl/);
    expect(src('src/index.css')).toContain('.hub-jobs-document #job-hours .job-hours-entry-row');
    expect(job).toContain('job-hours-entry-row');
    const timesheets = src('src/pages/TimesheetsPage.tsx');
    expect(timesheets).toContain('TimesheetEntryDeleteControl');
  });

  it('toast Open uses click (not pointerdown) and action toasts last 15s', () => {
    const toast = src('src/components/ui/Toast.tsx');
    expect(toast).toContain('action ? 15000 : 3500');
    expect(toast).toContain('touch-manipulation');
    expect(toast).toMatch(/onClick=\{\(\) => \{[\s\S]*toast\.action/);
    expect(toast).not.toMatch(/onPointerDown=\{[^}]*toast\.action/);
    expect(toast.indexOf('animate-slide-in-right')).toBeLessThan(toast.indexOf('toast.action'));
  });
});
