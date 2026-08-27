import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLIENT_LIST_FLOOR_JOB_COLUMNS,
  clientJobFloorMeta,
  clientJobFloorTitle,
  clientJobOpenHref,
  clientJobSearchBits,
  clientJobStatusLabel,
  clientJobsEmptyTitle,
  clientListFloorJobScope,
  clientMatchesSearch,
  clientOpenHref,
  clientSearchHaystack,
  collectJobSearchBitsByClient,
  filterClientsForSearch,
  formatClientJobCount,
  formatClientJobDate,
  formatClientJobTime,
  normalizeClientSearch,
  padClientJobNumber,
  sortClientJobsForFloor,
} from './clientsFloor';
import { clientListStatsQueries, jobRecordHref } from './clientRecords';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const northside = {
  name: 'Northside Electrical',
  contact_person: 'Alex Nguyen',
  phone: '0412 345 678',
  email: 'alex@northside.com.au',
  address: '12 Smith St, Suburb NSW 2000',
  notes: 'Main switchboard is in the plant room',
  jobSearchBits: clientJobSearchBits({
    title: 'Switchboard upgrade',
    address: '88 Workshop Rd, Perth WA 6000',
    job_number: 42,
  }),
};

describe('find a client on /clients', () => {
  it('strips a leading hash so #0042 matches the job number', () => {
    expect(normalizeClientSearch('#0042')).toBe('0042');
    expect(normalizeClientSearch('  North  ')).toBe('north');
    expect(clientMatchesSearch(northside, '#42')).toBe(true);
    expect(clientMatchesSearch(northside, '0042')).toBe(true);
  });

  it('matches name, contact, phone, email, and the client site', () => {
    expect(clientMatchesSearch(northside, 'north')).toBe(true);
    expect(clientMatchesSearch(northside, 'nguyen')).toBe(true);
    expect(clientMatchesSearch(northside, '0412')).toBe(true);
    expect(clientMatchesSearch(northside, 'northside.com.au')).toBe(true);
    expect(clientMatchesSearch(northside, 'smith st')).toBe(true);
    expect(clientMatchesSearch(northside, 'zzz')).toBe(false);
  });

  it('matches a job site, title, or number already on that client', () => {
    expect(clientMatchesSearch(northside, 'workshop')).toBe(true);
    expect(clientMatchesSearch(northside, 'switchboard')).toBe(true);
    expect(clientMatchesSearch(northside, '#0042')).toBe(true);
    expect(clientSearchHaystack(northside)).toContain('88 workshop rd, perth wa 6000');
  });

  it('keeps notes searchable without inventing extra identity fields', () => {
    expect(clientMatchesSearch(northside, 'plant room')).toBe(true);
  });

  it('returns the full list when the box is empty or only a hash', () => {
    const rows = [northside, { name: 'Westside Plumbing' }];
    expect(filterClientsForSearch(rows, '')).toEqual(rows);
    expect(filterClientsForSearch(rows, '   ')).toEqual(rows);
    expect(filterClientsForSearch(rows, '#')).toEqual(rows);
    expect(filterClientsForSearch(rows, 'west')).toEqual([rows[1]]);
  });

  it('groups job search bits by client_id and skips walk-up jobs', () => {
    const map = collectJobSearchBitsByClient([
      { client_id: 'c1', title: 'Meter box', address: '1 Site Rd', job_number: 7 },
      { client_id: null, title: 'Walk-up', address: '9 Other St', job_number: 8 },
      { client_id: 'c1', title: 'LED upgrade', address: null, job_number: 9 },
    ]);
    expect(map.get('c1')).toEqual([
      ...clientJobSearchBits({ title: 'Meter box', address: '1 Site Rd', job_number: 7 }),
      ...clientJobSearchBits({ title: 'LED upgrade', address: null, job_number: 9 }),
    ]);
    expect(map.has('')).toBe(false);
  });
});

