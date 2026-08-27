import { describe, expect, it } from 'vitest';
import {
  INSPECTION_TEMPLATE_PACKS,
  clonePackSections,
  packMetaDefaults,
} from './inspectionTemplatePacks';

function pack(id: string) {
  const found = INSPECTION_TEMPLATE_PACKS.find(p => p.id === id);
  if (!found) throw new Error(`missing pack ${id}`);
  return found;
}

describe('electrical verification pack', () => {
  const electrical = pack('electrical_verification');

  it('uses the electrical report renderer', () => {
    expect(electrical.suggestedRenderer).toBe('electrical_3000');
  });

  it('adds an Evidence photos section of type photo', () => {
    const section = electrical.sections.find(s => s.title === 'Evidence photos');
    expect(section).toBeTruthy();
    expect(section?.questions).toEqual([
      expect.objectContaining({ type: 'photo', label: 'Evidence photos' }),
    ]);
  });

  it('turns on allowPhotos for every visual inspection check', () => {
    const visual = electrical.sections.find(s => s.title === 'Visual inspection');
    expect(visual?.questions.length).toBeGreaterThan(0);
    for (const question of visual?.questions ?? []) {
      expect(question.allowPhotos, question.label).toBe(true);
    }
  });

  it('turns on allowPhotos for circuit test rows, not the circuit reference', () => {
    const circuit = electrical.sections.find(s => s.title === 'Circuit tests');
    expect(circuit).toBeTruthy();
    for (const question of circuit?.questions ?? []) {
      if (question.label === 'Circuit reference / DB & CB') {
        expect(question.allowPhotos).toBeFalsy();
        continue;
      }
      expect(question.allowPhotos, question.label).toBe(true);
    }
  });
});

describe('site photos pack', () => {
  const site = pack('site_photos');

  it('is a generic_inspection pack of photo questions only', () => {
    expect(site.name).toBe('Site photos');
    expect(site.suggestedRenderer).toBe('generic_inspection');
    const questions = site.sections.flatMap(s => s.questions);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every(q => q.type === 'photo')).toBe(true);
  });
});

describe('clonePackSections', () => {
  it('assigns fresh ids so a pack can be loaded onto a template', () => {
    const sections = clonePackSections('electrical_verification');
    const evidence = sections.find(s => s.title === 'Evidence photos');
    expect(evidence?.id).toBeTruthy();
    expect(evidence?.questions[0]?.id).toBeTruthy();
    expect(evidence?.questions[0]?.type).toBe('photo');
    expect(packMetaDefaults('electrical_verification')).toEqual({ layoutMode: 'test_schedule' });
    expect(packMetaDefaults('site_photos')).toEqual({ layoutMode: 'checklist' });
  });
});
