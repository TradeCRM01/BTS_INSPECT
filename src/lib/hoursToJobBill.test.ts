import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROFILE_STAFF_LABOUR_RATE_KEYS,
  buildJobCostFromTimesheetEntry,
  closedBillableEntries,
  formatUnbilledCueButtonLabel,
  formatUnbilledHoursLabel,
  labourLineDescription,
  lineNeedsLabourRate,
  planJobCostsFromTimesheetEntries,
  pullWouldNeedLabourPicker,
  resolveLabourSell,
  resolveLabourSellFromPriceBook,
  staffLabourSellFromProfile,
  unbilledHoursSummary,
} from './hoursToJobBill';

describe('price_book_items select columns', () => {
  it('pullUnbilledHoursToJobBill selects description (live column), not name', () => {
    const bill = readFileSync(resolve(process.cwd(), 'src/lib/hoursToJobBill.ts'), 'utf8');
    expect(bill).toContain(".select('id, category, description, unit_price, is_active')");
    expect(bill).not.toMatch(/price_book_items[\s\S]{0,120}\.select\([^)]*\bname\b/);
  });
});

const labour = { id: 'pb-1', category: 'Labour', unit_price: 95, is_active: true };
const labourB = { id: 'pb-2', category: 'Labour', unit_price: 110, is_active: true };
const labourUs = { id: 'pb-3', category: 'Labor', unit_price: 88, is_active: true };

describe('resolveLabourSell', () => {
  it('uses staff rate when profile field exists', () => {
    const keys = ['hourly_sell_rate'];
    expect(staffLabourSellFromProfile({ id: 'p1', hourly_sell_rate: 120 }, keys)).toBe(120);
    expect(resolveLabourSell({
      staffRate: 120,
      companyDefaultLabourRate: 80,
      labourItems: [labour],
      pickedPriceBookItemId: null,
    })).toMatchObject({ unitPrice: 120, needsRate: false, needsPicker: false });
  });

  it('uses company default when no staff rate', () => {
    expect(resolveLabourSell({
      staffRate: null,
      companyDefaultLabourRate: 85,
      labourItems: [labour, labourB],
      pickedPriceBookItemId: null,
    })).toMatchObject({ unitPrice: 85, needsRate: false, needsPicker: false });
  });

  it('uses the single active Labour price-book item', () => {
    expect(resolveLabourSell({
      staffRate: null,
      companyDefaultLabourRate: null,
      labourItems: [labour, { id: 'x', category: 'Materials', unit_price: 10, is_active: true }],
      pickedPriceBookItemId: null,
    })).toMatchObject({ unitPrice: 95, priceBookItemId: 'pb-1', needsRate: false });
  });

  it('requires picker when two+ Labour items and no company default', () => {
    expect(resolveLabourSell({
      staffRate: null,
      companyDefaultLabourRate: null,
      labourItems: [labour, labourB],
      pickedPriceBookItemId: null,
    })).toMatchObject({ needsPicker: true, unitPrice: 0, needsRate: false });
    expect(resolveLabourSell({
      staffRate: null,
      companyDefaultLabourRate: null,
      labourItems: [labour, labourB],
      pickedPriceBookItemId: 'pb-2',
    })).toMatchObject({ unitPrice: 110, priceBookItemId: 'pb-2', needsPicker: false });
  });

  it('is $0 amber when no rate sources exist', () => {
    expect(resolveLabourSell({
      staffRate: null,
      companyDefaultLabourRate: null,
      labourItems: [],
      pickedPriceBookItemId: null,
    })).toEqual({
      unitPrice: 0,
      priceBookItemId: null,
      needsRate: true,
      needsPicker: false,
      pickerItems: [],
    });
  });
});

describe('resolveLabourSellFromPriceBook (legacy)', () => {
  it('uses the single active Labour category item as sell', () => {
    expect(resolveLabourSellFromPriceBook([labour, { id: 'x', category: 'Materials', unit_price: 10, is_active: true }])).toMatchObject({
      unitPrice: 95,
      priceBookItemId: 'pb-1',
      needsRate: false,
    });
  });

  it('opens picker path when two+ Labour category items', () => {
    expect(resolveLabourSellFromPriceBook([])).toMatchObject({ needsRate: true });
    expect(resolveLabourSellFromPriceBook([labour, labourUs])).toMatchObject({
      needsPicker: true,
      needsRate: false,
    });
  });
});

describe('PROFILE_STAFF_LABOUR_RATE_KEYS', () => {
  it('is empty until schema adds a staff sell column', () => {
    expect(PROFILE_STAFF_LABOUR_RATE_KEYS).toEqual([]);
  });
});

