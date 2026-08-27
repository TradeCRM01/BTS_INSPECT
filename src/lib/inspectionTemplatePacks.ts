import { nanoid } from './nanoid';
import type { Section, Question } from '../types/template';

export interface InspectionTemplatePack {
  id: string;
  name: string;
  description: string;
  suggestedRenderer?: 'generic_inspection' | 'electrical_3000';
  sections: Omit<Section, 'id' | 'questions'> & {
    questions: Omit<Question, 'id'>[];
  }[];
}

function q(partial: Omit<Question, 'id' | 'required'> & { required?: boolean }): Omit<Question, 'id'> {
  return { required: false, ...partial };
}

export const INSPECTION_TEMPLATE_PACKS: InspectionTemplatePack[] = [
  {
    id: 'electrical_verification',
    name: 'Electrical verification (AS/NZS 3000 style)',
    description: 'Visual + insulation + earth continuity + polarity checklist with measured values.',
    suggestedRenderer: 'electrical_3000',
    sections: [
      {
        title: 'Visual inspection',
        description: 'General visual checks before energisation / as found.',
        isRepeating: false,
        questions: [
          q({ type: 'yes_no', label: 'Equipment / installation suitable for environment', yesNoLabels: 'pass_fail', failOnNo: true, allowComments: true, allowPhotos: true }),
          q({ type: 'yes_no', label: 'IP / enclosure integrity acceptable', yesNoLabels: 'pass_fail', failOnNo: true, allowComments: true, allowPhotos: true }),
          q({ type: 'yes_no', label: 'Conductors correctly identified / labelled', yesNoLabels: 'pass_fail', failOnNo: true, allowPhotos: true }),
          q({ type: 'yes_no', label: 'Earthing / bonding connections secure', yesNoLabels: 'pass_fail', failOnNo: true, allowPhotos: true }),
          q({ type: 'yes_no', label: 'No obvious damage, overheating or deterioration', yesNoLabels: 'pass_fail', failOnNo: true, allowComments: true, allowPhotos: true }),
        ],
      },
      {
        title: 'Evidence photos',
        description: 'Photographs for the existing report photo appendix.',
        isRepeating: false,
        questions: [
          q({ type: 'photo', label: 'Evidence photos' }),
        ],
      },
      {
        title: 'Circuit tests',
        description: 'Repeating block per circuit / final subcircuit.',
        isRepeating: true,
        repeatLabel: 'Circuit',
        questions: [
          q({ type: 'text', label: 'Circuit reference / DB & CB', required: true }),
          q({ type: 'number', label: 'Insulation resistance (L-E)', numberConfig: { unit: 'MΩ', min: 1, decimals: 2, failOutsideRange: true }, allowNa: true, allowComments: true, allowPhotos: true }),
          q({ type: 'number', label: 'Earth continuity', numberConfig: { unit: 'Ω', max: 0.5, decimals: 3, failOutsideRange: true }, allowNa: true, allowPhotos: true }),
          q({ type: 'yes_no', label: 'Polarity correct', yesNoLabels: 'pass_fail', failOnNo: true, allowPhotos: true }),
          q({ type: 'yes_no', label: 'Correct circuit protection fitted', yesNoLabels: 'pass_fail', failOnNo: true, allowPhotos: true }),
        ],
      },
      {
        title: 'Sign-off',
        isRepeating: false,
        questions: [
          q({ type: 'long_text', label: 'Comments / limitations', allowNa: true }),
          q({ type: 'signature', label: 'Licensed inspector signature', required: true }),
        ],
      },
    ],
  },
  {
    id: 'rcd_test',
    name: 'RCD / residual current device test',
    description: 'Trip-time schedule for RCDs with pass criteria.',
    suggestedRenderer: 'electrical_3000',
    sections: [
      {
        title: 'RCD schedule',
        isRepeating: true,
        repeatLabel: 'RCD',
        questions: [
          q({ type: 'text', label: 'RCD location / ID', required: true }),
          q({ type: 'multiple_choice', label: 'Type', options: ['Type AC', 'Type A', 'Type B', 'Type F', 'Other'], required: true }),
          q({ type: 'number', label: 'Rated residual current IΔn', numberConfig: { unit: 'mA', decimals: 0 }, required: true }),
          q({ type: 'number', label: 'Trip time @ IΔn (0°)', numberConfig: { unit: 'ms', max: 300, decimals: 0, failOutsideRange: true }, allowComments: true }),
          q({ type: 'number', label: 'Trip time @ IΔn (180°)', numberConfig: { unit: 'ms', max: 300, decimals: 0, failOutsideRange: true } }),
          q({ type: 'number', label: 'Trip time @ 5×IΔn', numberConfig: { unit: 'ms', max: 40, decimals: 0, failOutsideRange: true }, allowNa: true }),
          q({ type: 'yes_no', label: 'Push-button test OK', yesNoLabels: 'pass_fail', failOnNo: true }),
          q({ type: 'yes_no', label: 'Overall RCD result', yesNoLabels: 'pass_fail', failOnNo: true, allowComments: true, allowPhotos: true }),
        ],
      },
    ],
  },
  {
    id: 'service_checklist',
    name: 'General service checklist',
    description: 'Trade-agnostic service visit: arrive, inspect, test, leave site.',
    suggestedRenderer: 'generic_inspection',
    sections: [
      {
        title: 'Arrival & site',
        isRepeating: false,
        questions: [
          q({ type: 'yes_no', label: 'Site access / inductions complete', yesNoLabels: 'yes_no', failOnNo: true }),
          q({ type: 'yes_no', label: 'Correct asset / plant identified', yesNoLabels: 'pass_fail', failOnNo: true, allowPhotos: true }),
          q({ type: 'text', label: 'Asset / serial number', allowNa: true }),
        ],
      },
      {
        title: 'Service tasks',
        isRepeating: false,
        questions: [
          q({ type: 'checkboxes', label: 'Work performed', options: ['Inspected', 'Cleaned', 'Adjusted', 'Repaired', 'Replaced parts', 'Tested', 'Other'] }),
          q({ type: 'yes_no', label: 'Unit operating as intended after service', yesNoLabels: 'pass_fail', failOnNo: true, allowComments: true }),
          q({ type: 'yes_no', label: 'Safety devices functional', yesNoLabels: 'pass_fail', failOnNo: true }),
          q({ type: 'long_text', label: 'Parts used / consumables', allowNa: true }),
          q({ type: 'photo', label: 'Before / after photos' }),
        ],
      },
      {
        title: 'Close-out',
        isRepeating: false,
        questions: [
          q({ type: 'yes_no', label: 'Site left clean & secure', yesNoLabels: 'yes_no', failOnNo: true }),
          q({ type: 'signature', label: 'Technician signature', required: true }),
        ],
      },
    ],
  },
  {
    id: 'hvac_service',
    name: 'HVAC / split system service',
    description: 'Air-con / HVAC service sheet with temps and filter checks.',
    suggestedRenderer: 'generic_inspection',
    sections: [
      {
        title: 'Unit identity',
        isRepeating: false,
        questions: [
          q({ type: 'text', label: 'Indoor unit location', required: true }),
          q({ type: 'text', label: 'Model / serial', allowNa: true }),
          q({ type: 'multiple_choice', label: 'System type', options: ['Split', 'Multi-split', 'Ducted', 'Cassette', 'Package', 'Other'] }),
        ],
      },
      {
        title: 'Service checks',
        isRepeating: false,
        questions: [
          q({ type: 'yes_no', label: 'Filters cleaned / replaced', yesNoLabels: 'pass_fail', failOnNo: true, allowPhotos: true }),
          q({ type: 'yes_no', label: 'Coils / drains clear', yesNoLabels: 'pass_fail', failOnNo: true, allowComments: true }),
          q({ type: 'yes_no', label: 'Outdoor unit clear of debris', yesNoLabels: 'pass_fail', failOnNo: true }),
          q({ type: 'number', label: 'Supply air temp', numberConfig: { unit: '°C', decimals: 1 }, allowNa: true }),
          q({ type: 'number', label: 'Return air temp', numberConfig: { unit: '°C', decimals: 1 }, allowNa: true }),
          q({ type: 'number', label: 'Delta T', numberConfig: { unit: 'K', min: 6, max: 14, decimals: 1, failOutsideRange: true }, allowNa: true, allowComments: true }),
          q({ type: 'yes_no', label: 'Unusual noise / vibration', yesNoLabels: 'yes_no', allowComments: true }),
          q({ type: 'yes_no', label: 'System performance acceptable', yesNoLabels: 'pass_fail', failOnNo: true }),
        ],
      },
      {
        title: 'Sign-off',
        isRepeating: false,
        questions: [
          q({ type: 'long_text', label: 'Recommendations', allowNa: true }),
          q({ type: 'signature', label: 'Technician signature', required: true }),
        ],
      },
    ],
  },
  {
    id: 'site_photos',
    name: 'Site photos',
    description: 'Photo-only inspection using the existing generic report and photo appendix.',
    suggestedRenderer: 'generic_inspection',
    sections: [
      {
        title: 'Site photos',
        description: 'Photographs for the existing report photo appendix.',
        isRepeating: false,
        questions: [
          q({ type: 'photo', label: 'Arrival / site condition' }),
          q({ type: 'photo', label: 'Work in progress' }),
          q({ type: 'photo', label: 'Completed work' }),
        ],
      },
    ],
  },
];

/** Clone pack sections with fresh IDs for inserting into a template. */
export function clonePackSections(packId: string): Section[] {
  const pack = INSPECTION_TEMPLATE_PACKS.find(p => p.id === packId);
  if (!pack) return [];
  return pack.sections.map(sec => ({
    id: nanoid(),
    title: sec.title,
    description: sec.description,
    isRepeating: sec.isRepeating,
    repeatLabel: sec.repeatLabel,
    questions: sec.questions.map(question => ({
      ...question,
      id: nanoid(),
      options: question.options ? [...question.options] : undefined,
      numberConfig: question.numberConfig ? { ...question.numberConfig } : undefined,
    })),
  }));
}

/** Suggested meta defaults when loading a trade pack onto a template. */
export function packMetaDefaults(packId: string): { layoutMode?: 'checklist' | 'test_schedule' | 'certificate' } {
  const pack = INSPECTION_TEMPLATE_PACKS.find(p => p.id === packId);
  if (!pack) return {};
  if (pack.suggestedRenderer === 'electrical_3000') {
    return { layoutMode: 'test_schedule' };
  }
  return { layoutMode: 'checklist' };
}
