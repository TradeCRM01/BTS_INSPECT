import { useEffect, useRef, useState } from 'react';
import { SearchBar } from '../ui/SearchBar';
import { OpsStatus } from '../ui/OpsCard';
import { JOB_STATUS_LABELS, JOB_STATUS_RAIL, JOB_STATUS_STYLES } from '../../types/crm';
import type { JobWithClient } from '../../types/crm';
import { formatJobRef } from '../../lib/jobRef';
import { jobsListSite, jobsListSuburbFromSite } from '../../lib/jobsListRow';
import { scheduleJobHref } from '../../lib/scheduleBoard';
import { format, parseISO } from 'date-fns';

function useSchedulePhone() {
  const [phone, setPhone] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  ));
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setPhone(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return phone;
}

function whenLabel(job: JobWithClient): string | null {
  if (!job.scheduled_date) return 'Unscheduled';
  const day = format(parseISO(job.scheduled_date.slice(0, 10)), 'd MMM');
  if (!job.start_time) return day;
  const start = job.start_time.slice(0, 5);
  const end = job.end_time ? `–${job.end_time.slice(0, 5)}` : '';
  return `${day} · ${start}${end}`;
}

export function ScheduleJobSearch({
  query,
  onQuery,
  results,
  loading,
  selectedId,
  onSelect,
  onOpenJob,
  onDragStart,
  onScheduleJob,
}: {
  query: string;
  onQuery: (value: string) => void;
  results: JobWithClient[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (job: JobWithClient | null) => void;
  onOpenJob: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  onScheduleJob: (job: JobWithClient) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const open = query.trim().length > 0;
  const [dragging, setDragging] = useState(false);
  const phone = useSchedulePhone();

  useEffect(() => {
    const endDrag = () => setDragging(false);
    window.addEventListener('dragend', endDrag);
    window.addEventListener('drop', endDrag);
    return () => {
      window.removeEventListener('dragend', endDrag);
      window.removeEventListener('drop', endDrag);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (dragging) return;
      if (!rootRef.current?.contains(e.target as Node)) {
        onQuery('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onQuery('');
        onSelect(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onQuery, onSelect, dragging]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 max-w-xl">
      <SearchBar
        value={query}
        onChange={onQuery}
        placeholder="Search jobs or clients..."
      />
      {open && (
        <div className={`hub-schedule-search-panel absolute z-30 mt-2 w-full overflow-hidden ${
          dragging ? 'pointer-events-none opacity-40' : ''
        }`}>
          <div className="hub-schedule-search-head">
            <p className="ops-meta">
              {loading
                ? 'Searching…'
                : `${results.length} match${results.length === 1 ? '' : 'es'}${
                  phone ? ' · tap to schedule' : ' · drag onto a name or a time'
                }`}
            </p>
          </div>
          {results.length === 0 && !loading ? (
            <p className="ops-meta px-4 py-4">No jobs match what you typed.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {results.map(job => {
                const suburb = jobsListSuburbFromSite(jobsListSite(job.address, job.client_address));
                const selected = selectedId === job.id;
                return (
                  <li key={job.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      draggable={!phone}
                      data-schedule-search-hit={job.id}
                      onDragStart={phone ? undefined : e => {
                        setDragging(true);
                        onSelect(job);
                        onDragStart(e, job.id);
                      }}
                      onClick={() => {
                        if (phone) {
                          onQuery('');
                          onSelect(null);
                          onScheduleJob(job);
                          return;
                        }
                        onSelect(job);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (phone) {
                            onQuery('');
                            onSelect(null);
                            onScheduleJob(job);
                            return;
                          }
                          onSelect(job);
                        }
                      }}
                      className={`hub-schedule-search-hit ${selected ? 'is-on' : ''}`}
                      style={{ borderLeft: `3px solid ${JOB_STATUS_RAIL[job.status]}` }}
                    >
                      <p className="hub-schedule-search-title">
                        {formatJobRef(job)} · {job.title}
                      </p>
                      <div className="hub-schedule-search-status">
                        <OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>
                        <a
                          href={scheduleJobHref(job.id)}
                          data-schedule-open-job={job.id}
                          className="hub-schedule-next"
                          onClick={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenJob(job);
                          }}
                          onPointerDown={e => e.stopPropagation()}
                        >
                          Open
                        </a>
                      </div>
                      <p className="ops-meta hub-schedule-search-meta">
                        {[job.client_name, suburb, whenLabel(job)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
