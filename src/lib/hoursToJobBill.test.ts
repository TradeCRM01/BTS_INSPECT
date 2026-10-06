import { describe, expect, it } from 'vitest';
import {
  buildJobCostFromTimesheetEntry,
  closedBillableEntries,
  formatUnbilledHoursLabel,
  lineNeedsLabourRate,
  planJobCostsFromTimesheetEntries,
  resolveLabourSellFromPriceBook,
  unbilledHoursSummary,
} from './hoursToJobBill';

describe('resolveLabourSellFromPriceBook', () => {
  const labour = { id: 'pb-1', category: 'Labour', unit_price: 95, is_active: true };
  const labourUs = { id: 'pb-2', category: 'Labor', unit_price: 88, is_active: true };

  it('uses the single active Labour category item as sell', () => {
    expect(resolveLabourSellFromPriceBook([labour, { id: 'x', category: 'Materials', unit_price: 10, is_active: true }])).toEqual({
      unitPrice: 95,
      priceBookItemId: 'pb-1',
      needsRate: false,
    });
  });

  it('needs rate when zero or two+ Labour category items', () => {
    expect(resolveLabourSellFromPriceBook([])).toEqual({ unitPrice: 0, priceBookItemId: null, needsRate: true });
    expect(resolveLabourSellFromPriceBook([labour, labourUs])).toEqual({
      unitPrice: 0,
      priceBookItemId: null,
      needsRate: true,
    });
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
    expect(formatUnbilledHoursLabel(3)).toBe('3 h logged not on the bill');
  });
});

describe('job cost from timesheet', () => {
  it('flags $0 labour sell when price book needs a rate', () => {
    const row = buildJobCostFromTimesheetEntry({
      entry: {
        id: 'e1',
        job_id: 'j1',
        timesheet_id: 't1',
        start_time: '2026-10-06T00:00:00.000Z',
        end_time: '2026-10-06T02:00:00.000Z',
        billable: true,
        work_type: 'Labour',
        notes: null,
      },
      companyId: 'co',
      jobId: 'j1',
      createdBy: 'u1',
      unitCost: 42,
      costModelId: 'm1',
      sell: { unitPrice: 0, priceBookItemId: null, needsRate: true },
      includeTimesheetLink: true,
    });
    expect(row.unit_price).toBe(0);
    expect(row.charge_type).toBe('Labour');
    expect(lineNeedsLabourRate(row)).toBe(true);
  });

  it('does not double-pull the same entry in a plan', () => {
    const planned = planJobCostsFromTimesheetEntries({
      entries: [{
        id: 'e1',
        job_id: 'j1',
        timesheet_id: 't1',
        start_time: '2026-10-06T00:00:00.000Z',
        end_time: '2026-10-06T01:00:00.000Z',
        billable: true,
        work_type: 'Labour',
        notes: null,
      }],
      billedEntryIds: new Set(),
      companyId: 'co',
      jobId: 'j1',
      createdBy: 'u1',
      employeeIdByTimesheetId: { t1: 'emp1' },
      profileRows: [{ id: 'emp1' }],
      costModels: [],
      sell: { unitPrice: 80, priceBookItemId: 'pb-1', needsRate: false },
      includeTimesheetLink: true,
    });
    expect(planned).toHaveLength(1);
    expect(planJobCostsFromTimesheetEntries({
      ...{
        entries: planned.length ? [{
          id: 'e1',
          job_id: 'j1',
          timesheet_id: 't1',
          start_time: '2026-10-06T00:00:00.000Z',
          end_time: '2026-10-06T01:00:00.000Z',
          billable: true,
          work_type: 'Labour',
          notes: null,
        }] : [],
        billedEntryIds: new Set(['e1']),
        companyId: 'co',
        jobId: 'j1',
        createdBy: 'u1',
        employeeIdByTimesheetId: { t1: 'emp1' },
        profileRows: [{ id: 'emp1' }],
        costModels: [],
        sell: { unitPrice: 80, priceBookItemId: 'pb-1', needsRate: false },
        includeTimesheetLink: true,
      },
    })).toHaveLength(0);
  });
});
