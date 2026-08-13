/**
 * Solar ROI / cash-flow engine — pure functions, money in integer cents.
 *
 * Specific yield (kWh/kWp/yr) MUST be supplied by the caller — never derive it
 * from STC zone ratings. Demand-charge savings default to $0 (conservative).
 */

import {
  DEFAULT_ANALYSIS_YEARS,
  DEFAULT_DEGRADATION_PER_YEAR,
  DEFAULT_DISCOUNT_RATE,
  DEFAULT_INVERTER_REPLACEMENT_YEAR,
  DEFAULT_PRICE_ESCALATION,
  DEFAULT_SYSTEM_LOSSES,
  SPECIFIC_YIELD_REQUIRED_MESSAGE,
} from './constants';

export type RoiScenarioKind = 'low' | 'base' | 'high';

export type RoiSiteInputs = {
  systemSizeKw: number;
  /**
   * Zone/orientation/pitch specific yield in kWh per kWp per year.
   * Required — throw if missing/non-positive.
   */
  specificYieldKwhPerKwp: number;
  /** 0–0.30 typical */
  shadingLoss?: number;
  /** Residual losses after shading (default DEFAULT_SYSTEM_LOSSES) */
  systemLosses?: number;
  /** Share of generation assumed daytime-aligned (0–1) before load cap */
  daytimeConsumptionShare: number;
  /** Annual site consumption (kWh) — caps self-consumption */
  annualLoadKwh: number;
  /** Blended or peak usage rate, cents/kWh (ex or inc GST — caller consistent) */
  usageRateCentsPerKwh: number;
  /** Feed-in tariff, cents/kWh */
  fitCentsPerKwh: number;
  /**
   * Export limit in kW AC.
   * null/undefined = unlimited; 0 = zero-export; >0 caps export energy
   * proportionally: maxExport ≈ (limit/size) × generation.
   */
  exportLimitKw?: number | null;
  /**
   * Conservative modelled demand-charge reduction ($/yr in cents).
   * Default 0 — do not assume solar cuts demand charges proportionally.
   */
  annualDemandSavingCents?: number;
  annualOmCents?: number;
  analysisYears?: number;
  degradationPerYear?: number;
  escalationPerYear?: number;
  discountRate?: number;
  inverterReplacementYear?: number;
  /** Cash cost of inverter replacement in that year (cents) */
  inverterReplacementCents?: number;
  /** Gross installed cost before STC (cents) */
  installedCostCents: number;
  /** Switchboard / structural / metering allowances (cents) */
  upgradeAllowancesCents?: number;
  stcRebateLowCents: number;
  stcRebateMidCents: number;
  stcRebateHighCents: number;
  /** Optional grid emissions intensity (kg CO₂-e / kWh). Null → skip CO₂. */
  gridEmissionsKgPerKwh?: number | null;
  /** Current annual bill cents — for % offset; optional */
  currentAnnualBillCents?: number | null;
};

export type YearCashflow = {
  year: number;
  generationKwh: number;
  selfConsumedKwh: number;
  exportedKwh: number;
  curtailedKwh: number;
  usageRateCentsPerKwh: number;
  savingCents: number;
  omCents: number;
  inverterCents: number;
  netCashflowCents: number;
  cumulativeCents: number;
};

export type RoiMetrics = {
  scenario: RoiScenarioKind;
  netUpfrontCents: number;
  year1GenerationKwh: number;
  year1SelfConsumedKwh: number;
  year1ExportedKwh: number;
  year1SavingCents: number;
  year1RoiPercent: number | null;
  simplePaybackYears: number | null;
  discountedPaybackYears: number | null;
  npvCents: number;
  irr: number | null;
  lifetimeNetSavingCents: number;
  lifetimeGenerationKwh: number;
  lcoeCentsPerKwh: number | null;
  billOffsetPercent: number | null;
  co2AbatedTonnesPerYear: number | null;
  cashflows: YearCashflow[];
};

export type RoiBundle = {
  low: RoiMetrics;
  base: RoiMetrics;
  high: RoiMetrics;
};

