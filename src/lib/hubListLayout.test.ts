import { describe, expect, it } from 'vitest';
import {
  hubListAreas,
  hubListLongTitleDoesNotStealNext,
  hubListVisibleCells,
} from './hubListLayout';

const WIDTHS = [1440, 1280, 390, 375];
const LONG = 'Switchboard upgrade and after-hours call-out at the north plant — extra long title';

describe('jobs/quotes/invoices list areas', () => {
  it('keeps identity, dates, status, totals and next on named areas at laptop and phone widths', () => {
    for (const width of WIDTHS) {
      expect(hubListVisibleCells('jobs', width)).toEqual(['identity', 'when', 'status', 'next']);
      expect(hubListVisibleCells('quotes', width)).toEqual(['ref', 'cust', 'job', 'date', 'status', 'total', 'next']);
      expect(hubListVisibleCells('invoices', width)).toEqual(['ref', 'cust', 'job', 'date', 'status', 'total', 'next']);
      expect(hubListAreas('quotes', width).total).toBe('total');
      expect(hubListAreas('quotes', width).status).toBe('status');
      expect(hubListLongTitleDoesNotStealNext('jobs', LONG, width)).toBe(true);
      expect(hubListLongTitleDoesNotStealNext('quotes', LONG, width)).toBe(true);
      expect(hubListLongTitleDoesNotStealNext('invoices', LONG, width)).toBe(true);
    }
  });
});
