/** Block form submit when Enter is pressed inside a native time field. */
export function shouldBlockTimeFieldEnter(key: string): boolean {
  return key === 'Enter';
}

export const TIME_FIELD_ADD_AM_PM = 'Add AM or PM';

/** True when value is a complete 24h time (rejects 24:00 and partial strings). */
export function isValidCompleteTimeValue(value: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return false;
  return true;
}

/** Browser locale uses 12-hour clock (AM/PM segment in native time inputs). */
export function browserUses12HourTime(locale?: string | string[]): boolean {
  try {
    const parts = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).formatToParts(
      new Date(2024, 0, 1, 13, 30),
    );
    return parts.some(p => p.type === 'dayPeriod');
  } catch {
    return false;
  }
}

/**
 * After the browser commits a native time value in 12h locales, reinterpret hours 1–12
 * with coach rules (1–6 → PM, 7–11 → AM, 12 → PM). Skips 00 and 13–23 (already 24h).
 */
export function infer24hFrom12hNativeValue(value: string): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hour12 = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hour12) || !Number.isFinite(mm) || mm > 59) return null;
  if (hour12 < 1 || hour12 > 12) return null;
  let hour24: number;
  if (hour12 >= 1 && hour12 <= 6) hour24 = hour12 + 12;
  else if (hour12 >= 7 && hour12 <= 11) hour24 = hour12;
  else hour24 = 12;
  return `${String(hour24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function timeFieldNeedsAmPm(input: {
  value: string;
  validity: { badInput: boolean };
  uses12Hour: boolean;
}): boolean {
  const { value, validity, uses12Hour } = input;
  if (!uses12Hour) return false;
  if (isValidCompleteTimeValue(value)) return false;
  if (!value) return validity.badInput;
  return validity.badInput;
}

export function timeFieldValidationMessage(
  value: string,
  needsAmPm = false,
): string | null {
  if (needsAmPm) return TIME_FIELD_ADD_AM_PM;
  if (!value) return 'Enter a complete time (hours and minutes).';
  if (!isValidCompleteTimeValue(value)) {
    return 'Enter a valid time as hh:mm (hours 00–23, minutes 00–59).';
  }
  return null;
}
