import type { ControlHierarchyId, JhaStep } from '../../types/jha';

/** Seed packs for template step libraries (mining / heavy industry). */
export type JhaStepPackId = 'mining_standard' | 'isolation_loto' | 'access_heights';

export interface JhaStepPack {
  id: JhaStepPackId;
  name: string;
  description: string;
  steps: Omit<JhaStep, 'id'>[];
}

function ctrl(
  hierarchy: ControlHierarchyId,
  text: string,
  owner: string,
  verify: string,
) {
  return { id: '', hierarchy, text, owner, verify };
}

function step(
  description: string,
  hazards: string,
  controls: ReturnType<typeof ctrl>[],
  likelihood = 'possible',
  consequence = 'moderate',
): Omit<JhaStep, 'id'> {
  return {
    description,
    hazards,
    consequence,
    likelihood,
    controls: '',
    controlMeasures: controls.map((c, i) => ({ ...c, id: `seed-${i}` })),
    initialRisk: '',
    residualRisk: '',
    residualLikelihood: 'unlikely',
    residualConsequence: 'minor',
    residualEscalationNote: '',
  };
}

export const MINING_STANDARD_PACK: JhaStepPack = {
  id: 'mining_standard',
  name: 'Mining standard pack',
  description: 'Access → ground check → isolate → execute → make-safe',
  steps: [
    step(
      'Access work area / set up',
      'Unauthorised entry\nVehicle / plant interaction\nUneven ground / slips',
      [
        ctrl('administrative', 'Sign onto area / take 5; confirm permit active', 'Supervisor', 'Permit board + crew register'),
        ctrl('isolate', 'Barricade / exclusion zone as required', 'Spotter', 'Visual check before entry'),
        ctrl('ppe', 'Site PPE minimum (hard hat, boots, hi-vis, glasses)', 'All crew', 'Buddy check at gate'),
      ],
      'possible',
      'moderate',
    ),
    step(
      'Ground / environmental check',
      'Unstable ground / wall\nWeather / visibility\nBuried services / energy',
      [
        ctrl('administrative', 'Inspect ground conditions and weather limits', 'Supervisor', 'Document on JHA before start'),
        ctrl('isolate', 'Mark known services / no-go zones', 'Competent person', 'Dial-before-you-dig / site plans'),
        ctrl('engineering', 'Use designated access routes only', 'All crew', 'Supervisor walk of path'),
      ],
      'possible',
      'major',
    ),
    step(
      'Isolate energy / LOTO',
      'Unexpected energisation\nStored energy release\nIncorrect isolation point',
      [
        ctrl('eliminate', 'De-energise / isolate all relevant sources before work', 'Authorised isolator', 'Isolation certificate'),
        ctrl('isolate', 'Apply personal LOTO locks / tags', 'Each worker', 'Try-start / zero energy test'),
        ctrl('administrative', 'Confirm isolation points against permit', 'Supervisor', 'Cross-check permit board'),
      ],
      'unlikely',
      'catastrophic',
    ),
    step(
      'Execute task',
      'Task-specific injury (struck / caught / cut)\nTool failure\nCommunication breakdown',
      [
        ctrl('engineering', 'Use correct plant / tooling rated for the task', 'Task lead', 'Pre-use inspection'),
        ctrl('administrative', 'Follow sequenced method; stop for change', 'All crew', 'Supervisor hold points'),
        ctrl('ppe', 'Task-specific PPE as listed', 'All crew', 'Pre-start PPE check'),
      ],
      'possible',
      'moderate',
    ),
    step(
      'Make safe / demobilise',
      'Incomplete reinstatement\nTools left in area\nUncontrolled re-energisation',
      [
        ctrl('administrative', 'Housekeeping; remove tools and waste', 'All crew', 'Area walkdown'),
        ctrl('isolate', 'Remove LOTO only after all clear; restore energy under permit', 'Authorised isolator', 'Permit close-out'),
        ctrl('administrative', 'Brief crew on residual hazards / next shift', 'Supervisor', 'Sign-off sheet complete'),
      ],
      'unlikely',
      'moderate',
    ),
  ],
};

