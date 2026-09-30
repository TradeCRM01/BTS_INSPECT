import { describe, expect, it } from 'vitest';
import {
  SCHEDULE_PLACEMENT_INVALIDATE_KEYS,
  applyPlacementToJobList,
  canSubmitPlacement,
  placementDraftAfterWrite,
  placementWriteFromDraft,
  runPlacementMutation,
} from './schedulePlacement';

const draft = {
  jobId: 'job-1',
  title: 'J-0001 · Switchboard',
  scheduled_date: '2026-09-30',
  start_time: '09:00',
  end_time: '11:00',
  assigned_team: ['dave'],
};

describe('schedule placement mutation', () => {
  it('refuses a second submit while the first request is pending', async () => {
    expect(canSubmitPlacement(true)).toBe(false);
    const result = await runPlacementMutation({
      pending: true,
      list: [{ id: 'job-1', scheduled_date: '2026-09-29' }],
      draft: placementWriteFromDraft(draft),
      write: async () => { throw new Error('should not write'); },
    });
    expect(result.submitted).toBe(false);
    expect(result.closeDraft).toBe(false);
    expect(result.list?.[0].scheduled_date).toBe('2026-09-29');
  });

  it('applies the write optimistically, then keeps the draft and restores the list on failure', async () => {
    const list = [
      { id: 'job-1', scheduled_date: '2026-09-29', start_time: null, assigned_team: [] as string[] },
      { id: 'job-2', scheduled_date: '2026-09-30' },
    ];
    const optimistic = applyPlacementToJobList(list, placementWriteFromDraft(draft));
    expect(optimistic[0]).toMatchObject({
      scheduled_date: '2026-09-30',
      start_time: '09:00',
      assigned_team: ['dave'],
    });
    expect(optimistic[1].id).toBe('job-2');

    const failed = await runPlacementMutation({
      pending: false,
      list,
      draft: placementWriteFromDraft(draft),
      write: async () => { throw new Error('offline'); },
    });
    expect(failed.submitted).toBe(true);
    expect(failed.closeDraft).toBe(false);
    expect(failed.list).toEqual(list);
    expect(placementDraftAfterWrite(false, draft)).toEqual(draft);
  });

  it('closes the draft only after the same request succeeds and lists living-job caches', async () => {
    const list = [{ id: 'job-1', scheduled_date: '2026-09-29' }];
    const ok = await runPlacementMutation({
      pending: false,
      list,
      draft: placementWriteFromDraft(draft),
      write: async () => undefined,
    });
    expect(ok.closeDraft).toBe(true);
    expect(ok.list?.[0].scheduled_date).toBe('2026-09-30');
    expect(placementDraftAfterWrite(true, draft)).toBeNull();
    expect(SCHEDULE_PLACEMENT_INVALIDATE_KEYS).toEqual(expect.arrayContaining([
      ['jobs'],
      ['job'],
      ['jobs-all'],
      ['jha-documents'],
      ['job-take5s'],
      ['jha-take5-all'],
      ['jha-take5-list'],
      ['schedule-job-search'],
      ['inspections'],
      ['inspection'],
      ['job-inspections'],
    ]));
  });
});
