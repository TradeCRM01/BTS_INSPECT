/**
 * Pure SRES / STC calculation layer — no React imports.
 * All money in integer cents; round only at display.
 */

import {
  DEEMING_ANCHOR_YEAR,
  DEFAULT_STC_OPTIONS,
  DEFAULT_STC_PRICE_HIGH_CENTS,
  DEFAULT_STC_PRICE_LOW_CENTS,
  MID_SCALE_CAPACITY_LIMIT_KW,
  MID_SCALE_FLAT_DEEMING_YEARS,
  MID_SCALE_START,
  SCHEME_END_YEAR,
  SGU_CAPACITY_LIMIT_KW,
  ZONE_RATINGS,
  type StcCalcOptions,
  type StcZone,
} from './constants';

export type StcCapacityBand = 'small' | 'midscale' | 'lgc';

export type StcEligibilityPath =
  | 'stc_small'
  | 'stc_midscale_proposed'
  | 'lgc'
  | 'scheme_closed';

export type StcRebateResult = {
  systemSizeKw: number;
  zone: StcZone;
  zoneRating: number;
  installDate: string;
  installYear: number;
  capacityBand: StcCapacityBand;
  path: StcEligibilityPath;
  capacityLimitKw: number;
  deemingYears: number;
  midscaleFlatDeemingApplied: boolean;
  stcCount: number;
  /** Rebate at low STC price (cents, ex GST) */
  rebateLowCents: number;
  /** Rebate at high STC price (cents, ex GST) */
  rebateHighCents: number;
  /** Midpoint of the band (cents) — display as range, not a single figure */
  rebateMidCents: number;
  priceLowCents: number;
  priceHighCents: number;
};