export const ISOLATION_LOTO_PACK: JhaStepPack = {
  id: 'isolation_loto',
  name: 'Isolation / LOTO focus',
  description: 'Identify → isolate → prove dead → work → restore',
  steps: [
    step(
      'Identify energy sources',
      'Missed energy source\nIncorrect drawings',
      [
        ctrl('administrative', 'Review P&IDs / single-line / isolation schedule', 'Authorised isolator', 'Permit energy list complete'),
      ],
      'possible',
      'major',
    ),
    step(
      'Apply isolation and LOTO',
      'Partial isolation\nShared lockout failure',
      [
        ctrl('isolate', 'Isolate and lock/tag each source', 'Authorised isolator', 'Lock box / personal locks applied'),
        ctrl('administrative', 'Group lockout if multi-crew', 'Supervisor', 'Lockbox key control'),
      ],
      'unlikely',
      'catastrophic',
    ),
    step(
      'Prove dead / zero energy',
      'Stored energy\nFalse indication',
      [
        ctrl('engineering', 'Discharge / bleed / ground as required', 'Competent person', 'Test-for-dead procedure'),
        ctrl('administrative', 'Record prove-dead results on permit', 'Authorised isolator', 'Permit section signed'),
      ],
      'unlikely',
      'catastrophic',
    ),
    step(
      'Perform work under isolation',
      'Unauthorised re-energisation attempt\nScope creep',
      [
        ctrl('administrative', 'Stop work if isolation integrity questioned', 'All crew', 'Immediate supervisor notify'),
        ctrl('ppe', 'Insulated / task PPE as required', 'All crew', 'Pre-use check'),
      ],
      'possible',
      'major',
    ),
    step(
      'Restore and close out',
      'Tools left in system\nPremature energisation',
      [
        ctrl('administrative', 'Clear-area check before de-isolation', 'Supervisor', 'Signed clear area'),
        ctrl('isolate', 'Remove locks in controlled order; restore energy', 'Authorised isolator', 'Permit closed'),
      ],
      'unlikely',
      'major',
    ),
  ],
};

export const ACCESS_HEIGHTS_PACK: JhaStepPack = {
  id: 'access_heights',
  name: 'Working at heights',
  description: 'Plan → edge control → work → rescue readiness → demobilise',
  steps: [
    step(
      'Plan access and fall control',
      'Inadequate fall protection\nUntrained persons',
      [
        ctrl('eliminate', 'Work from ground / EWP where practicable', 'Supervisor', 'Method selected on JHA'),
        ctrl('administrative', 'Confirm height permit / competency', 'Supervisor', 'Competency cards checked'),
      ],
      'possible',
      'catastrophic',
    ),
    step(
      'Establish edge protection / harness systems',
      'Unsecured edge\nIncorrect anchor',
      [
        ctrl('engineering', 'Install barriers / scaffolds / certified anchors', 'Competent rigger', 'Inspection tag current'),
        ctrl('ppe', 'Full body harness + lanyard / SRL as required', 'All at height', 'Buddy harness check'),
      ],
      'unlikely',
      'catastrophic',
    ),
    step(
      'Work at height',
      'Fall from height\nDropped objects',
      [
        ctrl('engineering', 'Tool lanyards / exclusion zone below', 'Task lead', 'Exclusion zone signed'),
        ctrl('administrative', 'Maintain 100% tie-off', 'All at height', 'Spotter observation'),
      ],
      'possible',
      'catastrophic',
    ),
    step(
      'Emergency / rescue readiness',
      'Delayed rescue after fall-arrest',
      [
        ctrl('administrative', 'Rescue plan briefed; equipment staged', 'Supervisor', 'Rescue kit inspected'),
      ],
      'unlikely',
      'catastrophic',
    ),
    step(
      'Demobilise height systems',
      'Unsecured openings left\nEquipment left aloft',
      [
        ctrl('administrative', 'Close openings; remove gear; clear below', 'All crew', 'Final walkdown'),
      ],
      'unlikely',
      'major',
    ),
  ],
};

export const JHA_STEP_PACKS: JhaStepPack[] = [
  MINING_STANDARD_PACK,
  ISOLATION_LOTO_PACK,
  ACCESS_HEIGHTS_PACK,
];

export function clonePackSteps(pack: JhaStepPack, idFactory: () => string): JhaStep[] {
  return pack.steps.map(s => ({
    ...s,
    id: idFactory(),
    controlMeasures: (s.controlMeasures ?? []).map(m => ({
      ...m,
      id: idFactory(),
    })),
  }));
}