describe('unbilled hours', () => {
  const entries = [
    {
      id: 'e1',
      job_id: 'j1',
      timesheet_id: 't1',
      start_time: '2026-10-06T00:00:00.000Z',
      end_time: '2026-10-06T03:00:00.000Z',
      billable: true,
      work_type: 'Labour',
      notes: null,
    },
    {
      id: 'e2',
      job_id: 'j1',
      timesheet_id: 't1',
      start_time: '2026-10-06T04:00:00.000Z',
      end_time: null,
      billable: true,
      work_type: 'Labour',
      notes: null,
    },
  ];

  it('skips open entries and dedupes billed ids', () => {
    expect(closedBillableEntries(entries)).toHaveLength(1);
    const summary = unbilledHoursSummary(entries, new Set(['e1']));
    expect(summary.entryCount).toBe(0);
    expect(formatUnbilledHoursLabel(3)).toBe('3.0 h logged not on the bill');
    expect(formatUnbilledCueButtonLabel(2)).toBe('2.0 unbilled hours · Add as labour');
  });

  it('ignores zero-minute overnight-bug intervals in the cue', () => {
    const bad = [{
      id: 'e0',
      job_id: 'j1',
      timesheet_id: 't1',
      start_time: '2026-10-06T13:00:00.000Z',
      end_time: '2026-10-06T13:00:00.000Z',
      billable: true,
      work_type: 'Labour',
      notes: null,
    }];
    expect(unbilledHoursSummary(bad, new Set())).toEqual({ hours: 0, entryCount: 0 });
  });
});

describe('job cost from timesheet', () => {
  const entry = {
    id: 'e1',
    job_id: 'j1',
    timesheet_id: 't1',
    start_time: '2026-10-06T00:00:00.000Z',
    end_time: '2026-10-06T02:00:00.000Z',
    billable: true,
    work_type: 'Labour',
    notes: null,
  };

  it('formats Labour 2.0 h @ $X description', () => {
    expect(labourLineDescription(2, 95)).toBe('Labour 2.0 h @ $95');
    const row = buildJobCostFromTimesheetEntry({
      entry,
      companyId: 'co',
      jobId: 'j1',
      createdBy: 'u1',
      unitCost: 42,
      costModelId: 'm1',
      sell: { unitPrice: 95, priceBookItemId: 'pb-1', needsRate: false, needsPicker: false, pickerItems: [] },
      includeTimesheetLink: true,
    });
    expect(row?.description).toBe('Labour 2.0 h @ $95');
    expect(row?.charge_type).toBe('Labour');
  });

  it('flags $0 labour sell when price book needs a rate', () => {
    const row = buildJobCostFromTimesheetEntry({
      entry,
      companyId: 'co',
      jobId: 'j1',
      createdBy: 'u1',
      unitCost: 42,
      costModelId: 'm1',
      sell: { unitPrice: 0, priceBookItemId: null, needsRate: true, needsPicker: false, pickerItems: [] },
      includeTimesheetLink: true,
    });
    expect(row?.unit_price).toBe(0);
    expect(lineNeedsLabourRate(row!)).toBe(true);
  });

  it('does not create a row for zero duration', () => {
    const row = buildJobCostFromTimesheetEntry({
      entry: { ...entry, end_time: entry.start_time },
      companyId: 'co',
      jobId: 'j1',
      createdBy: 'u1',
      unitCost: 0,
      costModelId: null,
      sell: { unitPrice: 80, priceBookItemId: 'pb-1', needsRate: false, needsPicker: false, pickerItems: [] },
      includeTimesheetLink: true,
    });
    expect(row).toBeNull();
  });

  it('does not double-pull the same entry in a plan', () => {
    const labourContext = {
      staffRatesByProfileId: {},
      companyDefaultLabourRate: null,
      labourPriceBookItems: [labour],
      pickedPriceBookItemId: null,
    };
    const planned = planJobCostsFromTimesheetEntries({
      entries: [entry],
      billedEntryIds: new Set(),
      companyId: 'co',
      jobId: 'j1',
      createdBy: 'u1',
      employeeIdByTimesheetId: { t1: 'emp1' },
      profileRows: [{ id: 'emp1' }],
      costModels: [],
      labourContext,
      includeTimesheetLink: true,
    });
    expect(planned).toHaveLength(1);
    expect(planJobCostsFromTimesheetEntries({
      entries: [entry],
      billedEntryIds: new Set(['e1']),
      companyId: 'co',
      jobId: 'j1',
      createdBy: 'u1',
      employeeIdByTimesheetId: { t1: 'emp1' },
      profileRows: [{ id: 'emp1' }],
      costModels: [],
      labourContext,
      includeTimesheetLink: true,
    })).toHaveLength(0);
  });

  it('pullWouldNeedLabourPicker when two labour items and no pick', () => {
    const labourContext = {
      staffRatesByProfileId: {},
      companyDefaultLabourRate: null,
      labourPriceBookItems: [labour, labourB],
      pickedPriceBookItemId: null,
    };
    const check = pullWouldNeedLabourPicker(
      [entry],
      new Set(),
      'j1',
      { t1: 'emp1' },
      labourContext,
    );
    expect(check.needsPicker).toBe(true);
    expect(check.pickerItems).toHaveLength(2);
  });
});
