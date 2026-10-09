/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as devFieldAuditAuth from './devFieldAuditAuth';
import {
  TIMESHEET_ENTRY_DELETE_BILLED,
  TIMESHEET_ENTRY_DELETE_BILLING_CHECK,
  TIMESHEET_ENTRY_DELETE_ALREADY,
  TIMESHEET_ENTRY_DELETE_PERMISSION,
  TIMESHEET_ENTRY_DELETE_RUNNING,
  deleteUnbilledTimesheetEntry,
  recomputeTimesheetTotalMinutes,
  timesheetEntryDeleteUiState,
} from './timesheetEntryDelete';
import {
  AUDIT_TIMESHEET_ENTRY_OTHER_ID,
  AUDIT_TIMESHEET_ENTRY_ALREADY_GONE,
  AUDIT_TIMESHEET_ENTRY_UNBILLED_ID,
  AUDIT_TIMESHEET_ID,
  AUDIT_TIMESHEET_OTHER_ID,
  getAuditTimesheetEntries,
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

  it('server guard: job_costs count > 0 → 0 rows deleted and billed message (check-then-delete)', async () => {
    let deleteCalled = false;
    const jobCostsCount = 1;
    const client = {
      from: (table: string) => {
        if (table === 'job_costs') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ count: jobCostsCount, error: null }),
            }),
          };
        }
        if (table === 'timesheet_entries') {
          return {
            delete: () => {
              deleteCalled = true;
              return {
                eq: () => ({
                  select: async () => ({ data: [], error: null }),
                }),
              };
            },
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
    expect(jobCostsCount).toBe(1);
    expect(deleteCalled).toBe(false);
  });

  it('surfaces billing check, permission, and already-deleted errors', async () => {
    const billingFailClient = {
      from: (table: string) => {
        if (table === 'job_costs') {
          return {
            select: () => ({
              eq: () => Promise.resolve({
                count: null,
                error: { code: 'PGRST204', message: 'column timesheet_entry_id does not exist' },
              }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };
    await expect(
      deleteUnbilledTimesheetEntry(billingFailClient as never, {
        id: 'e1',
        timesheet_id: 'ts-1',
        start_time: '2026-10-06T08:00:00.000Z',
        end_time: '2026-10-06T09:00:00.000Z',
      }),
    ).rejects.toThrow(TIMESHEET_ENTRY_DELETE_BILLING_CHECK);

    const permClient = {
      from: (table: string) => {
        if (table === 'job_costs') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ count: 0, error: null }),
            }),
          };
        }
        if (table === 'timesheet_entries') {
          return {
            delete: () => ({
              eq: () => ({
                select: async () => ({ data: null, error: { code: '42501', message: 'denied' } }),
              }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };
    await expect(
      deleteUnbilledTimesheetEntry(permClient as never, {
        id: 'e1',
        timesheet_id: 'ts-1',
        start_time: '2026-10-06T08:00:00.000Z',
        end_time: '2026-10-06T09:00:00.000Z',
      }),
    ).rejects.toThrow(TIMESHEET_ENTRY_DELETE_PERMISSION);

    const goneClient = {
      from: (table: string) => {
        if (table === 'job_costs') {
          return {
            select: () => ({
              eq: () => Promise.resolve({ count: 0, error: null }),
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
      deleteUnbilledTimesheetEntry(goneClient as never, {
        id: 'e1',
        timesheet_id: 'ts-1',
        start_time: '2026-10-06T08:00:00.000Z',
        end_time: '2026-10-06T09:00:00.000Z',
      }),
    ).rejects.toThrow(TIMESHEET_ENTRY_DELETE_ALREADY);
  });

  it('audit delete throws Already deleted on a second delete call', async () => {
    vi.mocked(devFieldAuditAuth.isDevFieldAuditAuth).mockReturnValue(true);
    resetAuditTimesheetEntryHides();
    const entry = {
      id: AUDIT_TIMESHEET_ENTRY_UNBILLED_ID,
      timesheet_id: AUDIT_TIMESHEET_ID,
      start_time: '2026-10-06T11:00:00.000Z',
      end_time: '2026-10-06T12:00:00.000Z',
    };
    await deleteUnbilledTimesheetEntry({} as never, entry);
    await expect(deleteUnbilledTimesheetEntry({} as never, entry)).rejects.toThrow(
      TIMESHEET_ENTRY_DELETE_ALREADY,
    );
  });

  it('audit already-gone entry shows Already deleted on confirm', async () => {
    vi.mocked(devFieldAuditAuth.isDevFieldAuditAuth).mockReturnValue(true);
    await expect(
      deleteUnbilledTimesheetEntry({} as never, {
        id: AUDIT_TIMESHEET_ENTRY_ALREADY_GONE,
        timesheet_id: AUDIT_TIMESHEET_ID,
        start_time: '2026-10-06T12:00:00.000Z',
        end_time: '2026-10-06T12:30:00.000Z',
      }),
    ).rejects.toThrow(TIMESHEET_ENTRY_DELETE_ALREADY);
  });

  it('audit delete removes the row from the entry list', () => {
    vi.mocked(devFieldAuditAuth.isDevFieldAuditAuth).mockReturnValue(true);
    resetAuditTimesheetEntryHides();
    const before = (getAuditTimesheetEntries() ?? []).some(e => e.id === AUDIT_TIMESHEET_ENTRY_UNBILLED_ID);
    expect(before).toBe(true);
    hideAuditTimesheetEntry(AUDIT_TIMESHEET_ENTRY_UNBILLED_ID);
    const after = (getAuditTimesheetEntries() ?? []).some(e => e.id === AUDIT_TIMESHEET_ENTRY_UNBILLED_ID);
    expect(after).toBe(false);
  });

  it('audit delete keeps another worker timesheet total from remaining entries', () => {
    vi.mocked(devFieldAuditAuth.isDevFieldAuditAuth).mockReturnValue(true);
    const before = getAuditTimesheetTotalMinutes(AUDIT_TIMESHEET_OTHER_ID);
    expect(before).toBe(150);
    hideAuditTimesheetEntry(AUDIT_TIMESHEET_ENTRY_OTHER_ID);
    recomputeAuditTimesheetTotalMinutes(AUDIT_TIMESHEET_OTHER_ID);
    const after = getAuditTimesheetTotalMinutes(AUDIT_TIMESHEET_OTHER_ID);
    expect(after).toBe(60);
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
    ).toBe(TIMESHEET_ENTRY_DELETE_BILLING_CHECK);
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
