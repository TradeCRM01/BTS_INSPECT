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
    return parts.some((p) => p.type === 'dayPeriod');
  } catch {
    return false;
  }
}

/**
 * Coach P1: infer 24h HH:mm from typed digits in 12-hour mode.
 * Hour 1–6 → PM, 7–11 → AM, 12 → PM. Accepts 3- or 4-digit buffers (930 → 0930).
 */
export function infer24hFrom12hTypedDigits(digits: string): string | null {
  const raw = digits.replace(/\D/g, '');
  const normalized = raw.length === 3 ? `0${raw}` : raw;
  if (!/^\d{4}$/.test(normalized)) return null;
  const hour12 = Number(normalized.slice(0, 2));
  const mm = Number(normalized.slice(2, 4));
  if (mm > 59) return null;
  if (hour12 < 1 || hour12 > 12) return null;
  let hour24 = hour12;
  if (hour12 >= 1 && hour12 <= 6) hour24 = hour12 + 12;
  else if (hour12 >= 7 && hour12 <= 11) hour24 = hour12;
  else if (hour12 === 12) hour24 = 12;
  return `${String(hour24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export type TimeFieldAmPmInput = {
  value: string;
  validity: { badInput: boolean };
  digitBuffer: string;
  uses12Hour: boolean;
};

/** 12h only: hour+minute digits entered but value not committed (AM/PM missing). */
export function timeFieldNeedsAmPm(input: TimeFieldAmPmInput): boolean {
  const { value, validity, digitBuffer, uses12Hour } = input;
  if (!uses12Hour) return false;
  if (!digitBuffer && !value) return false;
  if (isValidCompleteTimeValue(value)) return false;
  const digits = digitBuffer.replace(/\D/g, '');
  if (digits.length >= 3) {
    const inferred = infer24hFrom12hTypedDigits(digits);
    if (inferred && digits.length >= 4) return false;
    if (digits.length >= 4 && !inferred) return true;
    if (digits.length === 3 && infer24hFrom12hTypedDigits(digits)) return false;
  }
  if (validity.badInput && digits.length >= 3) return true;
  return false;
}

export function tryInferTimeFromDigitBuffer(
  digitBuffer: string,
  uses12Hour: boolean,
): string | null {
  if (!uses12Hour) return null;
  const digits = digitBuffer.replace(/\D/g, '');
  if (digits.length < 3) return null;
  return infer24hFrom12hTypedDigits(digits);
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
