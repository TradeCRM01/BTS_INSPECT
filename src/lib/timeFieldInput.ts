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

export function timeFieldNeedsAmPm(input: {
  value: string;
  validity: { badInput: boolean };
  uses12Hour: boolean;
  /** User edited but blur left value empty (AM/PM never committed). */
  incompleteTouch?: boolean;
}): boolean {
  const { value, validity, uses12Hour, incompleteTouch } = input;
  if (!uses12Hour) return false;
  if (isValidCompleteTimeValue(value)) return false;
  if (validity.badInput) return true;
  if (!value && incompleteTouch) return true;
  return false;
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
