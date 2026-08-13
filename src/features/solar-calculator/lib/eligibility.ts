/**
 * SRES / STC eligibility checklist — hard gates and soft caveats.
 *
 * Hard gate "no" → block rebate (zero STCs shown as entitlement).
 * Any "unknown" on a hard gate → indicative only (subject to verification).
 * Soft caveats never block; they warn.
 *
 * Sources (as at SCHEME_RULES_VERIFIED_AT):
 * https://cer.gov.au/schemes/renewable-energy-target/small-scale-renewable-energy-scheme/small-scale-renewable-energy-systems
 * https://cer.gov.au/schemes/renewable-energy-target/small-scale-renewable-energy-scheme/small-scale-technology-certificates/create-small-scale-technology-certificates
 */

import {
  MID_SCALE_CAPACITY_LIMIT_KW,
  MID_SCALE_START,
  SCHEME_END_YEAR,
  SCHEME_RULES_VERIFIED_AT,
  SGU_CAPACITY_LIMIT_KW,
  SGU_OUTPUT_LIMIT_MWH,
} from './constants';
import { capacityBand, calculateStcRebate, rebateCents, type StcCapacityBand, type StcEligibilityPath, type StcRebateResult } from './stc';
import type { StcCalcOptions, StcZone } from './constants';

/** Checklist answer from the estimator / customer interview. */
export type EligibilityAnswer = 'yes' | 'no' | 'unknown';

export type EligibilitySeverity = 'hard' | 'soft';

export type EligibilityItemId =
  // Hard gates
  | 'accredited_installer_designer'
  | 'cec_approved_products'
  | 'equipment_new'
  | 'capacity_and_output_sgu'
  | 'as_nzs_compliant'
  | 'stc_created_within_12_months'
  | 'no_prior_stc_claim'
  | 'compliance_paperwork_and_grid'
  | 'install_date_not_backdated'
  // Soft caveats
  | 'stc_price_volatility'
  | 'rebate_assigned_to_installer'
  | 'tax_advice_disclaimer'
  | 'gst_basis_ex'
  | 'network_export_approval'
  | 'inverter_network_thresholds'
  | 'strata_or_tenure'
  | 'roof_condition_asbestos'
  | 'switchboard_capacity'
  | 'roof_area_fit'
  | 'panel_degradation'
  | 'scheme_change_risk';

export type EligibilityItemDef = {
  id: EligibilityItemId;
  severity: EligibilitySeverity;
  /** Short label for checklist UI */
  label: string;
  /** Plain-English help for a facilities manager */
  help: string;
  /** Shown when answer is no (hard) or as standing caveat text (soft) */
  failOrCaveatText: string;
  /**
   * Soft items are informational by default (always warn).
   * Hard items require an answer; auto-evaluated items may omit from answers.
   */
  autoEvaluate?: boolean;
};

/** Months after install to create STCs in the REC Registry. */
export const STC_CREATION_WINDOW_MONTHS = 12;

