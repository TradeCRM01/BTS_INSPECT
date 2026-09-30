import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { persistLivingJobOnBoundJhas } from '../../lib/persistLivingJobJha';
import { isDevFieldAuditAuth } from '../../lib/devFieldAuditAuth';
import {
  dispatchDraftFromJob,
  reconcileDispatchDraft,
} from '../../lib/dispatchDraft';
import { useToast } from '../ui';
import type { Job } from '../../types/crm';
import { bookingIntervalIssue } from '../../lib/booking';

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
  const live = dispatchDraftFromJob({
    scheduled_date: job.scheduled_date ?? '',
    start_time: job.start_time,
    end_time: job.end_time,
    assigned_team: job.assigned_team,
  });
  const [jobId, setJobId] = useState(job.id);
  const [baseline, setBaseline] = useState(live);
  const [date, setDate] = useState(live.date);
  const [start, setStart] = useState(live.start);
  const [end, setEnd] = useState(live.end);
  const [team, setTeam] = useState<string[]>(live.team);
  const [conflict, setConflict] = useState(false);
  const issue = bookingIntervalIssue(start || null, end || null);
  const dirty = date !== baseline.date
    || start !== baseline.start
    || end !== baseline.end
    || team.join() !== baseline.team.join();
  const scheduleHref = date ? `/schedule?date=${date}` : '/schedule';

  useEffect(() => {
    const nextLive = dispatchDraftFromJob(job);
    const next = reconcileDispatchDraft({
      jobId: job.id,
      prevJobId: jobId,
      live: nextLive,
      prevLive: baseline,
      draft: { date, start, end, team },
    });
    setJobId(job.id);
    setBaseline(next.baseline);
    setDate(next.draft.date);
    setStart(next.draft.start);
    setEnd(next.draft.end);
    setTeam(next.draft.team);
    setConflict(next.conflict);
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setBaseline({ date, start, end, team: [...team] });
      setConflict(false);
      showToast('Booking saved');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const reset = () => {
    setDate(baseline.date);
    setStart(baseline.start);
    setEnd(baseline.end);
    setTeam([...baseline.team]);
    setConflict(false);
  };

  const loadLatest = () => {
    const nextLive = dispatchDraftFromJob(job);
    setBaseline(nextLive);
    setDate(nextLive.date);
    setStart(nextLive.start);
    setEnd(nextLive.end);
    setTeam(nextLive.team);
    setConflict(false);
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
        {conflict && (
          <p className="job-reschedule-banner" role="status">
            This booking changed elsewhere.{' '}
            <button type="button" className="ops-link" onClick={loadLatest}>Load latest</button>
          </p>
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
