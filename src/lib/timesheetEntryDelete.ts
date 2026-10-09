import type { SupabaseClient } from '@supabase/supabase-js';
import { isDevAuditBillingFetchFail, isDevFieldAuditAuth } from './devFieldAuditAuth';
import { isSchemaColumnMissingError, loadBilledTimesheetEntryIds } from './hoursToJobBill';
import { entryMinutes } from './timesheetJob';
import {
  AUDIT_TIMESHEET_ENTRY_ID,
  hideAuditTimesheetEntry,
  isAuditTimesheetEntryHidden,
  recomputeAuditTimesheetTotalMinutes,
} from './timesheetsList';

export const TIMESHEET_ENTRY_DELETE_BILLED =
  'This time is already on a job bill and cannot be deleted.';

export const TIMESHEET_ENTRY_DELETE_RUNNING =
  'Stop the running entry before you delete it.';

export const TIMESHEET_ENTRY_DELETE_BILLING_CHECK =
  "Couldn't check billing, try again";

export const TIMESHEET_ENTRY_DELETE_ALREADY = 'Already deleted';

export const TIMESHEET_ENTRY_DELETE_PERMISSION =
  "You don't have permission to delete this entry.";

function isTimesheetDeletePermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '42501' || code === 'PGRST301';
}

export type BilledTimesheetEntryIdsState = {
  ids: Set<string>;
  billingCheckOk: boolean;
};

export type TimesheetEntryDeleteGate = {
  loaded: boolean;
  billingCheckOk: boolean;
  ids: ReadonlySet<string>;
};

export function timesheetEntryDeleteBlockedReason(
  entryId: string,
  billedIds: ReadonlySet<string>,
): string | null {
  return billedIds.has(entryId) ? TIMESHEET_ENTRY_DELETE_BILLED : null;
}

export function timesheetEntryDeleteUiState(
  entry: { id: string; end_time: string | null },
  gate: TimesheetEntryDeleteGate,
): { disabled: boolean; lockMessage: string | null } {
  if (isDevFieldAuditAuth() && isAuditTimesheetEntryHidden(entry.id)) {
    return { disabled: true, lockMessage: TIMESHEET_ENTRY_DELETE_ALREADY };
  }
  if (!entry.end_time) {
    return { disabled: true, lockMessage: TIMESHEET_ENTRY_DELETE_RUNNING };
  }
  if (!gate.loaded) {
    return { disabled: true, lockMessage: null };
  }
  if (!gate.billingCheckOk) {
    return { disabled: true, lockMessage: TIMESHEET_ENTRY_DELETE_BILLING_CHECK };
  }
  const billed = timesheetEntryDeleteBlockedReason(entry.id, gate.ids);
  if (billed) return { disabled: true, lockMessage: billed };
  return { disabled: false, lockMessage: null };
}

export async function loadBilledTimesheetEntryIdsForJobs(
  client: SupabaseClient,
  jobIds: string[],
): Promise<BilledTimesheetEntryIdsState> {
  if (isDevFieldAuditAuth() && jobIds.length > 0) {
    if (isDevAuditBillingFetchFail()) {
      return { ids: new Set(), billingCheckOk: false };
    }
    return { ids: new Set([AUDIT_TIMESHEET_ENTRY_ID]), billingCheckOk: true };
  }
  const billed = new Set<string>();
  let billingCheckOk = true;
  for (const jobId of jobIds) {
    const { ids, columnMissing } = await loadBilledTimesheetEntryIds(client, jobId);
    if (columnMissing) billingCheckOk = false;
    ids.forEach(id => billed.add(id));
  }
  return { ids: billed, billingCheckOk };
}

export async function recomputeTimesheetTotalMinutes(
  client: SupabaseClient,
  timesheetId: string,
): Promise<number> {
  const { data, error } = await client
    .from('timesheet_entries')
    .select('start_time, end_time')
    .eq('timesheet_id', timesheetId);
  if (error) throw error;
  let total = 0;
  for (const row of data ?? []) {
    if (row.end_time) {
      total += entryMinutes(row.start_time as string, row.end_time as string);
    }
  }
  const { error: tsErr } = await client
    .from('timesheets')
    .update({ total_minutes: total })
    .eq('id', timesheetId);
  if (tsErr) throw tsErr;
  return total;
}

async function entryReferencedOnJobBill(
  client: SupabaseClient,
  entryId: string,
): Promise<{ blocked: boolean; checkOk: boolean }> {
  const { count, error } = await client
    .from('job_costs')
    .select('id', { count: 'exact', head: true })
    .eq('timesheet_entry_id', entryId);
  if (error) {
    if (isSchemaColumnMissingError(error, 'timesheet_entry_id')) {
      return { blocked: true, checkOk: false };
    }
    throw error;
  }
  return { blocked: (count ?? 0) > 0, checkOk: true };
}

export async function deleteUnbilledTimesheetEntry(
  client: SupabaseClient,
  entry: {
    id: string;
    timesheet_id: string;
    start_time: string;
    end_time: string | null;
  },
): Promise<{ deleted: boolean }> {
  if (!entry.end_time) {
    throw new Error(TIMESHEET_ENTRY_DELETE_RUNNING);
  }
  if (isDevFieldAuditAuth()) {
    if (isAuditTimesheetEntryHidden(entry.id)) {
      throw new Error(TIMESHEET_ENTRY_DELETE_ALREADY);
    }
    hideAuditTimesheetEntry(entry.id);
    recomputeAuditTimesheetTotalMinutes(entry.timesheet_id);
    return { deleted: true };
  }
  const bill = await entryReferencedOnJobBill(client, entry.id);
  if (!bill.checkOk) {
    throw new Error(TIMESHEET_ENTRY_DELETE_BILLING_CHECK);
  }
  if (bill.blocked) {
    throw new Error(TIMESHEET_ENTRY_DELETE_BILLED);
  }
  const { data: deleted, error: delErr } = await client
    .from('timesheet_entries')
    .delete()
    .eq('id', entry.id)
    .select('id');
  if (delErr) {
    if (isTimesheetDeletePermissionError(delErr)) {
      throw new Error(TIMESHEET_ENTRY_DELETE_PERMISSION);
    }
    throw delErr;
  }
  if (!deleted?.length) {
    throw new Error(TIMESHEET_ENTRY_DELETE_ALREADY);
  }
  await recomputeTimesheetTotalMinutes(client, entry.timesheet_id);
  return { deleted: true };
}