export const ELIGIBILITY_ITEMS: readonly EligibilityItemDef[] = [
  {
    id: 'accredited_installer_designer',
    severity: 'hard',
    label: 'Accredited installer & designer',
    help: 'The system must be designed by an accredited designer and installed by an accredited installer (accreditation now sits with Solar Accreditation Australia). Self-install or unaccredited work cannot create STCs.',
    failOrCaveatText: 'Not eligible — installation/design must be by accredited practitioners.',
  },
  {
    id: 'cec_approved_products',
    severity: 'hard',
    label: 'CEC approved panels & inverters',
    help: 'Panels and inverters must be on the Clean Energy Council approved products list at the date of installation. Products can be removed from the list over time.',
    failOrCaveatText: 'Not eligible — equipment must be on the CEC approved products list at install date.',
  },
  {
    id: 'equipment_new',
    severity: 'hard',
    label: 'New equipment only',
    help: 'Second-hand or refurbished panels/inverters cannot create STCs.',
    failOrCaveatText: 'Not eligible — equipment must be new.',
  },
  {
    id: 'capacity_and_output_sgu',
    severity: 'hard',
    label: 'Capacity / output within STC scheme',
    help: 'Before 1 Oct 2026, STCs apply only to small generation units under 100 kW with annual output under 250 MWh. From 1 Oct 2026, mid-scale systems up to 1 MW may become eligible (proposed — subject to regulations). Larger systems sit on the LGC path instead.',
    failOrCaveatText: 'No upfront STCs — system falls under the LGC / power-station pathway.',
    autoEvaluate: true,
  },
  {
    id: 'as_nzs_compliant',
    severity: 'hard',
    label: 'AS/NZS 5033, 4777.1 & 3000 compliant',
    help: 'The install must comply with AS/NZS 5033 (PV array), AS/NZS 4777.1 (inverter energy systems) and AS/NZS 3000 (wiring rules). Non-compliant installs cannot validly create STCs.',
    failOrCaveatText: 'Not eligible — installation must comply with AS/NZS 5033, 4777.1 and 3000.',
  },
  {
    id: 'stc_created_within_12_months',
    severity: 'hard',
    label: 'STCs created within 12 months of install',
    help: 'Certificates must be created in the REC Registry within 12 months of the installation date. CER verification can take six weeks or more, so the practical deadline is earlier than the legal one. Miss the window and the entitlement is lost.',
    failOrCaveatText: 'Entitlement lost — STCs were not (or will not be) created within 12 months of installation.',
  },
  {
    id: 'no_prior_stc_claim',
    severity: 'hard',
    label: 'No prior STC claim on this equipment',
    help: 'Certificates can only be claimed once per unit of equipment. Relocated or previously claimed panels are not eligible again.',
    failOrCaveatText: 'Not eligible — STCs already claimed (or previously claimed) for this equipment.',
  },
  {
    id: 'compliance_paperwork_and_grid',
    severity: 'hard',
    label: 'Compliance paperwork & grid connection',
    help: 'The installer must provide the written compliance statement, and the system must be connected to the grid (or meet the relevant off-grid criteria). Installation is not finalised until a certificate of electrical compliance (or equivalent) is issued.',
    failOrCaveatText: 'Not eligible — missing compliance paperwork or grid/off-grid connection criteria not met.',
  },
  {
    id: 'install_date_not_backdated',
    severity: 'hard',
    label: 'Install date is the real install date',
    help: 'The installation date is the date the system is installed and commissioned — not the quote, deposit or order date. Backdating to capture a higher deeming year is fraud; the CER audits this.',
    failOrCaveatText: 'Blocked — install date must not be backdated. Use the real commissioning date.',
  },
  {
    id: 'stc_price_volatility',
    severity: 'soft',
    label: 'STC price is a range, not a fixed quote',
    help: 'The clearing house price is $40 ex GST, but most certificates trade on the open market below that after agent/installer margins. Final rebate depends on price at creation.',
    failOrCaveatText: 'STC prices fluctuate — always show a low/high range; final discount depends on certificate price at install.',
  },
  {
    id: 'rebate_assigned_to_installer',
    severity: 'soft',
    label: 'Rebate is usually an upfront discount',
    help: 'STCs are almost always assigned to the installer and applied as a point-of-sale discount. The customer typically does not receive a separate cash payment from the government.',
    failOrCaveatText: 'The STC benefit is normally assigned to the installer as an upfront discount, not a cash payment to the customer.',
  },
  {
    id: 'tax_advice_disclaimer',
    severity: 'soft',
    label: 'Tax & depreciation — seek advice',
    help: 'The STC discount and the solar asset have income tax and depreciation consequences. Instant asset write-off thresholds change. This tool does not give tax advice.',
    failOrCaveatText: 'Consult your accountant; BTS does not provide tax or financial advice.',
  },
  {
    id: 'gst_basis_ex',
    severity: 'soft',
    label: 'STC values are quoted ex GST',
    help: 'Certificate prices and modelled rebates in this tool are ex GST unless stated otherwise.',
    failOrCaveatText: 'All STC rebate figures are ex GST unless explicitly labelled otherwise.',
  },
  {
    id: 'network_export_approval',
    severity: 'soft',
    label: 'Network export approval not guaranteed',
    help: 'Energex/Ergon may require export limiting, flexible export, or a connection study. Approval is not guaranteed and zero-export conditions change ROI.',
    failOrCaveatText: 'Network connection/export approval is separate from STCs and may limit or prevent export.',
  },
  {
    id: 'inverter_network_thresholds',
    severity: 'soft',
    label: 'Inverter size may change network pathway',
    help: 'Inverter AC capacity thresholds trigger different Energex/Ergon application pathways. Confirm against the current connection standard for the site’s phases and network area.',
    failOrCaveatText: 'Confirm inverter AC capacity against the current Energex/Ergon connection standard — do not assume thresholds.',
  },
  {
    id: 'strata_or_tenure',
    severity: 'soft',
    label: 'Who owns the asset vs who gets the savings',
    help: 'Strata/body corporate installs need committee or general meeting approval and may need an exclusive-use by-law. Landlord vs tenant: the payer may not be the party receiving the bill savings.',
    failOrCaveatText: 'Confirm ownership, approval pathway, and who receives the electricity savings before relying on the business case.',
  },
  {
    id: 'roof_condition_asbestos',
    severity: 'soft',
    label: 'Roof condition / asbestos risk',
    help: 'Roof age, remaining life, structure and asbestos can add substantial cost or make the install unviable.',
    failOrCaveatText: 'Allow for roof remediation or asbestos management — these can change project viability.',
  },
  {
    id: 'switchboard_capacity',
    severity: 'soft',
    label: 'Main switchboard may need upgrade',
    help: 'Older commercial sites commonly need a main switchboard upgrade — a frequent hidden cost.',
    failOrCaveatText: 'Budget for possible main switchboard upgrade on older sites.',
  },
  {
    id: 'roof_area_fit',
    severity: 'soft',
    label: 'Usable roof area must fit the array',
    help: 'Rule of thumb: about 5–6 m² per kW for commercial modules, plus setbacks and walkways. Undersized roof area means the selected size will not fit.',
    failOrCaveatText: 'Selected system size may not fit usable roof area (allow ~5–6 m²/kW plus clearances).',
  },
  {
    id: 'panel_degradation',
    severity: 'soft',
    label: 'Panel output degrades over time',
    help: 'Model output degradation (typically ~0.5%/year) over the analysis period — year-1 figures overstate lifetime generation if ignored.',
    failOrCaveatText: 'Lifetime savings assume panel degradation; year-1 generation is not constant for 25 years.',
  },
  {
    id: 'scheme_change_risk',
    severity: 'soft',
    label: 'SRES ends 31 Dec 2030 (legislation can change)',
    help: 'The scheme is legislated to end at the end of 2030, but legislation can change. Mid-scale expansion rules are still subject to regulations.',
    failOrCaveatText: `Scheme settings verified as at ${SCHEME_RULES_VERIFIED_AT}. SRES closes end ${SCHEME_END_YEAR}; rules can change.`,
  },
] as const;

