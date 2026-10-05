import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  JOB_CLIENT_ATTACH_PLACEHOLDER,
  JOBS_LIST_NO_CLIENT,
  jobsListCustomer,
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
});
