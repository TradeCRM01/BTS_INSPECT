import { describe, expect, it } from 'vitest';
import {
  dispatchDraftFromJob,
  dispatchDraftsEqual,
  reconcileDispatchDraft,
} from './dispatchDraft';

const jobA = {
  id: 'job-a',
  scheduled_date: '2026-09-30',
  start_time: '08:00:00',
  end_time: '10:00:00',
  assigned_team: ['dave'],
};

describe('JobDispatchPanel draft baseline', () => {
  it('refreshes an untouched draft when the live job changes', () => {
    const prevLive = dispatchDraftFromJob(jobA);
    const live = dispatchDraftFromJob({ ...jobA, scheduled_date: '2026-10-01', start_time: '09:15:00' });
    const next = reconcileDispatchDraft({
      jobId: 'job-a',
      prevJobId: 'job-a',
      live,
      prevLive,
      draft: prevLive,
    });
    expect(dispatchDraftsEqual(next.draft, live)).toBe(true);
    expect(next.conflict).toBe(false);
  });

  it('keeps dirty input and flags an external change instead of overwriting', () => {
    const prevLive = dispatchDraftFromJob(jobA);
    const draft = { ...prevLive, start: '07:30' };
    const live = dispatchDraftFromJob({ ...jobA, assigned_team: ['jack'] });
    const next = reconcileDispatchDraft({
      jobId: 'job-a',
      prevJobId: 'job-a',
      live,
      prevLive,
      draft,
    });
    expect(next.draft.start).toBe('07:30');
    expect(next.draft.team).toEqual(['dave']);
    expect(next.conflict).toBe(true);
    expect(dispatchDraftsEqual(next.baseline, prevLive)).toBe(true);
  });

  it('replaces the draft when the job identity changes', () => {
    const prevLive = dispatchDraftFromJob(jobA);
    const live = dispatchDraftFromJob({
      scheduled_date: '2026-10-02',
      start_time: '13:00',
      end_time: '15:00',
      assigned_team: [],
    });
    const dirty = { ...prevLive, date: '2026-11-01' };
    const next = reconcileDispatchDraft({
      jobId: 'job-b',
      prevJobId: 'job-a',
      live,
      prevLive,
      draft: dirty,
    });
    expect(next.draft).toEqual(live);
    expect(next.conflict).toBe(false);
  });
});