export type EligibilityAnswers = Partial<Record<EligibilityItemId, EligibilityAnswer>>;

export type EligibilityContext = {
  systemSizeKw: number;
  /** Install / commissioning date YYYY-MM-DD */
  installDate: string;
  /** Estimated annual generation (MWh). If omitted, output gate is unknown. */
  estimatedAnnualOutputMwh?: number | null;
  /** Usable roof area m² — soft check vs system size */
  usableRoofAreaM2?: number | null;
  /** Rough m² per kW for fit check (default 5.5) */
  m2PerKw?: number;
};

export type EligibilityItemResult = {
  id: EligibilityItemId;
  severity: EligibilitySeverity;
  label: string;
  help: string;
  answer: EligibilityAnswer;
  /** pass | warn | fail for UI */
  outcome: 'pass' | 'warn' | 'fail';
  message: string | null;
  autoEvaluated: boolean;
};

export type EligibilityVerdict =
  | 'eligible'
  | 'indicative'
  | 'blocked'
  | 'lgc_path'
  | 'scheme_closed';

export type EligibilityReport = {
  verdict: EligibilityVerdict;
  /** True when hard gates allow showing a rebate number (may still be indicative) */
  rebateAllowed: boolean;
  /** True when result must be labelled indicative — subject to verification */
  indicative: boolean;
  /** Mid-scale path still proposed / subject to regulations */
  midscaleProposed: boolean;
  capacityBand: StcCapacityBand;
  items: EligibilityItemResult[];
  failedHardGates: EligibilityItemId[];
  unknownHardGates: EligibilityItemId[];
  softWarnings: EligibilityItemId[];
  summary: string;
};

