import { GripVertical } from 'lucide-react';
import { SearchBar } from '../ui/SearchBar';
import type { JobWithClient } from '../../types/crm';
import { formatJobRef } from '../../lib/jobRef';
import { buildScheduleQueue } from '../../lib/scheduleQueue';
import { partitionScheduleJobs } from '../../lib/jobNextAction';

function whenLabel(job: JobWithClient): string {
  if (!job.scheduled_date) return 'Unscheduled';
  const day = job.scheduled_date.slice(0, 10);
  const start = job.start_time?.slice(0, 5);
  return start ? `${day} · ${start}` : day;
}

export function ScheduleJobsTray({
  jobs,
  query,
  onQuery,
  scope,
  onScope,
  selectedId,
  onSelect,
  onSchedule,
  onDragStart,
  feedback,
}: {
  jobs: JobWithClient[];
  query: string;
  onQuery: (value: string) => void;
  scope: 'unscheduled' | 'all';
  onScope: (scope: 'unscheduled' | 'all') => void;
  selectedId: string | null;
  onSelect: (job: JobWithClient) => void;
  onSchedule: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  feedback?: { message: string; retryable?: boolean; onRetry?: () => void } | null;
}) {
  const { needsDate, onBoard } = partitionScheduleJobs(jobs);
  const groups = buildScheduleQueue(needsDate, onBoard);
  const visible = (scope === 'unscheduled' ? needsDate : jobs);

  return (
    <aside className="dc-jobs-tray" data-schedule-jobs-tray="1">
      <div className="dc-jobs-tray-head">
        <p className="ops-card-kicker">Existing jobs</p>
        <p className="ops-meta">Drag a card onto the board, or tap Schedule.</p>
      </div>
      <SearchBar value={query} onChange={onQuery} placeholder="Job number, title, client or address" />
      <div className="flex gap-2 mt-2" role="group" aria-label="Job list">
        <button
          type="button"
          className={`ops-seg-btn min-h-11 ${scope === 'unscheduled' ? 'ops-seg-btn-on' : 'ops-seg-btn-off'}`}
          aria-pressed={scope === 'unscheduled'}
          onClick={() => onScope('unscheduled')}
        >
          Unscheduled
        </button>
        <button
          type="button"
          className={`ops-seg-btn min-h-11 ${scope === 'all' ? 'ops-seg-btn-on' : 'ops-seg-btn-off'}`}
          aria-pressed={scope === 'all'}
          onClick={() => onScope('all')}
        >
          All jobs
        </button>
      </div>
      {feedback ? (
        <p className="ops-meta dc-place-feedback" role="status">
          {feedback.message}
          {feedback.retryable && feedback.onRetry ? (
            <button type="button" className="ops-link ml-2 min-h-11" onClick={feedback.onRetry}>Retry</button>
          ) : null}
        </p>
      ) : null}
      {scope === 'all' && groups.some(g => g.jobs.length > 0) ? (
        <p className="ops-meta mt-2">{groups.filter(g => g.jobs.length).map(g => `${g.label} ${g.jobs.length}`).join(' · ')}</p>
      ) : null}
      <ul className="dc-jobs-tray-list">
        {visible.length === 0 ? (
          <li className="ops-meta px-1 py-3">
            {scope === 'unscheduled' ? 'No unscheduled jobs. Search or show all jobs.' : 'No jobs match.'}
          </li>
        ) : visible.map(job => {
          const selected = selectedId === job.id;
          return (
            <li key={job.id}>
              <div
                className={`dc-job-card ${selected ? 'is-on' : ''}`}
                data-schedule-tray-job={job.id}
              >
                <button
                  type="button"
                  className="dc-job-card-handle"
                  draggable
                  aria-label={`Drag ${formatJobRef(job)}`}
                  onDragStart={e => {
                    onSelect(job);
                    onDragStart(e, job.id);
                  }}
                >
                  <GripVertical size={16} aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="hub-schedule-ref truncate">{formatJobRef(job)} · {job.title}</p>
                  <p className="ops-meta truncate">
                    {[job.client_name, job.address || job.client_address, whenLabel(job)].filter(Boolean).join(' · ')}
                  </p>
                  {job.scheduled_date ? (
                    <p className="ops-meta">Scheduling this will move the existing booking.</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn-secondary min-h-11"
                  onClick={() => onSchedule(job)}
                >
                  Schedule
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