function assertYield(y: number): void {
  if (!(y > 0) || Number.isNaN(y)) {
    throw new Error(SPECIFIC_YIELD_REQUIRED_MESSAGE);
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Year-1 (or year-n degraded) gross generation before export curtailment. */
export function yearGenerationKwh(args: {
  systemSizeKw: number;
  specificYieldKwhPerKwp: number;
  shadingLoss: number;
  systemLosses: number;
  /** 0-based year index; year 0 = first year */
  yearIndex: number;
  degradationPerYear: number;
}): number {
  assertYield(args.specificYieldKwhPerKwp);
  const shade = clamp01(args.shadingLoss);
  const losses = clamp01(args.systemLosses);
  const deg = Math.max(0, args.degradationPerYear);
  const degradeFactor = Math.pow(1 - deg, args.yearIndex);
  const raw =
    args.systemSizeKw *
    args.specificYieldKwhPerKwp *
    (1 - shade) *
    (1 - losses) *
    degradeFactor;
  return Math.max(0, raw);
}

/**
 * Split generation into self-consumed / exported / curtailed.
 * Self-consumption is capped by annual site load — never exceeds load.
 */
export function allocateGeneration(args: {
  generationKwh: number;
  annualLoadKwh: number;
  daytimeConsumptionShare: number;
  systemSizeKw: number;
  exportLimitKw?: number | null;
}): {
  selfConsumedKwh: number;
  exportedKwh: number;
  curtailedKwh: number;
} {
  const gen = Math.max(0, args.generationKwh);
  const load = Math.max(0, args.annualLoadKwh);
  const share = clamp01(args.daytimeConsumptionShare);

  const uncappedSelf = gen * share;
  const selfConsumedKwh = Math.min(uncappedSelf, load, gen);
  const surplus = Math.max(0, gen - selfConsumedKwh);

  const limit = args.exportLimitKw;
  let exportedKwh: number;
  if (limit == null || Number.isNaN(limit)) {
    exportedKwh = surplus;
  } else if (limit <= 0) {
    exportedKwh = 0;
  } else if (!(args.systemSizeKw > 0)) {
    exportedKwh = 0;
  } else {
    // Proportional AC export cap vs array size on this year's generation profile
    const maxExport = surplus * Math.min(1, limit / args.systemSizeKw);
    // Also never exceed surplus
    exportedKwh = Math.min(surplus, maxExport);
  }

  const curtailedKwh = Math.max(0, surplus - exportedKwh);
  return { selfConsumedKwh, exportedKwh, curtailedKwh };
}

export function annualSavingCents(args: {
  selfConsumedKwh: number;
  exportedKwh: number;
  usageRateCentsPerKwh: number;
  fitCentsPerKwh: number;
  annualDemandSavingCents: number;
  annualOmCents: number;
}): number {
  const energy =
    args.selfConsumedKwh * args.usageRateCentsPerKwh +
    args.exportedKwh * args.fitCentsPerKwh;
  return Math.round(energy + args.annualDemandSavingCents - args.annualOmCents);
}

/** Net upfront = installed + upgrades − STC rebate (scenario). */
export function netUpfrontCents(args: {
  installedCostCents: number;
  upgradeAllowancesCents: number;
  stcRebateCents: number;
}): number {
  return Math.round(
    args.installedCostCents + args.upgradeAllowancesCents - args.stcRebateCents,
  );
}

function buildCashflows(input: RequiredRoiResolved, stcRebateCents: number): {
  cashflows: YearCashflow[];
  netUpfrontCents: number;
  year1: Omit<YearCashflow, 'year' | 'cumulativeCents' | 'inverterCents' | 'omCents' | 'netCashflowCents' | 'savingCents' | 'usageRateCentsPerKwh'> & {
    savingCents: number;
    generationKwh: number;
    selfConsumedKwh: number;
    exportedKwh: number;
  };
} {
  const upfront = netUpfrontCents({
    installedCostCents: input.installedCostCents,
    upgradeAllowancesCents: input.upgradeAllowancesCents,
    stcRebateCents,
  });

  const cashflows: YearCashflow[] = [];
  let cumulative = -upfront;

  let year1Saving = 0;
  let year1Gen = 0;
  let year1Self = 0;
  let year1Exp = 0;

  for (let y = 0; y < input.analysisYears; y++) {
    const generationKwh = yearGenerationKwh({
      systemSizeKw: input.systemSizeKw,
      specificYieldKwhPerKwp: input.specificYieldKwhPerKwp,
      shadingLoss: input.shadingLoss,
      systemLosses: input.systemLosses,
      yearIndex: y,
      degradationPerYear: input.degradationPerYear,
    });

    const alloc = allocateGeneration({
      generationKwh,
      annualLoadKwh: input.annualLoadKwh,
      daytimeConsumptionShare: input.daytimeConsumptionShare,
      systemSizeKw: input.systemSizeKw,
      exportLimitKw: input.exportLimitKw,
    });

    const usageRate = input.usageRateCentsPerKwh * Math.pow(1 + input.escalationPerYear, y);
    const om = Math.round(input.annualOmCents * Math.pow(1 + input.escalationPerYear, y));
    const demand = Math.round(
      input.annualDemandSavingCents * Math.pow(1 + input.escalationPerYear, y),
    );
    const inverter =
      y + 1 === input.inverterReplacementYear ? input.inverterReplacementCents : 0;

    const savingCents = annualSavingCents({
      selfConsumedKwh: alloc.selfConsumedKwh,
      exportedKwh: alloc.exportedKwh,
      usageRateCentsPerKwh: usageRate,
      fitCentsPerKwh: input.fitCentsPerKwh,
      annualDemandSavingCents: demand,
      annualOmCents: 0, // O&M applied separately below for clarity in cashflow
    });

    // annualSavingCents subtracts O&M when passed; we pass 0 then subtract om+inverter here
    const net = Math.round(savingCents - om - inverter);
    cumulative += net;

    if (y === 0) {
      year1Saving = Math.round(savingCents - om);
      year1Gen = generationKwh;
      year1Self = alloc.selfConsumedKwh;
      year1Exp = alloc.exportedKwh;
    }

    cashflows.push({
      year: y + 1,
      generationKwh,
      selfConsumedKwh: alloc.selfConsumedKwh,
      exportedKwh: alloc.exportedKwh,
      curtailedKwh: alloc.curtailedKwh,
      usageRateCentsPerKwh: usageRate,
      savingCents: Math.round(savingCents - om),
      omCents: om,
      inverterCents: inverter,
      netCashflowCents: net,
      cumulativeCents: cumulative,
    });
  }

  return {
    cashflows,
    netUpfrontCents: upfront,
    year1: {
      generationKwh: year1Gen,
      selfConsumedKwh: year1Self,
      exportedKwh: year1Exp,
      curtailedKwh: 0,
      savingCents: year1Saving,
    },
  };
}

export function simplePaybackYears(
  netUpfrontCents: number,
  cashflows: YearCashflow[],
): number | null {
  if (netUpfrontCents <= 0) return 0;
  for (const cf of cashflows) {
    if (cf.cumulativeCents >= 0) {
      const prev = cf.cumulativeCents - cf.netCashflowCents;
      if (cf.netCashflowCents <= 0) return cf.year;
      const frac = (-prev) / cf.netCashflowCents;
      return Number((cf.year - 1 + frac).toFixed(2));
    }
  }
  return null;
}

export function discountedPaybackYears(
  netUpfrontCents: number,
  cashflows: YearCashflow[],
  discountRate: number,
): number | null {
  if (netUpfrontCents <= 0) return 0;
  let cum = -netUpfrontCents;
  let prevCum = cum;
  for (const cf of cashflows) {
    prevCum = cum;
    const disc = cf.netCashflowCents / Math.pow(1 + discountRate, cf.year);
    cum += disc;
    if (cum >= 0) {
      if (disc === 0) return cf.year;
      const frac = (-prevCum) / disc;
      return Number((cf.year - 1 + frac).toFixed(2));
    }
  }
  return null;
}

export function npvCents(
  netUpfrontCents: number,
  cashflows: YearCashflow[],
  discountRate: number,
): number {
  let total = -netUpfrontCents;
  for (const cf of cashflows) {
    total += cf.netCashflowCents / Math.pow(1 + discountRate, cf.year);
  }
  return Math.round(total);
}

/** IRR of project: CF0 = -upfront, CF1..n = netCashflow. Null if no bracket. */
export function irr(netUpfrontCents: number, cashflows: YearCashflow[]): number | null {
  const flows = [-netUpfrontCents, ...cashflows.map(c => c.netCashflowCents)];
  if (flows.every(f => f === 0)) return null;

  const npvAt = (r: number) =>
    flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);

  let lo = -0.99;
  let hi = 10;
  let nLo = npvAt(lo);
  let nHi = npvAt(hi);
  if (nLo * nHi > 0) {
    // try widen
    hi = 100;
    nHi = npvAt(hi);
    if (nLo * nHi > 0) return null;
  }

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const nMid = npvAt(mid);
    if (Math.abs(nMid) < 1e-6) return Number(mid.toFixed(6));
    if (nLo * nMid <= 0) {
      hi = mid;
      nHi = nMid;
    } else {
      lo = mid;
      nLo = nMid;
    }
  }
  return Number(((lo + hi) / 2).toFixed(6));
}

