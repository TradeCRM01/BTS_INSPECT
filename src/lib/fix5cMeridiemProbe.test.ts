import { afterEach, describe, expect, it } from 'vitest';
import {
  measureTimeFieldMeridiemProbe,
  resetTimeFieldRendersMeridiemProbeCache,
  setTimeFieldRendersMeridiemProbeOverride,
  timeFieldRendersMeridiem,
} from './timeFieldMeridiemProbe';

afterEach(() => {
  setTimeFieldRendersMeridiemProbeOverride(undefined);
  resetTimeFieldRendersMeridiemProbeCache();
});

describe('FIX-5c C7 meridiem probe (mocked)', () => {
  it('mocked 12h drives true', () => {
    setTimeFieldRendersMeridiemProbeOverride(true);
    expect(timeFieldRendersMeridiem()).toBe(true);
  });

  it('mocked 24h drives false', () => {
    setTimeFieldRendersMeridiemProbeOverride(false);
    expect(timeFieldRendersMeridiem()).toBe(false);
  });

  it('inconclusive width deltas yield rendersMeridiem false', () => {
    const m = measureTimeFieldMeridiemProbe();
    if (!m) return;
    if (m.delta13 <= 0.5 && m.delta0930 <= 0.5) {
      expect(m.rendersMeridiem).toBe(false);
      expect(timeFieldRendersMeridiem()).toBe(false);
    }
  });
});
