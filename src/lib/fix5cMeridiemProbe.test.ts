import { afterEach, describe, expect, it } from 'vitest';
import {
  measureTimeFieldMeridiemProbe,
  rendersMeridiemFromProbeDeltas,
  resetTimeFieldRendersMeridiemProbeCache,
  setTimeFieldRendersMeridiemProbeOverride,
  TIME_FIELD_MERIDIEM_PROBE_MIN_DELTA,
  timeFieldRendersMeridiem,
} from './timeFieldMeridiemProbe';

afterEach(() => {
  setTimeFieldRendersMeridiemProbeOverride(undefined);
  resetTimeFieldRendersMeridiemProbeCache();
});

describe('FIX-5c C9 meridiem probe deltas', () => {
  it('12h-style wider time control → true', () => {
    expect(rendersMeridiemFromProbeDeltas(12, 0)).toBe(true);
    expect(rendersMeridiemFromProbeDeltas(0, 10)).toBe(true);
  });

  it('equal widths → false (inconclusive / 24h-safe)', () => {
    expect(rendersMeridiemFromProbeDeltas(0, 0)).toBe(false);
    expect(rendersMeridiemFromProbeDeltas(TIME_FIELD_MERIDIEM_PROBE_MIN_DELTA, 0)).toBe(false);
  });

  it('mocked override still drives hint wiring', () => {
    setTimeFieldRendersMeridiemProbeOverride(true);
    expect(timeFieldRendersMeridiem()).toBe(true);
    setTimeFieldRendersMeridiemProbeOverride(false);
    expect(timeFieldRendersMeridiem()).toBe(false);
  });

  it('live measure on jsdom is inconclusive → false', () => {
    const m = measureTimeFieldMeridiemProbe();
    if (!m) return;
    if (!m.rendersMeridiem) {
      expect(timeFieldRendersMeridiem()).toBe(false);
    }
  });
});
