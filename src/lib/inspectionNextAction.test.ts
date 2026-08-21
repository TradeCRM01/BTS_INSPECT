import { describe, expect, it } from 'vitest';
import type { Section, TemplateSchema } from '../types/template';
import {
  inspectionFillContext,
  inspectionListBucket,
  inspectionListContext,
  inspectionOpenPath,
  inspectionRequiredComplete,
  inspectionSectionCompletion,
  inspectionStatusClass,
  inspectionStatusLabel,
  recommendInspectionFillAction,
  recommendInspectionListAction,
} from './inspectionNextAction';

const switchboard: Section = {
  id: 'sec-board',
  title: 'Switchboard',
  isRepeating: false,
  questions: [
    { id: 'q-site', type: 'text', label: 'Board ID', required: true },
    { id: 'q-note', type: 'text', label: 'Notes', required: false },
  ],
};

const circuits: Section = {
  id: 'sec-circuits',
  title: 'Circuits',
  isRepeating: true,
  repeatLabel: 'Circuit',
  questions: [
    { id: 'q-circ', type: 'text', label: 'Circuit', required: true },
  ],
};

const schema: TemplateSchema = {
  meta: {
    requiresSiteName: true,
    requiresSiteAddress: false,
    requiresClientName: false,
    requiresJobNumber: false,
  },
  sections: [switchboard, circuits],
};

describe('inspection status', () => {
  it('uses solid field labels, Ready for completed', () => {
    expect(inspectionStatusLabel('draft')).toBe('Draft');
    expect(inspectionStatusLabel('completed')).toBe('Ready');
    expect(inspectionStatusLabel('issued')).toBe('Issued');
    expect(inspectionStatusLabel('sent')).toBe('Sent');
    expect(inspectionStatusClass('draft')).toBe('ops-status-wait');
    expect(inspectionStatusClass('completed')).toBe('ops-status-progress');
    expect(inspectionStatusClass('issued')).toBe('ops-status-ok');
    expect(inspectionStatusClass('sent')).toBe('ops-status-ok');
  });

  it('buckets drafts as open and completed/issued/sent as done', () => {
    expect(inspectionListBucket('draft')).toBe('open');
    expect(inspectionListBucket('completed')).toBe('done');
    expect(inspectionListBucket('issued')).toBe('done');
    expect(inspectionListBucket('sent')).toBe('done');
  });
});

describe('inspectionSectionCompletion / required complete', () => {
  it('treats a section with no required questions as full', () => {
    const optional: Section = {
      id: 'opt',
      title: 'Notes',
      isRepeating: false,
      questions: [{ id: 'n', type: 'text', label: 'Notes', required: false }],
    };
    expect(inspectionSectionCompletion(optional, {})).toBe('full');
  });

  it('counts required answers, including N/A', () => {
    expect(inspectionSectionCompletion(switchboard, {})).toBe('empty');
    expect(inspectionSectionCompletion(switchboard, { 'q-site': 'DB1' })).toBe('full');
    expect(inspectionSectionCompletion(switchboard, { 'q-site': 'n/a' })).toBe('full');
  });

  it('needs at least one repeating item with required answers', () => {
    expect(inspectionSectionCompletion(circuits, {})).toBe('empty');
    expect(inspectionSectionCompletion(circuits, { 'q-circ__a1': 'Lights' })).toBe('full');
    expect(inspectionRequiredComplete(schema, { 'q-site': 'DB1' })).toBe(false);
    expect(inspectionRequiredComplete(schema, { 'q-site': 'DB1', 'q-circ__a1': 'Lights' })).toBe(true);
    expect(inspectionRequiredComplete(null, {})).toBe(false);
  });
});

