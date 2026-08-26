import { describe, expect, it } from 'vitest';
import { jobMatchesSearch, normalizeJobSearch } from './scheduleJobSearch';
import type { JobWithClient } from '../types/crm';

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
});
