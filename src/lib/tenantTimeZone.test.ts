import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tomorrowYmd, COMPANY_TIME_ZONE } from './jobReminder';
import {
  DEFAULT_TENANT_TIME_ZONE,
  formatEnquiryTime,
  resolveTenantTimeZone,
  tenantTodayYmd,
} from './tenantTimeZone';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const missedCallAt = new Date('2026-10-09T15:30:00.000Z');

describe('tenant time zone', () => {
  it('defaults to Australia/Brisbane', () => {
    expect(DEFAULT_TENANT_TIME_ZONE).toBe('Australia/Brisbane');
    expect(resolveTenantTimeZone(null)).toBe('Australia/Brisbane');
    expect(resolveTenantTimeZone('')).toBe('Australia/Brisbane');
    expect(resolveTenantTimeZone('Not/AZone')).toBe('Australia/Brisbane');
    expect(resolveTenantTimeZone('Australia/Perth')).toBe('Australia/Perth');
  });

  it('renders enquiry times in the tenant time zone', () => {
    expect(formatEnquiryTime(missedCallAt, 'Australia/Brisbane')).toBe('10 Oct 2026, 1:30 am');
    expect(formatEnquiryTime(missedCallAt, 'Australia/Perth')).toBe('9 Oct 2026, 11:30 pm');
    expect(formatEnquiryTime(missedCallAt, null)).toBe('10 Oct 2026, 1:30 am');
    expect(tenantTodayYmd(missedCallAt, 'Australia/Brisbane')).toBe('2026-10-10');
    expect(tenantTodayYmd(missedCallAt, 'Australia/Perth')).toBe('2026-10-09');
  });

  it('renders Sydney summer AEDT and winter AEST', () => {
    const summerUtc = new Date('2026-01-15T13:30:00.000Z');
    const winterUtc = new Date('2026-06-15T13:30:00.000Z');
    expect(formatEnquiryTime(summerUtc, 'Australia/Sydney')).toBe('16 Jan 2026, 12:30 am');
    expect(tenantTodayYmd(summerUtc, 'Australia/Sydney')).toBe('2026-01-16');
    expect(formatEnquiryTime(winterUtc, 'Australia/Sydney')).toBe('15 June 2026, 11:30 pm');
    expect(tenantTodayYmd(winterUtc, 'Australia/Sydney')).toBe('2026-06-15');
  });
});

describe('job-reminder stays on Perth', () => {
  const reminder = src('src/lib/jobReminder.ts');
  const edge = src('supabase/functions/job-reminder/index.ts');
  const migration = src('supabase/migrations/20261012000000_companies_time_zone.sql');

  it('does not change job-reminder calendar or edge timezone', () => {
    expect(COMPANY_TIME_ZONE).toBe('Australia/Perth');
    expect(reminder).toContain("export const COMPANY_TIME_ZONE = 'Australia/Perth'");
    expect(edge).toContain('const COMPANY_TZ = "Australia/Perth"');
    expect(reminder).not.toContain('tenantTimeZone');
    expect(edge).not.toContain('tenantTimeZone');
    expect(reminder).not.toContain('companies.time_zone');
    expect(edge).not.toContain('time_zone');
    expect(migration).toContain("DEFAULT 'Australia/Brisbane'");
    expect(migration).not.toContain('job-reminder');
    expect(migration).not.toContain('COMPANY_TZ');
  });

  it('keeps the signed Perth tomorrow window', () => {
    const fourPmPerth = new Date('2026-08-21T08:00:00.000Z');
    expect(tomorrowYmd(fourPmPerth)).toBe('2026-08-22');
    const midnightPerth = new Date('2026-08-21T16:00:00.000Z');
    expect(tomorrowYmd(midnightPerth)).toBe('2026-08-23');
  });
});
