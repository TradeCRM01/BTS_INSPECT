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
 * Show the AM/PM hint only when the user typed time digits and the native control
 * reports badInput (meridiem missing in a 12h field). No navigator.language branch:
 * 24h fields do not surface this state.
 */
export function timeFieldNeedsAmPm(input: {
  value: string;
  validity: { badInput: boolean };
  hasTypedDigits: boolean;
}): boolean {
  const { value, validity, hasTypedDigits } = input;
  if (isValidCompleteTimeValue(value)) return false;
  if (!hasTypedDigits) return false;
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

export type TimeFieldSaveFocus = 'start' | 'end';

/** Block save/create when AM/PM hint is active or required times are incomplete. */
export function timeFieldsSaveValidation(input: {
  start: string;
  end: string;
  startNeedsAmPm: boolean;
  endNeedsAmPm: boolean;
  requireBothTimes?: boolean;
}): { message: string; focus: TimeFieldSaveFocus } | null {
  if (input.startNeedsAmPm) {
    return { message: TIME_FIELD_ADD_AM_PM, focus: 'start' };
  }
  if (input.endNeedsAmPm) {
    return { message: TIME_FIELD_ADD_AM_PM, focus: 'end' };
  }
  if (input.requireBothTimes) {
    const startMsg = timeFieldValidationMessage(input.start, false);
    if (startMsg) return { message: startMsg, focus: 'start' };
    const endMsg = timeFieldValidationMessage(input.end, false);
    if (endMsg) return { message: endMsg, focus: 'end' };
  }
  return null;
}

export function focusTimeFieldInput(container: ParentNode | null | undefined): void {
  const root = container instanceof HTMLElement ? container : document;
  const input = root.querySelector<HTMLInputElement>('input[type="time"]');
  input?.focus();
}

/** AM/PM is shown under the field; form-level banners only carry non-meridiem errors. */
export function timeFieldSaveFormError(message: string): string | null {
  return message === TIME_FIELD_ADD_AM_PM ? null : message;
}

export function applyTimeFieldsSaveBlock(
  block: { message: string; focus: TimeFieldSaveFocus },
  handlers: {
    setFormError: (message: string | null) => void;
    focusStart: () => void;
    focusEnd: () => void;
  },
): void {
  handlers.setFormError(timeFieldSaveFormError(block.message));
  if (block.focus === 'start') handlers.focusStart();
  else handlers.focusEnd();
}
