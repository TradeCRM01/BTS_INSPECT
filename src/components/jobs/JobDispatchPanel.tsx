import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { persistLivingJobOnBoundJhas } from '../../lib/persistLivingJobJha';
import { isDevFieldAuditAuth } from '../../lib/devFieldAuditAuth';
import { useToast } from '../ui';
import type { Job } from '../../types/crm';
import { bookingIntervalIssue } from '../../lib/booking';

function toTimeInput(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

export function JobDispatchPanel({
  job,
  teamMembers,
  rescheduleBanner = null,
}: {
  job: Job;
  teamMembers: { id: string; name: string }[];
  rescheduleBanner?: string | null;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [date, setDate] = useState(job.scheduled_date ?? '');
  const [start, setStart] = useState(toTimeInput(job.start_time));
  const [end, setEnd] = useState(toTimeInput(job.end_time));
  const [team, setTeam] = useState<string[]>(job.assigned_team ?? []);
  const issue = bookingIntervalIssue(start || null, end || null);
  const dirty = date !== (job.scheduled_date ?? '')
    || start !== toTimeInput(job.start_time)
    || end !== toTimeInput(job.end_time)
    || team.join() !== (job.assigned_team ?? []).join();
  const scheduleHref = date ? `/schedule?date=${date}` : '/schedule';

  const save = useMutation({
    mutationFn: async () => {
      if (isDevFieldAuditAuth()) return;
      const patch = {
        scheduled_date: date || null,
        start_time: start || null,
        end_time: end || null,
        assigned_team: team,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('jobs').update(patch).eq('id', job.id);
      if (error) throw error;
      await persistLivingJobOnBoundJhas(job.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      showToast('Booking saved');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const reset = () => {
    setDate(job.scheduled_date ?? '');
    setStart(toTimeInput(job.start_time));
    setEnd(toTimeInput(job.end_time));
    setTeam(job.assigned_team ?? []);
  };

  return (
    <div className="ops-tray mb-5">
      <div className="ops-tray-head">
        <h2 className="ops-section-title flex items-center gap-1.5">
          <Calendar size={14} /> Schedule & crew
        </h2>
        <Link to={scheduleHref} className="ops-link">
          View on board
        </Link>
      </div>

      <div className="px-3 pb-3 pt-2">
        {rescheduleBanner && (
          <p className="job-reschedule-banner" role="status">{rescheduleBanner}</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <label className="block">
            <span className="ops-field-label">Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
          </label>
          <label className="block">
            <span className="ops-field-label">Start</span>
            <input type="time" value={start} onChange={e => setStart(e.target.value)} className="form-input" />
          </label>
          <label className="block">
            <span className="ops-field-label">End</span>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="form-input" />
          </label>
        </div>
        {issue && <p className="ops-meta text-[#B42318] mb-3">{issue}</p>}
        <p className="ops-meta mb-3">
          No date → Needs a date on the board. Dated but no crew → Unassigned. Time not set stays empty until you save clocks.
        </p>

        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="ops-field-label mb-0 flex items-center gap-1.5">
            <Users size={13} /> Crew
          </span>
          {team.length > 0 && (
            <button type="button" onClick={() => setTeam([])} className="ops-link text-xs">
              Clear crew
            </button>
          )}
        </div>
        {teamMembers.length === 0 ? (
          <p className="ops-meta">No team members to assign</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {teamMembers.map(m => {
              const selected = team.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTeam(prev => prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id])}
                  className={`px-2.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-navy text-white'
                      : 'bg-zebra text-muted border border-rule hover:text-navy'
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </div>
        )}
        {team.length === 0 && (
          <p className="ops-meta mt-2">Unassigned — still on the board when a date is set.</p>
        )}
        {dirty && (
          <div className="flex gap-2 mt-4">
            <button type="button" className="btn-secondary min-h-[44px]" onClick={reset}>Cancel</button>
            <button
              type="button"
              className="btn-primary min-h-[44px]"
              disabled={!!issue || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : 'Save booking'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
