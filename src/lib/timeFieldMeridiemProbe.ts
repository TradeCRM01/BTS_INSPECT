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
  live13: number;
  ref13: number;
  live0930: number;
  ref0930: number;
  delta13: number;
  delta0930: number;
  rendersMeridiem: boolean;
};

/** Run width probe once and return measurements (for diagnostics). */
export function measureTimeFieldMeridiemProbe(doc?: Document): TimeFieldMeridiemProbeMeasurement | null {
  const root = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!root?.body) return null;

  const host = root.createElement('div');
  host.className = 'time-field-meridiem-probe-host';
  const live = root.createElement('input');
  live.type = 'time';
  live.className = 'form-input time-field-meridiem-probe-live';
  live.setAttribute('aria-hidden', 'true');
  live.tabIndex = -1;

  const reference = root.createElement('input');
  reference.type = 'time';
  reference.className = 'form-input time-field-meridiem-probe-ref';
  reference.setAttribute('aria-hidden', 'true');
  reference.tabIndex = -1;

  host.append(live, reference);
  root.body.appendChild(host);

  const measure = (el: HTMLInputElement, value: string) => {
    el.value = value;
    void el.offsetWidth;
    return el.getBoundingClientRect().width;
  };

  const live13 = measure(live, '13:00');
  const ref13 = measure(reference, '13:00');
  const live0930 = measure(live, '09:30');
  const ref0930 = measure(reference, '09:30');

  root.body.removeChild(host);

  const delta13 = Math.abs(live13 - ref13);
  const delta0930 = Math.abs(live0930 - ref0930);
  const rendersMeridiem = delta13 > 0.5 || delta0930 > 0.5;

  return { live13, ref13, live0930, ref0930, delta13, delta0930, rendersMeridiem };
}

/**
 * Detect 12h time fields from the control itself: compare rendered width of a live
 * probe input at 13:00 against an offscreen reference probe (same class).
 * No navigator.language / Intl checks.
 *
 * When width deltas are inconclusive (≤ 0.5px), returns **false** (24h-safe): generic
 * hint copy only and no reserved hint line — see measureTimeFieldMeridiemProbe /
 * cached assignment below.
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

  // Inconclusive (deltas ≤ 0.5): false → generic copy, no hint line reserved.
  cachedRendersMeridiem = measured.rendersMeridiem;
  return cachedRendersMeridiem;
}
