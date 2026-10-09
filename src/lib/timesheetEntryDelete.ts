import type { SupabaseClient } from '@supabase/supabase-js';
import { isDevFieldAuditAuth } from './devFieldAuditAuth';
import { loadBilledTimesheetEntryIds } from './hoursToJobBill';
import { entryMinutes } from './timesheetJob';
import { AUDIT_TIMESHEET_ENTRY_ID, hideAuditTimesheetEntry } from './timesheetsList';

export const TIMESHEET_ENTRY_DELETE_BILLED =
  'This time is already on a job bill and cannot be deleted.';

export function timesheetEntryDeleteBlockedReason(
  entryId: string,
  billedIds: ReadonlySet<string>,
): string | null {
  return billedIds.has(entryId) ? TIMESHEET_ENTRY_DELETE_BILLED : null;
}

export async function loadBilledTimesheetEntryIdsForJobs(
  client: SupabaseClient,
  jobIds: string[],
): Promise<Set<string>> {
  if (isDevFieldAuditAuth() && jobIds.length > 0) {
    return new Set([AUDIT_TIMESHEET_ENTRY_ID]);
  }
  const billed = new Set<string>();
  for (const jobId of jobIds) {
    const { ids } = await loadBilledTimesheetEntryIds(client, jobId);
    ids.forEach(id => billed.add(id));
  }
  return billed;
}

export async function deleteUnbilledTimesheetEntry(
  client: SupabaseClient,
  entry: {
    id: string;
    timesheet_id: string;
    start_time: string;
    end_time: string | null;
  },
  timesheetTotalMinutes: number,
): Promise<void> {
  if (isDevFieldAuditAuth()) {
    hideAuditTimesheetEntry(entry.id);
    return;
  }
  const removed = entryMinutes(entry.start_time, entry.end_time);
  const { error: delErr } = await client.from('timesheet_entries').delete().eq('id', entry.id);
  if (delErr) throw delErr;
  const nextTotal = Math.max(0, timesheetTotalMinutes - removed);
  const { error: tsErr } = await client
    .from('timesheets')
    .update({ total_minutes: nextTotal })
    .eq('id', entry.timesheet_id);
  if (tsErr) throw tsErr;
}
