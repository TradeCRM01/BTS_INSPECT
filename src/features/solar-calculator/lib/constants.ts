/**
 * SRES / STC scheme constants for the BTS Solar Estimates calculator.
 *
 * Sources verified as at SCHEME_RULES_VERIFIED_AT. Re-check CER before each release —
 * mid-scale rules especially are moving.
 *
 * 🟢 = primary/official · 🟡 = credible secondary · 🔴 = announced / not yet law
 */

/** Last date these constants were checked against CER / ministerial sources. */
export const SCHEME_RULES_VERIFIED_AT = '2026-08-07';

/**
 * 🟢 SRES closes end of 2030. Deeming years = SCHEME_END_YEAR + 1 − installYear.
 * https://cer.gov.au/schemes/renewable-energy-target/small-scale-renewable-energy-scheme/small-scale-technology-certificates
 */
export const SCHEME_END_YEAR = 2030;

/** Year used in deemingYears = DEEMING_ANCHOR_YEAR − installYear */
export const DEEMING_ANCHOR_YEAR = SCHEME_END_YEAR + 1; // 2031

/**
 * 🟢 Pre-expansion SGU capacity ceiling (kW). Golden cases treat 100.0 kW as
 * over the cliff (strictly less than this value qualifies under Regime A).
 * CER: capacity no more than 100 kW — we follow the brief’s cliff assertion.
 * https://cer.gov.au/schemes/renewable-energy-target/small-scale-renewable-energy-scheme/small-scale-renewable-energy-systems
 */
export const SGU_CAPACITY_LIMIT_KW = 100;

/**
 * 🟢 SGU annual output ceiling (MWh). Above this → LRET / LGC path.
 */
export const SGU_OUTPUT_LIMIT_MWH = 250;

/**
 * 🔴 Mid-scale expansion commencement. Systems with onsite capacity between
 * 100 kW and 1 MW intended to create STCs from this date, subject to regulations.
 * https://cer.gov.au/news-and-media/news/2026/august/expansion-solar-photovoltaic-pv-eligibility-under-small-scale-renewable-energy-scheme
 * https://minister.dcceew.gov.au/bowen/media-releases/putting-more-roofs-work
 */
export const MID_SCALE_START = '2026-10-01';

/**
 * 🔴 Post-expansion upper capacity for STC eligibility (kW).
 * Above this → LGC / power-station path.
 */
export const MID_SCALE_CAPACITY_LIMIT_KW = 1000;

/**
 * 🔴🟡 Mid-scale flat five-year deeming (trade press / unconfirmed regulations).
 * Default OFF in DEFAULT_STC_OPTIONS. Pass `midscaleFlatDeeming: true` when applying.
 * https://www.pv-magazine.com/2026/08/05/expansion-of-rooftop-solar-rebate-scheme-to-unlock-australias-missing-middle/
 */
export const MID_SCALE_FLAT_DEEMING_YEARS = 5;

/**
 * 🟢 CER zone ratings (STCs per kW per deeming year).
 * Postcode → zone must come from CER table, not these labels alone.
 */
export const ZONE_RATINGS = {
  1: 1.622,
  2: 1.536,
  3: 1.382,
  4: 1.185,
} as const;

export type StcZone = keyof typeof ZONE_RATINGS;

/**
 * 🟢/🟡 Default STC price band (ex GST), integer cents.
 * Clearing house is $40 ex GST; spot typically a few dollars below after margins.
 * Editable in the Solar Estimates UI — not a separate settings screen.
 */
export const DEFAULT_STC_PRICE_LOW_CENTS = 3800; // $38.00
export const DEFAULT_STC_PRICE_HIGH_CENTS = 4000; // $40.00
export const DEFAULT_STC_PRICE_AS_AT = '2026-08-07';

/**
 * Runtime options for STC calculation. Mid-scale flat deeming is built-in
 * but only applied when `midscaleFlatDeeming` is true.
 */
export type StcCalcOptions = {
  /**
   * When true, mid-scale systems (after MID_SCALE_START, capacity in (100, 1000])
   * use a flat five-year deeming period instead of the annual step-down.
   * Default false — apply explicitly when BTS chooses to model that scenario.
   */
  midscaleFlatDeeming?: boolean;
};

export const DEFAULT_STC_OPTIONS: Readonly<Required<StcCalcOptions>> = {
  midscaleFlatDeeming: false,
};

// ── ROI modelling assumptions (not yield / not $/W) ───────────────

/** Default analysis horizon (years). */
export const DEFAULT_ANALYSIS_YEARS = 25;

/** Brief default electricity price escalation. */
export const DEFAULT_PRICE_ESCALATION = 0.03;

/** Brief default panel degradation per year. */
export const DEFAULT_DEGRADATION_PER_YEAR = 0.005;

/** Brief default discount rate for NPV / discounted payback. */
export const DEFAULT_DISCOUNT_RATE = 0.07;

/** Default year for inverter replacement cash outflow. */
export const DEFAULT_INVERTER_REPLACEMENT_YEAR = 12;

/**
 * Typical residual system losses (inverter, wiring, soiling, availability)
 * applied after shading. Editable per estimate — not a yield figure.
 */
export const DEFAULT_SYSTEM_LOSSES = 0.10;

/**
 * Specific yield (kWh/kWp/yr) is intentionally NOT defaulted here.
 * BTS must supply zone/orientation yields before ROI runs — do not use
 * STC zone ratings (1.382 etc.) as yield.
 */
export const SPECIFIC_YIELD_REQUIRED_MESSAGE =
  'Specific yield (kWh/kWp/yr) is required — supply BTS yield figures before running ROI.';
