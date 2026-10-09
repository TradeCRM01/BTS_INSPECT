import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  browserUses12HourTime,
  infer24hFrom12hTypedDigits,
  TIME_FIELD_ADD_AM_PM,
  timeFieldNeedsAmPm,
  timeFieldValidationMessage,
  tryInferTimeFromDigitBuffer,
} from './timeFieldInput';
import { quoteConvertShowsInline } from './quoteJobFields';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-5b C5/C7 — 12-hour locale AM/PM', () => {
  it('shows Add AM or PM only for incomplete 12h digit entry', () => {
    expect(timeFieldValidationMessage('', true)).toBe(TIME_FIELD_ADD_AM_PM);
    expect(
      timeFieldNeedsAmPm({
        value: '',
        validity: { badInput: true },
        digitBuffer: '0930',
        uses12Hour: true,
      }),
    ).toBe(false);
    expect(
      timeFieldNeedsAmPm({
        value: '',
        validity: { badInput: false },
        digitBuffer: '',
        uses12Hour: true,
      }),
    ).toBe(false);
    expect(
      timeFieldNeedsAmPm({
        value: '09:30',
        validity: { badInput: false },
        digitBuffer: '',
        uses12Hour: true,
      }),
    ).toBe(false);
    expect(
      timeFieldNeedsAmPm({
        value: '',
        validity: { badInput: true },
        digitBuffer: '0930',
        uses12Hour: false,
      }),
    ).toBe(false);
    expect(quoteConvertShowsInline(TIME_FIELD_ADD_AM_PM)).toBe(true);
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toContain('time-field-am-pm-hint');
    expect(field).toContain('is-visible');
    expect(field).not.toContain('queueMicrotask');
  });

  it('infers 24h from typed digits (incl. 3-digit 930) with PM/AM boundaries', () => {
    expect(infer24hFrom12hTypedDigits('0930')).toBe('09:30');
    expect(infer24hFrom12hTypedDigits('0230')).toBe('14:30');
    expect(infer24hFrom12hTypedDigits('930')).toBe('09:30');
    expect(infer24hFrom12hTypedDigits('0600')).toBe('18:00');
    expect(infer24hFrom12hTypedDigits('0700')).toBe('07:00');
    expect(infer24hFrom12hTypedDigits('1200')).toBe('12:00');
    expect(infer24hFrom12hTypedDigits('0030')).toBe(null);
    expect(tryInferTimeFromDigitBuffer('0930', true)).toBe('09:30');
    expect(tryInferTimeFromDigitBuffer('0930', false)).toBe(null);
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

  it('detects 12h vs 24h browser locales', () => {
    expect(browserUses12HourTime('en-AU')).toBe(true);
    expect(browserUses12HourTime('en-GB')).toBe(false);
  });
});
