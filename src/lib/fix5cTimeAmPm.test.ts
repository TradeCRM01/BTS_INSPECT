import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  timeFieldHintKind,
  TIME_FIELD_ADD_AM_PM,
  TIME_FIELD_INCOMPLETE,
  timeFieldValidationMessage,
  timeFieldsSaveValidation,
} from './timeFieldInput';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-5c C6 — hint kind (no locale check)', () => {
  it('TimeFieldInput tracks typed digit count, not browserUses12HourTime', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).not.toContain('infer24hFrom12hNativeValue');
    expect(field).not.toContain('browserUses12HourTime');
    expect(field).toContain('typedDigitCountRef');
    expect(field).toContain('time-field-am-pm-hint');
  });

  it('12h four digits without meridiem → AM/PM hint', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
      }),
    ).toBe('ampm');
  });

  it('24h partial two digits → generic incomplete (not AM/PM)', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 2,
      }),
    ).toBe('incomplete');
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: false },
        typedDigitCount: 2,
      }),
    ).toBe('incomplete');
  });

  it('12h meridiem set but minutes partial → generic incomplete', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 2,
      }),
    ).toBe('incomplete');
  });

  it('complete value → no hint', () => {
    expect(
      timeFieldHintKind({
        value: '09:30',
        validity: { badInput: false },
        typedDigitCount: 4,
      }),
    ).toBe('none');
  });

  it('cleared untouched field uses complete-time copy on save, not AM/PM', () => {
    expect(timeFieldValidationMessage('', 'none')).toMatch(/complete time/i);
    expect(timeFieldsSaveValidation({
      start: '',
      end: '',
      startHint: 'none',
      endHint: 'none',
      requireBothTimes: true,
    })?.message).toMatch(/complete time/i);
  });

  it('blocks validation with both hint messages', () => {
    expect(timeFieldValidationMessage('', 'ampm')).toBe(TIME_FIELD_ADD_AM_PM);
    expect(timeFieldValidationMessage('', 'incomplete')).toBe(TIME_FIELD_INCOMPLETE);
    expect(timeFieldsSaveValidation({
      start: '',
      end: '',
      startHint: 'ampm',
      endHint: 'none',
    })).toEqual({ message: TIME_FIELD_ADD_AM_PM, focus: 'start' });
    expect(timeFieldsSaveValidation({
      start: '',
      end: '',
      startHint: 'incomplete',
      endHint: 'none',
    })?.message).toBe(TIME_FIELD_INCOMPLETE);
  });
});

describe('FIX-5c C3 — save blocks on all time surfaces', () => {
  it('Add Time blocks save via timeFieldsSaveValidation', () => {
    const form = src('src/components/timesheets/TimeEntryForm.tsx');
    expect(form).toContain('timeFieldsSaveValidation');
    expect(form).toContain('onTimeFieldHintChange={setStartTimeHint}');
    expect(form).toContain('focusTimeFieldInput');
  });

  it('ScheduleJobSheet blocks Save on time hints', () => {
    const sheet = src('src/components/crm/ScheduleJobSheet.tsx');
    expect(sheet).toContain('timeFieldsSaveValidation');
    expect(sheet).toContain('onTimeFieldHintChange={setStartTimeHint}');
    expect(sheet).toContain('focusTimeFieldInput');
  });

  it('JobFormModal blocks create on time hints', () => {
    const modal = src('src/components/crm/JobFormModal.tsx');
    expect(modal).toContain('timeFieldsSaveValidation');
    expect(modal).toContain('onTimeFieldHintChange={setStartTimeHint}');
    expect(modal).toContain('focusTimeFieldInput');
  });

  it('quote convert blocks on time hints', () => {
    const page = src('src/pages/QuotesPage.tsx');
    expect(page).toContain('convertStartTimeHint');
    expect(page).toContain("setErr('')");
    expect(page).toContain('focusQuoteConvertField');
    expect(page).not.toMatch(/hub-quote-convert-miss[\s\S]{0,80}TIME_FIELD_ADD_AM_PM/);
  });

  it('dispatch skips persist while hint is active without refocus trap', () => {
    const panel = src('src/components/jobs/JobDispatchPanel.tsx');
    expect(panel).toContain('startTimeHintRef');
    expect(panel).toContain('onTimeFieldHintChange');
    expect(panel).toMatch(/startTimeHintRef\.current !== 'none'/);
    expect(panel).not.toMatch(/startTimeHintRef\.current[\s\S]{0,120}\.focus\(/);
  });

  it('reverted schedule sheet backdrop override from C5', () => {
    const css = src('src/index.css');
    expect(css).not.toContain('.overlay-backdrop:has(.hub-schedule-job-sheet)');
  });
});
