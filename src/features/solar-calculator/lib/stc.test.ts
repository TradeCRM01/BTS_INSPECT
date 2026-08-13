import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STC_PRICE_LOW_CENTS,
  MID_SCALE_FLAT_DEEMING_YEARS,
  ZONE_RATINGS,
} from './constants';
import {
  calculateStcRebate,
  capacityBand,
  deemingYears,
  rebateErosionCents,
  stcCount,
  sguCapacityLimitKw,
} from './stc';

describe('STC deeming years (small-scale step-down)', () => {
  it('2026 → 5, 2027 → 4, …, 2030 → 1, 2031 → 0', () => {
    expect(deemingYears(6.6, '2026-06-15')).toBe(5);
    expect(deemingYears(6.6, '2027-01-01')).toBe(4);
    expect(deemingYears(6.6, '2028-01-01')).toBe(3);
    expect(deemingYears(6.6, '2029-01-01')).toBe(2);
    expect(deemingYears(6.6, '2030-12-31')).toBe(1);
    expect(deemingYears(6.6, '2031-01-01')).toBe(0);
  });
});

describe('STC golden cases — Zone 3 (1.382)', () => {
  const zone = 3 as const;
  const rating = ZONE_RATINGS[zone];

  it('6.6 kW install 2026 → 45 STCs; at $38 = $1,710', () => {
    // floor(6.6 × 1.382 × 5) = floor(45.606) = 45
    expect(Math.floor(6.6 * rating * 5)).toBe(45);
    expect(stcCount(6.6, zone, '2026-03-01')).toBe(45);

    const r = calculateStcRebate({
      systemSizeKw: 6.6,
      zone,
      installDate: '2026-03-01',
      priceLowCents: DEFAULT_STC_PRICE_LOW_CENTS,
      priceHighCents: DEFAULT_STC_PRICE_LOW_CENTS,
    });
    expect(r.stcCount).toBe(45);
    expect(r.rebateLowCents).toBe(171_000); // $1,710.00
    expect(r.path).toBe('stc_small');
  });

  it('6.6 kW install 2029 → 18 STCs', () => {
    // floor(6.6 × 1.382 × 2) = floor(18.2424) = 18
    expect(stcCount(6.6, zone, '2029-06-01')).toBe(18);
  });

  it('6.6 kW install 2031 → 0 STCs (scheme closed)', () => {
    expect(stcCount(6.6, zone, '2031-01-01')).toBe(0);
    const r = calculateStcRebate({
      systemSizeKw: 6.6,
      zone,
      installDate: '2031-01-01',
    });
    expect(r.path).toBe('scheme_closed');
    expect(r.rebateHighCents).toBe(0);
  });

  it('99.9 kW Zone 3 2026 → 690 STCs; 100.0 kW → 0 (cliff)', () => {
    // floor(99.9 × 1.382 × 5) = floor(690.309) = 690
    expect(stcCount(99.9, zone, '2026-06-01')).toBe(690);
    expect(capacityBand(99.9, '2026-06-01')).toBe('small');

    expect(stcCount(100.0, zone, '2026-06-01')).toBe(0);
    expect(capacityBand(100.0, '2026-06-01')).toBe('lgc');
    const cliff = calculateStcRebate({
      systemSizeKw: 100,
      zone,
      installDate: '2026-06-01',
    });
    expect(cliff.path).toBe('lgc');
    expect(cliff.stcCount).toBe(0);
  });
});

describe('100 kW / mid-scale timing cliff', () => {
  it('capacity limit is 100 before 1 Oct 2026 and 1000 on/after', () => {
    expect(sguCapacityLimitKw('2026-09-30')).toBe(100);
    expect(sguCapacityLimitKw('2026-10-01')).toBe(1000);
  });

  it('120 kW Sep 2026 → LGC (0 STCs); Oct 2026 → mid-scale proposed', () => {
    const sep = calculateStcRebate({
      systemSizeKw: 120,
      zone: 3,
      installDate: '2026-09-15',
    });
    expect(sep.path).toBe('lgc');
    expect(sep.stcCount).toBe(0);

    const oct = calculateStcRebate({
      systemSizeKw: 120,
      zone: 3,
      installDate: '2026-10-01',
    });
    expect(oct.capacityBand).toBe('midscale');
    expect(oct.path).toBe('stc_midscale_proposed');
    // Flat deeming OFF by default → same step-down as small (5 years in 2026)
    expect(oct.deemingYears).toBe(5);
    expect(oct.midscaleFlatDeemingApplied).toBe(false);
    expect(oct.stcCount).toBe(Math.floor(120 * 1.382 * 5));
  });

  it('exactly 100 kW on/after commencement remains small-scale', () => {
    expect(capacityBand(100, '2026-10-01')).toBe('small');
    expect(stcCount(100, 3, '2026-10-01')).toBe(Math.floor(100 * 1.382 * 5));
  });

  it('>1 MW always LGC', () => {
    expect(capacityBand(1000.1, '2026-10-01')).toBe('lgc');
    expect(stcCount(1000.1, 3, '2026-10-01')).toBe(0);
  });
});

describe('mid-scale flat deeming (apply via options)', () => {
  it('default OFF — mid-scale uses annual step-down', () => {
    expect(deemingYears(250, '2028-06-01')).toBe(3);
    expect(deemingYears(250, '2028-06-01', { midscaleFlatDeeming: false })).toBe(3);
  });

  it('when applied — mid-scale uses flat 5 years even in later years', () => {
    expect(
      deemingYears(250, '2028-06-01', { midscaleFlatDeeming: true }),
    ).toBe(MID_SCALE_FLAT_DEEMING_YEARS);
    expect(
      deemingYears(250, '2030-06-01', { midscaleFlatDeeming: true }),
    ).toBe(MID_SCALE_FLAT_DEEMING_YEARS);

    const r = calculateStcRebate({
      systemSizeKw: 250,
      zone: 3,
      installDate: '2029-01-15',
      options: { midscaleFlatDeeming: true },
    });
    expect(r.midscaleFlatDeemingApplied).toBe(true);
    expect(r.deemingYears).toBe(5);
    expect(r.stcCount).toBe(Math.floor(250 * 1.382 * 5));
    expect(r.path).toBe('stc_midscale_proposed');
  });

  it('flat deeming does not apply to small-scale', () => {
    expect(
      deemingYears(50, '2029-01-01', { midscaleFlatDeeming: true }),
    ).toBe(2);
  });

  it('flat deeming does not revive scheme after 2030', () => {
    expect(
      deemingYears(250, '2031-01-01', { midscaleFlatDeeming: true }),
    ).toBe(0);
  });
});

describe('rebate erosion helper', () => {
  it('waiting a year reduces mid-band rebate for small-scale', () => {
    const { lossMidCents, earlier, later } = rebateErosionCents({
      systemSizeKw: 99.9,
      zone: 3,
      earlierInstallDate: '2026-06-01',
      laterInstallDate: '2027-06-01',
    });
    expect(earlier.stcCount).toBeGreaterThan(later.stcCount);
    expect(lossMidCents).toBeGreaterThan(0);
  });
});