/** LCOE = PV(costs) / PV(generation); costs = upfront + O&M + inverter (STC already netted in upfront). */
export function lcoeCentsPerKwh(
  netUpfrontCents: number,
  cashflows: YearCashflow[],
  discountRate: number,
): number | null {
  let pvCost = netUpfrontCents;
  let pvGen = 0;
  for (const cf of cashflows) {
    const cost = cf.omCents + cf.inverterCents;
    pvCost += cost / Math.pow(1 + discountRate, cf.year);
    pvGen += cf.generationKwh / Math.pow(1 + discountRate, cf.year);
  }
  if (pvGen <= 0) return null;
  return Number((pvCost / pvGen).toFixed(4));
}

type RequiredRoiResolved = {
  systemSizeKw: number;
  specificYieldKwhPerKwp: number;
  shadingLoss: number;
  systemLosses: number;
  daytimeConsumptionShare: number;
  annualLoadKwh: number;
  usageRateCentsPerKwh: number;
  fitCentsPerKwh: number;
  exportLimitKw: number | null;
  annualDemandSavingCents: number;
  annualOmCents: number;
  analysisYears: number;
  degradationPerYear: number;
  escalationPerYear: number;
  discountRate: number;
  inverterReplacementYear: number;
  inverterReplacementCents: number;
  installedCostCents: number;
  upgradeAllowancesCents: number;
  stcRebateLowCents: number;
  stcRebateMidCents: number;
  stcRebateHighCents: number;
  gridEmissionsKgPerKwh: number | null;
  currentAnnualBillCents: number | null;
};

