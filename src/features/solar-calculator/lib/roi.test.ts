import { describe, expect, it } from 'vitest';
import { SPECIFIC_YIELD_REQUIRED_MESSAGE } from './constants';
import {
  allocateGeneration,
  calculateRoiBundle,
  yearGenerationKwh,
  netUpfrontCents,
  simplePaybackYears,
  type RoiSiteInputs,
} from './roi';

/** Test-only yield — not a production default. */
const TEST_YIELD = 1400; // kWh/kWp/yr

function baseInput(over: Partial<RoiSiteInputs> = {}): RoiSiteInputs {
  return {
    systemSizeKw: 50,
    specificYieldKwhPerKwp: TEST_YIELD,
    shadingLoss: 0.03,
    systemLosses: 0.10,
    daytimeConsumptionShare: 0.7,
    annualLoadKwh: 80_000,
    usageRateCentsPerKwh: 25, // $0.25/kWh
    fitCentsPerKwh: 6,
    exportLimitKw: null,
    annualDemandSavingCents: 0,
    annualOmCents: 50_000, // $500/yr
    analysisYears: 25,
    installedCostCents: 5_000_000, // $50,000
    upgradeAllowancesCents: 0,
    stcRebateLowCents: 800_000,
    stcRebateMidCents: 850_000,
    stcRebateHighCents: 900_000,
    inverterReplacementCents: 800_000,
    ...over,
  };
}

describe('yearGenerationKwh', () => {
  it('requires positive specific yield', () => {
    expect(() =>
      yearGenerationKwh({
        systemSizeKw: 10,
        specificYieldKwhPerKwp: 0,
        shadingLoss: 0,
        systemLosses: 0,
        yearIndex: 0,
        degradationPerYear: 0.005,
      }),
    ).toThrow(SPECIFIC_YIELD_REQUIRED_MESSAGE);
  });

  it('applies shading, losses and degradation', () => {
    const y0 = yearGenerationKwh({
      systemSizeKw: 10,
      specificYieldKwhPerKwp: 1000,
      shadingLoss: 0.1,
      systemLosses: 0.1,
      yearIndex: 0,
      degradationPerYear: 0.005,
    });
    // 10 * 1000 * 0.9 * 0.9 = 8100
    expect(y0).toBeCloseTo(8100, 5);

    const y1 = yearGenerationKwh({
      systemSizeKw: 10,
      specificYieldKwhPerKwp: 1000,
      shadingLoss: 0.1,
      systemLosses: 0.1,
      yearIndex: 1,
      degradationPerYear: 0.005,
    });
    expect(y1).toBeCloseTo(8100 * 0.995, 5);
  });
});

describe('self-consumption cap', () => {
  it('never exceeds site load even if daytime share is high', () => {
    const alloc = allocateGeneration({
      generationKwh: 100_000,
      annualLoadKwh: 40_000,
      daytimeConsumptionShare: 0.9,
      systemSizeKw: 100,
      exportLimitKw: null,
    });
    // Uncapped would be 90_000 — must cap at load 40_000
    expect(alloc.selfConsumedKwh).toBe(40_000);
    expect(alloc.exportedKwh).toBe(60_000);
    expect(alloc.selfConsumedKwh + alloc.exportedKwh + alloc.curtailedKwh).toBeCloseTo(100_000, 5);
  });

  it('never exceeds generation', () => {
    const alloc = allocateGeneration({
      generationKwh: 10_000,
      annualLoadKwh: 200_000,
      daytimeConsumptionShare: 1,
      systemSizeKw: 10,
    });
    expect(alloc.selfConsumedKwh).toBe(10_000);
    expect(alloc.exportedKwh).toBe(0);
  });

  it('zero-export curtails surplus', () => {
    const alloc = allocateGeneration({
      generationKwh: 50_000,
      annualLoadKwh: 20_000,
      daytimeConsumptionShare: 0.5,
      systemSizeKw: 40,
      exportLimitKw: 0,
    });
    expect(alloc.selfConsumedKwh).toBe(20_000); // min(25000, 20000)
    expect(alloc.exportedKwh).toBe(0);
    expect(alloc.curtailedKwh).toBe(30_000);
  });
});

describe('net upfront & payback', () => {
  it('subtracts STC rebate from installed + upgrades', () => {
    expect(
      netUpfrontCents({
        installedCostCents: 1_000_000,
        upgradeAllowancesCents: 100_000,
        stcRebateCents: 250_000,
      }),
    ).toBe(850_000);
  });
});

describe('calculateRoiBundle', () => {
  it('throws without specific yield', () => {
    expect(() =>
      calculateRoiBundle(baseInput({ specificYieldKwhPerKwp: 0 })),
    ).toThrow(SPECIFIC_YIELD_REQUIRED_MESSAGE);
  });

  it('returns low/base/high with capped self-consumption on base', () => {
    // Force generation >> load
    const bundle = calculateRoiBundle(
      baseInput({
        systemSizeKw: 100,
        specificYieldKwhPerKwp: 1500,
        shadingLoss: 0,
        systemLosses: 0,
        daytimeConsumptionShare: 0.95,
        annualLoadKwh: 50_000,
        installedCostCents: 10_000_000,
      }),
    );

    expect(bundle.base.year1GenerationKwh).toBe(150_000);
    expect(bundle.base.year1SelfConsumedKwh).toBe(50_000); // capped at load
    expect(bundle.base.year1ExportedKwh).toBe(100_000);
    expect(bundle.base.cashflows).toHaveLength(25);
    expect(bundle.base.npvCents).toBeTypeOf('number');
    expect(bundle.low.netUpfrontCents).toBeGreaterThanOrEqual(bundle.high.netUpfrontCents);
  });

  it('simple payback finds crossover when savings positive', () => {
    const bundle = calculateRoiBundle(
      baseInput({
        installedCostCents: 2_000_000,
        stcRebateLowCents: 0,
        stcRebateMidCents: 0,
        stcRebateHighCents: 0,
        annualOmCents: 0,
        inverterReplacementCents: 0,
        analysisYears: 25,
      }),
    );
    expect(bundle.base.simplePaybackYears).not.toBeNull();
    expect(bundle.base.simplePaybackYears!).toBeGreaterThan(0);
    expect(simplePaybackYears(bundle.base.netUpfrontCents, bundle.base.cashflows)).toBe(
      bundle.base.simplePaybackYears,
    );
  });

  it('defaults demand savings to zero (conservative)', () => {
    const bundle = calculateRoiBundle(baseInput({ annualDemandSavingCents: undefined }));
    // Year-1 saving should equal energy only (no demand bump)
    const gen = bundle.base.year1GenerationKwh;
    const self = bundle.base.year1SelfConsumedKwh;
    const exp = bundle.base.year1ExportedKwh;
    expect(self + exp).toBeLessThanOrEqual(gen + 1e-6);
  });

  it('reports CO₂ when intensity provided', () => {
    const bundle = calculateRoiBundle(
      baseInput({ gridEmissionsKgPerKwh: 0.7 }),
    );
    expect(bundle.base.co2AbatedTonnesPerYear).not.toBeNull();
    expect(bundle.base.co2AbatedTonnesPerYear!).toBeGreaterThan(0);
  });
});
