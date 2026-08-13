import { describe, expect, it } from 'vitest';
import {
  allHardGatesYes,
  applyEligibilityToStcCount,
  calculateEligibleStcRebate,
  ELIGIBILITY_ITEMS,
  evaluateCapacityOutputGate,
  evaluateEligibility,
  type EligibilityAnswers,
} from './eligibility';

describe('eligibility catalogue', () => {
  it('defines hard and soft items with help text', () => {
    const hard = ELIGIBILITY_ITEMS.filter(i => i.severity === 'hard');
    const soft = ELIGIBILITY_ITEMS.filter(i => i.severity === 'soft');
    expect(hard.length).toBeGreaterThanOrEqual(8);
    expect(soft.length).toBeGreaterThanOrEqual(8);
    for (const item of ELIGIBILITY_ITEMS) {
      expect(item.help.length).toBeGreaterThan(20);
      expect(item.failOrCaveatText.length).toBeGreaterThan(10);
    }
  });
});

describe('capacity / output auto gate', () => {
  it('99.9 kW 2026 → pass capacity (output unknown)', () => {
    const g = evaluateCapacityOutputGate({
      systemSizeKw: 99.9,
      installDate: '2026-06-01',
    });
    expect(g.band).toBe('small');
    expect(g.answer).toBe('unknown'); // output not provided
    expect(g.outcome).toBe('warn');
  });

  it('100 kW pre-Oct 2026 → fail (cliff / LGC)', () => {
    const g = evaluateCapacityOutputGate({
      systemSizeKw: 100,
      installDate: '2026-06-01',
    });
    expect(g.answer).toBe('no');
    expect(g.outcome).toBe('fail');
    expect(g.pathHint).toBe('lgc');
  });

  it('120 kW Oct 2026 → midscale warn (proposed)', () => {
    const g = evaluateCapacityOutputGate({
      systemSizeKw: 120,
      installDate: '2026-10-01',
      estimatedAnnualOutputMwh: 180,
    });
    expect(g.band).toBe('midscale');
    expect(g.answer).toBe('yes');
    expect(g.outcome).toBe('warn');
  });

  it('small system with output ≥ 250 MWh → fail', () => {
    const g = evaluateCapacityOutputGate({
      systemSizeKw: 99,
      installDate: '2026-06-01',
      estimatedAnnualOutputMwh: 250,
    });
    expect(g.answer).toBe('no');
    expect(g.pathHint).toBe('lgc');
  });

  it('2031 install → scheme closed', () => {
    const g = evaluateCapacityOutputGate({
      systemSizeKw: 50,
      installDate: '2031-01-01',
    });
    expect(g.pathHint).toBe('scheme_closed');
    expect(g.answer).toBe('no');
  });
});

describe('evaluateEligibility — hard gates block rebate', () => {
  const baseCtx = { systemSizeKw: 50, installDate: '2026-06-01', estimatedAnnualOutputMwh: 80 };

  it('all hard yes + known output → eligible', () => {
    const report = evaluateEligibility(allHardGatesYes(), baseCtx);
    expect(report.verdict).toBe('eligible');
    expect(report.rebateAllowed).toBe(true);
    expect(report.failedHardGates).toEqual([]);
  });

  it('unaccredited installer → blocked and zeros STCs', () => {
    const answers: EligibilityAnswers = {
      ...allHardGatesYes(),
      accredited_installer_designer: 'no',
    };
    const report = evaluateEligibility(answers, baseCtx);
    expect(report.verdict).toBe('blocked');
    expect(report.rebateAllowed).toBe(false);
    expect(report.failedHardGates).toContain('accredited_installer_designer');

    const eligible = calculateEligibleStcRebate({
      systemSizeKw: 50,
      zone: 3,
      installDate: '2026-06-01',
      estimatedAnnualOutputMwh: 80,
      answers,
    });
    expect(eligible.raw.stcCount).toBeGreaterThan(0);
    expect(eligible.stcCount).toBe(0);
    expect(eligible.rebateHighCents).toBe(0);
  });

  it('unknown hard gates → indicative (rebate still shown)', () => {
    const report = evaluateEligibility({}, baseCtx);
    expect(report.verdict).toBe('indicative');
    expect(report.rebateAllowed).toBe(true);
    expect(report.unknownHardGates.length).toBeGreaterThan(0);
    expect(report.indicative).toBe(true);
  });

  it('100 kW cliff → lgc_path and zero STCs even if checklist all yes', () => {
    const eligible = calculateEligibleStcRebate({
      systemSizeKw: 100,
      zone: 3,
      installDate: '2026-06-01',
      answers: allHardGatesYes(),
    });
    expect(eligible.eligibility.verdict).toBe('lgc_path');
    expect(eligible.stcCount).toBe(0);
    expect(eligible.raw.stcCount).toBe(0);
  });

  it('mid-scale Oct 2026 → indicative + acknowledgement flag', () => {
    const eligible = calculateEligibleStcRebate({
      systemSizeKw: 120,
      zone: 3,
      installDate: '2026-10-01',
      estimatedAnnualOutputMwh: 180,
      answers: allHardGatesYes(),
      options: { midscaleFlatDeeming: true },
    });
    expect(eligible.eligibility.verdict).toBe('indicative');
    expect(eligible.eligibility.midscaleProposed).toBe(true);
    expect(eligible.requiresMidscaleAcknowledgement).toBe(true);
    expect(eligible.stcCount).toBeGreaterThan(0);
  });

  it('backdated install date answered no → blocked', () => {
    const report = evaluateEligibility(
      { ...allHardGatesYes(), install_date_not_backdated: 'no' },
      baseCtx,
    );
    expect(report.verdict).toBe('blocked');
    expect(report.failedHardGates).toContain('install_date_not_backdated');
  });
});

describe('soft caveats', () => {
  it('always warn until acknowledged', () => {
    const report = evaluateEligibility(allHardGatesYes(), {
      systemSizeKw: 50,
      installDate: '2026-06-01',
      estimatedAnnualOutputMwh: 80,
    });
    expect(report.softWarnings).toContain('rebate_assigned_to_installer');
    expect(report.softWarnings).toContain('tax_advice_disclaimer');
    expect(report.verdict).toBe('eligible'); // soft does not block
  });

  it('roof area too small → soft warn with sizing message', () => {
    const report = evaluateEligibility(allHardGatesYes(), {
      systemSizeKw: 100,
      installDate: '2026-10-01',
      estimatedAnnualOutputMwh: 120,
      usableRoofAreaM2: 200, // needs ~550 m²
    });
    const roof = report.items.find(i => i.id === 'roof_area_fit');
    expect(roof?.outcome).toBe('warn');
    expect(roof?.answer).toBe('no');
    expect(roof?.message).toMatch(/m²/);
  });
});

describe('applyEligibilityToStcCount', () => {
  it('zeros when rebate not allowed', () => {
    expect(applyEligibilityToStcCount(45, { rebateAllowed: false })).toBe(0);
    expect(applyEligibilityToStcCount(45, { rebateAllowed: true })).toBe(45);
  });
});
