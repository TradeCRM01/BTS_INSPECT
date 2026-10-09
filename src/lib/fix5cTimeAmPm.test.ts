import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  setTimeFieldRendersMeridiemProbeOverride,
  resetTimeFieldRendersMeridiemProbeCache,
} from './timeFieldMeridiemProbe';
import {
  timeFieldDigitsImplyMeridiemHint,
  timeFieldHintKind,
  TIME_FIELD_ADD_AM_PM,
  TIME_FIELD_INCOMPLETE,
  timeFieldValidationMessage,
  timeFieldsSaveValidation,
} from './timeFieldInput';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

afterEach(() => {
  setTimeFieldRendersMeridiemProbeOverride(undefined);
  resetTimeFieldRendersMeridiemProbeCache();
});

describe('FIX-5c C7 — meridiem probe + hint copy', () => {
  it('TimeFieldInput uses meridiem probe and reserves hint line only for 12h', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).toContain('timeFieldRendersMeridiem');
    expect(field).toContain('rendersMeridiem ?');
    expect(field).toContain('digitSequenceRef');
    expect(field).toContain('meridiemEngagedRef');
    expect(field).not.toContain('browserUses12HourTime');
  });

  it('probe module compares live vs reference probe widths (no navigator.language)', () => {
    const probe = src('src/lib/timeFieldMeridiemProbe.ts');
    expect(probe).toContain('time-field-meridiem-probe-live');
    expect(probe).toContain('time-field-meridiem-probe-ref');
    expect(probe).not.toMatch(/navigator\.language\s*[;=]/);
  });

  it('12h 0930 keystrokes → AM/PM hint when probe is 12h', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: true,
        digitSequence: '0930',
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('ampm');
  });

  it('24h four digit keys → generic incomplete, not AM/PM', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: false,
        digitSequence: '0800',
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('incomplete');
  });

  it('24h partial 09 → generic incomplete', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 2,
        rendersMeridiem: false,
        digitSequence: '09',
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('incomplete');
  });

  it('12h meridiem engaged (a then digits) → generic incomplete', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: true,
        digitSequence: '0808',
        meridiemEngagedSinceFocus: true,
      }),
    ).toBe('incomplete');
  });

  it('12h on-the-hour four keys (0800) → generic incomplete', () => {
    expect(timeFieldDigitsImplyMeridiemHint('0800')).toBe(false);
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 4,
        rendersMeridiem: true,
        digitSequence: '0800',
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('incomplete');
  });

  it('soft: leave and return resets digit session (unit: zero count → no ampm)', () => {
    expect(
      timeFieldHintKind({
        value: '',
        validity: { badInput: true },
        typedDigitCount: 2,
        rendersMeridiem: true,
        digitSequence: '30',
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('incomplete');
  });

  it('complete value → no hint', () => {
    expect(
      timeFieldHintKind({
        value: '09:30',
        validity: { badInput: false },
        typedDigitCount: 4,
        rendersMeridiem: true,
        digitSequence: '0930',
        meridiemEngagedSinceFocus: false,
      }),
    ).toBe('none');
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
  });
});

describe('FIX-5c C3 — save blocks on all time surfaces', () => {
  it('Add Time blocks save via timeFieldsSaveValidation', () => {
    const form = src('src/components/timesheets/TimeEntryForm.tsx');
    expect(form).toContain('timeFieldsSaveValidation');
    expect(form).toContain('onTimeFieldHintChange={setStartTimeHint}');
  });

  it('dispatch skips persist while hint is active without refocus trap', () => {
    const panel = src('src/components/jobs/JobDispatchPanel.tsx');
    expect(panel).toContain('startTimeHintRef');
    expect(panel).not.toMatch(/startTimeHintRef\.current[\s\S]{0,120}\.focus\(/);
  });
});
