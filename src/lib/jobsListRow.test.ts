import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOB_CLIENT_ATTACH_PLACEHOLDER,
  JOBS_LIST_NO_CLIENT,
  jobsListCustomer,
  jobsListPhoneDate,
  jobsListPhoneRow,
  jobsListTitle,
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
    expect(page).toContain('<JobRow key={job.id} job={job} />');
    expect(page).not.toContain('function JobCard');
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(JOB_CLIENT_ATTACH_PLACEHOLDER).toBe('Add client…');
    expect(sheet).toContain('JOB_CLIENT_ATTACH_PLACEHOLDER');
    expect(sheet).toContain('<option value="">{JOB_CLIENT_ATTACH_PLACEHOLDER}</option>');
    expect(sheet).not.toContain('<option value="">Client</option>');
  });

  it('stacks the phone row: full title, client · suburb, one status, date, and a 44px next', () => {
    const page = src('src/pages/JobsPage.tsx');
    const css = src('src/index.css');
    expect(page).toContain('jobsListPhoneRow(job)');
    expect(page).toContain('data-jobs-phone-list');
    expect(page).toContain('data-jobs-phone-row');
    expect(page).toContain('hub-jobs-phone-row');
    expect(page).toContain('hub-jobs-phone-title');
    expect(page).toContain('hub-jobs-phone-meta');
    expect(page).toContain('hub-jobs-phone-status');
    expect(page).toContain('hub-jobs-phone-date');
    expect(page).toContain('hub-jobs-phone-next');
    expect(page).toContain('hub-jobs-desktop-list');
    expect(page).toContain('function JobPhoneRow');
    expect(page).not.toContain('hub-jobs-pill');
    expect(page).not.toMatch(/data-jobs-phone-row[\s\S]{0,900}ItemMenu/);
    expect(css).toContain('.hub-jobs-phone-list');
    expect(css).toContain('.hub-jobs-phone-row');
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toContain('white-space: normal');
    expect(css).toContain('.hub-jobs-phone-next {\n      min-height: 44px;');
    expect(css).toContain('.hub-jobs-desktop-list {\n      display: none;');
  });
});

describe('jobsListPhoneRow', () => {
  it('keeps the full title and client next to suburb, with one status and the date', () => {
    const row = jobsListPhoneRow({
      title: '291 prove switchboard and after-hours commissioning on a live site',
      job_number: 291,
      client_name: 'Client Services Northside Body Corporate',
      address: '18 William St, Perth WA 6000',
      status: 'scheduled',
      scheduled_date: '2026-09-11',
    });
    expect(row.title).toBe('291 prove switchboard and after-hours commissioning on a live site');
    expect(row.title).not.toContain('…');
    expect(row.ref).toBe('#0291');
    expect(row.meta).toBe('Client Services Northside Body Corporate · Perth');
    expect(row.meta).not.toContain('…');
    expect(row.status).toBe('Scheduled');
    expect(row.date).toBe(jobsListPhoneDate('2026-09-11'));
    expect(row.date).toBe('11 Sep');
  });
});
