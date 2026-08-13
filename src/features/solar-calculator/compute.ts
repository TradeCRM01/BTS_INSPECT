/**
 * Compute STC (+ optional ROI) outputs for all selected sizes from wizard inputs.
 */

import { blankSolarInputs, type SolarEstimateInputs, type SolarEstimateOutputs } from './draft';
import {
  DEFAULT_STC_PRICE_AS_AT,
  SCHEME_RULES_VERIFIED_AT,
  type StcZone,
} from './lib/constants';
import { calculateEligibleStcRebate, allHardGatesYes } from './lib/eligibility';
import { calculateRoiBundle } from './lib/roi';
import { lookupZone } from './lib/zones';
import { rebateErosionCents } from './lib/stc';

function dollarsToCents(raw: string): number {
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

function parseNum(raw: string, fallback = 0): number {
  const n = parseFloat(raw);
  return Number.isNaN(n) ? fallback : n;
}

export function selectedSizesKw(inputs: SolarEstimateInputs): number[] {
  const set = new Set(inputs.compareSizesKw.filter(s => s > 0));
  const custom = parseNum(inputs.customSizeKw, 0);
  if (custom > 0) set.add(custom);
  // Prefer panel DC for STC if set
  const dc = parseNum(inputs.panelDcKw, 0);
  if (dc > 0) set.add(dc);
  return [...set].sort((a, b) => a - b);
}

export function annualLoadKwhFromInputs(inputs: SolarEstimateInputs): number {
  if (inputs.energyMode === 'annual_kwh') {
    return Math.max(0, parseNum(inputs.annualKwh, 0));
  }
  const sum = inputs.quarterlyKwh.reduce((s, q) => s + parseNum(q, 0), 0);
  if (sum > 0) return sum;
  // Back-solve from $ bills + rate if kWh blank
  const billDollars = inputs.quarterlyBillsCents.reduce((s, q) => s + parseNum(q, 0), 0);
  const rate = parseNum(inputs.usageRateCentsPerKwh, 0) / 100;
  if (billDollars > 0 && rate > 0) return billDollars / rate;
  return 0;
}

export function installedCostCentsForSize(inputs: SolarEstimateInputs, sizeKw: number): number {
  const upgrades =
    dollarsToCents(inputs.switchboardAllowanceDollars) +
    dollarsToCents(inputs.structuralAllowanceDollars) +
    dollarsToCents(inputs.meteringFeesDollars);

  if (inputs.costMode === 'total') {
    const key = String(sizeKw);
    const total = dollarsToCents(inputs.totalCostBySize[key] ?? '');
    return total + upgrades;
  }
  const dpw = parseNum(inputs.dollarsPerWatt, 0);
  // $/W × kW × 1000 W/kW → dollars, then cents
  return Math.round(dpw * sizeKw * 1000 * 100) + upgrades;
}

export function computeSolarOutputs(inputs: SolarEstimateInputs): SolarEstimateOutputs {
  const zoneLookup = lookupZone({
    postcode: inputs.postcode,
    suburb: inputs.suburb || null,
  });

  let zone: StcZone | null = null;
  let zoneRating: number | null = null;
  let zoneStatus = zoneLookup.status;

  if (zoneLookup.status === 'resolved') {
    zone = zoneLookup.zone;
    zoneRating = zoneLookup.rating;
  } else if (zoneLookup.status === 'needs_suburb') {
    zoneStatus = 'needs_suburb';
  }

  const priceLow = dollarsToCents(inputs.stcPriceLowDollars);
  const priceHigh = dollarsToCents(inputs.stcPriceHighDollars);
  const sizesKw = selectedSizesKw(inputs);
  const loadKwh = annualLoadKwhFromInputs(inputs);
  const yieldVal = parseNum(inputs.specificYieldKwhPerKwp, 0);
  const hasYield = yieldVal > 0 && loadKwh > 0;

  const sizes: SolarEstimateOutputs['sizes'] = [];

  if (zone != null) {
    for (const sizeKw of sizesKw) {
      const eligible = calculateEligibleStcRebate({
        systemSizeKw: sizeKw,
        zone,
        installDate: inputs.installDate || new Date().toISOString().slice(0, 10),
        priceLowCents: priceLow,
        priceHighCents: priceHigh,
        options: { midscaleFlatDeeming: inputs.midscaleFlatDeeming },
        answers: { ...allHardGatesYes(), ...inputs.eligibility },
        estimatedAnnualOutputMwh: hasYield
          ? (sizeKw * yieldVal * (1 - parseNum(inputs.shadingLossPct, 3) / 100) * 0.9) / 1000
          : null,
      });

      let netUpfrontMidCents: number | null = null;
      let year1SavingCents: number | null = null;
      let simplePaybackYears: number | null = null;
      let npvCents: number | null = null;

      if (hasYield && eligible.eligibility.rebateAllowed) {
        try {
          const installed = installedCostCentsForSize(inputs, sizeKw);
          const roi = calculateRoiBundle({
            systemSizeKw: sizeKw,
            specificYieldKwhPerKwp: yieldVal,
            shadingLoss: parseNum(inputs.shadingLossPct, 3) / 100,
            daytimeConsumptionShare: parseNum(inputs.daytimeSharePct, 70) / 100,
            annualLoadKwh: loadKwh,
            usageRateCentsPerKwh: parseNum(inputs.usageRateCentsPerKwh, 28),
            fitCentsPerKwh: parseNum(inputs.fitCentsPerKwh, 7),
            exportLimitKw: inputs.exportLimitKw.trim() === ''
              ? null
              : parseNum(inputs.exportLimitKw, 0),
            annualDemandSavingCents: 0,
            annualOmCents: dollarsToCents(inputs.annualOmDollars),
            escalationPerYear: parseNum(inputs.escalationPct, 3) / 100,
            installedCostCents: installed - (
              dollarsToCents(inputs.switchboardAllowanceDollars) +
              dollarsToCents(inputs.structuralAllowanceDollars) +
              dollarsToCents(inputs.meteringFeesDollars)
            ),
            upgradeAllowancesCents:
              dollarsToCents(inputs.switchboardAllowanceDollars) +
              dollarsToCents(inputs.structuralAllowanceDollars) +
              dollarsToCents(inputs.meteringFeesDollars),
            stcRebateLowCents: eligible.rebateLowCents,
            stcRebateMidCents: eligible.rebateMidCents,
            stcRebateHighCents: eligible.rebateHighCents,
            inverterReplacementCents: Math.round(
              parseNum(inputs.inverterReplacementPerKwDollars, 180) * sizeKw * 100,
            ),
          });
          netUpfrontMidCents = roi.base.netUpfrontCents;
          year1SavingCents = roi.base.year1SavingCents;
          simplePaybackYears = roi.base.simplePaybackYears;
          npvCents = roi.base.npvCents;
        } catch {
          // ROI optional until yield/load complete
        }
      }

      sizes.push({
        sizeKw,
        stcCount: eligible.stcCount,
        rebateLowCents: eligible.rebateLowCents,
        rebateHighCents: eligible.rebateHighCents,
        rebateMidCents: eligible.rebateMidCents,
        path: eligible.raw.path,
        midscaleProposed: eligible.requiresMidscaleAcknowledgement,
        eligibilityVerdict: eligible.eligibility.verdict,
        netUpfrontMidCents,
        year1SavingCents,
        simplePaybackYears,
        npvCents,
      });
    }
  }

  let waitingCostMidCents: number | null = null;
  if (zone != null && sizesKw.length > 0) {
    const focus = sizesKw.includes(99) ? 99 : sizesKw[0];
    const install = inputs.installDate || new Date().toISOString().slice(0, 10);
    const y = Number(install.slice(0, 4));
    if (y >= 2026 && y < 2030) {
      const later = `${y + 1}-01-01`;
      const erosion = rebateErosionCents({
        systemSizeKw: focus,
        zone,
        earlierInstallDate: install,
        laterInstallDate: later,
        priceLowCents: priceLow,
        priceHighCents: priceHigh,
        options: { midscaleFlatDeeming: inputs.midscaleFlatDeeming },
      });
      waitingCostMidCents = erosion.lossMidCents;
    }
  }

  return {
    zone,
    zoneRating,
    zoneStatus,
    computedAt: new Date().toISOString(),
    sizes,
    waitingCostMidCents,
  };
}

export const SOLAR_DISCLAIMER = (asAt = SCHEME_RULES_VERIFIED_AT) =>
  `Estimate only. Figures are based on the information provided and current Clean Energy Regulator settings as at ${asAt} (STC price band as at ${DEFAULT_STC_PRICE_AS_AT}). STC prices fluctuate and the final rebate depends on the certificate price at the time of installation. Eligibility is subject to CEC-accredited installation, approved equipment, network connection approval, and compliance with AS/NZS 5033, AS/NZS 4777.1 and AS/NZS 3000. Savings projections depend on actual consumption patterns and future electricity prices, which cannot be guaranteed. This is not financial, tax or legal advice. Building Technology Solutions — Licence 1506389.`;

export function mergeInputs(raw: unknown): SolarEstimateInputs {
  const base = blankSolarInputs();
  if (!raw || typeof raw !== 'object') return base;
  return { ...base, ...(raw as Partial<SolarEstimateInputs>) };
}
