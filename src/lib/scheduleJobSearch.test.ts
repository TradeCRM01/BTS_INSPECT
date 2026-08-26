import { describe, expect, it } from 'vitest';
import { attachJobClients, jobMatchesSearch, mergeScheduleJobPatch, normalizeJobSearch, parseJobRefQuery, withScheduleJobPatches } from './scheduleJobSearch';
import type { Job, JobWithClient } from '../types/crm';

const job = {
  id: 'j1',
  title: 'Switchboard upgrade',
  description: 'Isolate and replace the main board.',
  address: '12 Workshop Rd, Perth WA 6000',
  client_name: 'Northside Electrical',
  client_address: '12 Workshop Rd, Perth WA 6000',
  job_number: 42,
  status: 'scheduled',
} as JobWithClient;

describe('schedule job search', () => {
  it('strips a leading hash so #0042 matches', () => {
    expect(normalizeJobSearch('#0042')).toBe('0042');
    expect(jobMatchesSearch(job, '#42')).toBe(true);
    expect(jobMatchesSearch(job, '0042')).toBe(true);
  });

  it('matches title, client, and address as you type', () => {
    expect(jobMatchesSearch(job, 'swit')).toBe(true);
    expect(jobMatchesSearch(job, 'north')).toBe(true);
    expect(jobMatchesSearch(job, 'workshop')).toBe(true);
    expect(jobMatchesSearch(job, 'zzz')).toBe(false);
  });

  it('matches a stage by parent job number and cost code', () => {
    const stage = {
      ...job,
      id: 'j-stage',
      title: 'Switchboard labour',
      job_number: 44,
      parent_job_id: 'parent',
      parent_job_number: 42,
      cost_code: '01',
    } as JobWithClient;
    expect(jobMatchesSearch(stage, '42')).toBe(true);
    expect(jobMatchesSearch(stage, '#0042.01')).toBe(true);
    expect(jobMatchesSearch(stage, '01')).toBe(true);
    expect(jobMatchesSearch(stage, 'labour')).toBe(true);
    expect(parseJobRefQuery('#0042.01')).toEqual({ jobNumber: 42, costCode: '01' });
    expect(parseJobRefQuery('42')).toEqual({ jobNumber: 42, costCode: null });
  });

  it('attaches client fields from a client list, not a Map', () => {
    const rows = attachJobClients(
      [{
        id: 'j1',
        company_id: 'c',
        client_id: 'client-1',
        title: 'Meter box replacement',
        description: null,
        status: 'scheduled',
        priority: 'medium',
        scheduled_date: null,
        start_time: null,
        end_time: null,
        address: '12 Workshop Rd',
        assigned_team: [],
        inspection_id: null,
        created_by: 'u1',
        created_at: '2026-08-24T00:00:00.000Z',
        updated_at: '2026-08-24T00:00:00.000Z',
        job_number: 43,
        color: null,
        budget: null,
        parent_job_id: null,
      } as Job],
      [{ id: 'client-1', name: 'Northside Electrical', phone: '0400 111 222', address: '12 Workshop Rd' }],
    );
    expect(rows[0].client_name).toBe('Northside Electrical');
    expect(rows[0].client_phone).toBe('0400 111 222');
  });

  it('keeps a dropped job patched so it does not fall back to unscheduled', () => {
    mergeScheduleJobPatch('patch-job', {
      scheduled_date: '2026-08-26',
      start_time: '08:00:00',
      end_time: '09:00:00',
    });
    const [row] = withScheduleJobPatches([{ id: 'patch-job', scheduled_date: null, start_time: null, end_time: null }]);
    expect(row.scheduled_date).toBe('2026-08-26');
    expect(row.start_time).toBe('08:00:00');
  });
});