function parseIsoDate(iso: string): { y: number; m: number; d: number; time: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) throw new Error(`Invalid install date: ${iso}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return { y, m: mo, d, time: Date.UTC(y, mo - 1, d) };
}

function midScaleStartTime(): number {
  const p = parseIsoDate(MID_SCALE_START);
  return p.time;
}

/** Date-dependent SGU / mid-scale capacity ceiling (kW). Exclusive upper bound for eligibility. */
export function sguCapacityLimitKw(installDate: string): number {
  const { time } = parseIsoDate(installDate);
  return time >= midScaleStartTime() ? MID_SCALE_CAPACITY_LIMIT_KW : SGU_CAPACITY_LIMIT_KW;
}

/**
 * Capacity band for STC vs LGC path.
 * Regime A (before MID_SCALE_START): size < 100 → small; else LGC.
 * Regime B (on/after): size < 100 → small; 100 < size <= 1000 → midscale; size == 100 → still small?
 *
 * Golden case: 100.0 kW in 2026 (pre-Oct) → cliff (LGC).
 * After commencement, exactly 100 kW remains small-scale (under the old SGU ceiling);
 * mid-scale is strictly above 100 and up to 1000.
 */
export function capacityBand(systemSizeKw: number, installDate: string): StcCapacityBand {
  if (!(systemSizeKw > 0) || Number.isNaN(systemSizeKw)) return 'lgc';
  const { time } = parseIsoDate(installDate);
  const midscaleOn = time >= midScaleStartTime();

  if (systemSizeKw < SGU_CAPACITY_LIMIT_KW) return 'small';
  if (!midscaleOn) return 'lgc';
  // Exactly 100 kW after commencement: still within classic SGU "no more than 100"
  if (systemSizeKw <= SGU_CAPACITY_LIMIT_KW) return 'small';
  if (systemSizeKw <= MID_SCALE_CAPACITY_LIMIT_KW) return 'midscale';
  return 'lgc';
}

/**
 * Deeming years for the given size and install date.
 * Small-scale: max(0, 2031 − installYear).
 * Mid-scale: flat five years when `midscaleFlatDeeming` is applied; otherwise
 * the same annual step-down as small-scale (interim until regs confirm flat rule).
 */
export function deemingYears(
  systemSizeKw: number,
  installDate: string,
  options: StcCalcOptions = {},
): number {
  const { y: installYear } = parseIsoDate(installDate);
  if (installYear > SCHEME_END_YEAR) return 0;

  const band = capacityBand(systemSizeKw, installDate);
  if (band === 'lgc') return 0;

  const opts = { ...DEFAULT_STC_OPTIONS, ...options };
  if (band === 'midscale' && opts.midscaleFlatDeeming) {
    return MID_SCALE_FLAT_DEEMING_YEARS;
  }

  return Math.max(0, DEEMING_ANCHOR_YEAR - installYear);
}

export function stcCount(
  systemSizeKw: number,
  zone: StcZone,
  installDate: string,
  options: StcCalcOptions = {},
): number {
  const years = deemingYears(systemSizeKw, installDate, options);
  if (years <= 0) return 0;
  const rating = ZONE_RATINGS[zone];
  return Math.floor(systemSizeKw * rating * years);
}

export function rebateCents(stcs: number, priceCents: number): number {
  if (stcs <= 0 || priceCents <= 0) return 0;
  return stcs * priceCents;
}

function resolvePath(
  band: StcCapacityBand,
  installYear: number,
): StcEligibilityPath {
  if (installYear > SCHEME_END_YEAR) return 'scheme_closed';
  if (band === 'lgc') return 'lgc';
  if (band === 'midscale') return 'stc_midscale_proposed';
  return 'stc_small';
}

/**
 * Full STC rebate estimate for one system size.
 * Always returns a low/high range — never a single confident figure.
 */
export function calculateStcRebate(input: {
  systemSizeKw: number;
  zone: StcZone;
  /** Installation / commissioning date (YYYY-MM-DD) — drives deeming, not quote date */
  installDate: string;
  priceLowCents?: number;
  priceHighCents?: number;
  options?: StcCalcOptions;
}): StcRebateResult {
  const {
    systemSizeKw,
    zone,
    installDate,
    priceLowCents = DEFAULT_STC_PRICE_LOW_CENTS,
    priceHighCents = DEFAULT_STC_PRICE_HIGH_CENTS,
    options = {},
  } = input;

  const opts = { ...DEFAULT_STC_OPTIONS, ...options };
  const { y: installYear } = parseIsoDate(installDate);
  const band = capacityBand(systemSizeKw, installDate);
  const years = deemingYears(systemSizeKw, installDate, opts);
  const count = stcCount(systemSizeKw, zone, installDate, opts);
  const low = Math.min(priceLowCents, priceHighCents);
  const high = Math.max(priceLowCents, priceHighCents);
  const rebateLow = rebateCents(count, low);
  const rebateHigh = rebateCents(count, high);

  return {
    systemSizeKw,
    zone,
    zoneRating: ZONE_RATINGS[zone],
    installDate,
    installYear,
    capacityBand: band,
    path: resolvePath(band, installYear),
    capacityLimitKw: sguCapacityLimitKw(installDate),
    deemingYears: years,
    midscaleFlatDeemingApplied: band === 'midscale' && opts.midscaleFlatDeeming && years > 0,
    stcCount: count,
    rebateLowCents: rebateLow,
    rebateHighCents: rebateHigh,
    rebateMidCents: Math.round((rebateLow + rebateHigh) / 2),
    priceLowCents: low,
    priceHighCents: high,
  };
}

/** Waiting N months (to a later install date) costs this much mid-band rebate. */
export function rebateErosionCents(args: {
  systemSizeKw: number;
  zone: StcZone;
  earlierInstallDate: string;
  laterInstallDate: string;
  priceLowCents?: number;
  priceHighCents?: number;
  options?: StcCalcOptions;
}): { earlier: StcRebateResult; later: StcRebateResult; lossMidCents: number } {
  const earlier = calculateStcRebate({ ...args, installDate: args.earlierInstallDate });
  const later = calculateStcRebate({ ...args, installDate: args.laterInstallDate });
  return {
    earlier,
    later,
    lossMidCents: Math.max(0, earlier.rebateMidCents - later.rebateMidCents),
  };
}
