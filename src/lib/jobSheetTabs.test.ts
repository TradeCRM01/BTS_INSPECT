import { describe, expect, it } from 'vitest';
import {
  JOB_SHEET_PAPERWORK_GROUPS,
  JOB_SHEET_SECTION_TAB,
  JOB_SHEET_TABS,
  isJobSheetTab,
  jobSheetGroupLabel,
  jobSheetOverviewRows,
  jobSheetTabFor,
  readJobSheetTab,
  writeJobSheetTab,
} from './jobSheetTabs';

describe('job sheet tabs', () => {
  it('lists the four tabs in the locked order with the locked labels', () => {
    expect(JOB_SHEET_TABS.map(t => [t.id, t.label])).toEqual([
      ['overview', 'Overview'],
      ['schedule', 'Schedule & people'],
      ['paperwork', 'Paperwork'],
      ['materials', 'Materials'],
    ]);
  });

  it('routes every section to a registered tab', () => {
    const ids = JOB_SHEET_TABS.map(t => t.id);
    for (const [section, tab] of Object.entries(JOB_SHEET_SECTION_TAB)) {
      expect(ids, section).toContain(tab);
      expect(jobSheetTabFor(section)).toBe(tab);
    }
    expect(jobSheetTabFor('job-lanes')).toBe('overview');
    expect(jobSheetTabFor('job-schedule')).toBe('schedule');
    expect(jobSheetTabFor('job-hours')).toBe('schedule');
    expect(jobSheetTabFor('job-swms')).toBe('paperwork');
    expect(jobSheetTabFor('job-quotes')).toBe('paperwork');
    expect(jobSheetTabFor('job-invoices')).toBe('paperwork');
    expect(jobSheetTabFor('job-gallery')).toBe('paperwork');
    expect(jobSheetTabFor('job-bill')).toBe('materials');
    expect(jobSheetTabFor('job-take5')).toBe('overview');
    expect(jobSheetTabFor('nope')).toBe('overview');
    expect(jobSheetTabFor('constructor')).toBe('overview');
  });

  it('groups exactly the paperwork sections, each once, and labels the opener of each group', () => {
    const grouped = JOB_SHEET_PAPERWORK_GROUPS.flatMap(g => g.sections);
    const paperwork = Object.entries(JOB_SHEET_SECTION_TAB)
      .filter(([, tab]) => tab === 'paperwork')
      .map(([section]) => section);
    expect([...grouped].sort()).toEqual([...paperwork].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(JOB_SHEET_PAPERWORK_GROUPS.map(g => g.label)).toEqual(['Safety', 'Field records', 'Quotes & invoices']);
    expect(jobSheetGroupLabel('job-swms')).toBe('Safety');
    expect(jobSheetGroupLabel('job-visit-notes')).toBe('Field records');
    expect(jobSheetGroupLabel('job-quotes')).toBe('Quotes & invoices');
    expect(jobSheetGroupLabel('job-insp')).toBeNull();
    expect(jobSheetGroupLabel('job-invoices')).toBeNull();
    expect(jobSheetGroupLabel('job-bill')).toBeNull();
  });

  it('reads ?tab= first, then the #section hash, then Overview', () => {
    expect(readJobSheetTab(new URLSearchParams('tab=materials'), '')).toBe('materials');
    expect(readJobSheetTab(new URLSearchParams(''), '#job-swms')).toBe('paperwork');
    expect(readJobSheetTab(new URLSearchParams(''), '#job-hours')).toBe('schedule');
    expect(readJobSheetTab(new URLSearchParams('tab=schedule'), '#job-gallery')).toBe('schedule');
    expect(readJobSheetTab(new URLSearchParams('tab=nonsense'), '')).toBe('overview');
    expect(readJobSheetTab(new URLSearchParams('tab=nonsense'), '#job-gallery')).toBe('paperwork');
    expect(readJobSheetTab(new URLSearchParams('tab=bill'), '#job-bill')).toBe('materials');
    expect(readJobSheetTab(new URLSearchParams(''), '#not-a-section')).toBe('overview');
    expect(readJobSheetTab(new URLSearchParams(''), '')).toBe('overview');
    expect(isJobSheetTab('paperwork')).toBe(true);
    expect(isJobSheetTab('Paperwork')).toBe(false);
    expect(isJobSheetTab('gallery')).toBe(false);
    expect(isJobSheetTab(null)).toBe(false);
  });

  it('writes the tab into the params and drops it for Overview', () => {
    expect(writeJobSheetTab(new URLSearchParams('reschedule=1'), 'overview').toString()).toBe('reschedule=1');
    expect(writeJobSheetTab(new URLSearchParams('reschedule=1'), 'schedule').toString()).toBe('reschedule=1&tab=schedule');
    expect(writeJobSheetTab(new URLSearchParams('tab=materials'), 'overview').toString()).toBe('');
    expect(writeJobSheetTab(new URLSearchParams('tab=materials'), 'paperwork').toString()).toBe('tab=paperwork');
  });

  it('keeps labels all-trades and free of locked names', () => {
    for (const { label } of [...JOB_SHEET_TABS, ...JOB_SHEET_PAPERWORK_GROUPS]) {
      expect(label).not.toMatch(/Relovi|Littleloop|electric/i);
    }
  });
});

describe('jobSheetOverviewRows', () => {
  it('reads a fresh booked job as five lanes with nothing on file', () => {
    expect(jobSheetOverviewRows({
      scheduledDate: '2026-08-25',
      startTime: '07:30:00',
      crewNames: ['Field Audit'],
      jhaCount: 0,
      take5Count: 0,
      inspectionCount: 0,
      testingDueCount: 0,
      noteCount: 0,
      photoCount: 0,
      quoteCount: 0,
      invoiceCount: 0,
      billLines: 0,
      billCost: 0,
      billCharge: 0,
    })).toEqual([
      { section: 'job-schedule', label: 'Schedule & people', meta: 'Tue 25 Aug 07:30 · Field Audit', status: 'Booked', tone: 'ok' },
      { section: 'job-swms', label: 'Safety', meta: '0 JHA / SWMS · 0 Take 5', status: 'No JHA', tone: 'wait' },
      { section: 'job-visit-notes', label: 'Field records', meta: '0 inspections · 0 photos', status: 'Nothing posted', tone: 'wait' },
      { section: 'job-quotes', label: 'Quotes & invoices', meta: '', status: 'None yet', tone: 'wait' },
      { section: 'job-bill', label: 'Materials', meta: 'Cost $0.00 · Charge $0.00', status: 'No materials', tone: 'wait' },
    ]);
  });

  it('reads a worked, unbooked job with singular and plural counts', () => {
    expect(jobSheetOverviewRows({
      scheduledDate: null,
      startTime: null,
      crewNames: [],
      jhaCount: 1,
      take5Count: 2,
      inspectionCount: 1,
      testingDueCount: 1,
      noteCount: 1,
      photoCount: 6,
      quoteCount: 1,
      invoiceCount: 2,
      billLines: 1,
      billCost: 1250.5,
      billCharge: 1800,
    })).toEqual([
      { section: 'job-schedule', label: 'Schedule & people', meta: 'Unassigned', status: 'Not booked', tone: 'wait' },
      { section: 'job-swms', label: 'Safety', meta: '1 JHA / SWMS · 2 Take 5', status: 'JHA on file', tone: 'ok' },
      { section: 'job-visit-notes', label: 'Field records', meta: '1 inspection · 6 photos · 1 test due', status: '1 note', tone: 'info' },
      { section: 'job-quotes', label: 'Quotes & invoices', meta: '', status: '1 quote · 2 invoices', tone: 'info' },
      { section: 'job-bill', label: 'Materials', meta: 'Cost $1,250.50 · Charge $1,800.00', status: '1 line', tone: 'info' },
    ]);
  });

  it('sends every lane to a section on a tab other than Overview', () => {
    const rows = jobSheetOverviewRows({
      scheduledDate: '2026-09-12',
      startTime: null,
      crewNames: ['A', 'B'],
      jhaCount: 0,
      take5Count: 0,
      inspectionCount: 0,
      testingDueCount: 0,
      noteCount: 3,
      photoCount: 0,
      quoteCount: 0,
      invoiceCount: 0,
      billLines: 0,
      billCost: 0,
      billCharge: 0,
    });
    expect(rows.map(r => [r.section, jobSheetTabFor(r.section)])).toEqual([
      ['job-schedule', 'schedule'],
      ['job-swms', 'paperwork'],
      ['job-visit-notes', 'paperwork'],
      ['job-quotes', 'paperwork'],
      ['job-bill', 'materials'],
    ]);
    expect(rows[0].meta).toBe('Sat 12 Sep · A, B');
    expect(rows[2].status).toBe('3 notes');
  });
});
