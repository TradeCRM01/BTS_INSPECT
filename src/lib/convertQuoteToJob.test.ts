import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONVERT_QUOTE_NEED_DATE_CREW,
  assignedTeamFromQuote,
  convertQuoteHasDateAndCrew,
  jobFieldsFromQuote,
  padQuoteNumber,
  scheduledDateFromQuote,
} from './quoteJobFields';
import { partitionScheduleJobs } from './jobNextAction';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('jobFieldsFromQuote', () => {
  const base = {
    quote_number: 12,
    client_id: 'client-1',
    description: 'Site install',
    scope_of_works: 'Fit the new run and leave the site clean.',
    total: 4400.5,
  };

  it('copies client, scope, budget and client address', () => {
    expect(jobFieldsFromQuote(base, '12 Smith St, Geelong VIC')).toEqual({
      client_id: 'client-1',
      title: 'Site install',
      description: 'Fit the new run and leave the site clean.',
      address: '12 Smith St, Geelong VIC',
      budget: 4400.5,
      status: 'scheduled',
      priority: 'medium',
      scheduled_date: null,
      assigned_team: [],
      start_time: null,
      end_time: null,
    });
  });

  it('copies a job date, crew, and times when the quote has them', () => {
    const fields = jobFieldsFromQuote({
      ...base,
      scheduled_date: '2026-08-22T09:00:00.000Z',
      assigned_team: ['crew-1', '', 'crew-2'],
      start_time: '09:30',
      end_time: '14:00',
    }, null);
    expect(fields.scheduled_date).toBe('2026-08-22');
    expect(fields.assigned_team).toEqual(['crew-1', 'crew-2']);
    expect(fields.start_time).toBe('09:30');
    expect(fields.end_time).toBe('14:00');
    expect(jobFieldsFromQuote({ ...base, scheduled_date: '2026-08-22' }, null).scheduled_date).toBe('2026-08-22');
  });

  it('does not invent a date or crew when none is provided', () => {
    expect(jobFieldsFromQuote({ ...base, scheduled_date: '  ' }, null).scheduled_date).toBeNull();
    expect(jobFieldsFromQuote({ ...base, scheduled_date: null }, null).scheduled_date).toBeNull();
    expect(jobFieldsFromQuote({ ...base, assigned_team: null }, null).assigned_team).toEqual([]);
    expect(scheduledDateFromQuote(undefined)).toBeNull();
    expect(scheduledDateFromQuote('not-a-date')).toBeNull();
    expect(assignedTeamFromQuote(undefined)).toEqual([]);
    expect(assignedTeamFromQuote('crew-1')).toEqual([]);
  });

  it('falls back to Job from Quote # when description is empty', () => {
    const fields = jobFieldsFromQuote({ ...base, description: '  ' }, null);
    expect(fields.title).toBe('Job from Quote #0012');
    expect(fields.address).toBeNull();
    expect(fields.description).toBe('Fit the new run and leave the site clean.');
  });

  it('pads quote numbers', () => {
    expect(padQuoteNumber(7)).toBe('0007');
    expect(padQuoteNumber(null)).toBe('0000');
  });
});

describe('G4 G5 — Convert needs date, crew, and times on the same tap', () => {
  const datedCrew = {
    scheduled_date: '2026-09-03',
    assigned_team: ['crew-1'],
    start_time: '08:00',
    end_time: '12:00',
  };

  it('blocks Convert when date, crew, or time is empty — no job row', () => {
    expect(convertQuoteHasDateAndCrew({})).toBe(false);
    expect(convertQuoteHasDateAndCrew({ scheduled_date: '2026-09-03', assigned_team: [] })).toBe(false);
    expect(convertQuoteHasDateAndCrew({ scheduled_date: '', assigned_team: ['crew-1'] })).toBe(false);
    expect(convertQuoteHasDateAndCrew({ scheduled_date: '  ', assigned_team: ['crew-1'] })).toBe(false);
    expect(convertQuoteHasDateAndCrew({ scheduled_date: '2026-09-03', assigned_team: ['crew-1'] })).toBe(false);
    expect(CONVERT_QUOTE_NEED_DATE_CREW).toMatch(/date and crew/i);

    const convert = src('src/lib/convertQuoteToJob.ts');
    expect(convert).toContain('if (latest?.job_id) return latest.job_id as string;');
    expect(convert).toContain('if (!convertQuoteHasDateAndCrew(quote))');
    expect(convert).toContain('quoteConvertMissing');
    expect(convert.indexOf('if (!convertQuoteHasDateAndCrew(quote))')).toBeLessThan(convert.indexOf(".from('jobs')"));
  });

  it('writes date, crew, and times onto the job when Convert is ready', () => {
    expect(convertQuoteHasDateAndCrew(datedCrew)).toBe(true);
    const fields = jobFieldsFromQuote({
      quote_number: 4,
      client_id: null,
      description: 'Site install',
      scope_of_works: null,
      total: 100,
      ...datedCrew,
    }, null);
    expect(fields.scheduled_date).toBe('2026-09-03');
    expect(fields.assigned_team).toEqual(['crew-1']);
    expect(fields.start_time).toBe('08:00');
    expect(fields.end_time).toBe('12:00');

    const convert = src('src/lib/convertQuoteToJob.ts');
    expect(convert).toContain('...fields');
    expect(convert).toContain('scheduled_date');
    expect(convert).toContain('assigned_team');
    expect(convert).toContain('start_time');
    expect(convert).toContain('end_time');
  });
});

describe('quote date and crew columns', () => {
  it('stores scheduled_date and assigned_team on the existing quotes row', () => {
    const migration = src('supabase/migrations/20260903040000_071_quote_scheduled_date_crew.sql');
    expect(migration).toContain('ALTER TABLE quotes ADD COLUMN IF NOT EXISTS scheduled_date date');
    expect(migration).toContain("ALTER TABLE quotes ADD COLUMN IF NOT EXISTS assigned_team jsonb NOT NULL DEFAULT '[]'::jsonb");
  });
});

describe('G3 — Accept with no date/crew still lands on Needs a date', () => {
  it('undated accepted jobs stay on the existing Needs a date rail', () => {
    const fields = jobFieldsFromQuote({
      quote_number: 8,
      client_id: null,
      description: 'Call-back',
      scope_of_works: null,
      total: null,
    }, null);
    expect(fields.scheduled_date).toBeNull();
    expect(fields.assigned_team).toEqual([]);

    const { needsDate, onBoard } = partitionScheduleJobs([
      { id: 'from-accept', status: 'scheduled', scheduled_date: fields.scheduled_date },
    ]);
    expect(needsDate.map(j => j.id)).toEqual(['from-accept']);
    expect(onBoard).toEqual([]);
  });
});
