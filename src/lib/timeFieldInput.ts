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

/** Native 12-hour time input: hours/minutes typed but AM/PM not chosen yet. */
export function timeFieldNeedsAmPm(
  input: { value: string; validity: { badInput: boolean } },
  typedSinceFocus: boolean,
): boolean {
  if (input.validity.badInput) return true;
  if (typedSinceFocus && !input.value) return true;
  return false;
}

/**
 * Coach P1: infer 24h HH:mm from four typed digits in 12-hour mode.
 * Hour 1–6 → PM, 7–11 → AM, 12 → PM. Returns null when digits are not a valid clock time.
 */
export function infer24hFrom12hTypedDigits(digits: string): string | null {
  if (!/^\d{4}$/.test(digits)) return null;
  const hour12 = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  if (mm > 59) return null;
  if (hour12 < 1 || hour12 > 12) return null;
  let hour24 = hour12;
  if (hour12 >= 1 && hour12 <= 6) hour24 = hour12 + 12;
  else if (hour12 >= 7 && hour12 <= 11) hour24 = hour12;
  else if (hour12 === 12) hour24 = 12;
  return `${String(hour24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
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