function parseInstallYear(iso: string): number {
  const m = /^(\d{4})/.exec(iso.trim());
  if (!m) throw new Error(`Invalid install date: ${iso}`);
  return Number(m[1]);
}

function isOnOrAfterMidScale(installDate: string): boolean {
  return installDate.trim().slice(0, 10) >= MID_SCALE_START;
}

/**
 * Auto-evaluate capacity / output gate.
 * Aligns with stc.capacityBand cliff rules + 250 MWh SGU output limit.
 */
export function evaluateCapacityOutputGate(ctx: EligibilityContext): {
  answer: EligibilityAnswer;
  outcome: 'pass' | 'warn' | 'fail';
  message: string | null;
  band: StcCapacityBand;
  pathHint: StcEligibilityPath | 'ok';
} {
  const year = parseInstallYear(ctx.installDate);
  if (year > SCHEME_END_YEAR) {
    return {
      answer: 'no',
      outcome: 'fail',
      message: `SRES closed after ${SCHEME_END_YEAR} — no STCs.`,
      band: 'lgc',
      pathHint: 'scheme_closed',
    };
  }

  const band = capacityBand(ctx.systemSizeKw, ctx.installDate);

  if (band === 'lgc') {
    const midscaleHint = !isOnOrAfterMidScale(ctx.installDate)
      && ctx.systemSizeKw >= SGU_CAPACITY_LIMIT_KW
      && ctx.systemSizeKw <= MID_SCALE_CAPACITY_LIMIT_KW;
    return {
      answer: 'no',
      outcome: 'fail',
      message: midscaleHint
        ? `System is ${ctx.systemSizeKw} kW. Before ${MID_SCALE_START}, STCs stop at ${SGU_CAPACITY_LIMIT_KW} kW (LGC path). Installing on/after ${MID_SCALE_START} may open mid-scale STCs (proposed — subject to regulations).`
        : `System exceeds STC capacity ceiling (${isOnOrAfterMidScale(ctx.installDate) ? MID_SCALE_CAPACITY_LIMIT_KW : SGU_CAPACITY_LIMIT_KW} kW) — LGC / power-station pathway.`,
      band: 'lgc',
      pathHint: 'lgc',
    };
  }

  const output = ctx.estimatedAnnualOutputMwh;
  if (output != null && !Number.isNaN(output)) {
    // Classic SGU output limit; mid-scale output rules are not yet settled — still flag >250 MWh.
    if (output >= SGU_OUTPUT_LIMIT_MWH && band === 'small') {
      return {
        answer: 'no',
        outcome: 'fail',
        message: `Estimated annual output ${output} MWh is at or above the ${SGU_OUTPUT_LIMIT_MWH} MWh SGU limit — LGC pathway.`,
        band,
        pathHint: 'lgc',
      };
    }
    if (output >= SGU_OUTPUT_LIMIT_MWH && band === 'midscale') {
      return {
        answer: 'unknown',
        outcome: 'warn',
        message: `Estimated output ${output} MWh exceeds the classic ${SGU_OUTPUT_LIMIT_MWH} MWh SGU limit. Mid-scale output rules are subject to regulations — treat as indicative.`,
        band,
        pathHint: 'ok',
      };
    }
  } else if (band === 'small' || band === 'midscale') {
    // Capacity OK but output not provided
    return {
      answer: 'unknown',
      outcome: 'warn',
      message: `Capacity is within the ${band === 'midscale' ? 'mid-scale (proposed)' : 'SGU'} band; annual output not yet verified against the ${SGU_OUTPUT_LIMIT_MWH} MWh limit.`,
      band,
      pathHint: 'ok',
    };
  }

  return {
    answer: 'yes',
    outcome: band === 'midscale' ? 'warn' : 'pass',
    message: band === 'midscale'
      ? 'Mid-scale STC eligibility is proposed from 1 Oct 2026 — subject to regulations. Do not present as settled.'
      : null,
    band,
    pathHint: 'ok',
  };
}

