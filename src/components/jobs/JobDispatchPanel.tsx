import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { persistLivingJobOnBoundJhas } from '../../lib/persistLivingJobJha';
import { isDevFieldAuditAuth } from '../../lib/devFieldAuditAuth';
import { useToast } from '../ui';
import type { Job } from '../../types/crm';
import {
  bookingIntervalIssue,
  isMissingRelation,
  memberNameMap,
  normalizeClock,
  staffHoursFromRow,
} from '../../lib/booking';
import { decideDispatchWrite, evaluateDispatch, isSoftWriteGate } from '../../lib/dispatchResources';
import { loadDispatchPack, snapshotForJob } from '../../lib/loadDispatchSnapshot';
import { attachPlacementKey } from '../../lib/schedulePlacement';
import {
  DISPATCH_UNAVAILABLE,
  bookingDraftAfterRefresh,
  bookingFieldsForWrite,
  saveJobDispatch,
  skillRequirementsForWrite,
} from '../../lib/saveJobDispatch';
import type { DispatchRole, JobResourceRequirement } from '../../lib/dispatchResources';

function toTimeInput(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

async function siblingJobsOn(jobId: string, date: string | null) {
  if (!date) return [];
  const { data, error } = await supabase
    .from('jobs')
    .select('id, status, scheduled_date, start_time, end_time, assigned_team')
    .eq('scheduled_date', date)
    .neq('id', jobId);
  if (error) throw error;
  return data ?? [];
}

async function staffHoursOn(date: string | null) {
  if (!date) return [];
  const { data, error } = await supabase
    .from('staff_hours')
    .select('member_id, date, working, start_time, end_time, reason')
    .eq('date', date);
  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
  return (data ?? []).map(staffHoursFromRow);
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
    ? `/schedule?date=${job.scheduled_date}&view=day`
    : '/schedule';
  const names = memberNameMap(teamMembers);
  const [overrideReason, setOverrideReason] = useState('');
  const placementKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const [draftDate, setDraftDate] = useState(job.scheduled_date ?? '');
  const [draftStart, setDraftStart] = useState(toTimeInput(job.start_time));
  const [draftEnd, setDraftEnd] = useState(toTimeInput(job.end_time));
  const [draftCrew, setDraftCrew] = useState<string[]>(assigned);
  const [bookingConflict, setBookingConflict] = useState<string | null>(null);
  const bookingDirtyRef = useRef(false);

  const incomingDraft = {
    date: job.scheduled_date ?? '',
    start: toTimeInput(job.start_time),
    end: toTimeInput(job.end_time),
    crew: job.assigned_team ?? [],
  };
  const jobBookingKey = [
    job.id,
    job.updated_at,
    incomingDraft.date,
    incomingDraft.start,
    incomingDraft.end,
    incomingDraft.crew.join(','),
  ].join('|');

  useEffect(() => {
    const next = bookingDraftAfterRefresh(bookingDirtyRef.current, incomingDraft, {
      date: draftDate,
      start: draftStart,
      end: draftEnd,
      crew: draftCrew,
    });
    setDraftDate(next.draft.date);
    setDraftStart(next.draft.start);
    setDraftEnd(next.draft.end);
    setDraftCrew(next.draft.crew);
    setBookingConflict(next.conflict);
    // The draft values are the previous edit. The key is the saved job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobBookingKey]);

  const bookingDirty =
    (draftDate || '') !== (job.scheduled_date ?? '')
    || draftStart !== toTimeInput(job.start_time)
    || draftEnd !== toTimeInput(job.end_time)
    || draftCrew.join(',') !== assigned.join(',');
  bookingDirtyRef.current = bookingDirty;
  const intervalIssue = bookingIntervalIssue(normalizeClock(draftStart), normalizeClock(draftEnd));

  const { data: pack } = useQuery({
    queryKey: ['dispatch-pack', job.id],
    queryFn: () => loadDispatchPack([job.id]),
  });

  const availabilityDate = draftDate || null;
  const siblingsQuery = useQuery({
    queryKey: ['dispatch-siblings', job.id, availabilityDate],
    queryFn: async () => {
      if (!availabilityDate) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, status, scheduled_date, start_time, end_time, assigned_team')
        .eq('scheduled_date', availabilityDate)
        .neq('id', job.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!availabilityDate,
  });

  const hoursQuery = useQuery({
    queryKey: ['staff-hours', availabilityDate],
    queryFn: async () => {
      if (!availabilityDate) return [];
      const { data, error } = await supabase
        .from('staff_hours')
        .select('member_id, date, working, start_time, end_time, reason')
        .eq('date', availabilityDate);
      if (error) {
        if (isMissingRelation(error)) return [];
        throw error;
      }
      return (data ?? []).map(staffHoursFromRow);
    },
    enabled: !!availabilityDate,
  });
  const siblings = siblingsQuery.data ?? [];
  const hours = hoursQuery.data ?? [];
  const checkingAvailability = !!availabilityDate && (siblingsQuery.isPending || hoursQuery.isPending);

  const snapshot = useMemo(() => {
    if (!pack || pack.missing) return null;
    return snapshotForJob({
      job: {
        id: job.id,
        status: job.status,
        scheduled_date: draftDate || null,
        start_time: normalizeClock(draftStart),
        end_time: normalizeClock(draftEnd),
        assigned_team: draftCrew,
        dispatch_ready: job.dispatch_ready,
        required_crew_count: job.required_crew_count,
      },
      pack,
      siblings,
      hours,
      names,
    });
  }, [pack, job, siblings, hours, names, draftDate, draftStart, draftEnd, draftCrew]);

  const dispatchLocked = !pack || pack.missing || !snapshot;
  const conflicts = snapshot && !checkingAvailability ? evaluateDispatch(snapshot) : [];
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
        throw new Error(DISPATCH_UNAVAILABLE);
      }
      if (checkingAvailability && (patch.scheduled_date !== undefined ? (patch.scheduled_date || null) : (job.scheduled_date ?? null)) === (draftDate || null)) {
        throw new Error('Checking availability for that date.');
      }
      const booked = bookingFieldsForWrite({
        scheduled_date: job.scheduled_date ?? null,
        start_time: job.start_time ?? null,
        end_time: job.end_time ?? null,
        assigned_team: job.assigned_team ?? [],
      }, patch);
      const assignedTeam = booked.assigned_team;
      const nextJob = {
        ...snapshot.job,
        scheduled_date: booked.scheduled_date,
        start_time: booked.start_time,
        end_time: booked.end_time,
        assigned_team: assignedTeam,
      };
      const skills = skillRequirementsForWrite(
        snapshot.skillRequirements,
        patch.skillIds,
      );
      const sameDay = (booked.scheduled_date ?? null) === (draftDate || null);
      const writeSnapshot = sameDay
        ? { ...snapshot, job: nextJob, assignedTeam }
        : snapshotForJob({
          job: {
            id: job.id,
            status: job.status,
            scheduled_date: booked.scheduled_date,
            start_time: booked.start_time,
            end_time: booked.end_time,
            assigned_team: assignedTeam,
            dispatch_ready: job.dispatch_ready,
            required_crew_count: job.required_crew_count,
          },
          pack,
          siblings: await siblingJobsOn(job.id, booked.scheduled_date),
          hours: await staffHoursOn(booked.scheduled_date),
          names,
        });
      const keyed = attachPlacementKey(placementKeyRef.current, {
        jobId: job.id,
        expectedUpdatedAt: job.updated_at,
        assignedTeam,
        resourceIds: patch.resourceIds ?? snapshot.allocations.map(a => a.resourceId),
        skillRequirements: skills,
        resourceRequirements: patch.resourceRequirements ?? snapshot.resourceRequirements,
        requiredCrewCount: patch.required_crew_count ?? snapshot.requiredCrewCount,
        dispatchReady: patch.dispatch_ready ?? snapshot.dispatchReady,
        role,
        overrideReason,
        reschedule: patch.reschedule,
        snapshot: { ...writeSnapshot, job: nextJob, assignedTeam, skillRequirements: skills },
      });
      placementKeyRef.current = keyed.remembered;
      const result = await saveJobDispatch(keyed.input);
      if (!result.ok) throw new Error(result.message);
      if (assignedTeam !== job.assigned_team) {
        await persistLivingJobOnBoundJhas(job.id);
      }
      return result;
    },
    onSuccess: () => {
      bookingDirtyRef.current = false;
      setBookingConflict(null);
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
    setDraftCrew(current => current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId]);
  };

  const saveBooking = () => {
    if (intervalIssue) {
      showToast(intervalIssue);
      return;
    }
    persist.mutate({
      assigned_team: draftCrew,
      scheduled_date: draftDate || null,
      start_time: normalizeClock(draftStart),
      end_time: normalizeClock(draftEnd),
      reschedule: true,
    });
  };

  const resetBooking = () => {
    bookingDirtyRef.current = false;
    setDraftDate(job.scheduled_date ?? '');
    setDraftStart(toTimeInput(job.start_time));
    setDraftEnd(toTimeInput(job.end_time));
    setDraftCrew(job.assigned_team ?? []);
    setBookingConflict(null);
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
              value={draftDate}
              onChange={e => setDraftDate(e.target.value)}
              disabled={dispatchLocked}
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="ops-field-label">Start</span>
            <input
              type="time"
              value={draftStart}
              onChange={e => setDraftStart(e.target.value)}
              disabled={dispatchLocked}
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="ops-field-label">End</span>
            <input
              type="time"
              value={draftEnd}
              onChange={e => setDraftEnd(e.target.value)}
              disabled={dispatchLocked}
              className="form-input"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button
            type="button"
            className="ops-link min-h-11"
            disabled={dispatchLocked}
            onClick={() => { setDraftStart(''); setDraftEnd(''); }}
          >
            Clear times
          </button>
          {intervalIssue ? <p className="ops-meta text-[#B42318] mb-0">{intervalIssue}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            className="btn-primary"
            disabled={dispatchLocked || persist.isPending || !!intervalIssue || !bookingDirty || checkingAvailability}
            onClick={saveBooking}
          >
            Save booking
          </button>
          <button
            type="button"
            className="btn-secondary min-h-11"
            disabled={!bookingDirty || persist.isPending}
            onClick={resetBooking}
          >
            Cancel
          </button>
        </div>
        {checkingAvailability ? (
          <p className="ops-meta mb-3" role="status" data-testid="dispatch-availability">Checking availability for that date…</p>
        ) : null}
        {bookingConflict ? (
          <p className="ops-meta mb-3" role="status" data-testid="dispatch-booking-conflict">{bookingConflict}</p>
        ) : null}
        <p className="ops-meta mb-3">
          No date → Needs a date on the board. Dated but no crew → Unassigned. Dropping on a person adds them.
        </p>

        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="ops-field-label mb-0 flex items-center gap-1.5">
            <Users size={13} /> Crew
          </span>
          {draftCrew.length > 0 && (
            <button
              type="button"
              onClick={() => setDraftCrew([])}
              disabled={dispatchLocked}
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
              const selected = draftCrew.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleCrew(m.id)}
                  disabled={persist.isPending || dispatchLocked}
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
        {draftCrew.length === 0 && (
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
                disabled={dispatchLocked || checkingAvailability || persist.isPending}
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
                        disabled={checkingAvailability || persist.isPending}
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
                        disabled={checkingAvailability || persist.isPending}
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
                disabled={checkingAvailability || persist.isPending}
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
          <p className="ops-meta mt-3" role="status" data-testid="job-dispatch-unavailable">
            {DISPATCH_UNAVAILABLE} Date, time and crew on this tray stay read-only. Job details, status and notes still save as before.
          </p>
        )}
      </div>
    </div>
  );
}
