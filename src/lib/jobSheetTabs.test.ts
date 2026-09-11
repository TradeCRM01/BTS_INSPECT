import { describe, expect, it } from 'vitest';
import {
  JOB_SHEET_SECTION_TAB,
  JOB_SHEET_TABS,
  isJobSheetTab,
  jobSheetTabFor,
  readJobSheetTab,
  writeJobSheetTab,
} from './jobSheetTabs';

describe('job sheet tabs', () => {
  it('lists the eight tabs in the locked order with the locked labels', () => {
    expect(JOB_SHEET_TABS.map(t => [t.id, t.label])).toEqual([
      ['overview', 'Overview'],
      ['quotes', 'Quotes'],
      ['bill', 'Bill'],
      ['safety', 'Safety'],
      ['time', 'Time'],
      ['notes', 'Notes & photos'],
      ['inspections', 'Inspections'],
      ['gallery', 'Gallery'],
    ]);
  });

  it('routes every section to a registered tab', () => {
    const ids = JOB_SHEET_TABS.map(t => t.id);
    for (const [section, tab] of Object.entries(JOB_SHEET_SECTION_TAB)) {
      expect(ids, section).toContain(tab);
      expect(jobSheetTabFor(section)).toBe(tab);
    }
    expect(jobSheetTabFor('job-swms')).toBe('safety');
    expect(jobSheetTabFor('job-take5')).toBe('safety');
    expect(jobSheetTabFor('job-invoices')).toBe('bill');
    expect(jobSheetTabFor('job-schedule')).toBe('overview');
    expect(jobSheetTabFor('nope')).toBe('overview');
    expect(jobSheetTabFor('constructor')).toBe('overview');
  });

  it('reads ?tab= first, then the #section hash, then Overview', () => {
    expect(readJobSheetTab(new URLSearchParams('tab=bill'), '')).toBe('bill');
    expect(readJobSheetTab(new URLSearchParams(''), '#job-swms')).toBe('safety');
    expect(readJobSheetTab(new URLSearchParams('tab=time'), '#job-gallery')).toBe('time');
    expect(readJobSheetTab(new URLSearchParams('tab=nonsense'), '')).toBe('overview');
    expect(readJobSheetTab(new URLSearchParams('tab=nonsense'), '#job-gallery')).toBe('gallery');
    expect(readJobSheetTab(new URLSearchParams(''), '#not-a-section')).toBe('overview');
    expect(readJobSheetTab(new URLSearchParams(''), '')).toBe('overview');
    expect(isJobSheetTab('gallery')).toBe(true);
    expect(isJobSheetTab('Gallery')).toBe(false);
    expect(isJobSheetTab(null)).toBe(false);
  });

  it('writes the tab into the params and drops it for Overview', () => {
    expect(writeJobSheetTab(new URLSearchParams('reschedule=1'), 'overview').toString()).toBe('reschedule=1');
    expect(writeJobSheetTab(new URLSearchParams('reschedule=1'), 'time').toString()).toBe('reschedule=1&tab=time');
    expect(writeJobSheetTab(new URLSearchParams('tab=bill'), 'overview').toString()).toBe('');
    expect(writeJobSheetTab(new URLSearchParams('tab=bill'), 'gallery').toString()).toBe('tab=gallery');
  });

  it('keeps labels all-trades and free of locked names', () => {
    for (const t of JOB_SHEET_TABS) {
      expect(t.label).not.toMatch(/Relovi|Littleloop|electric/i);
    }
  });
});
