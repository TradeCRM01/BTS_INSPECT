import { differenceInCalendarDays, format } from 'date-fns';
import {
  dashboardClockLabel,
  dashboardCrewLabel,
  dashboardJobPlace,
  dashboardJobSite,
  type DashboardTodayJob,
} from './dashboardHome';
import {
  JOB_CREW_SCHEDULE_BOOKED,
  JOB_CREW_SCHEDULE_DONE,
  JOB_CREW_SCHEDULE_IN_PROGRESS,
  JOB_CREW_SCHEDULE_NEEDS_CREW,
  JOB_CREW_SCHEDULE_NO_DATE,
  jobCrewScheduleStatus,
} from './jobCrewScheduleStatus';
import { formatJobRef } from './jobRef';
import type { ScheduleCrewMember } from './scheduleBoard';

export const TODAY_PILL_READY = 'Ready to invoice';
export const TODAY_PILL_SET_DATE = 'Set a date';
export const TODAY_CREW_NONE = 'No crew yet';
export const TODAY_CLOCK_ALL_DAY = 'All day';

export type TodayBand = 'p' | 't' | 'd';
export type TodayNowKind = 'now' | 'on_site' | 'next' | 'empty';
export type TodayPillTone = 'ok' | 'warn' | 'live' | 'sched' | 'draft';

export type TodayNowPick<T extends DashboardTodayJob = DashboardTodayJob> = {
  kind: TodayNowKind;
  job: T | null;
};

export type TodayJobPill = {
  label: string;
  tone: TodayPillTone;
  kind: string;
};

export function todayBandFromWidth(width: number): TodayBand {
  if (width < 640) return 'p';
  if (width < 1024) return 't';
  return 'd';
}

export function todayShowsPlace(width: number): boolean {
  return width >= 1200;
}

export function todayEyebrow(now: Date, wide: boolean): string {
  const day = format(now, wide ? 'EEEE d MMMM' : 'EEE d MMM');
  return `${day} · ${format(now, 'HH:mm')}`;
}

export function todayClockLabel(
  start: string | null | undefined,
  end?: string | null,
): string {
  return compactTodayClock(dashboardClockLabel(start, end));
}

export function todayClockRange(
  start: string | null | undefined,
  end?: string | null,
): string {
  const startClock = clockMinutes(start);
  if (startClock == null) return TODAY_CLOCK_ALL_DAY;
  const endClock = jobEndMinutes(start, end);
  return `${padClock(startClock)}–${padClock(endClock)}`;
}

export function todayClockLines(
  start: string | null | undefined,
  end?: string | null,
): string[] {
  const startClock = clockMinutes(start);
  if (startClock == null) return [TODAY_CLOCK_ALL_DAY];
  return [padClock(startClock), padClock(jobEndMinutes(start, end))];
}

