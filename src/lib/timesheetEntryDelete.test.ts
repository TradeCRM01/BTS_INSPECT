/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as devFieldAuditAuth from './devFieldAuditAuth';
import {
  TIMESHEET_ENTRY_DELETE_BILLED,
  TIMESHEET_ENTRY_DELETE_RUNNING,
  deleteUnbilledTimesheetEntry,
  recomputeTimesheetTotalMinutes,
  timesheetEntryDeleteUiState,
} from './timesheetEntryDelete';
import {
  AUDIT_TIMESHEET_ENTRY_OTHER_ID,
  AUDIT_TIMESHEET_OTHER_ID,
  getAuditTimesheetTotalMinutes,
  hideAuditTimesheetEntry,
  recomputeAuditTimesheetTotalMinutes,
  resetAuditTimesheetEntryHides,
} from './timesheetsList';

describe('timesheet entry delete — FIX-5a C4', () => {
  beforeEach(() => {
    resetAuditTimesheetEntryHides();
    vi.spyOn(devFieldAuditAuth, 'isDevFieldAuditAuth').mockReturnValue(false);
  });

  it('recomputes owning timesheet total from remaining entries, not client cache', async () => {
    const rows = [
      { start_time: '2026-10-06T08:00:00.000Z', end_time: '2026-10-06T10:00:00.000Z' },
      { start_time: '2026-10-06T11:00:00.000Z', end_time: '2026-10-06T12:00:00.000Z' },
    ];
    const client = {
      from: (table: string) => {
        if (table === 'timesheet_entries') {
          return {
            select: () => ({
              eq: async () => ({ data: rows, error: null }),
            }),
          };
        }
        if (table === 'timesheets') {
          return {
            update: (patch: { total_minutes: number }) => ({
              eq: async () => {
                expect(patch.total_minutes).toBe(180);
                return { error: null };
              },
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };
    const total = await recomputeTimesheetTotalMinutes(client as never, 'ts-1');
    expect(total).toBe(180);
  });

  it('refuses delete when job_costs references the entry (0 rows deleted)', async () => {
    const client = {
      from: (table: string) => {
        if (table === 'job_costs') {
          return {
            select: () => ({
              eq: () => ({ count: 1, error: null }),
            }),
          };
        }
        if (table === 'timesheet_entries') {
          return {
            delete: () => ({
              eq: () => ({
                select: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };
    await expect(
      deleteUnbilledTimesheetEntry(client as never, {
        id: 'e1',
        timesheet_id: 'ts-1',
        start_time: '2026-10-06T08:00:00.000Z',
        end_time: '2026-10-06T09:00:00.000Z',
      }),
    ).rejects.toThrow(TIMESHEET_ENTRY_DELETE_BILLED);
  });

  it('audit delete keeps another worker timesheet total correct', () => {
    vi.mocked(devFieldAuditAuth.isDevFieldAuditAuth).mockReturnValue(true);
    const before = getAuditTimesheetTotalMinutes(AUDIT_TIMESHEET_OTHER_ID);
    expect(before).toBe(90);
    hideAuditTimesheetEntry(AUDIT_TIMESHEET_ENTRY_OTHER_ID);
    recomputeAuditTimesheetTotalMinutes(AUDIT_TIMESHEET_OTHER_ID);
    const after = getAuditTimesheetTotalMinutes(AUDIT_TIMESHEET_OTHER_ID);
    expect(after).toBe(0);
    expect(before - after).toBe(90);
  });

  it('fails closed when billed gate is not ready or check failed', () => {
    expect(
      timesheetEntryDeleteUiState(
        { id: 'e1', end_time: '2026-10-06T10:00:00.000Z' },
        { loaded: false, billingCheckOk: true, ids: new Set() },
      ).disabled,
    ).toBe(true);
    expect(
      timesheetEntryDeleteUiState(
        { id: 'e1', end_time: '2026-10-06T10:00:00.000Z' },
        { loaded: true, billingCheckOk: false, ids: new Set() },
      ).lockMessage,
    ).toBe(TIMESHEET_ENTRY_DELETE_BILLED);
  });

  it('blocks running entries without end time', () => {
    const ui = timesheetEntryDeleteUiState(
      { id: 'e1', end_time: null },
      { loaded: true, billingCheckOk: true, ids: new Set() },
    );
    expect(ui.disabled).toBe(true);
    expect(ui.lockMessage).toBe(TIMESHEET_ENTRY_DELETE_RUNNING);
  });
});
