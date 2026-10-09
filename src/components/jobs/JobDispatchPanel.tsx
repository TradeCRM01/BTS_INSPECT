import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TimeFieldInput } from '../ui/TimeFieldInput';
import { isValidCompleteTimeValue } from '../../lib/timeFieldInput';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { persistLivingJobOnBoundJhas } from '../../lib/persistLivingJobJha';
import { isDevFieldAuditAuth } from '../../lib/devFieldAuditAuth';
import { crewAssignmentHelper, nextAssignedTeam } from '../../lib/jobDispatchCrew';
import { useToast } from '../ui';
import type { Job } from '../../types/crm';

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
  const serverTeamKey = (job.assigned_team ?? []).join(',');
  const [crewDraft, setCrewDraft] = useState<string[]>(() => job.assigned_team ?? []);
  const assigned = crewDraft;
  const scheduleHref = job.scheduled_date
    ? `/schedule?date=${job.scheduled_date}`
    : '/schedule';

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (isDevFieldAuditAuth()) {
        queryClient.setQueryData<Job>(['job', job.id], old => (old ? { ...old, ...patch } as Job : old));
        return;
      }
      const { error } = await supabase
        .from('jobs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      if (error) throw error;
      if ('assigned_team' in patch || 'address' in patch) {
        await persistLivingJobOnBoundJhas(job.id);
      }
    },
    onSuccess: () => {
      if (isDevFieldAuditAuth()) return;
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      queryClient.invalidateQueries({ queryKey: ['job-jhas', job.id] });
      queryClient.invalidateQueries({ queryKey: ['job-take5s', job.id] });
      queryClient.invalidateQueries({ queryKey: ['job-inspections', job.id] });
      queryClient.invalidateQueries({ queryKey: ['inspections'] });
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      queryClient.invalidateQueries({ queryKey: ['jha-take5-all'] });
      queryClient.invalidateQueries({ queryKey: ['jha-take5-list'] });
    },
    onError: (e: Error) => showToast(e.message),
  });

  useEffect(() => {
    setCrewDraft(job.assigned_team ?? []);
  }, [job.id]);

  useEffect(() => {
    if (save.isPending) return;
    setCrewDraft(job.assigned_team ?? []);
  }, [serverTeamKey, save.isPending, job.assigned_team]);

  const persistCrew = (next: string[], rollback: string[]) => {
    setCrewDraft(next);
    save.mutate({ assigned_team: next }, {
      onError: () => setCrewDraft(rollback),
    });
  };

  const toggleCrew = (memberId: string) => {
    const rollback = crewDraft;
    persistCrew(nextAssignedTeam(crewDraft, memberId), rollback);
  };

  const crewHelper = crewAssignmentHelper(assigned, teamMembers);
  const [startDraft, setStartDraft] = useState(() => toTimeInput(job.start_time));
  const [endDraft, setEndDraft] = useState(() => toTimeInput(job.end_time));

  useEffect(() => {
    setStartDraft(toTimeInput(job.start_time));
    setEndDraft(toTimeInput(job.end_time));
  }, [job.id, job.start_time, job.end_time]);

  const commitJobTime = (field: 'start_time' | 'end_time', raw: string) => {
    const server = field === 'start_time' ? toTimeInput(job.start_time) : toTimeInput(job.end_time);
    if (raw === server) return;
    if (raw && !isValidCompleteTimeValue(raw)) {
      if (field === 'start_time') setStartDraft(server);
      else setEndDraft(server);
      return;
    }
    if (import.meta.env.DEV) {
      try {
        const w = window as Window & { __fix5aDispatchTimeSaves?: number };
        w.__fix5aDispatchTimeSaves = (w.__fix5aDispatchTimeSaves ?? 0) + 1;
      } catch {
        // ignore
      }
    }
    save.mutate({ [field]: raw || null });
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
            <input
              type="date"
              value={job.scheduled_date ?? ''}
              onChange={e => save.mutate({ scheduled_date: e.target.value || null })}
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="ops-field-label">Start</span>
            <TimeFieldInput
              value={startDraft}
              onChange={setStartDraft}
              onBlurCommit={v => commitJobTime('start_time', v)}
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="ops-field-label">End</span>
            <TimeFieldInput
              value={endDraft}
              onChange={setEndDraft}
              onBlurCommit={v => commitJobTime('end_time', v)}
              className="form-input"
            />
          </label>
        </div>
        <p className="ops-meta mb-3">
          Set a date to book this job on the board. Tap a name below to assign crew.
        </p>

        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="ops-field-label mb-0 flex items-center gap-1.5">
            <Users size={13} /> Crew
          </span>
          {assigned.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const rollback = crewDraft;
                persistCrew([], rollback);
              }}
              className="ops-link text-xs"
            >
              Clear crew
            </button>
          )}
        </div>
        {teamMembers.length === 0 ? (
          <p className="ops-meta">No team members to assign</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {teamMembers.map(m => {
              const selected = assigned.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleCrew(m.id)}
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
        <p className="ops-meta mt-2" data-crew-assignment-helper="1">{crewHelper}</p>
      </div>
    </div>
  );
}
