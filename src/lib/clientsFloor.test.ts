import { existsSync, readFileSync } from 'node:fs';
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

describe('clients look — open record is the document sheet', () => {
  it('paints the open client as the document sheet, not admin rows or a CLIENTS eyebrow', () => {
    const list = src('src/pages/ClientsPage.tsx');
    const detail = src('src/pages/ClientDetailPage.tsx');
    const css = src('src/index.css');
    const clientCssStart = css.indexOf('/* Clients look only');
    const clientCssEnd = css.indexOf('/* End client sheet contact write */');
    expect(clientCssStart).toBeGreaterThan(-1);
    expect(clientCssEnd).toBeGreaterThan(clientCssStart);
    const clientCss = css.slice(clientCssStart, clientCssEnd);

    expect(list).toContain('hub-clients');
    expect(list).toContain('hub-clients-sheet');
    expect(list).toContain('hub-clients-row');
    expect(list).toContain('Customer');
    expect(list).toContain('Suburb');
    expect(list).toContain('Jobs');
    expect(list).toContain('Open');
    expect(list).toContain('ops-page-title">Clients');
    expect(list).not.toContain('hub-look-eyebrow');
    expect(list).not.toContain('hub-clients-kicker');
    expect(list).not.toMatch(/>CLIENTS</);
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toContain('function ClientCard');
    expect(list).not.toMatch(/Relovi|Littleloop/);

    expect(detail).toContain('is-record-open');
    expect(detail).toContain('hub-clients-document');
    expect(detail).toContain('hub-clients-sheet-bar');
    expect(detail).toContain('hub-clients-sheet-body');
    expect(detail).toContain('hub-clients-hero');
    expect(detail).toContain('hub-clients-label');
    expect(detail).toContain('hub-clients-ledger');
    expect(detail).toContain('hub-clients-job-row');
    expect(detail).toContain('hub-clients-pill');
    expect(detail).toContain('clientJobOpenHref');
    expect(detail).toContain('clientJobFloorMeta');
    expect(detail).toContain('formatClientJobDate');
    expect(detail).toContain('className="btn-primary"');
    expect(detail).toContain('New job');
    expect(detail).not.toContain('hub-clients-kicker');
    expect(detail).not.toContain('hub-clients-contact-sheet');
    expect(detail).not.toContain('hub-clients-jobs-sheet');
    expect(detail).not.toContain('hub-clients-jobs-thead');
    expect(detail).not.toMatch(/>CLIENTS</);
    expect(detail).not.toContain('This week');
    expect(detail).not.toContain('<table');
    expect(detail).not.toContain('<thead');
    expect(detail).not.toMatch(/Relovi|Littleloop/);

    expect(clientCss).toContain('--client-page: #F5F0E6');
    expect(clientCss).toContain('--client-sheet: #FFFDF8');
    expect(clientCss).toContain('--client-ink: #0A2540');
    expect(clientCss).toContain('--client-muted: #5B6B7C');
    expect(clientCss).toContain('--client-line: #E2D9CC');
    expect(clientCss).toContain('#2E75B6');
    expect(clientCss).toContain('box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(clientCss).toContain('box-shadow: inset 0 1px 0 #fff');
    expect(clientCss).toContain('font-size: 56px !important');
    expect(clientCss).toContain("font-family: Rajdhani, sans-serif");
    expect(clientCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(clientCss).toContain('font-variant-numeric: tabular-nums');
    expect(clientCss).toContain('letter-spacing: 0.12em');
    expect(clientCss).toContain('.hub-clients.is-record-open');
    expect(clientCss).not.toContain('--client-pass');
    expect(clientCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(clientCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(clientCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(clientCss).not.toContain('indigo-500');
    expect(clientCss).not.toMatch(/#111|#000\b/);
    expect(clientCss).not.toContain('.hub-clients-kicker');
  });

  it('does not restyle stay-off floors, AppShell, or the form overlay', () => {
    const list = src('src/pages/ClientsPage.tsx');
    const detail = src('src/pages/ClientDetailPage.tsx');
    expect(list).not.toContain('hub-take5');
    expect(list).not.toContain('hub-jha');
    expect(list).not.toContain('hub-inspections');
    expect(list).not.toContain('hub-reports');
    expect(list).not.toContain('hub-timesheets');
    expect(list).not.toContain('hub-compliance');
    expect(list).not.toContain('SchedulePage');
    expect(detail).not.toContain('hub-take5');
    expect(detail).not.toContain('hub-jha');
    expect(detail).not.toContain('hub-inspections');
    expect(detail).not.toContain('hub-reports');
    expect(detail).not.toContain('hub-timesheets');
    expect(detail).not.toContain('TimesheetsPage');
    expect(detail).not.toContain('SchedulePage');

    const jobs = src('src/pages/JobsPage.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const login = src('src/pages/LoginPage.tsx');
    const landing = src('src/pages/RootPage.tsx');
    const shell = src('src/components/layout/AppShell.tsx');

    expect(jobs).not.toContain('hub-clients');
    expect(quotes).not.toContain('hub-clients');
    expect(invoices).not.toContain('hub-clients');
    expect(login).not.toContain('hub-clients');
    expect(landing).not.toContain('hub-clients');
    expect(shell).not.toContain('hub-clients');
    expect(shell).toContain('resolveAppShellColors');

    const formChunk = list.slice(list.indexOf('export function ClientForm'));
    expect(formChunk).not.toContain('hub-clients-document');
    expect(formChunk).not.toContain('hub-clients-hero');
  });

  it('LOOK frames cover the open client as the document sheet on desktop and phone only', () => {
    for (const rel of [
      'docs/look/clients-sheet-desktop.png',
      'docs/look/clients-sheet-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});

describe('clients list quiet elevation', () => {
  it('lifts the list sheet on cream with one quiet elevation, not the open record', () => {
    const list = src('src/pages/ClientsPage.tsx');
    const detail = src('src/pages/ClientDetailPage.tsx');
    const css = src('src/index.css');
    const listSheet = css.slice(css.indexOf('  .hub-clients-sheet {'), css.indexOf('  .hub-clients-contact-sheet {'));

    expect(list).toContain('hub-clients-sheet');
    expect(list).toContain('<div className="hub-clients-sheet">');
    expect(listSheet).toContain('inset 0 1px 0 #fff');
    expect(listSheet).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(listSheet).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(detail).not.toContain('className="hub-clients-sheet"');
    expect(detail).toContain('hub-clients-document');
  });

  it('LOOK frames cover the clients list elevation on desktop', () => {
    for (const rel of [
      'docs/look/list-card-elevation-clients-desktop.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