function softRoofFit(ctx: EligibilityContext): EligibilityAnswer {
  const area = ctx.usableRoofAreaM2;
  if (area == null || Number.isNaN(area) || ctx.systemSizeKw <= 0) return 'unknown';
  const m2 = ctx.m2PerKw ?? 5.5;
  const needed = ctx.systemSizeKw * m2;
  return area + 1e-9 >= needed ? 'yes' : 'no';
}

function defaultSoftAnswer(id: EligibilityItemId, ctx: EligibilityContext): EligibilityAnswer {
  if (id === 'roof_area_fit') return softRoofFit(ctx);
  // Standing caveats always surface as unknown/warn unless explicitly acknowledged as yes
  return 'unknown';
}

/**
 * Evaluate the full eligibility checklist.
 * Soft items always contribute warnings unless answered "yes" (acknowledged).
 */
export function evaluateEligibility(
  answers: EligibilityAnswers,
  ctx: EligibilityContext,
): EligibilityReport {
  const cap = evaluateCapacityOutputGate(ctx);
  const items: EligibilityItemResult[] = [];

  for (const def of ELIGIBILITY_ITEMS) {
    let answer: EligibilityAnswer;
    let autoEvaluated = false;
    let message: string | null = def.failOrCaveatText;

    if (def.id === 'capacity_and_output_sgu') {
      answer = cap.answer;
      autoEvaluated = true;
      message = cap.message ?? (cap.answer === 'yes' ? null : def.failOrCaveatText);
    } else if (def.severity === 'hard') {
      answer = answers[def.id] ?? 'unknown';
      message = answer === 'no' ? def.failOrCaveatText : answer === 'unknown' ? `Unverified — ${def.label.toLowerCase()}.` : null;
    } else {
      answer = answers[def.id] ?? defaultSoftAnswer(def.id, ctx);
      // Soft: "no" or "unknown" → warn; "yes" means acknowledged / OK
      message = answer === 'yes' ? null : def.failOrCaveatText;
      if (def.id === 'roof_area_fit' && answer === 'no') {
        const m2 = ctx.m2PerKw ?? 5.5;
        message = `Usable roof ~${ctx.usableRoofAreaM2} m² is below ~${(ctx.systemSizeKw * m2).toFixed(0)} m² needed for ${ctx.systemSizeKw} kW (rule of thumb ${m2} m²/kW).`;
      }
    }

    let outcome: 'pass' | 'warn' | 'fail';
    if (def.severity === 'hard') {
      outcome = answer === 'yes' ? 'pass' : answer === 'no' ? 'fail' : 'warn';
      if (def.id === 'capacity_and_output_sgu') outcome = cap.outcome;
    } else {
      outcome = answer === 'yes' ? 'pass' : 'warn';
    }

    items.push({
      id: def.id,
      severity: def.severity,
      label: def.label,
      help: def.help,
      answer,
      outcome,
      message,
      autoEvaluated,
    });
  }

  const failedHardGates = items
    .filter(i => i.severity === 'hard' && i.outcome === 'fail')
    .map(i => i.id);
  const unknownHardGates = items
    .filter(i => i.severity === 'hard' && i.answer === 'unknown' && i.outcome !== 'fail')
    .map(i => i.id);
  const softWarnings = items
    .filter(i => i.severity === 'soft' && i.outcome === 'warn')
    .map(i => i.id);

  const year = parseInstallYear(ctx.installDate);
  const schemeClosed = year > SCHEME_END_YEAR;
  const lgc = cap.band === 'lgc' || cap.pathHint === 'lgc';
  const midscaleProposed = cap.band === 'midscale';

  let verdict: EligibilityVerdict;
  if (schemeClosed) verdict = 'scheme_closed';
  else if (lgc || failedHardGates.includes('capacity_and_output_sgu')) verdict = 'lgc_path';
  else if (failedHardGates.length > 0) verdict = 'blocked';
  else if (unknownHardGates.length > 0 || midscaleProposed) verdict = 'indicative';
  else verdict = 'eligible';

  const rebateAllowed = verdict === 'eligible' || verdict === 'indicative';
  const indicative = verdict === 'indicative' || unknownHardGates.length > 0 || midscaleProposed;

  let summary: string;
  switch (verdict) {
    case 'scheme_closed':
      summary = `SRES has ended (after ${SCHEME_END_YEAR}) — no STCs.`;
      break;
    case 'lgc_path':
      summary = cap.message ?? 'System is on the LGC pathway — no upfront STC discount.';
      break;
    case 'blocked':
      summary = `STCs blocked: ${failedHardGates.length} hard eligibility failure(s).`;
      break;
    case 'indicative':
      summary = midscaleProposed
        ? 'Indicative mid-scale STC estimate — proposed expansion, subject to regulations and verification.'
        : 'Indicative only — one or more hard eligibility items are unverified.';
      break;
    default:
      summary = 'Hard eligibility gates passed for estimate purposes.';
  }

  return {
    verdict,
    rebateAllowed,
    indicative,
    midscaleProposed,
    capacityBand: cap.band,
    items,
    failedHardGates,
    unknownHardGates,
    softWarnings,
    summary,
  };
}

