import { afterEach, describe, expect, it } from 'vitest';
import {
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
});
