import { isDevFieldAuditAuth } from './devFieldAuditAuth';
import { supabase } from './supabase';
import { clockOffSaveError, clockOnSaveError, isoDateKey, overlapQueryDates, type TimeEntrySibling } from './dateTimeIntegrity';
import { getAuditTimesheetEntries, getAuditTimesheets } from './timesheetsList';
import { localDateIso } from './timesheetJob';

function asSibling(row: { id?: string; start_time: string; end_time: string | null }): TimeEntrySibling {
  return {
    id: row.id,
    start_time: row.start_time,
    end_time: row.end_time,
  };
}

export async function loadPersonTimeEntries(args: {
  employeeId: string;
  date: string;
  endsNextDay?: boolean;
}): Promise<TimeEntrySibling[]> {
  const day = isoDateKey(args.date);
  if (!day || !args.employeeId) return [];
  const { fromDate, toDate } = overlapQueryDates(day, args.endsNextDay);
  if (isDevFieldAuditAuth()) {
    const mine = new Set(
      (getAuditTimesheets() ?? [])
        .filter(sheet => sheet.employee_id === args.employeeId)
        .map(sheet => sheet.id),
    );
    return (getAuditTimesheetEntries() ?? [])
      .filter(row => {
        if (!mine.has(row.timesheet_id)) return false;
        if (!row.end_time) return true;
        const startDay = isoDateKey(row.start_time);
        return !!startDay && startDay >= fromDate && startDay <= toDate;
      })
      .map(row => asSibling(row));
  }

  const [rangedSheets, allSheets] = await Promise.all([
    supabase
      .from('timesheets')
      .select('id')
      .eq('employee_id', args.employeeId)
      .gte('date', fromDate)
      .lte('date', toDate),
    supabase
      .from('timesheets')
      .select('id')
      .eq('employee_id', args.employeeId),
  ]);
  if (rangedSheets.error) throw rangedSheets.error;
  if (allSheets.error) throw allSheets.error;

  const rangedIds = (rangedSheets.data ?? []).map(row => row.id as string).filter(Boolean);
  const allIds = (allSheets.data ?? []).map(row => row.id as string).filter(Boolean);

  const [rangedEntries, openEntries] = await Promise.all([
    rangedIds.length
      ? supabase.from('timesheet_entries').select('id, start_time, end_time').in('timesheet_id', rangedIds)
      : Promise.resolve({ data: [] as { id: string; start_time: string; end_time: string | null }[], error: null }),
    allIds.length
      ? supabase
        .from('timesheet_entries')
        .select('id, start_time, end_time')
        .in('timesheet_id', allIds)
        .is('end_time', null)
      : Promise.resolve({ data: [] as { id: string; start_time: string; end_time: string | null }[], error: null }),
  ]);
  if (rangedEntries.error) throw rangedEntries.error;
  if (openEntries.error) throw openEntries.error;

  const byId = new Map<string, TimeEntrySibling>();
  for (const row of [...(rangedEntries.data ?? []), ...(openEntries.data ?? [])]) {
    byId.set(row.id as string, asSibling({
      id: row.id as string,
      start_time: row.start_time as string,
      end_time: (row.end_time as string | null) ?? null,
    }));
  }
  return [...byId.values()];
}

export type PersonTimeEntryLoader = (args: {
  employeeId: string;
  date: string;
  endsNextDay?: boolean;
}) => Promise<TimeEntrySibling[]>;

export async function jobClockOnBlocked(args: {
  employeeId: string;
  now: Date | string;
  load?: PersonTimeEntryLoader;
}): Promise<string | null> {
  const now = typeof args.now === 'string' ? new Date(args.now) : args.now;
  const load = args.load ?? loadPersonTimeEntries;
  const siblings = await load({
    employeeId: args.employeeId,
    date: localDateIso(now),
    endsNextDay: true,
  });
  return clockOnSaveError({ now, existing: siblings });
}

export async function jobClockOffBlocked(args: {
  employeeId: string;
  startIso: string;
  endIso: string;
  excludeIds?: string[];
  load?: PersonTimeEntryLoader;
}): Promise<string | null> {
  const load = args.load ?? loadPersonTimeEntries;
  const day = isoDateKey(args.startIso) ?? localDateIso(new Date(args.startIso));
  const siblings = (await load({
    employeeId: args.employeeId,
    date: day,
    endsNextDay: true,
  })).filter(row => !args.excludeIds?.includes(row.id ?? ''));
  return clockOffSaveError({
    startIso: args.startIso,
    endIso: args.endIso,
    existing: siblings,
  });
}
