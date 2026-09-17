import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { persistLivingJobOnBoundJhas } from '../../lib/persistLivingJobJha';
import { isDevFieldAuditAuth } from '../../lib/devFieldAuditAuth';
import { useToast } from '../ui';
import type { Job } from '../../types/crm';
import {
  isMissingRelation,
  memberNameMap,
  staffHoursFromRow,
} from '../../lib/booking';
import { decideDispatchWrite, evaluateDispatch, isSoftWriteGate, newIdempotencyKey } from '../../lib/dispatchResources';
import { loadDispatchPack, snapshotForJob } from '../../lib/loadDispatchSnapshot';
import { saveJobDispatch } from '../../lib/saveJobDispatch';
import type { DispatchRole, JobResourceRequirement } from '../../lib/dispatchResources';

function toTimeInput(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

export function JobDispatchPanel({
  job,
  teamMembers,
  role,
  rescheduleBanner = null,
}: {
  job: Job;
  teamMembers: { id: string; name: string }[];
  role: DispatchRole;
  rescheduleBanner?: string | null;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const assigned = job.assigned_team ?? [];
  const scheduleHref = job.scheduled_date
    ? `/schedule?date=${job.scheduled_date}`
    : '/schedule';
  const names = memberNameMap(teamMembers);
  const [overrideReason, setOverrideReason] = useState('');
  const [pendingKey, setPendingKey] = useState(() => newIdempotencyKey());

  const { data: pack } = useQuery({
    queryKey: ['dispatch-pack', job.id],
    queryFn: () => loadDispatchPack([job.id]),
  });

  const { data: siblings = [] } = useQuery({
    queryKey: ['dispatch-siblings', job.scheduled_date],
    queryFn: async () => {
      if (!job.scheduled_date) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, status, scheduled_date, start_time, end_time, assigned_team')
        .eq('scheduled_date', job.scheduled_date)
        .neq('id', job.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!job.scheduled_date,
  });

  const { data: hours = [] } = useQuery({
    queryKey: ['staff-hours', job.scheduled_date],
    queryFn: async () => {
      if (!job.scheduled_date) return [];
      const { data, error } = await supabase
        .from('staff_hours')
        .select('member_id, date, working, start_time, end_time, reason')
        .eq('date', job.scheduled_date);
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return (data ?? []).map(staffHoursFromRow);
    },
    enabled: !!job.scheduled_date,
  });

  const snapshot = useMemo(() => {
    if (!pack || pack.missing) return null;
    return snapshotForJob({
      job: {
        id: job.id,
        status: job.status,
        scheduled_date: job.scheduled_date,
        start_time: job.start_time,
        end_time: job.end_time,
        assigned_team: job.assigned_team,
        dispatch_ready: job.dispatch_ready,
        required_crew_count: job.required_crew_count,
      },
      pack,
      siblings,
      hours,
      names,
    });
  }, [pack, job, siblings, hours, names]);

  const conflicts = snapshot ? evaluateDispatch(snapshot) : [];
  const writePreview = snapshot
    ? decideDispatchWrite({ role, conflicts, overrideReason })
    : { ok: true, blocker: null, overridden: false as const };

  const persist = useMutation({
    mutationFn: async (patch: {
      assigned_team?: string[];
      scheduled_date?: string | null;
      start_time?: string | null;
      end_time?: string | null;
      dispatch_ready?: boolean;
      required_crew_count?: number;
      skillIds?: string[];
      resourceIds?: string[];
      resourceRequirements?: JobResourceRequirement[];
      reschedule?: boolean;
    }) => {
      if (isDevFieldAuditAuth()) return;
      if (!snapshot || !pack || pack.missing) {
        const { error } = await supabase
          .from('jobs')
          .update({
            assigned_team: patch.assigned_team ?? job.assigned_team,
            scheduled_date: patch.scheduled_date === undefined ? job.scheduled_date : patch.scheduled_date,
            start_time: patch.start_time === undefined ? job.start_time : patch.start_time,
            end_time: patch.end_time === undefined ? job.end_time : patch.end_time,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        if (error) throw error;
        return;
      }
      const assignedTeam = patch.assigned_team ?? job.assigned_team ?? [];
      const nextJob = {
        ...snapshot.job,
        scheduled_date: patch.scheduled_date === undefined ? job.scheduled_date : patch.scheduled_date,
        start_time: patch.start_time === undefined ? job.start_time : patch.start_time,
        end_time: patch.end_time === undefined ? job.end_time : patch.end_time,
        assigned_team: assignedTeam,
      };
      const result = await saveJobDispatch({
        jobId: job.id,
        expectedUpdatedAt: job.updated_at,
        assignedTeam,
        resourceIds: patch.resourceIds ?? snapshot.allocations.map(a => a.resourceId),
        skillRequirements: (patch.skillIds ?? snapshot.skillRequirements.map(s => s.skillId))
          .map(skillId => ({ skillId })),
        resourceRequirements: patch.resourceRequirements ?? snapshot.resourceRequirements,
        requiredCrewCount: patch.required_crew_count ?? snapshot.requiredCrewCount,
        dispatchReady: patch.dispatch_ready ?? snapshot.dispatchReady,
        role,
        overrideReason,
        reschedule: patch.reschedule,
        idempotencyKey: pendingKey,
        snapshot: { ...snapshot, job: nextJob, assignedTeam },
      });
      if (!result.ok) throw new Error(result.message);
      if (assignedTeam !== job.assigned_team) {
        await persistLivingJobOnBoundJhas(job.id);
      }
    },
    onSuccess: () => {
      setPendingKey(newIdempotencyKey());
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-pack'] });
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

  const toggleCrew = (memberId: string) => {
    const next = assigned.includes(memberId)
      ? assigned.filter(id => id !== memberId)
      : [...assigned, memberId];
    persist.mutate({ assigned_team: next });
  };

  const toggleSkill = (skillId: string) => {
    if (!snapshot) return;
    const current = snapshot.skillRequirements.map(s => s.skillId);
    const next = current.includes(skillId)
      ? current.filter(id => id !== skillId)
      : [...current, skillId];
    persist.mutate({ skillIds: next });
  };

  const toggleResource = (resourceId: string) => {
    if (!snapshot) return;
    const current = snapshot.allocations.map(a => a.resourceId);
    const next = current.includes(resourceId)
      ? current.filter(id => id !== resourceId)
      : [...current, resourceId];
    const reqs = current.includes(resourceId)
      ? snapshot.resourceRequirements.filter(r => r.resourceId !== resourceId)
      : snapshot.resourceRequirements.some(r => r.resourceId === resourceId)
        ? snapshot.resourceRequirements
        : [...snapshot.resourceRequirements, { resourceId, quantity: 1 }];
    persist.mutate({
      resourceIds: next,
      skillIds: snapshot.skillRequirements.map(s => s.skillId),
      resourceRequirements: reqs,
    });
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
        {job.last_dispatch_override_at && (
          <p className="job-reschedule-banner" role="status">
            Override recorded{job.last_dispatch_override_reason ? ` — ${job.last_dispatch_override_reason}` : ''}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <label className="block">
            <span className="ops-field-label">Date</span>
            <input
              type="date"
              value={job.scheduled_date ?? ''}
              onChange={e => persist.mutate({ scheduled_date: e.target.value || null, reschedule: true })}
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="ops-field-label">Start</span>
            <input
              type="time"
              value={toTimeInput(job.start_time)}
              onChange={e => persist.mutate({ start_time: e.target.value || null, reschedule: true })}
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="ops-field-label">End</span>
            <input
              type="time"
              value={toTimeInput(job.end_time)}
              onChange={e => persist.mutate({ end_time: e.target.value || null, reschedule: true })}
              className="form-input"
            />
          </label>
        </div>
        <p className="ops-meta mb-3">
          No date → Needs a date on the board. Dated but no crew → Unassigned. Dropping on a person adds them.
        </p>

        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="ops-field-label mb-0 flex items-center gap-1.5">
            <Users size={13} /> Crew
          </span>
          {assigned.length > 0 && (
            <button
              type="button"
              onClick={() => persist.mutate({ assigned_team: [] })}
              className="ops-link text-xs min-h-11 sm:min-h-0"
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
                  disabled={persist.isPending}
                  className={`job-crew-chip px-2.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
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
        {assigned.length === 0 && (
          <p className="ops-meta mt-2">Unassigned — still on the board when a date is set.</p>
        )}
        <p className="ops-meta mt-2" role="status" data-testid="job-dispatch-save-status">
          {persist.isPending
            ? 'Saving assignment…'
            : persist.isError
              ? persist.error?.message || 'Could not save assignment. Retry.'
              : persist.isSuccess
                ? 'Assignment saved.'
                : ''}
        </p>

        {pack && !pack.missing && snapshot ? (
          <div className="mt-4 pt-3 border-t border-rule">
            <p className="ops-field-label">Requirements</p>
            <label className="block mt-2 max-w-[12rem]">
              <span className="ops-meta">Crew needed</span>
              <input
                type="number"
                min={0}
                className="form-input"
                value={job.required_crew_count ?? 0}
                onChange={e => persist.mutate({ required_crew_count: Number(e.target.value) || 0 })}
              />
            </label>
            {pack.skills.length > 0 && (
              <div className="mt-2">
                <p className="ops-meta mb-1">Tickets</p>
                <div className="flex flex-wrap gap-1.5">
                  {pack.skills.map(skill => {
                    const on = snapshot.skillRequirements.some(s => s.skillId === skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        className={`px-2.5 min-h-11 rounded-md text-xs ${on ? 'bg-navy text-white' : 'bg-zebra border border-rule'}`}
                        onClick={() => toggleSkill(skill.id)}
                      >
                        {skill.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {pack.resources.length > 0 && (
              <div className="mt-2">
                <p className="ops-meta mb-1">Equipment / vehicles</p>
                <div className="flex flex-wrap gap-1.5">
                  {pack.resources.map(res => {
                    const on = snapshot.allocations.some(a => a.resourceId === res.id);
                    return (
                      <button
                        key={res.id}
                        type="button"
                        className={`px-2.5 min-h-11 rounded-md text-xs ${on ? 'bg-navy text-white' : 'bg-zebra border border-rule'}`}
                        onClick={() => toggleResource(res.id)}
                      >
                        {res.name}{res.status === 'out_of_service' ? ' (out)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 mt-3 min-h-11">
              <input
                type="checkbox"
                checked={!!job.dispatch_ready}
                onChange={e => persist.mutate({ dispatch_ready: e.target.checked })}
              />
              <span className="text-sm">Ready for dispatch</span>
            </label>
            {conflicts.filter(c => c.severity === 'hard').map(c => (
              <p key={c.kind + c.message} className="ops-meta mt-1 text-[#B42318]">{c.message}</p>
            ))}
            {conflicts.filter(c => c.severity === 'soft').slice(0, 2).map(c => (
              <p key={c.kind + c.message} className="ops-meta mt-1">{c.message}</p>
            ))}
            {role === 'admin' && conflicts.some(isSoftWriteGate) && (
              <label className="block mt-2">
                <span className="ops-field-label">Override reason</span>
                <input
                  className="form-input"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="Required for an admin override"
                />
              </label>
            )}
            {writePreview.blocker === 'member_hard' && (
              <p className="ops-meta mt-1">A member can only save a compatible assignment.</p>
            )}
          </div>
        ) : (
          <p className="ops-meta mt-3">Dispatch requirements are local-only until the sandbox schema is applied.</p>
        )}
      </div>
    </div>
  );
}
