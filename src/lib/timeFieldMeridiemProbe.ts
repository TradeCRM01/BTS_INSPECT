/** Cached result: does this browser render a meridiem segment on native time inputs? */
let cachedRendersMeridiem: boolean | null = null;

let probeOverride: boolean | undefined;

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
  delta13: number;
  segment: number;
  rendersMeridiem: boolean;
};

/**
 * r5 probe decision from measured delta13 and seconds segment (CoS live values:
 * 12h 34.81 / 26 → true; 24h 7.81 / 27 → false).
 */
export function rendersMeridiemFromProbeR5(delta13: number, segment: number): boolean {
  if (!Number.isFinite(delta13) || !Number.isFinite(segment) || segment <= 0) {
    return false;
  }
  return delta13 > segment / 2;
}

function syncTextRefStyle(time: HTMLInputElement, text: HTMLElement): void {
  const cs = getComputedStyle(time);
  text.style.font = cs.font;
  text.style.letterSpacing = cs.letterSpacing;
  text.style.padding = cs.padding;
  text.style.border = cs.border;
  text.style.boxSizing = cs.boxSizing;
}

function measureInputWidth(time: HTMLInputElement, value: string, step?: number): number {
  if (step === undefined) {
    time.removeAttribute('step');
  } else {
    time.setAttribute('step', String(step));
  }
  time.value = value;
  void time.offsetWidth;
  return time.getBoundingClientRect().width;
}

function measureSegmentWidth(time: HTMLInputElement): number {
  const withSeconds = measureInputWidth(time, '13:00:00', 1);
  const hourMinute = measureInputWidth(time, '13:00');
  return withSeconds - hourMinute;
}

function measureDelta13(time: HTMLInputElement, text: HTMLElement): {
  time13Width: number;
  text13Width: number;
  delta13: number;
} {
  const time13Width = measureInputWidth(time, '13:00');
  syncTextRefStyle(time, text);
  text.textContent = '13:00';
  void text.offsetWidth;
  const text13Width = text.getBoundingClientRect().width;
  return { time13Width, text13Width, delta13: time13Width - text13Width };
}

/**
 * r5 meridiem probe: hide picker on probe input only; compare delta13 to half the
 * seconds segment width on the same control. No navigator.language / Intl checks.
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

  try {
    const segment = measureSegmentWidth(time);
    const at13 = measureDelta13(time, text);
    const rendersMeridiem = rendersMeridiemFromProbeR5(at13.delta13, segment);

    return {
      time13Width: at13.time13Width,
      text13Width: at13.text13Width,
      delta13: at13.delta13,
      segment,
      rendersMeridiem,
    };
  } catch {
    return null;
  } finally {
    root.body.removeChild(host);
  }
}

/**
 * Detect 12h time fields from the control itself.
 *
 * When segment ≤ 0 or measurement fails, returns **false** (24h-safe): generic hint
 * copy only and no reserved hint line.
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
