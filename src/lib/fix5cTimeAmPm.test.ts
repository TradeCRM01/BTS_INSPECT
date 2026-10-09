import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  timeFieldNeedsAmPm,
  TIME_FIELD_ADD_AM_PM,
  timeFieldValidationMessage,
  timeFieldsSaveValidation,
} from './timeFieldInput';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-5c AM/PM — hint only (no value re-inference)', () => {
  it('TimeFieldInput does not re-infer or branch on navigator.language', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).not.toContain('infer24hFrom12hNativeValue');
    expect(field).not.toContain('browserUses12HourTime');
    expect(field).toContain('time-field-am-pm-hint');
    expect(field).toContain('hasTypedDigitsRef');
  });

  it('shows hint only with typed digits and badInput', () => {
    expect(
      timeFieldNeedsAmPm({
        value: '',
        validity: { badInput: true },
        hasTypedDigits: true,
      }),
    ).toBe(true);
    expect(
      timeFieldNeedsAmPm({
        value: '',
        validity: { badInput: true },
        hasTypedDigits: false,
      }),
    ).toBe(false);
    expect(
      timeFieldNeedsAmPm({
        value: '09:30',
        validity: { badInput: false },
        hasTypedDigits: true,
      }),
    ).toBe(false);
  });

  it('cleared untouched field uses complete-time copy on save, not AM/PM', () => {
    expect(timeFieldValidationMessage('', false)).toMatch(/complete time/i);
    expect(timeFieldsSaveValidation({
      start: '',
      end: '',
      startNeedsAmPm: false,
      endNeedsAmPm: false,
      requireBothTimes: true,
    })?.message).toMatch(/complete time/i);
  });

  it('blocks validation with Add AM or PM when incomplete', () => {
    expect(timeFieldValidationMessage('', true)).toBe(TIME_FIELD_ADD_AM_PM);
    expect(timeFieldValidationMessage('09:30', false)).toBeNull();
    expect(timeFieldsSaveValidation({
      start: '',
      end: '',
      startNeedsAmPm: true,
      endNeedsAmPm: false,
    })).toEqual({ message: TIME_FIELD_ADD_AM_PM, focus: 'start' });
  });
});

describe('FIX-5c C3 — save blocks on all time surfaces', () => {
  it('Add Time blocks save via timeFieldsSaveValidation', () => {
    const form = src('src/components/timesheets/TimeEntryForm.tsx');
    expect(form).toContain('timeFieldsSaveValidation');
    expect(form).toContain('onIncompleteAmPmChange={setStartNeedsAmPm}');
    expect(form).toContain('focusTimeFieldInput');
  });

  it('ScheduleJobSheet blocks Save on AM/PM hint', () => {
    const sheet = src('src/components/crm/ScheduleJobSheet.tsx');
    expect(sheet).toContain('timeFieldsSaveValidation');
    expect(sheet).toContain('onIncompleteAmPmChange={setStartNeedsAmPm}');
    expect(sheet).toContain('focusTimeFieldInput');
  });

  it('JobFormModal blocks create on AM/PM hint', () => {
    const modal = src('src/components/crm/JobFormModal.tsx');
    expect(modal).toContain('timeFieldsSaveValidation');
    expect(modal).toContain('onIncompleteAmPmChange={setStartNeedsAmPm}');
    expect(modal).toContain('focusTimeFieldInput');
  });

  it('quote convert blocks on AM/PM hint', () => {
    const page = src('src/pages/QuotesPage.tsx');
    expect(page).toContain('convertStartNeedsAmPm');
    expect(page).toContain('TIME_FIELD_ADD_AM_PM');
    expect(page).toContain('focusQuoteConvertField');
  });

  it('dispatch does not persist while AM/PM hint is active', () => {
    const panel = src('src/components/jobs/JobDispatchPanel.tsx');
    expect(panel).toContain('startNeedsAmPmRef');
    expect(panel).toContain('onIncompleteAmPmChange');
    expect(panel).toMatch(/startNeedsAmPmRef\.current[\s\S]{0,120}focus/);
  });
});
