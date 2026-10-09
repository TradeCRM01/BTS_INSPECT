/** Cached result: does this browser render a meridiem segment on native time inputs? */
let cachedRendersMeridiem: boolean | null = null;

let probeOverride: boolean | undefined;

/** Min px wider than plain hh:mm text before we treat the native control as 12h. */
export const TIME_FIELD_MERIDIEM_PROBE_MIN_DELTA = 8;

/** Vitest / Playwright can pin probe result without touching navigator locale. */
export function setTimeFieldRendersMeridiemProbeOverride(value: boolean | undefined): void {
  probeOverride = value;
  cachedRendersMeridiem = null;
}

export function resetTimeFieldRendersMeridiemProbeCache(): void {
  cachedRendersMeridiem = null;
}

type ProbeWindow = Window & { __FIX5C_TIME_FIELD_RENDER_MERIDIEM__?: boolean };

export type TimeFieldMeridiemProbeMeasurement = {
  time13Width: number;
  text13Width: number;
  time0930Width: number;
  text0930Width: number;
  delta13: number;
  delta0930: number;
  rendersMeridiem: boolean;
};

/** Pure width-delta decision (unit-tested with mocked widths). */
export function rendersMeridiemFromProbeDeltas(delta13: number, delta0930: number): boolean {
  return (
    delta13 > TIME_FIELD_MERIDIEM_PROBE_MIN_DELTA
    || delta0930 > TIME_FIELD_MERIDIEM_PROBE_MIN_DELTA
  );
}

function syncTextRefStyle(time: HTMLInputElement, text: HTMLElement): void {
  const cs = getComputedStyle(time);
  text.style.font = cs.font;
  text.style.letterSpacing = cs.letterSpacing;
  text.style.padding = cs.padding;
  text.style.border = cs.border;
  text.style.boxSizing = cs.boxSizing;
}

function measureTimeAgainstText(
  time: HTMLInputElement,
  text: HTMLElement,
  timeValue: string,
  textLabel: string,
): { timeWidth: number; textWidth: number; delta: number } {
  time.value = timeValue;
  void time.offsetWidth;
  syncTextRefStyle(time, text);
  text.textContent = textLabel;
  void text.offsetWidth;
  const timeWidth = time.getBoundingClientRect().width;
  const textWidth = text.getBoundingClientRect().width;
  return { timeWidth, textWidth, delta: timeWidth - textWidth };
}

/**
 * Compare native time input min-content width to plain text hh:mm in the same font.
 * 12h controls include an extra meridiem segment (+ padding), so the time input is wider.
 */
export function measureTimeFieldMeridiemProbe(doc?: Document): TimeFieldMeridiemProbeMeasurement | null {
  const root = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!root?.body) return null;

  const host = root.createElement('div');
  host.className = 'time-field-meridiem-probe-host';
  const time = root.createElement('input');
  time.type = 'time';
  time.className = 'form-input time-field-meridiem-probe-live';
  time.setAttribute('aria-hidden', 'true');
  time.tabIndex = -1;

  const text = root.createElement('span');
  text.className = 'time-field-meridiem-probe-text-ref';
  text.setAttribute('aria-hidden', 'true');

  host.append(time, text);
  root.body.appendChild(host);

  const at13 = measureTimeAgainstText(time, text, '13:00', '13:00');
  const at0930 = measureTimeAgainstText(time, text, '09:30', '09:30');

  root.body.removeChild(host);

  const delta13 = at13.delta;
  const delta0930 = at0930.delta;
  const rendersMeridiem = rendersMeridiemFromProbeDeltas(delta13, delta0930);

  return {
    time13Width: at13.timeWidth,
    text13Width: at13.textWidth,
    time0930Width: at0930.timeWidth,
    text0930Width: at0930.textWidth,
    delta13,
    delta0930,
    rendersMeridiem,
  };
}

/**
 * Detect 12h time fields from the control itself. No navigator.language / Intl checks.
 *
 * When width deltas are inconclusive (≤ TIME_FIELD_MERIDIEM_PROBE_MIN_DELTA), returns
 * **false** (24h-safe): generic hint copy only and no reserved hint line.
 */
export function timeFieldRendersMeridiem(doc?: Document): boolean {
  if (probeOverride !== undefined) return probeOverride;

  const root = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!root) {
    cachedRendersMeridiem = false;
    return false;
  }

  const win = root.defaultView as ProbeWindow | null;
  if (
    import.meta.env.DEV
    && win
    && typeof win.__FIX5C_TIME_FIELD_RENDER_MERIDIEM__ === 'boolean'
  ) {
    cachedRendersMeridiem = win.__FIX5C_TIME_FIELD_RENDER_MERIDIEM__;
    return cachedRendersMeridiem;
  }

  if (cachedRendersMeridiem !== null) return cachedRendersMeridiem;

  const measured = measureTimeFieldMeridiemProbe(root);
  if (!measured) {
    cachedRendersMeridiem = false;
    return false;
  }

  cachedRendersMeridiem = measured.rendersMeridiem;
  return cachedRendersMeridiem;
}
