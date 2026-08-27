import { format } from 'date-fns';
import {
  compareScheduleJobs,
  scheduleClockLabel,
  scheduleCrewLabel,
  scheduleDateKey,
  scheduleDayKey,
  scheduleJobHref,
  type ScheduleCrewMember,
  type ScheduleDayJob,
} from './scheduleBoard';

export type DashboardTodayStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export type DashboardTodayJob = ScheduleDayJob & {
  status?: DashboardTodayStatus | null;
  address?: string | null;
  client_address?: string | null;
  client_name?: string | null;
};

const AU_STATE = /\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b.*$/i;

/** Existing job sheet — home does not invent another destination. */
export function dashboardJobHref(jobId: string): string {
  return scheduleJobHref(jobId);
}

export function dashboardTodayKey(now = new Date()): string {
  return scheduleDateKey(now);
}

/** Thursday 27 August — the sparkie’s calendar day, local to the device. */
export function dashboardHeadingDate(now = new Date()): string {
  return format(now, 'EEEE d MMMM');
}

/**
 * Today’s work from existing job/schedule fields:
 * booked on this calendar day, or already on site.
 * Cancelled jobs stay off the run sheet.
 */
export function isDashboardTodayWork(
  job: DashboardTodayJob,
  now = new Date(),
): boolean {
  if (job.status === 'cancelled') return false;
  if (job.status === 'in_progress') return true;
  return scheduleDayKey(job.scheduled_date) === dashboardTodayKey(now);
}

export function todaysDashboardJobs<T extends DashboardTodayJob>(
  jobs: T[],
  now = new Date(),
): T[] {
  return jobs.filter(job => isDashboardTodayWork(job, now)).sort(compareScheduleJobs);
}

export function dashboardClockLabel(
  start: string | null | undefined,
  end?: string | null,
): string {
  return scheduleClockLabel(start, end) ?? 'All day';
}

export function dashboardJobSite(
  job: Pick<DashboardTodayJob, 'address' | 'client_address'>,
): string {
  for (const part of [job.address, job.client_address]) {
    const trimmed = part?.trim();
    if (trimmed && trimmed !== 'No site address') return trimmed;
  }
  return '';
}

/** Suburb from an AU site line — "12 Workshop Rd, Perth WA 6000" → Perth. */
export function dashboardJobSuburb(site: string): string {
  const parts = site.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return site.trim();
  const loc = parts[1].replace(AU_STATE, '').trim();
  return loc || parts[1];
}

export function dashboardJobPlace(job: Pick<DashboardTodayJob, 'address' | 'client_address'>): string {
  const site = dashboardJobSite(job);
  return site ? dashboardJobSuburb(site) : '';
}

export function dashboardCrewLabel(
  assigned: string[] | null | undefined,
  members: ScheduleCrewMember[] | null | undefined,
): string {
  return scheduleCrewLabel(assigned, members);
}

export type DashboardJobState = 'on_site' | 'today' | 'done' | 'scheduled';

export function dashboardJobState(
  job: DashboardTodayJob,
  now = new Date(),
): DashboardJobState {
  if (job.status === 'completed') return 'done';
  if (job.status === 'in_progress') return 'on_site';
  if (scheduleDayKey(job.scheduled_date) === dashboardTodayKey(now)) return 'today';
  return 'scheduled';
}

export function dashboardJobStateLabel(state: DashboardJobState): string {
  if (state === 'on_site') return 'On site';
  if (state === 'today') return 'Today';
  if (state === 'done') return 'Done';
  return 'Scheduled';
}

export function dashboardJobMetaLine(job: DashboardTodayJob): string {
  return [job.client_name?.trim(), dashboardJobPlace(job)].filter(Boolean).join(' · ');
}
