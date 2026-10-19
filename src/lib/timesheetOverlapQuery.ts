import { isDevFieldAuditAuth } from './devFieldAuditAuth';
import { supabase } from './supabase';
import { addLocalDate, isoDateKey, type TimeEntrySibling } from './dateTimeIntegrity';
import { getAuditTimesheetEntries, getAuditTimesheets } from './timesheetsList';

export async function loadPersonTimeEntries(args: {
  employeeId: string;
  date: string;
  endsNextDay?: boolean;
}): Promise<TimeEntrySibling[]> {
  const day = isoDateKey(args.date);
  if (!day || !args.employeeId) return [];
  const toDate = args.endsNextDay ? addLocalDate(day, 1) : day;
  if (isDevFieldAuditAuth()) {
    const mine = new Set(
      (getAuditTimesheets() ?? [])
        .filter(sheet => sheet.employee_id === args.employeeId)
        .map(sheet => sheet.id),
    );
    return (getAuditTimesheetEntries() ?? [])
      .filter(row => {
        if (!mine.has(row.timesheet_id)) return false;
        const startDay = isoDateKey(row.start_time);
        return !!startDay && startDay >= day && startDay <= toDate;
      })
      .map(row => ({
        id: row.id,
        start_time: row.start_time,
        end_time: row.end_time,
      }));
  }
  const { data: sheets, error: sheetErr } = await supabase
    .from('timesheets')
    .select('id')
    .eq('employee_id', args.employeeId)
    .gte('date', day)
    .lte('date', toDate);
  if (sheetErr) throw sheetErr;
  const ids = (sheets ?? []).map(row => row.id as string).filter(Boolean);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('timesheet_entries')
    .select('id, start_time, end_time')
    .in('timesheet_id', ids);
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    start_time: row.start_time as string,
    end_time: (row.end_time as string | null) ?? null,
  }));
}

export type PersonTimeEntryLoader = (args: {
  employeeId: string;
  date: string;
  endsNextDay?: boolean;
}) => Promise<TimeEntrySibling[]>;
