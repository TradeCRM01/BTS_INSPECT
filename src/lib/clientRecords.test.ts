import { describe, expect, it } from 'vitest';
import {
  clientRecordHref,
  invoiceRecordHref,
  jobRecordHref,
  jobSiteAddressFromClient,
  newJobFromClientHref,
  newQuoteFromClientHref,
  quoteRecordHref,
} from './clientRecords';

describe('client record hrefs', () => {
  it('opens the client from the job hub chip', () => {
    expect(clientRecordHref('c1')).toBe('/clients/c1');
  });

  it('opens existing jobs, quotes, and invoices', () => {
    expect(jobRecordHref('job-1')).toBe('/jobs/job-1');
    expect(quoteRecordHref('q1')).toBe('/quotes?id=q1');
    expect(invoiceRecordHref('inv-1')).toBe('/invoices?id=inv-1');
  });

  it('starts quote and job create with the client preselected', () => {
    expect(newQuoteFromClientHref('c1')).toBe('/quotes?client=c1');
    expect(newJobFromClientHref('c1')).toBe('/jobs?client=c1');
  });
});

describe('jobSiteAddressFromClient', () => {
  it('fills an empty job address from the client', () => {
    expect(jobSiteAddressFromClient('', '12 Site Rd')).toBe('12 Site Rd');
    expect(jobSiteAddressFromClient('   ', '12 Site Rd')).toBe('12 Site Rd');
  });

  it('does not overwrite an address already on the job', () => {
    expect(jobSiteAddressFromClient('Warehouse B', '12 Site Rd')).toBe('Warehouse B');
  });

  it('leaves the field empty when the client has no address', () => {
    expect(jobSiteAddressFromClient('', null)).toBe('');
    expect(jobSiteAddressFromClient('', undefined)).toBe('');
  });
});
