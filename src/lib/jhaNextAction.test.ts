import { describe, expect, it } from 'vitest';
import {
  jhaCardHint,
  jhaCrewNamed,
  jhaCrewSigned,
  jhaFillContext,
  jhaListBucket,
  jhaListContext,
  jhaStepsReady,
  recommendJhaFillAction,
  recommendJhaListAction,
} from './jhaNextAction';
import type { JhaCrewMember, JhaSignOff, JhaStep } from '../types/jha';

const readyStep: JhaStep = {
  id: 's1',
  description: 'Isolate supply',
  hazards: 'Live parts',
  consequence: 'major',
  likelihood: 'possible',
  controls: '',
  controlMeasures: [{ id: 'c1', hierarchy: 'isolate', text: 'Lock out', owner: '', verify: '' }],
  initialRisk: '',
  residualRisk: '',
  photos: [],
};

const emptyStep: JhaStep = {
  id: 's2',
  description: '',
  hazards: '',
  consequence: '',
  likelihood: '',
  controls: '',
  controlMeasures: [],
  initialRisk: '',
  residualRisk: '',
  photos: [],
};

const namedUnsigned: JhaCrewMember = { id: 'w1', name: 'Sam', role: 'Electrician', date: '2026-08-20' };
const namedSigned: JhaCrewMember = { ...namedUnsigned, signature: 'data:image/png;base64,xx' };
const supervisor: JhaSignOff = { roleId: 'sup', roleLabel: 'Supervisor', name: 'Pat', signature: 'data:image/png;base64,yy', date: '2026-08-20' };

describe('jhaStepsReady', () => {
  it('needs a description and a control on every step', () => {
    expect(jhaStepsReady([])).toBe(false);
    expect(jhaStepsReady([emptyStep])).toBe(false);
    expect(jhaStepsReady([{ ...emptyStep, description: 'Work' }])).toBe(false);
    expect(jhaStepsReady([readyStep])).toBe(true);
    expect(jhaStepsReady([{ ...readyStep, controlMeasures: [], controls: 'PPE' }])).toBe(true);
  });
});

describe('jhaCrewNamed / jhaCrewSigned', () => {
  it('treats blank names as missing and requires a signature from each named person', () => {
    expect(jhaCrewNamed([])).toBe(false);
    expect(jhaCrewNamed([{ ...namedUnsigned, name: '  ' }])).toBe(false);
    expect(jhaCrewNamed([namedUnsigned])).toBe(true);
    expect(jhaCrewSigned([namedUnsigned])).toBe(false);
    expect(jhaCrewSigned([namedSigned])).toBe(true);
    expect(jhaCrewSigned([namedSigned, namedUnsigned])).toBe(false);
  });
});

describe('recommendJhaFillAction', () => {
  const ready = {
    status: 'draft',
    saved: true,
    hasSite: true,
    stepsReady: true,
    crewNamed: true,
    crewSigned: true,
    requiredSignOffsDone: true,
    hasPdf: false,
  };

  it('saves first so a new JHA has an id for photos and crew links', () => {
    expect(recommendJhaFillAction({ ...ready, saved: false }).key).toBe('save');
  });

  it('walks site → steps → crew → signatures → publish', () => {
    expect(recommendJhaFillAction({ ...ready, hasSite: false }).key).toBe('site');
    expect(recommendJhaFillAction({ ...ready, stepsReady: false }).label).toBe('Complete steps');
    expect(recommendJhaFillAction({ ...ready, crewNamed: false }).label).toBe('Add crew');
    expect(recommendJhaFillAction({ ...ready, crewSigned: false }).label).toBe('Get signatures');
    expect(recommendJhaFillAction({ ...ready, requiredSignOffsDone: false }).label).toBe('Sign off');
    expect(recommendJhaFillAction(ready).key).toBe('publish');
  });

  it('opens the PDF once published', () => {
    expect(recommendJhaFillAction({ ...ready, status: 'published', hasPdf: true }).key).toBe('pdf');
  });

  it('builds fill context from live steps and crew', () => {
    const ctx = jhaFillContext({
      status: 'draft',
      saved: true,
      hasPdf: false,
      siteParts: ['12 Site Rd'],
      steps: [readyStep],
      crew: [namedSigned],
      signOffRoles: [{ id: 'sup', required: true }],
      signOffs: [supervisor],
    });
    expect(recommendJhaFillAction(ctx).key).toBe('publish');
  });
});

describe('recommendJhaListAction', () => {
  it('makes job/site and crew the next on drafts, and Open on published', () => {
    expect(recommendJhaListAction({ status: 'draft', hasSite: false, crewNamed: false, crewSigned: false }).label).toBe('Add site');
    expect(recommendJhaListAction({ status: 'draft', hasSite: true, crewNamed: false, crewSigned: false }).label).toBe('Add crew');
    expect(recommendJhaListAction({ status: 'draft', hasSite: true, crewNamed: true, crewSigned: false }).label).toBe('Get signatures');
    expect(recommendJhaListAction({ status: 'draft', hasSite: true, crewNamed: true, crewSigned: true }).label).toBe('Finish & publish');
    expect(recommendJhaListAction({ status: 'published', hasSite: true, crewNamed: true, crewSigned: true }).key).toBe('open');
  });

  it('reads crew and site off the list row', () => {
    const ctx = jhaListContext({
      status: 'draft',
      meta: {
        siteName: 'Plant A',
        crewSignOns: JSON.stringify([namedUnsigned]),
      },
      job_title: 'Shutdown',
    });
    expect(jhaCardHint(ctx)).toBe('Get signatures');
    expect(jhaListBucket('draft')).toBe('open');
    expect(jhaListBucket('published')).toBe('published');
  });
});
