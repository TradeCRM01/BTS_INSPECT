import { describe, expect, it } from 'vitest';
import { scheduleChipClock } from './scheduleBoard';
import { scheduleDayKey } from './scheduleBoard';
import { asDateText, isNeedCrewJob } from './scheduleNeedCrew';
import { STATUS_FALLBACK, schedulePill, sentenceStatus } from './scheduleInvoiceStatus';

const dated = { id: 's', scheduled_date: '2026-10-19', assigned_team: ['dean'] };
const datedOpen = { id: 'o', scheduled_date: '2026-10-19', assigned_team: [] };

describe('schedule status and date never throw', () => {
  it('null status is never Scheduled or Booked', () => {
    expect(() => schedulePill({ ...dated, status: null })).not.toThrow();
    expect(schedulePill({ ...dated, status: null }).label).not.toBe('Scheduled');
    expect(schedulePill({ ...datedOpen, status: null }).label).toBe('Needs crew');
    expect(scheduleChipClock(null, null, '2026-10-19', { status: null, scheduled_date: '2026-10-19' })).not.toMatch(/Booked/);
    expect(scheduleChipClock(null, null, '2026-10-19', { ...dated, status: null })).not.toMatch(/Booked/);
  });

  it('undefined status is never Scheduled or Booked', () => {
    expect(() => schedulePill({ ...dated, status: undefined })).not.toThrow();
    expect(schedulePill({ ...dated, status: undefined }).label).not.toBe('Scheduled');
    expect(sentenceStatus(undefined)).toBe(STATUS_FALLBACK);
    expect(scheduleChipClock(null, null, '2026-10-19', { scheduled_date: '2026-10-19' })).not.toMatch(/Booked/);
  });

  it('empty status is never Scheduled or Booked', () => {
    expect(schedulePill({ ...dated, status: '' }).label).toBe(STATUS_FALLBACK);
    expect(schedulePill({ ...datedOpen, status: '' }).label).toBe('Needs crew');
    expect(sentenceStatus('')).toBe(STATUS_FALLBACK);
    expect(scheduleChipClock(null, null, '2026-10-19', { status: '', scheduled_date: '2026-10-19' })).not.toMatch(/Booked/);
  });

  it('whitespace status is never Scheduled or Booked', () => {
    expect(schedulePill({ ...dated, status: '   ' }).label).toBe(STATUS_FALLBACK);
    expect(sentenceStatus('   ')).toBe(STATUS_FALLBACK);
    expect(scheduleChipClock(null, null, '2026-10-19', { status: '  ', scheduled_date: '2026-10-19' })).not.toMatch(/Booked/);
  });

  it('unknown string status is sentence-cased, never Scheduled or Booked', () => {
    expect(schedulePill({ ...dated, status: 'quoted' }).label).toBe('Quoted');
    expect(schedulePill({ ...dated, status: 'quoted' }).label).not.toBe('Scheduled');
    expect(scheduleChipClock(null, null, '2026-10-19', { status: 'quoted', scheduled_date: '2026-10-19' })).not.toMatch(/Booked/);
  });

  it('on_hold is On hold', () => {
    expect(sentenceStatus('on_hold')).toBe('On hold');
    expect(schedulePill({ ...dated, status: 'on_hold' }).label).toBe('On hold');
    expect(schedulePill({ ...dated, status: 'on_hold' }).label).not.toBe('Scheduled');
  });

  it('number status uses a neutral fallback and never throws', () => {
    expect(() => schedulePill({ ...dated, status: 5 })).not.toThrow();
    expect(schedulePill({ ...dated, status: 5 }).label).toBe(STATUS_FALLBACK);
    expect(schedulePill({ ...dated, status: 5 }).label).not.toBe('Scheduled');
    expect(sentenceStatus(5)).toBe(STATUS_FALLBACK);
  });

  it('object status uses a neutral fallback and never throws', () => {
    expect(() => schedulePill({ ...dated, status: {} })).not.toThrow();
    expect(schedulePill({ ...dated, status: {} }).label).toBe(STATUS_FALLBACK);
    expect(sentenceStatus({})).toBe(STATUS_FALLBACK);
  });

  it('boolean status uses a neutral fallback and never throws', () => {
    expect(() => schedulePill({ ...dated, status: true })).not.toThrow();
    expect(schedulePill({ ...dated, status: true }).label).toBe(STATUS_FALLBACK);
    expect(sentenceStatus(true)).toBe(STATUS_FALLBACK);
  });

  it('array status uses a neutral fallback and never throws', () => {
    expect(() => schedulePill({ ...dated, status: [] })).not.toThrow();
    expect(schedulePill({ ...dated, status: [] }).label).toBe(STATUS_FALLBACK);
    expect(sentenceStatus([])).toBe(STATUS_FALLBACK);
  });

  it('non-string scheduled_date is undated and never throws', () => {
    expect(() => asDateText(20261019)).not.toThrow();
    expect(asDateText(20261019)).toBe('');
    expect(() => schedulePill({ id: 'd', scheduled_date: 20261019, assigned_team: [], status: 'scheduled' })).not.toThrow();
    expect(schedulePill({ id: 'd', scheduled_date: 20261019, assigned_team: [], status: 'scheduled' }).label).toBe('No date');
    expect(() => isNeedCrewJob({ scheduled_date: 20261019, assigned_team: [], status: 'scheduled' })).not.toThrow();
    expect(isNeedCrewJob({ scheduled_date: 20261019, assigned_team: [], status: 'scheduled' })).toBe(false);
    expect(() => scheduleDayKey(20261019)).not.toThrow();
    expect(scheduleDayKey(20261019)).toBe(null);
    for (const value of [20261019, { y: 2026, m: 10, d: 19 }, ['2026-10-19']] as const) {
      expect(() => asDateText(value)).not.toThrow();
      expect(asDateText(value)).toBe('');
      expect(() => schedulePill({ id: 'd', scheduled_date: value, assigned_team: [], status: 'scheduled' })).not.toThrow();
      expect(schedulePill({ id: 'd', scheduled_date: value, assigned_team: [], status: 'scheduled' }).label).toBe('No date');
      expect(schedulePill({ ...dated, scheduled_date: value }).label).not.toBe('Scheduled');
      expect(schedulePill({ ...dated, scheduled_date: value }).label).not.toBe('Booked');
      expect(() => scheduleChipClock(null, null, value, { scheduled_date: value, status: 'scheduled' })).not.toThrow();
      expect(scheduleChipClock(null, null, value, { scheduled_date: value, status: 'scheduled' })).not.toMatch(/Booked/);
      expect(scheduleChipClock(null, null, value, { scheduled_date: value, status: 'scheduled' })).not.toMatch(/Scheduled/);
      expect(() => isNeedCrewJob({ scheduled_date: value, assigned_team: [], status: 'scheduled' })).not.toThrow();
      expect(isNeedCrewJob({ scheduled_date: value, assigned_team: [], status: 'scheduled' })).toBe(false);
      expect(() => scheduleDayKey(value)).not.toThrow();
      expect(scheduleDayKey(value)).toBe(null);
    }
  });
});
