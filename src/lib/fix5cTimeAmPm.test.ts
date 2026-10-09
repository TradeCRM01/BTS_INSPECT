import { describe, expect, it } from 'vitest';
import {
  browserUses12HourTime,
  infer24hFrom12hNativeValue,
  timeFieldNeedsAmPm,
  TIME_FIELD_ADD_AM_PM,
  timeFieldValidationMessage,
} from './timeFieldInput';

describe('FIX-5c AM/PM — pure rules', () => {
  it('detects 12h locales', () => {
    expect(browserUses12HourTime('en-AU')).toBe(true);
    expect(browserUses12HourTime('en-GB')).toBe(false);
  });

  it('infers 24h from native committed 12h clock values', () => {
    expect(infer24hFrom12hNativeValue('09:30')).toBe('09:30');
    expect(infer24hFrom12hNativeValue('02:30')).toBe('14:30');
    expect(infer24hFrom12hNativeValue('07:00')).toBe('07:00');
    expect(infer24hFrom12hNativeValue('06:00')).toBe('18:00');
    expect(infer24hFrom12hNativeValue('12:00')).toBe('12:00');
    expect(infer24hFrom12hNativeValue('21:30')).toBeNull();
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
        validity: { badInput: true },
        uses12Hour: false,
      }),
    ).toBe(false);
  });

  it('blocks validation with Add AM or PM when incomplete', () => {
    expect(timeFieldValidationMessage('', true)).toBe(TIME_FIELD_ADD_AM_PM);
    expect(timeFieldValidationMessage('09:30', false)).toBeNull();
  });
});