describe('recommendInspectionFillAction', () => {
  const ready = {
    status: 'draft',
    saveNeeded: false,
    hasSite: true,
    isLastSection: false,
  };

  it('saves when the last write failed or is pending', () => {
    expect(recommendInspectionFillAction({ ...ready, saveNeeded: true }).key).toBe('save');
  });

  it('walks site → next section → review, then PDF once done', () => {
    expect(recommendInspectionFillAction({ ...ready, hasSite: false }).label).toBe('Add site');
    expect(recommendInspectionFillAction(ready).label).toBe('Next section');
    expect(recommendInspectionFillAction({ ...ready, isLastSection: true }).key).toBe('review');
    expect(recommendInspectionFillAction({ ...ready, status: 'completed' }).key).toBe('pdf');
    expect(recommendInspectionFillAction({ ...ready, status: 'issued' }).label).toBe('View PDF');
  });

  it('builds fill context from live site parts', () => {
    const ctx = inspectionFillContext({
      status: 'draft',
      saveNeeded: false,
      siteParts: ['12 Site Rd'],
      isLastSection: true,
    });
    expect(recommendInspectionFillAction(ctx).key).toBe('review');
  });
});

describe('recommendInspectionListAction', () => {
  it('sends drafts to fill or review, and done rows to the PDF', () => {
    expect(recommendInspectionListAction({ status: 'draft', hasSite: false, requiredComplete: false }).label).toBe('Add site');
    expect(recommendInspectionListAction({ status: 'draft', hasSite: true, requiredComplete: false }).label).toBe('Continue');
    expect(recommendInspectionListAction({ status: 'draft', hasSite: true, requiredComplete: true }).key).toBe('review');
    expect(recommendInspectionListAction({ status: 'completed', hasSite: true, requiredComplete: true }).key).toBe('pdf');
    expect(recommendInspectionListAction({ status: 'issued', hasSite: true, requiredComplete: true }).label).toBe('View PDF');
    expect(recommendInspectionListAction({
      status: 'issued', hasSite: true, requiredComplete: true, hasReport: true, reportId: 'rep-1',
    }).label).toBe('Send');
    expect(recommendInspectionListAction({
      status: 'issued', hasSite: true, requiredComplete: true, hasReport: false,
    }).label).toBe('No report yet');
  });

  it('opens fill, review, or the report from the next key', () => {
    expect(inspectionOpenPath('abc', 'section')).toBe('/inspections/abc');
    expect(inspectionOpenPath('abc', 'site')).toBe('/inspections/abc');
    expect(inspectionOpenPath('abc', 'review')).toBe('/inspections/abc/review');
    expect(inspectionOpenPath('abc', 'pdf')).toBe('/inspections/abc/report');
    expect(inspectionOpenPath('abc', 'send')).toBe('/inspections/abc/report');
  });

  it('reads site and completeness off the list row', () => {
    const incomplete = inspectionListContext({
      status: 'draft',
      meta: { siteName: 'Plant A' },
      job_title: 'Shutdown',
      template_snapshot: { schema },
      responses: { 'q-site': 'DB1' },
    });
    expect(recommendInspectionListAction(incomplete).label).toBe('Continue');

    const ready = inspectionListContext({
      status: 'draft',
      meta: { siteName: 'Plant A' },
      template_snapshot: { schema },
      responses: { 'q-site': 'DB1', 'q-circ__a1': 'Lights' },
    });
    expect(recommendInspectionListAction(ready).key).toBe('review');
  });

  it('uses the live job site when bound — a stale snapshot is not enough', () => {
    const boundEmpty = inspectionListContext({
      status: 'draft',
      meta: { siteName: 'Stale plant' },
      job_address: '',
      livingSite: '',
      jobBound: true,
      template_snapshot: { schema },
      responses: { 'q-site': 'DB1', 'q-circ__a1': 'Lights' },
    });
    expect(boundEmpty.hasSite).toBe(false);
    expect(recommendInspectionListAction(boundEmpty).label).toBe('Add site');

    const boundLive = inspectionListContext({
      status: 'draft',
      meta: { siteName: 'Stale plant' },
      livingSite: '12 Site Rd, Geelong',
      jobBound: true,
      template_snapshot: { schema },
      responses: { 'q-site': 'DB1', 'q-circ__a1': 'Lights' },
    });
    expect(boundLive.hasSite).toBe(true);
    expect(recommendInspectionListAction(boundLive).key).toBe('review');
  });
});