function resolveInputs(input: RoiSiteInputs): RequiredRoiResolved {
  assertYield(input.specificYieldKwhPerKwp);
  if (!(input.systemSizeKw > 0)) throw new Error('systemSizeKw must be positive');
  if (!(input.annualLoadKwh >= 0)) throw new Error('annualLoadKwh must be ≥ 0');

  return {
    systemSizeKw: input.systemSizeKw,
    specificYieldKwhPerKwp: input.specificYieldKwhPerKwp,
    shadingLoss: clamp01(input.shadingLoss ?? 0.03),
    systemLosses: clamp01(input.systemLosses ?? DEFAULT_SYSTEM_LOSSES),
    daytimeConsumptionShare: clamp01(input.daytimeConsumptionShare),
    annualLoadKwh: input.annualLoadKwh,
    usageRateCentsPerKwh: input.usageRateCentsPerKwh,
    fitCentsPerKwh: input.fitCentsPerKwh,
    exportLimitKw: input.exportLimitKw === undefined ? null : input.exportLimitKw,
    annualDemandSavingCents: input.annualDemandSavingCents ?? 0,
    annualOmCents: input.annualOmCents ?? 0,
    analysisYears: input.analysisYears ?? DEFAULT_ANALYSIS_YEARS,
    degradationPerYear: input.degradationPerYear ?? DEFAULT_DEGRADATION_PER_YEAR,
    escalationPerYear: input.escalationPerYear ?? DEFAULT_PRICE_ESCALATION,
    discountRate: input.discountRate ?? DEFAULT_DISCOUNT_RATE,
    inverterReplacementYear: input.inverterReplacementYear ?? DEFAULT_INVERTER_REPLACEMENT_YEAR,
    inverterReplacementCents: input.inverterReplacementCents ?? 0,
    installedCostCents: input.installedCostCents,
    upgradeAllowancesCents: input.upgradeAllowancesCents ?? 0,
    stcRebateLowCents: input.stcRebateLowCents,
    stcRebateMidCents: input.stcRebateMidCents,
    stcRebateHighCents: input.stcRebateHighCents,
    gridEmissionsKgPerKwh:
      input.gridEmissionsKgPerKwh === undefined ? null : input.gridEmissionsKgPerKwh,
    currentAnnualBillCents:
      input.currentAnnualBillCents === undefined ? null : input.currentAnnualBillCents,
  };
}