describe('open the client, see jobs, open a job', () => {
  it('opens the existing client record and job page — no new routes', () => {
    expect(clientOpenHref('c1')).toBe('/clients/c1');
    expect(clientJobOpenHref('job-1')).toBe('/jobs/job-1');
    expect(clientJobOpenHref('job-1')).toBe(jobRecordHref('job-1'));
  });

  it('names a job by site, then title, then job number', () => {
    expect(clientJobFloorTitle({
      address: '88 Workshop Rd, Perth WA 6000',
      title: 'Switchboard upgrade',
      job_number: 42,
    })).toBe('88 Workshop Rd, Perth WA 6000');
    expect(clientJobFloorTitle({
      address: '  ',
      title: 'Switchboard upgrade',
      job_number: 42,
    })).toBe('Switchboard upgrade');
    expect(clientJobFloorTitle({
      address: 'No site address',
      title: null,
      job_number: 42,
    })).toBe('#0042');
    expect(clientJobFloorTitle({})).toBe('');
  });

  it('puts job number, status, and date on the row so a tradie can pick the right job', () => {
    expect(padClientJobNumber(42)).toBe('0042');
    expect(clientJobStatusLabel('in_progress')).toBe('In Progress');
    expect(clientJobStatusLabel('scheduled')).toBe('Scheduled');
    expect(formatClientJobDate('2026-08-12')).toBe('12 Aug 2026');
    expect(formatClientJobTime('07:30:00')).toBe('07:30');
    expect(clientJobFloorMeta({
      address: '88 Workshop Rd, Perth WA 6000',
      title: 'Switchboard upgrade',
      job_number: 42,
      status: 'in_progress',
      scheduled_date: '2026-08-12',
      start_time: '07:30:00',
    })).toBe('#0042 · Switchboard upgrade · In Progress · 12 Aug 2026 · 07:30');
  });

  it('does not repeat the title when the row is already the job title or number', () => {
    expect(clientJobFloorMeta({
      address: null,
      title: 'Switchboard upgrade',
      job_number: 42,
      status: 'scheduled',
      scheduled_date: '2026-08-20',
    })).toBe('#0042 · Scheduled · 20 Aug 2026');
    expect(clientJobFloorMeta({
      address: null,
      title: null,
      job_number: 42,
      status: 'completed',
    })).toBe('Completed');
  });

  it('floats live work above completed and cancelled jobs', () => {
    const ordered = sortClientJobsForFloor([
      { id: 'done', status: 'completed', scheduled_date: '2026-08-20', job_number: 40 },
      { id: 'cancel', status: 'cancelled', scheduled_date: '2026-08-21', job_number: 41 },
      { id: 'dated', status: 'scheduled', scheduled_date: '2026-08-18', job_number: 39 },
      { id: 'needs-date', status: 'scheduled', scheduled_date: null, job_number: 38 },
      { id: 'on-site', status: 'in_progress', scheduled_date: '2026-08-12', job_number: 42 },
    ]);
    expect(ordered.map(job => job.id)).toEqual([
      'on-site',
      'needs-date',
      'dated',
      'done',
      'cancel',
    ]);
  });

  it('within a rank, prefers the newer date then the higher job number', () => {
    const ordered = sortClientJobsForFloor([
      { id: 'old', status: 'scheduled', scheduled_date: '2026-08-01', job_number: 50 },
      { id: 'new-low', status: 'scheduled', scheduled_date: '2026-08-20', job_number: 10 },
      { id: 'new-high', status: 'scheduled', scheduled_date: '2026-08-20', job_number: 11 },
    ]);
    expect(ordered.map(job => job.id)).toEqual(['new-high', 'new-low', 'old']);
  });

  it('says how many jobs the client already has', () => {
    expect(formatClientJobCount(0)).toBeNull();
    expect(formatClientJobCount(1)).toBe('1 job');
    expect(formatClientJobCount(4)).toBe('4 jobs');
  });

  it('does not dress a jobs load miss as an empty tray', () => {
    expect(clientJobsEmptyTitle({ error: true, count: 0 })).toBe('Could not load jobs');
    expect(clientJobsEmptyTitle({ error: false, count: 0 })).toBe('No jobs yet');
    expect(clientJobsEmptyTitle({ error: false, count: 2 })).toBe('');
  });
});

describe('list job scope stays on existing job fields', () => {
  it('widens the list jobs select to site, title, and number without scanning the ledger', () => {
    const base = clientListStatsQueries({ companyId: 'co1', clientIds: ['c1'] })!;
    const floor = clientListFloorJobScope(base.jobs);
    expect(floor.eq).toEqual(base.jobs.eq);
    expect(floor.inFilters).toEqual(base.jobs.inFilters);
    expect(floor.columns).toBe(CLIENT_LIST_FLOOR_JOB_COLUMNS);
    expect(floor.columns.split(',').map(col => col.trim())).toEqual([
      'client_id',
      'status',
      'scheduled_date',
      'address',
      'title',
      'job_number',
    ]);
    expect(floor.columns).not.toMatch(/\binspection_id\b/);
    expect(floor.columns).not.toBe('*');
  });
});

describe('clients floor wiring', () => {
  it('finds a client on /clients, opens /clients/:id, lists jobs, and taps through to /jobs/:id', () => {
    const list = src('src/pages/ClientsPage.tsx');
    const detail = src('src/pages/ClientDetailPage.tsx');
    const app = src('src/App.tsx');

    expect(list).toContain('filterClientsForSearch');
    expect(list).toContain('clientListFloorJobScope');
    expect(list).toContain('collectJobSearchBitsByClient');
    expect(list).toContain('clientOpenHref');
    expect(list).toContain('formatClientJobCount');
    expect(list).toContain('Search by name, site, job, phone, or email');
    expect(list).not.toContain("path: '/clients/");

    expect(detail).toContain('sortClientJobsForFloor');
    expect(detail).toContain('clientJobFloorTitle');
    expect(detail).toContain('clientJobFloorMeta');
    expect(detail).toContain('clientJobOpenHref');
    expect(detail).toContain('clientJobsEmptyTitle');
    expect(detail).toContain('isError: jobsError');
    expect(detail).toContain("queryKey: ['client-jobs'");
    expect(detail).toContain('clientHubRecordQueries');

    expect(app).toContain('<Route path="/clients"');
    expect(app).toContain('<Route path="/clients/:id"');
    expect(app).toContain('<Route path="/jobs/:id"');
    expect(app.match(/path="\/clients/g)?.length).toBe(2);
  });

  it('stays on clients-owned files and does not pull schedule or job-hub look modules', () => {
    const list = src('src/pages/ClientsPage.tsx');
    const detail = src('src/pages/ClientDetailPage.tsx');
    const floor = src('src/lib/clientsFloor.ts');
    const forbidden = [
      'SchedulePage',
      'BoardViews',
      'ScheduleJobSearch',
      'scheduleBoard',
      'JobsPage',
      'JobDetailPage',
    ];
    for (const name of forbidden) {
      expect(list).not.toContain(name);
      expect(detail).not.toContain(name);
      expect(floor).not.toContain(name);
    }
  });
});