/**
 * Apply eligibility to an STC count / rebate.
 * Blocked / LGC / scheme closed → zero certificates.
 * Indicative / eligible → unchanged counts (caller labels indicative).
 */
export function applyEligibilityToStcCount(
  stcCount: number,
  report: Pick<EligibilityReport, 'rebateAllowed'>,
): number {
  if (!report.rebateAllowed) return 0;
  return stcCount;
}

/** Empty answers — all hard gates unknown (indicative). Soft caveats warn by default. */
export function blankEligibilityAnswers(): EligibilityAnswers {
  return {};
}

/** Convenience: all hard gates yes (for tests / optimistic drafts). */
export function allHardGatesYes(): EligibilityAnswers {
  const out: EligibilityAnswers = {};
  for (const item of ELIGIBILITY_ITEMS) {
    if (item.severity === 'hard' && !item.autoEvaluate) out[item.id] = 'yes';
  }
  return out;
}

export type EligibleStcRebate = {
  eligibility: EligibilityReport;
  /** Raw calc before eligibility zeroing */
  raw: StcRebateResult;
  /** Rebate after hard-gate blocking (zeros when not rebateAllowed) */
  stcCount: number;
  rebateLowCents: number;
  rebateHighCents: number;
  rebateMidCents: number;
  /** Present mid-scale figures only with proposed banner / acknowledgement */
  requiresMidscaleAcknowledgement: boolean;
};

/**
 * Run STC calc + eligibility together.
 * Hard failures / LGC / scheme closed zero the rebate figures.
 */
export function calculateEligibleStcRebate(input: {
  systemSizeKw: number;
  zone: StcZone;
  installDate: string;
  priceLowCents?: number;
  priceHighCents?: number;
  options?: StcCalcOptions;
  answers?: EligibilityAnswers;
  estimatedAnnualOutputMwh?: number | null;
  usableRoofAreaM2?: number | null;
}): EligibleStcRebate {
  const raw = calculateStcRebate({
    systemSizeKw: input.systemSizeKw,
    zone: input.zone,
    installDate: input.installDate,
    priceLowCents: input.priceLowCents,
    priceHighCents: input.priceHighCents,
    options: input.options,
  });

  const eligibility = evaluateEligibility(input.answers ?? {}, {
    systemSizeKw: input.systemSizeKw,
    installDate: input.installDate,
    estimatedAnnualOutputMwh: input.estimatedAnnualOutputMwh,
    usableRoofAreaM2: input.usableRoofAreaM2,
  });

  const count = applyEligibilityToStcCount(raw.stcCount, eligibility);
  const low = rebateCents(count, raw.priceLowCents);
  const high = rebateCents(count, raw.priceHighCents);

  return {
    eligibility,
    raw,
    stcCount: count,
    rebateLowCents: low,
    rebateHighCents: high,
    rebateMidCents: Math.round((low + high) / 2),
    requiresMidscaleAcknowledgement: eligibility.midscaleProposed && eligibility.rebateAllowed,
  };
}
