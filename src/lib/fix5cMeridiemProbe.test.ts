import { afterEach, describe, expect, it } from 'vitest';
import {
  measureTimeFieldMeridiemProbe,
  rendersMeridiemFromProbeR5,
  resetTimeFieldRendersMeridiemProbeCache,
  setTimeFieldRendersMeridiemProbeOverride,
  timeFieldRendersMeridiem,
} from './timeFieldMeridiemProbe';

afterEach(() => {
  setTimeFieldRendersMeridiemProbeOverride(undefined);
  resetTimeFieldRendersMeridiemProbeCache();
});

describe('FIX-5c C10 r5 meridiem probe', () => {
  it('12h CoS measurements → true', () => {
    expect(rendersMeridiemFromProbeR5(34.81, 26)).toBe(true);
  });

  it('24h CoS measurements → false', () => {
    expect(rendersMeridiemFromProbeR5(7.81, 27)).toBe(false);
  });

  it('segment 0 → false (inconclusive)', () => {
    expect(rendersMeridiemFromProbeR5(34.81, 0)).toBe(false);
    expect(rendersMeridiemFromProbeR5(100, -1)).toBe(false);
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
