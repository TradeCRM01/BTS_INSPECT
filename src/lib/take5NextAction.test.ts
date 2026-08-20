import { describe, expect, it } from 'vitest';
import {
  take5CardHint,
  take5ChecksReady,
  take5FillContext,
  take5FillPath,
  take5IsSigned,
  take5ListBucket,
  take5ListContext,
  take5StatusClass,
  take5StatusLabel,
  recommendTake5FillAction,
  recommendTake5ListAction,
} from './take5NextAction';

describe('take5 status', () => {
  it('uses solid field labels, Ready for completed', () => {
    expect(take5StatusLabel('draft')).toBe('Draft');
    expect(take5StatusLabel('completed')).toBe('Ready');
    expect(take5StatusClass('draft')).toBe('ops-status-wait');
    expect(take5StatusClass('completed')).toBe('ops-status-ok');
  });

  it('buckets drafts as open and completed as done', () => {
    expect(take5ListBucket('draft')).toBe('open');
    expect(take5ListBucket('completed')).toBe('done');
  });
});

describe('take5ChecksReady / take5IsSigned', () => {
  it('matches complete: stop, identify, and controls — assess is optional', () => {
    expect(take5ChecksReady({})).toBe(false);
    expect(take5ChecksReady({ stop_think: 'Isolate', identify_hazards: 'Live', control_actions: '' })).toBe(false);
    expect(take5ChecksReady({ stop_think: 'Isolate', identify_hazards: 'Live', control_actions: 'Lock out' })).toBe(true);
    expect(take5ChecksReady({ stop_think: '  ', identify_hazards: 'Live', control_actions: 'Lock out' })).toBe(false);
  });

  it('treats a blank signature as unsigned', () => {
    expect(take5IsSigned(null)).toBe(false);
    expect(take5IsSigned('  ')).toBe(false);
    expect(take5IsSigned('data:image/png;base64,xx')).toBe(true);
  });
});

describe('recommendTake5FillAction', () => {
  const ready = {
    status: 'draft',
    saved: true,
    hasSite: true,
    checksReady: true,
    signed: true,
    hasPdf: false,
  };

  it('saves first so a new Take 5 has an id on the parent JHA', () => {
    expect(recommendTake5FillAction({ ...ready, saved: false }).key).toBe('save');
  });

  it('walks site → checks → sign → complete, then PDF once done', () => {
    expect(recommendTake5FillAction({ ...ready, hasSite: false }).label).toBe('Add site');
    expect(recommendTake5FillAction({ ...ready, checksReady: false }).label).toBe('Complete checks');
    expect(recommendTake5FillAction({ ...ready, signed: false }).label).toBe('Sign');
    expect(recommendTake5FillAction(ready).key).toBe('complete');
    expect(recommendTake5FillAction({ ...ready, status: 'completed' }).key).toBe('pdf');
    expect(recommendTake5FillAction({ ...ready, status: 'completed', hasPdf: true }).label).toBe('View PDF');
  });

  it('builds fill context from live checks and site parts', () => {
    const ctx = take5FillContext({
      status: 'draft',
      saved: true,
      hasPdf: false,
      siteParts: ['Switchboard face'],
      stopThink: 'Isolate',
      identifyHazards: 'Live parts',
      controlActions: 'Lock out',
      signed: true,
    });
    expect(recommendTake5FillAction(ctx).key).toBe('complete');
  });
});

describe('recommendTake5ListAction', () => {
  it('sends drafts to fill steps, and completed rows to Open', () => {
    expect(recommendTake5ListAction({ status: 'draft', hasSite: false, checksReady: false, signed: false }).label).toBe('Add site');
    expect(recommendTake5ListAction({ status: 'draft', hasSite: true, checksReady: false, signed: false }).label).toBe('Continue');
    expect(recommendTake5ListAction({ status: 'draft', hasSite: true, checksReady: true, signed: false }).label).toBe('Sign');
    expect(recommendTake5ListAction({ status: 'draft', hasSite: true, checksReady: true, signed: true }).label).toBe('Complete');
    expect(recommendTake5ListAction({ status: 'completed', hasSite: true, checksReady: true, signed: true }).key).toBe('open');
  });

  it('opens fill with parent JHA and Take 5 id', () => {
    expect(take5FillPath('jha-1')).toBe('/jha/take5?jhaId=jha-1');
    expect(take5FillPath('jha-1', 't5-9')).toBe('/jha/take5?jhaId=jha-1&id=t5-9');
  });

  it('reads site, checks, and sign off the list row', () => {
    const ctx = take5ListContext({
      status: 'draft',
      meta: { location: 'Plant A' },
      stop_think: 'Isolate',
      identify_hazards: 'Live',
      control_actions: '',
      signature: null,
      job_title: 'Shutdown',
    });
    expect(take5CardHint(ctx)).toBe('Continue');
  });
});
