import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  browserUses12HourTime,
  timeFieldNeedsAmPm,
  TIME_FIELD_ADD_AM_PM,
  timeFieldValidationMessage,
} from './timeFieldInput';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-5c AM/PM — hint only (no value re-inference)', () => {
  it('detects 12h locales', () => {
    expect(browserUses12HourTime('en-AU')).toBe(true);
    expect(browserUses12HourTime('en-GB')).toBe(false);
  });

  it('TimeFieldInput does not re-infer committed native values', () => {
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).not.toContain('infer24hFrom12hNativeValue');
    expect(field).not.toContain('digitBufferRef');
    expect(field).toContain('time-field-am-pm-hint');
  });

  it('shows hint when badInput and value incomplete in 12h', () => {
    expect(
      timeFieldNeedsAmPm({
        value: '',
        validity: { badInput: true },
        uses12Hour: true,
      }),
    ).toBe(true);
    expect(
      timeFieldNeedsAmPm({
        value: '09:30',
        validity: { badInput: false },
        uses12Hour: true,
      }),
    ).toBe(false);
    expect(
      timeFieldNeedsAmPm({
        value: '',
        validity: { badInput: false },
        uses12Hour: true,
        incompleteTouch: true,
      }),
    ).toBe(true);
  });

  it('blocks validation with Add AM or PM when incomplete', () => {
    expect(timeFieldValidationMessage('', true)).toBe(TIME_FIELD_ADD_AM_PM);
    expect(timeFieldValidationMessage('09:30', false)).toBeNull();
  });
});
