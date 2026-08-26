import { useEffect, useRef } from 'react';
import { SearchBar } from '../ui/SearchBar';
import { OpsStatus, opsSiteLabel } from '../ui/OpsCard';
import { JOB_STATUS_LABELS, JOB_STATUS_RAIL, JOB_STATUS_STYLES } from '../../types/crm';
import type { JobWithClient } from '../../types/crm';
import { format, parseISO } from 'date-fns';

function formatJobNumber(n: number | null | undefined): string {
  if (n == null) return 'JOB';
  return `#${String(n).padStart(4, '0')}`;
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
  onDragStart,
}: {
  query: string;
  onQuery: (value: string) => void;
  results: JobWithClient[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (job: JobWithClient | null) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const open = query.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onQuery('');
        onSelect(null);
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
  }, [open, onQuery, onSelect]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 max-w-xl">
      <SearchBar
        value={query}
        onChange={onQuery}
        placeholder="Search a job, then drop it on a person…"
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-rule rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-rule">
            <p className="ops-meta">
              {loading ? 'Searching…' : `${results.length} match${results.length === 1 ? '' : 'es'} · drag onto a name or a time`}
            </p>
          </div>
          {results.length === 0 && !loading ? (
            <p className="ops-meta px-3 py-4">No jobs match what you typed.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map(job => {
                const site = opsSiteLabel(job.address, job.client_address);
                const selected = selectedId === job.id;
                return (
                  <li key={job.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={e => {
                        onSelect(job);
                        onDragStart(e, job.id);
                      }}
                      onClick={() => onSelect(job)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(job);
                        }
                      }}
                      className={`w-full text-left px-3 py-2 cursor-grab active:cursor-grabbing hover:bg-zebra ${
                        selected ? 'bg-zebra' : ''
                      }`}
                      style={{ borderLeft: `3px solid ${JOB_STATUS_RAIL[job.status]}` }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold tracking-tight text-navy truncate">
                          {formatJobNumber(job.job_number)} · {job.title}
                        </p>
                        <OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>
                      </div>
                      <p className="ops-meta mt-0.5 truncate">
                        {[job.client_name, site, whenLabel(job)].filter(Boolean).join(' · ')}
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
