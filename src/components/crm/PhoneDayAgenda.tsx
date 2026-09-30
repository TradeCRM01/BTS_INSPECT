import { format } from 'date-fns';
import type { JobWithClient } from '../../types/crm';
import {
  TIME_NOT_SET_LABEL,
  jobsOnScheduleDay,
  scheduleChipClock,
  scheduleDateKey,
  scheduleJobPartyLine,
} from '../../lib/scheduleBoard';
import { formatJobRef } from '../../lib/jobRef';
import { RecordIdentity } from '../layout/RecordIdentity';

export function PhoneDayAgenda({
  jobs,
  teamMembers,
  currentDate,
  onJobClick,
  onScheduleTap,
}: {
  jobs: JobWithClient[];
  teamMembers: { id: string; name: string }[];
  currentDate: Date;
  onJobClick: (job: JobWithClient) => void;
  onScheduleTap?: (dateStr: string) => void;
}) {
  const dateStr = scheduleDateKey(currentDate);
  const dayJobs = jobsOnScheduleDay(jobs, dateStr);
  const timed = dayJobs.filter(j => j.start_time);
  const untimed = dayJobs.filter(j => !j.start_time);

  return (
    <div className="hub-phone-agenda" data-phone-day-agenda="1">
      <p className="hub-schedule-label">{format(currentDate, 'EEEE d MMMM')}</p>
      {dayJobs.length === 0 && (
        <p className="ops-meta mt-2">Nothing on this day.</p>
      )}
      <ul className="hub-phone-agenda-list">
        {timed.map(job => (
          <li key={job.id}>
            <button type="button" className="hub-phone-agenda-row" onClick={() => onJobClick(job)}>
              <span className="hub-phone-agenda-time">{scheduleChipClock(job.start_time, job.end_time)}</span>
              <RecordIdentity
                primary={`${formatJobRef(job)} · ${job.title || 'Job'}`}
                secondary={scheduleJobPartyLine(job.client_name, job.assigned_team, teamMembers)}
              />
            </button>
          </li>
        ))}
      </ul>
      {untimed.length > 0 && (
        <div className="hub-day-untimed" data-untimed-lane="1">
          <p className="hub-schedule-label">On this day · {TIME_NOT_SET_LABEL}</p>
          <ul className="hub-phone-agenda-list">
            {untimed.map(job => (
              <li key={job.id}>
                <button type="button" className="hub-phone-agenda-row" onClick={() => onJobClick(job)}>
                  <RecordIdentity
                    primary={`${formatJobRef(job)} · ${job.title || 'Job'}`}
                    secondary={scheduleJobPartyLine(job.client_name, job.assigned_team, teamMembers)}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {onScheduleTap && (
        <button type="button" className="btn-secondary mt-3 min-h-[44px] w-full" onClick={() => onScheduleTap(dateStr)}>
          Schedule a job
        </button>
      )}
    </div>
  );
}

export function PhoneWeekAgenda({
  jobs,
  teamMembers,
  days,
  onSelectDay,
  onJobClick,
}: {
  jobs: JobWithClient[];
  teamMembers: { id: string; name: string }[];
  days: Date[];
  onSelectDay: (date: Date) => void;
  onJobClick: (job: JobWithClient) => void;
}) {
  return (
    <div className="hub-phone-agenda" data-phone-week-agenda="1">
      {days.map(day => {
        const key = scheduleDateKey(day);
        const dayJobs = jobsOnScheduleDay(jobs, key);
        return (
          <section key={key} className="hub-phone-week-day">
            <button type="button" className="hub-phone-week-head" onClick={() => onSelectDay(day)}>
              {format(day, 'EEE d MMM')}
            </button>
            {dayJobs.length === 0 ? (
              <p className="ops-meta">No jobs</p>
            ) : (
              <ul className="hub-phone-agenda-list">
                {dayJobs.map(job => (
                  <li key={job.id}>
                    <button type="button" className="hub-phone-agenda-row" onClick={() => onJobClick(job)}>
                      <span className="hub-phone-agenda-time">{scheduleChipClock(job.start_time, job.end_time)}</span>
                      <RecordIdentity
                        primary={`${formatJobRef(job)} · ${job.title || 'Job'}`}
                        secondary={scheduleJobPartyLine(job.client_name, job.assigned_team, teamMembers)}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