function metricsForRebate(
  resolved: RequiredRoiResolved,
  scenario: RoiScenarioKind,
  stcRebateCents: number,
  daytimeShare: number,
  escalation: number,
): RoiMetrics {
  const adjusted = {
    ...resolved,
    daytimeConsumptionShare: daytimeShare,
    escalationPerYear: escalation,
  };
  const { cashflows, netUpfrontCents: upfront, year1 } = buildCashflows(adjusted, stcRebateCents);

  const lifetimeGen = cashflows.reduce((s, c) => s + c.generationKwh, 0);
  const lifetimeNet = cashflows.reduce((s, c) => s + c.netCashflowCents, 0) - upfront;
  const y1Roi =
    upfront > 0 ? Number(((year1.savingCents / upfront) * 100).toFixed(2)) : null;

  let billOffset: number | null = null;
  if (resolved.currentAnnualBillCents != null && resolved.currentAnnualBillCents > 0) {
    billOffset = Number(((year1.savingCents / resolved.currentAnnualBillCents) * 100).toFixed(1));
  }

  let co2: number | null = null;
  if (resolved.gridEmissionsKgPerKwh != null && resolved.gridEmissionsKgPerKwh > 0) {
    // Abatement on self-consumed + exported displacing grid (curtailed ignored)
    const displaced = year1.selfConsumedKwh + year1.exportedKwh;
    co2 = Number(((displaced * resolved.gridEmissionsKgPerKwh) / 1000).toFixed(3));
  }

  return {
    scenario,
    netUpfrontCents: upfront,
    year1GenerationKwh: year1.generationKwh,
    year1SelfConsumedKwh: year1.selfConsumedKwh,
    year1ExportedKwh: year1.exportedKwh,
    year1SavingCents: year1.savingCents,
    year1RoiPercent: y1Roi,
    simplePaybackYears: simplePaybackYears(upfront, cashflows),
    discountedPaybackYears: discountedPaybackYears(upfront, cashflows, resolved.discountRate),
    npvCents: npvCents(upfront, cashflows, resolved.discountRate),
    irr: irr(upfront, cashflows),
    lifetimeNetSavingCents: lifetimeNet,
    lifetimeGenerationKwh: lifetimeGen,
    lcoeCentsPerKwh: lcoeCentsPerKwh(upfront, cashflows, resolved.discountRate),
    billOffsetPercent: billOffset,
    co2AbatedTonnesPerYear: co2,
    cashflows,
  };
}

/**
 * Run low / base / high ROI scenarios.
 * - low (pessimistic): smaller STC rebate, −5 pp self-consumption, −1 pp escalation
 * - base: mid STC, stated share & escalation
 * - high (optimistic): larger STC rebate, +5 pp self-consumption, +1 pp escalation
 */
export function calculateRoiBundle(input: RoiSiteInputs): RoiBundle {
  const resolved = resolveInputs(input);
  const share = resolved.daytimeConsumptionShare;
  const esc = resolved.escalationPerYear;
  const stcLo = Math.min(resolved.stcRebateLowCents, resolved.stcRebateHighCents);
  const stcHi = Math.max(resolved.stcRebateLowCents, resolved.stcRebateHighCents);

  return {
    low: metricsForRebate(resolved, 'low', stcLo, clamp01(share - 0.05), Math.max(0, esc - 0.01)),
    base: metricsForRebate(resolved, 'base', resolved.stcRebateMidCents, share, esc),
    high: metricsForRebate(resolved, 'high', stcHi, clamp01(share + 0.05), esc + 0.01),
  };
}
