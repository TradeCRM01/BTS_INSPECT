/** Block form submit when Enter is pressed inside a native time field. */
export function shouldBlockTimeFieldEnter(key: string): boolean {
  return key === 'Enter';
}

export const TIME_FIELD_ADD_AM_PM = 'Add AM or PM';
export const TIME_FIELD_INCOMPLETE =
  'Enter a complete time (hours and minutes).';

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

export type TimeFieldHintKind = 'none' | 'ampm' | 'incomplete';

export type TimeFieldSegmentProgress = {
  hourFilled: boolean;
  minuteFilled: boolean;
};

export function timeFieldSegmentProgressFromCounts(
  hourDigits: number,
  minuteDigits: number,
): TimeFieldSegmentProgress {
  return {
    hourFilled: hourDigits >= 2,
    minuteFilled: minuteDigits >= 2,
  };
}

/** Which segment the caret is editing on a native time control (hh:mm). */
export function timeFieldActiveSegment(el: HTMLInputElement): 'hour' | 'minute' {
  const pos = el.selectionStart;
  if (pos !== null && pos >= 3) return 'minute';
  return 'hour';
}

export function applyTimeFieldDigitsToSegmentCounts(
  hourDigits: number,
  minuteDigits: number,
  segment: 'hour' | 'minute',
  digitsAdded: number,
): { hourDigits: number; minuteDigits: number } {
  const cap = 2;
  if (segment === 'hour') {
    return { hourDigits: Math.min(cap, hourDigits + digitsAdded), minuteDigits };
  }
  return { hourDigits, minuteDigits: Math.min(cap, minuteDigits + digitsAdded) };
}

export function applyTimeFieldDigitBatch(
  hourDigits: number,
  minuteDigits: number,
  startSegment: 'hour' | 'minute',
  digitCount: number,
): { hourDigits: number; minuteDigits: number } {
  let h = hourDigits;
  let m = minuteDigits;
  let seg = startSegment;
  for (let i = 0; i < digitCount; i++) {
    const next = applyTimeFieldDigitsToSegmentCounts(h, m, seg, 1);
    h = next.hourDigits;
    m = next.minuteDigits;
    if (h >= 2 && seg === 'hour') seg = 'minute';
  }
  return { hourDigits: h, minuteDigits: m };
}

export function timeFieldHintMessage(kind: TimeFieldHintKind): string | null {
  if (kind === 'ampm') return TIME_FIELD_ADD_AM_PM;
  if (kind === 'incomplete') return TIME_FIELD_INCOMPLETE;
  return null;
}

/** 12h reserves an empty hint line; 24h only mounts the line while a hint is active. */
export function timeFieldHintRendersLine(
  rendersMeridiem: boolean,
  hintKind: TimeFieldHintKind,
): boolean {
  return rendersMeridiem || hintKind !== 'none';
}

/**
 * Field hint under native time input. AM/PM only on 12h-rendered fields when badInput,
 * four digit keys, and meridiem not engaged via a/p.
 */
export function timeFieldHintKind(input: {
  value: string;
  validity: { badInput: boolean };
  segments: TimeFieldSegmentProgress;
  rendersMeridiem: boolean;
  meridiemEngagedSinceFocus: boolean;
}): TimeFieldHintKind {
  const {
    value,
    validity,
    segments,
    rendersMeridiem,
    meridiemEngagedSinceFocus,
  } = input;
  if (isValidCompleteTimeValue(value)) return 'none';
  const anySegment = segments.hourFilled || segments.minuteFilled;
  if (!anySegment && !validity.badInput && !value) return 'none';

  const bothFilled = segments.hourFilled && segments.minuteFilled;
  const ampmCandidate =
    rendersMeridiem
    && validity.badInput
    && bothFilled
    && !meridiemEngagedSinceFocus;

  if (ampmCandidate) return 'ampm';
  if (anySegment || validity.badInput || value) return 'incomplete';
  return 'none';
}

export function timeFieldValidationMessage(
  value: string,
  fieldHint: TimeFieldHintKind = 'none',
): string | null {
  const hintMsg = timeFieldHintMessage(fieldHint);
  if (hintMsg) return hintMsg;
  if (!value) return TIME_FIELD_INCOMPLETE;
  if (!isValidCompleteTimeValue(value)) {
    return 'Enter a valid time as hh:mm (hours 00–23, minutes 00–59).';
  }
  return null;
}

export type TimeFieldSaveFocus = 'start' | 'end';

/** Block save/create when a time hint is active or required times are incomplete. */
export function timeFieldsSaveValidation(input: {
  start: string;
  end: string;
  startHint: TimeFieldHintKind;
  endHint: TimeFieldHintKind;
  requireBothTimes?: boolean;
}): { message: string; focus: TimeFieldSaveFocus } | null {
  const startHintMsg = timeFieldHintMessage(input.startHint);
  if (startHintMsg) {
    return { message: startHintMsg, focus: 'start' };
  }
  const endHintMsg = timeFieldHintMessage(input.endHint);
  if (endHintMsg) {
    return { message: endHintMsg, focus: 'end' };
  }
  if (input.requireBothTimes) {
    const startMsg = timeFieldValidationMessage(input.start, 'none');
    if (startMsg) return { message: startMsg, focus: 'start' };
    const endMsg = timeFieldValidationMessage(input.end, 'none');
    if (endMsg) return { message: endMsg, focus: 'end' };
  }
  return null;
}

export function focusTimeFieldInput(container: ParentNode | null | undefined): void {
  const root = container instanceof HTMLElement ? container : document;
  const input = root.querySelector<HTMLInputElement>('input[type="time"]');
  input?.focus();
}

/** Hints are shown under the field; form-level banners only carry other errors. */
export function timeFieldSaveFormError(message: string): string | null {
  if (message === TIME_FIELD_ADD_AM_PM || message === TIME_FIELD_INCOMPLETE) {
    return null;
  }
  return message;
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
