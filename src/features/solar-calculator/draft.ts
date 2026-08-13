/**
 * Solar estimate wizard draft shape (persisted in solar_quotes.inputs).
 */

import type { EligibilityAnswer, EligibilityItemId } from './lib/eligibility';
import type { StcZone } from './lib/constants';

export type SolarSiteType =
  | 'commercial'
  | 'industrial'
  | 'strata'
  | 'retail'
  | 'warehouse'
  | 'other';

export type SolarOwnership =
  | 'owner_occupier'
  | 'tenant'
  | 'landlord'
  | 'body_corporate';

export type SolarMounting = 'roof' | 'ground' | 'carport' | 'mixed';

export type EnergyInputMode = 'quarterly' | 'annual_kwh';

export type CostInputMode = 'per_watt' | 'total';

export const SYSTEM_SIZE_MAX_KW = 1000;

/** Preset system sizes for the estimate dropdown (kW DC), up to 1 MW. No cliff-edge 39.9 / 99. */
export const SYSTEM_SIZE_OPTIONS_KW: readonly number[] = (() => {
  const sizes: number[] = [];
  for (let k = 5; k <= 100; k += 5) sizes.push(k);
  for (let k = 125; k <= 250; k += 25) sizes.push(k);
  for (let k = 300; k <= SYSTEM_SIZE_MAX_KW; k += 50) sizes.push(k);
  return sizes;
})();

/** @deprecated Use SYSTEM_SIZE_OPTIONS_KW — kept for older imports */
export const DEFAULT_COMPARE_SIZES_KW = SYSTEM_SIZE_OPTIONS_KW;

export type SolarEstimateInputs = {
  // Step 1 — site & customer
  customerName: string;
  clientId: string | null;
  siteAddress: string;
  postcode: string;
  suburb: string;
  siteType: SolarSiteType;
  ownership: SolarOwnership;
  nmi: string;
  meterCount: number;

  // Step 2 — system
  compareSizesKw: number[];
  customSizeKw: string;
  panelDcKw: string;
  inverterAcKw: string;
  dcAcRatio: string;
  mounting: SolarMounting;
  installDate: string;
  phases: 'single' | 'three';
  orientationDeg: string;
  pitchDeg: string;
  shadingLossPct: string;
  /** Manual specific yield kWh/kWp/yr — required for ROI until BTS table exists */
  specificYieldKwhPerKwp: string;
  midscaleFlatDeeming: boolean;

  // Step 3 — energy
  energyMode: EnergyInputMode;
  quarterlyBillsCents: [string, string, string, string];
  quarterlyKwh: [string, string, string, string];
  annualKwh: string;
  usageRateCentsPerKwh: string;
  fitCentsPerKwh: string;
  dailySupplyCents: string;
  demandChargeCents: string;
  tariffCode: string;
  daytimeSharePct: string;
  operatingDaysPerWeek: string;
  escalationPct: string;
  plannedLoadChange: boolean;
  plannedLoadNote: string;
  exportLimitKw: string;

  // Step 4 — costs
  costMode: CostInputMode;
  dollarsPerWatt: string;
  /** sizeKw → total $ string */
  totalCostBySize: Record<string, string>;
  switchboardAllowanceDollars: string;
  structuralAllowanceDollars: string;
  meteringFeesDollars: string;
  annualOmDollars: string;
  inverterReplacementPerKwDollars: string;
  gstRegistered: boolean;
  stcPriceLowDollars: string;
  stcPriceHighDollars: string;

  // Step 5 — eligibility
  eligibility: Partial<Record<EligibilityItemId, EligibilityAnswer>>;
};

export type SolarEstimateOutputs = {
  zone: StcZone | null;
  zoneRating: number | null;
  zoneStatus: string;
  computedAt: string;
  sizes: Array<{
    sizeKw: number;
    stcCount: number;
    rebateLowCents: number;
    rebateHighCents: number;
    rebateMidCents: number;
    path: string;
    midscaleProposed: boolean;
    eligibilityVerdict: string;
    netUpfrontMidCents: number | null;
    year1SavingCents: number | null;
    simplePaybackYears: number | null;
    npvCents: number | null;
  }>;
  waitingCostMidCents: number | null;
};

export function blankSolarInputs(): SolarEstimateInputs {
  const today = new Date().toISOString().slice(0, 10);
  return {
    customerName: '',
    clientId: null,
    siteAddress: '',
    postcode: '',
    suburb: '',
    siteType: 'commercial',
    ownership: 'owner_occupier',
    nmi: '',
    meterCount: 1,

    compareSizesKw: [100],
    customSizeKw: '',
    panelDcKw: '',
    inverterAcKw: '',
    dcAcRatio: '1.33',
    mounting: 'roof',
    installDate: today,
    phases: 'three',
    orientationDeg: '0',
    pitchDeg: '10',
    shadingLossPct: '3',
    specificYieldKwhPerKwp: '',
    midscaleFlatDeeming: false,

    energyMode: 'annual_kwh',
    quarterlyBillsCents: ['', '', '', ''],
    quarterlyKwh: ['', '', '', ''],
    annualKwh: '',
    usageRateCentsPerKwh: '28',
    fitCentsPerKwh: '7',
    dailySupplyCents: '200',
    demandChargeCents: '0',
    tariffCode: '',
    daytimeSharePct: '70',
    operatingDaysPerWeek: '5',
    escalationPct: '3',
    plannedLoadChange: false,
    plannedLoadNote: '',
    exportLimitKw: '',

    costMode: 'per_watt',
    dollarsPerWatt: '1.20',
    totalCostBySize: {},
    switchboardAllowanceDollars: '0',
    structuralAllowanceDollars: '0',
    meteringFeesDollars: '0',
    annualOmDollars: '500',
    inverterReplacementPerKwDollars: '180',
    gstRegistered: true,
    stcPriceLowDollars: '38',
    stcPriceHighDollars: '40',

    eligibility: {},
  };
}
