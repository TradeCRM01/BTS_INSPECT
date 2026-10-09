import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  infer24hFrom12hTypedDigits,
  TIME_FIELD_ADD_AM_PM,
  timeFieldNeedsAmPm,
  timeFieldValidationMessage,
} from './timeFieldInput';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-5b C5 — 12-hour locale AM/PM', () => {
  it('shows Add AM or PM for incomplete native time input', () => {
    expect(timeFieldValidationMessage('', true)).toBe(TIME_FIELD_ADD_AM_PM);
    expect(
      timeFieldNeedsAmPm({ value: '', validity: { badInput: true } }, false),
    ).toBe(true);
    expect(timeFieldNeedsAmPm({ value: '', validity: { badInput: false } }, true)).toBe(true);
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toContain('time-field-am-pm-hint');
    expect(field).toContain('TIME_FIELD_ADD_AM_PM');
    expect(field).toContain('onIncompleteAmPmChange');
    expect(field).toContain('infer24hFrom12hTypedDigits');
  });

  it('infers 24h from typed digits on blur (Coach P1 thin default)', () => {
    expect(infer24hFrom12hTypedDigits('0930')).toBe('09:30');
    expect(infer24hFrom12hTypedDigits('0230')).toBe('14:30');
    expect(infer24hFrom12hTypedDigits('1200')).toBe('12:00');
    expect(infer24hFrom12hTypedDigits('0030')).toBe(null);
  });

  it('TimeFieldInput is shared across Add Time, schedule, job form, dispatch, quote convert', () => {
    expect(src('src/components/timesheets/TimeEntryForm.tsx')).toContain('TimeFieldInput');
    expect(src('src/components/crm/ScheduleJobSheet.tsx')).toContain('TimeFieldInput');
    expect(src('src/components/crm/JobFormModal.tsx')).toContain('TimeFieldInput');
    expect(src('src/components/jobs/JobDispatchPanel.tsx')).toContain('TimeFieldInput');
    expect(src('src/pages/QuotesPage.tsx')).toContain('TimeFieldInput');
    const form = src('src/components/timesheets/TimeEntryForm.tsx');
    expect(form).toContain('noValidate');
    expect(form).toContain('onIncompleteAmPmChange');
    expect(form).toContain('timeFieldValidationMessage(form.start_time, startNeedsAmPm)');
  });
});
