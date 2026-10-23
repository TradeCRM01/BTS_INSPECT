import { describe, expect, it } from 'vitest';
import {
  JOB_SHEET_ALL_NOTES,
  JOB_SHEET_ALL_PHOTOS,
  JOB_SHEET_BACK,
  JOB_SHEET_EDIT_BILL,
  JOB_SHEET_NO_CREW,
  JOB_SHEET_SET_A_DATE,
  jobSheetBillLinesLabel,
  jobSheetBillTotals,
  jobSheetCrewLabel,
  jobSheetEyebrow,
  jobSheetHoursLogged,
  jobSheetMapsHref,
  jobSheetNoteStamp,
  jobSheetPhotosHeading,
  jobSheetSubLine,
} from './jobSheetChrome';

describe('job sheet chrome', () => {
  it('prints Job #0036, the when-sub line, and drops zero parts', () => {
    expect(jobSheetEyebrow('#0036')).toBe('JOB #0036');
    expect(jobSheetSubLine({ billLines: 4, minutes: 264 })).toBe('4 bill lines · 4.4 h logged');
    expect(jobSheetSubLine({ billLines: 1, minutes: 60 })).toBe('1 bill line · 1 h logged');
    expect(jobSheetSubLine({ billLines: 0, minutes: 264 })).toBe('4.4 h logged');
    expect(jobSheetSubLine({ billLines: 4, minutes: 0 })).toBe('4 bill lines');
    expect(jobSheetSubLine({ billLines: 0, minutes: 0 })).toBe('');
    expect(jobSheetHoursLogged(0)).toBe('');
    expect(jobSheetBillLinesLabel(0)).toBe('');
  });

  it('stamps notes, photos, crew empty, Go maps, and bill preview money', () => {
    expect(jobSheetNoteStamp('Tom Nguyen', '07:40')).toBe('Tom Nguyen · 07:40');
    expect(jobSheetPhotosHeading(7)).toBe('Photos · 7');
    expect(jobSheetCrewLabel([])).toBe(JOB_SHEET_NO_CREW);
    expect(jobSheetCrewLabel(['Dean', 'Tom'])).toBe('Dean, Tom');
    expect(jobSheetMapsHref('12 Grange Rd, Stafford')).toBe(
      'https://maps.google.com/?q=12%20Grange%20Rd%2C%20Stafford',
    );
    expect(jobSheetBillTotals({
      lineCount: 4,
      subtotal: 835.5,
      taxAmount: 83.55,
      totalIncGst: 919.05,
    })).toEqual({
      lines: 4,
      subtotal: '$835.50',
      gst: '$83.55',
      total: '$919.05',
    });
    expect(jobSheetBillTotals(null)).toBeNull();
    expect(JOB_SHEET_BACK).toBe('Jobs');
    expect(JOB_SHEET_SET_A_DATE).toBe('Set a date');
    expect(JOB_SHEET_ALL_NOTES).toBe('All notes');
    expect(JOB_SHEET_ALL_PHOTOS).toBe('All photos');
    expect(JOB_SHEET_EDIT_BILL).toBe('Edit bill');
  });
});
