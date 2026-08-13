/** AU WHS Reg Schedule 3 — high risk construction work categories (SWMS trigger). */
export const HRCW_CATEGORIES = [
  { id: 'risk_fall', label: 'Risk of a person falling more than 2 metres' },
  { id: 'telecommunications', label: 'Work on a telecommunications tower' },
  { id: 'demolition', label: 'Demolition of an element of a structure that is load-bearing or related to structural integrity' },
  { id: 'asbestos', label: 'Work involving, or likely involving, asbestos' },
  { id: 'structural_alteration', label: 'Structural alterations or repairs that require temporary support to prevent collapse' },
  { id: 'confined_space', label: 'Work in or near a confined space' },
  { id: 'shaft_trench', label: 'Work in or near a shaft or trench deeper than 1.5 m, or a tunnel' },
  { id: 'explosives', label: 'Use of explosives' },
  { id: 'pressurised_gas', label: 'Work on or near pressurised gas mains or piping' },
  { id: 'chemical_fuel_refrigerant', label: 'Work on or near chemical, fuel or refrigerant lines' },
  { id: 'energised_electrical', label: 'Work on or near energised electrical installations or services' },
  { id: 'contaminated_atmosphere', label: 'Work in an area that may have a contaminated or flammable atmosphere' },
  { id: 'tilt_up_precast', label: 'Work with tilt-up or precast concrete' },
  { id: 'adjacent_road_rail', label: 'Work on, in or adjacent to a road, railway, shipping lane or other traffic corridor in use by traffic other than pedestrians' },
  { id: 'powered_mobile_plant', label: 'Work in an area with movement of powered mobile plant' },
  { id: 'extremes_temperature', label: 'Work in areas with artificial extremes of temperature' },
  { id: 'water_drowning', label: 'Work in or near water or other liquid that involves a risk of drowning' },
  { id: 'diving', label: 'Diving work' },
] as const;

export type HrcwCategoryId = (typeof HRCW_CATEGORIES)[number]['id'];

export interface JhaSwmsData {
  enabled: boolean;
  hrcwCategories: string[];
  principalContractor: string;
  pcie: string;
  emergencyProcedures: string;
  highRiskNotes: string;
}

export const EMPTY_SWMS: JhaSwmsData = {
  enabled: false,
  hrcwCategories: [],
  principalContractor: '',
  pcie: '',
  emergencyProcedures: '',
  highRiskNotes: '',
};

export function parseSwmsMeta(raw: string | undefined): JhaSwmsData {
  if (!raw?.trim()) return { ...EMPTY_SWMS };
  try {
    const parsed = JSON.parse(raw);
    return {
      enabled: !!parsed.enabled,
      hrcwCategories: Array.isArray(parsed.hrcwCategories) ? parsed.hrcwCategories.map(String) : [],
      principalContractor: String(parsed.principalContractor ?? ''),
      pcie: String(parsed.pcie ?? ''),
      emergencyProcedures: String(parsed.emergencyProcedures ?? ''),
      highRiskNotes: String(parsed.highRiskNotes ?? ''),
    };
  } catch {
    return { ...EMPTY_SWMS };
  }
}

export function hrcwLabel(id: string): string {
  return HRCW_CATEGORIES.find(c => c.id === id)?.label ?? id;
}