export function todayDirectionsHref(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function todayCrewOut(jobs: readonly DashboardTodayJob[]): number {
  const ids = new Set<string>();
  for (const job of jobs) {
    if (job.status === 'cancelled') continue;
    for (const id of job.assigned_team ?? []) {
      const member = (id ?? '').trim();
      if (member) ids.add(member);
    }
  }
  return ids.size;
}

export function todayCrewMeta(
  assigned: string[] | null | undefined,
  members: ScheduleCrewMember[] | null | undefined,
): string {
  if (!(assigned ?? []).some(id => (id ?? '').trim())) return TODAY_CREW_NONE;
  const label = dashboardCrewLabel(assigned, members);
  return label === 'Unassigned' ? TODAY_CREW_NONE : label;
}

export function todayWhisperJobs(count: number): string {
  if (count === 0) return 'No jobs today';
  return count === 1 ? '1 job' : `${count} jobs`;
}

export function todayWhisperCrew(count: number): string {
  if (count === 0) return 'No crew out';
  return count === 1 ? '1 crew out' : `${count} crew out`;
}

export function todayWhisperNeedCrew(count: number): string {
  return count === 1 ? '1 need crew' : `${count} need crew`;
}

export function pickTodayNowJob<T extends DashboardTodayJob>(
  jobs: readonly T[],
  now: Date,
): TodayNowPick<T> {
  const open = jobs.filter(job => job.status !== 'completed' && job.status !== 'cancelled');
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const current = open
    .filter(job => {
      const start = clockMinutes(job.start_time);
      if (start == null) return false;
      return start <= nowMin && nowMin < jobEndMinutes(job.start_time, job.end_time);
    })
    .sort((a, b) => {
      const aLive = a.status === 'in_progress' ? 0 : 1;
      const bLive = b.status === 'in_progress' ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      return (clockMinutes(b.start_time) ?? 0) - (clockMinutes(a.start_time) ?? 0);
    });
  if (current[0]) return { kind: 'now', job: current[0] };

  const onSite = open.find(job => job.status === 'in_progress');
  if (onSite) return { kind: 'on_site', job: onSite };

  const next = open
    .filter(job => {
      const start = clockMinutes(job.start_time);
      return start != null && start > nowMin;
    })
    .sort((a, b) => (clockMinutes(a.start_time) ?? 0) - (clockMinutes(b.start_time) ?? 0));
  if (next[0]) return { kind: 'next', job: next[0] };

  return { kind: 'empty', job: null };
}

export function todayNowEyebrow<T extends DashboardTodayJob>(pick: TodayNowPick<T>): string {
  if (pick.kind === 'on_site') return 'Now · On site';
  if (pick.kind === 'next' && pick.job) {
    return `Next · ${todayClockRange(pick.job.start_time, pick.job.end_time)}`;
  }
  if (pick.kind === 'now' && pick.job) {
    return `Now · ${todayClockRange(pick.job.start_time, pick.job.end_time)}`;
  }
  return 'Nothing on right now';
}

export function todayJobPill(
  job: DashboardTodayJob,
  readyIds: ReadonlySet<string>,
): TodayJobPill {
  if (job.status === 'completed' || job.status === 'Done') {
    if (readyIds.has(job.id)) {
      return { label: TODAY_PILL_READY, tone: 'ok', kind: 'ready_to_invoice' };
    }
    return { label: JOB_CREW_SCHEDULE_DONE, tone: 'draft', kind: 'done' };
  }
  const crew = jobCrewScheduleStatus(job.status, job.scheduled_date, job.assigned_team);
  if (crew.kind === 'needs_crew') {
    return { label: JOB_CREW_SCHEDULE_NEEDS_CREW, tone: 'warn', kind: crew.kind };
  }
  if (crew.kind === 'in_progress') {
    return { label: JOB_CREW_SCHEDULE_IN_PROGRESS, tone: 'live', kind: crew.kind };
  }
  if (crew.kind === 'no_date') {
    return { label: JOB_CREW_SCHEDULE_NO_DATE, tone: 'draft', kind: crew.kind };
  }
  if (crew.kind === 'booked') {
    return { label: JOB_CREW_SCHEDULE_BOOKED, tone: 'sched', kind: crew.kind };
  }
  return { label: crew.label, tone: 'draft', kind: crew.kind };
}

export function todayJobMeta(
  job: DashboardTodayJob,
  members: ScheduleCrewMember[] | null | undefined,
  width: number,
): string[] {
  const ref = formatJobRef(job);
  const client = (job.client_name ?? '').trim();
  const place = dashboardJobPlace(job);
  const crew = todayCrewMeta(job.assigned_team, members);
  if (width < 640) return [ref, client, crew].filter(Boolean);
  if (width < 1200) return [ref, client, place, crew].filter(Boolean);
  return [ref, client, crew].filter(Boolean);
}

export function todayDueLabel(
  dueDate: string | null | undefined,
  overdue: boolean,
  now = new Date(),
): string {
  const due = (dueDate ?? '').slice(0, 10);
  if (overdue && due) {
    const days = Math.max(1, differenceInCalendarDays(startOfLocalDay(now), isoDate(due)));
    return days === 1 ? '1 day overdue' : `${days} days overdue`;
  }
  if (!due) return '';
  return `Due ${format(isoDate(due), 'EEE d MMM')}`;
}

export function todayJobSiteAddress(job: Pick<DashboardTodayJob, 'address' | 'client_address'>): string {
  return dashboardJobSite(job);
}

export function todayJobsCap(band: TodayBand): number {
  return band === 'p' ? 6 : 8;
}

function compactTodayClock(label: string): string {
  return label.replace(/\s+[–-]\s+/g, '–');
}

function clockMinutes(value: string | null | undefined): number | null {
  const clock = (value ?? '').trim().slice(0, 5);
  if (!/^\d{1,2}:\d{2}$/.test(clock)) return null;
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

function jobEndMinutes(start: string | null | undefined, end?: string | null): number {
  const endClock = clockMinutes(end);
  if (endClock != null) return endClock;
  return (clockMinutes(start) ?? 0) + 60;
}

function padClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function isoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
