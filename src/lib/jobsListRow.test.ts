import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOB_CLIENT_ATTACH_PLACEHOLDER,
  JOBS_LIST_NO_CLIENT,
  JOBS_LIST_NO_CREW,
  jobsListCrewLabel,
  jobsListCustomer,
  jobsListPhoneDate,
  jobsListPhoneNextLabel,
  jobsListPhoneRow,
  jobsListTitle,
  jobsListUndatedNextLabel,
} from './jobsListRow';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('jobsListTitle', () => {
  it('renders the job title, not only #0001', () => {
    expect(jobsListTitle({ title: '290 data prove A — delete ok', job_number: 1 })).toBe(
      '290 data prove A — delete ok',
    );
    expect(jobsListTitle({ title: '  Site labour  ', job_number: 42 })).toBe('Site labour');
    expect(jobsListTitle({ title: '', job_number: 1 })).toBe('#0001');
  });
});

describe('jobsListCustomer', () => {
  it('prints No client when the job has no client', () => {
    expect(jobsListCustomer({ client_name: 'Northside Electrical' })).toBe('Northside Electrical');
    expect(jobsListCustomer({ client_name: '' })).toBe(JOBS_LIST_NO_CLIENT);
    expect(jobsListCustomer({ client_name: null })).toBe(JOBS_LIST_NO_CLIENT);
    expect(jobsListCustomer({})).toBe('No client');
  });
});

describe('jobs list rows use the helpers on desktop and phone', () => {
  it('paints title and No client from JobRow, and Add client… on the sheet picker', () => {
    const page = src('src/pages/JobsPage.tsx');
    const sheet = src('src/pages/JobDetailPage.tsx');
    expect(page).toContain('jobsListTitle(job)');
    expect(page).toContain('jobsListCustomer(job)');
    expect(page).toContain('hub-jobs-title');
    expect(page).toContain('290 data prove A — delete ok');
    expect(page).toContain('client_id: null');
    expect(page).toContain('<JobRow key={job.id} job={job}');
    expect(page).not.toContain('function JobCard');
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(JOB_CLIENT_ATTACH_PLACEHOLDER).toBe('Add client…');
    expect(sheet).toContain('JOB_CLIENT_ATTACH_PLACEHOLDER');
    expect(sheet).toContain('<option value="">{JOB_CLIENT_ATTACH_PLACEHOLDER}</option>');
    expect(sheet).not.toContain('<option value="">Client</option>');
  });

  it('stacks the phone row: full title, ref · suburb · crew, status pill, and a 44px next', () => {
    const page = src('src/pages/JobsPage.tsx');
    const css = src('src/index.css');
    expect(page).toContain('jobsListPhoneRow({');
    expect(page).toContain('data-jobs-phone-list');
    expect(page).toContain('data-jobs-phone-row');
    expect(page).toContain('hub-jobs-phone-row');
    expect(page).toContain('hub-jobs-phone-title');
    expect(page).toContain('hub-jobs-phone-meta');
    expect(page).toContain('row.statusClass');
    expect(src('src/lib/jobsListRow.ts')).toContain('jobsListCrewLabel');
    expect(page).toContain('hub-jobs-phone-next');
    expect(page).toContain('hub-jobs-desktop-list');
    expect(page).toContain('function JobPhoneRow');
    expect(css).toContain('.hub-jobs-phone-list');
    expect(css).toContain('.hub-jobs-phone-row');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('white-space: normal');
    expect(css).toContain('.hub-jobs-phone-row .hub-jobs-phone-next');
    expect(css).toMatch(/\.hub-jobs-phone-row \.hub-jobs-phone-next \{[\s\S]*min-height: 44px;/);
    expect(css).toMatch(/\.hub-jobs-phone-row \.hub-jobs-phone-next \{[\s\S]*min-width: 44px;/);
    const phone = page.slice(page.indexOf('function JobPhoneRow'), page.indexOf('function JobRow'));
    const desktop = page.slice(page.indexOf('function JobRow'));
    expect(phone).toContain('jobsListPhoneNextLabel(next)');
    expect(phone).toContain('aria-label={`Open job ${row.title}`}');
    expect(phone).toContain('{phoneNext ? (');
    expect(desktop).toContain('{nextLabel ? (');
  });
});

describe('jobsListPhoneNextLabel', () => {
  it('hides Next when it is not actionable so the status pill stands alone', () => {
    expect(jobsListPhoneNextLabel({ actionable: false, label: 'Cancelled' })).toBeNull();
    expect(jobsListPhoneNextLabel({ actionable: false, label: 'Done' })).toBeNull();
    expect(jobsListPhoneNextLabel({ actionable: false, label: 'Invoiced' })).toBeNull();
    expect(jobsListPhoneNextLabel({ actionable: true, label: 'Invoice' })).toBe('Invoice');
    expect(jobsListPhoneNextLabel({ actionable: true, label: 'Assign crew' })).toBe('Assign crew');
    expect(jobsListUndatedNextLabel('no_date', null)).toBe('Set a date');
  });
});

describe('jobsListPhoneRow', () => {
  it('keeps the full title and prints #0036 · Stafford · Dean, Tom', () => {
    const row = jobsListPhoneRow({
      title: '291 prove switchboard and after-hours commissioning on a live site',
      job_number: 36,
      client_name: 'Brooke Lawson',
      address: '12 Grange Rd, Stafford QLD 4053',
      status: 'completed',
      scheduled_date: '2026-10-19',
      assigned_team: ['dean', 'tom'],
      invoices: [],
    }, jobsListCrewLabel(['dean', 'tom'], [
      { id: 'dean', name: 'Dean Moretti' },
      { id: 'tom', name: 'Tom Nguyen' },
    ]));
    expect(row.title).toBe('291 prove switchboard and after-hours commissioning on a live site');
    expect(row.ref).toBe('#0036');
    expect(row.line2).toBe('#0036 · Stafford · Dean Moretti, Tom Nguyen');
    expect(row.line3).toBe('Brooke Lawson · 19 Oct');
    expect(row.status).toBe('Ready to invoice');
  });

  it('prints No crew yet on a dated job with an empty team', () => {
    const row = jobsListPhoneRow({
      title: 'Jet the line',
      job_number: 12,
      client_name: 'Northside',
      address: '1 Main St, Stafford QLD 4053',
      status: 'scheduled',
      scheduled_date: '2026-10-20',
      assigned_team: [],
    });
    expect(row.line2).toContain(JOBS_LIST_NO_CREW);
    expect(row.status).toBe('Needs crew');
  });
});
