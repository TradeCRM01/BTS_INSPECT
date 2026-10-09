import type { TimeFieldSegmentProgress } from './timeFieldInput';

export type TimeFieldSegment = 'hour' | 'minute' | 'meridiem';

export type TimeFieldSegmentState = {
  active: TimeFieldSegment;
  hourDigits: number;
  minuteDigits: number;
  hourFilled: boolean;
  minuteFilled: boolean;
};

export function createTimeFieldSegmentState(
  active: TimeFieldSegment = 'hour',
): TimeFieldSegmentState {
  return {
    active,
    hourDigits: 0,
    minuteDigits: 0,
    hourFilled: false,
    minuteFilled: false,
  };
}

export function timeFieldSegmentProgressFromState(
  state: TimeFieldSegmentState,
): TimeFieldSegmentProgress {
  return { hourFilled: state.hourFilled, minuteFilled: state.minuteFilled };
}

export function shiftTimeFieldSegmentActive(
  active: TimeFieldSegment,
  direction: 'left' | 'right',
  rendersMeridiem: boolean,
): TimeFieldSegment {
  const order: TimeFieldSegment[] = rendersMeridiem
    ? ['hour', 'minute', 'meridiem']
    : ['hour', 'minute'];
  const idx = order.indexOf(active);
  if (idx < 0) return 'hour';
  if (direction === 'left') return order[Math.max(0, idx - 1)];
  return order[Math.min(order.length - 1, idx + 1)];
}

export function applyTimeFieldSegmentDigit(
  state: TimeFieldSegmentState,
  rendersMeridiem: boolean,
): TimeFieldSegmentState {
  if (state.active === 'meridiem') return state;
  if (state.active === 'hour') {
    const hourDigits = Math.min(2, state.hourDigits + 1);
    const hourFilled = hourDigits >= 2;
    return {
      ...state,
      hourDigits,
      hourFilled,
      active: hourFilled ? 'minute' : 'hour',
    };
  }
  const minuteDigits = Math.min(2, state.minuteDigits + 1);
  const minuteFilled = minuteDigits >= 2;
  return {
    ...state,
    minuteDigits,
    minuteFilled,
    active: minuteFilled && rendersMeridiem ? 'meridiem' : 'minute',
  };
}

export function applyTimeFieldSegmentDigitBatch(
  state: TimeFieldSegmentState,
  rendersMeridiem: boolean,
  digitCount: number,
): TimeFieldSegmentState {
  let next = state;
  for (let i = 0; i < digitCount; i++) {
    next = applyTimeFieldSegmentDigit(next, rendersMeridiem);
  }
  return next;
}

export function applyTimeFieldSegmentBackspace(
  state: TimeFieldSegmentState,
): TimeFieldSegmentState {
  if (state.active === 'meridiem') return state;
  if (state.active === 'hour') {
    const hourDigits = Math.max(0, state.hourDigits - 1);
    return { ...state, hourDigits, hourFilled: hourDigits >= 2 };
  }
  const minuteDigits = Math.max(0, state.minuteDigits - 1);
  return { ...state, minuteDigits, minuteFilled: minuteDigits >= 2 };
}

export type TimeFieldSegmentClickLayout = {
  paddingLeft: number;
  hourBoundary: number;
  hmBoundary: number;
};

function syncTextMeasureStyle(time: HTMLInputElement, text: HTMLElement): void {
  const cs = getComputedStyle(time);
  text.style.font = cs.font;
  text.style.letterSpacing = cs.letterSpacing;
  text.style.fontSize = cs.fontSize;
  text.style.fontWeight = cs.fontWeight;
  text.style.fontFamily = cs.fontFamily;
  text.style.padding = '0';
  text.style.border = '0';
  text.style.boxSizing = 'content-box';
  text.style.whiteSpace = 'pre';
}

const layoutCache = new WeakMap<HTMLInputElement, TimeFieldSegmentClickLayout>();

/** Click X → segment using text-width boundaries (selection APIs are null on type=time). */
export function measureTimeFieldSegmentClickLayout(
  time: HTMLInputElement,
  doc: Document = document,
): TimeFieldSegmentClickLayout | null {
  const cached = layoutCache.get(time);
  if (cached) return cached;

  const text = doc.createElement('span');
  text.setAttribute('aria-hidden', 'true');
  text.style.position = 'fixed';
  text.style.visibility = 'hidden';
  text.style.pointerEvents = 'none';
  text.style.top = '0';
  text.style.left = '0';
  doc.body.appendChild(text);
  try {
    syncTextMeasureStyle(time, text);
    const padL = parseFloat(getComputedStyle(time).paddingLeft) || 0;
    text.textContent = '13';
    const hourEnd = padL + text.getBoundingClientRect().width;
    text.textContent = '13:00';
    const hmEnd = padL + text.getBoundingClientRect().width;
    if (!Number.isFinite(hourEnd) || !Number.isFinite(hmEnd) || hmEnd <= padL) {
      return null;
    }
    const layout = { paddingLeft: padL, hourBoundary: hourEnd, hmBoundary: hmEnd };
    layoutCache.set(time, layout);
    return layout;
  } finally {
    doc.body.removeChild(text);
  }
}

export function timeFieldSegmentFromClientX(
  time: HTMLInputElement,
  clientX: number,
  rendersMeridiem: boolean,
  layout?: TimeFieldSegmentClickLayout | null,
): TimeFieldSegment {
  const bounds = layout ?? measureTimeFieldSegmentClickLayout(time);
  if (!bounds) return 'hour';
  const localX = clientX - time.getBoundingClientRect().left;
  if (localX < bounds.hourBoundary) return 'hour';
  if (localX < bounds.hmBoundary) return 'minute';
  return rendersMeridiem ? 'meridiem' : 'minute';
}

export function clearTimeFieldSegmentClickLayoutCache(time: HTMLInputElement): void {
  layoutCache.delete(time);
}
