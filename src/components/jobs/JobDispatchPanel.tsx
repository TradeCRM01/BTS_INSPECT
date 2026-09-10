import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { persistLivingJobOnBoundJhas } from '../../lib/persistLivingJobJha';
import { isDevFieldAuditAuth } from '../../lib/devFieldAuditAuth';
import { useToast } from '../ui';
import type { Job } from '../../types/crm';
import {
  bookingWarnings,
  isMissingRelation,
  memberNameMap,
  staffHoursFromRow,
  type BookedJob,
} from '../../lib/booking';
import { BookingWarningBanner } from './BookingWarningBanner';

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
  const [pending, setPending] = useState<{ patch: Record<string, unknown>; warnings: string[] } | null>(null);
  const assigned = job.assigned_team ?? [];
  const scheduleHref = job.scheduled_date
    ? `/schedule?date=${job.scheduled_date}`
    : '/schedule';

  const names = memberNameMap(teamMembers);

  const save = useMutation({
    mutationFn: async ({ patch, acknowledged = false }: { patch: Record<string, unknown>; acknowledged?: boolean }) => {
      if (isDevFieldAuditAuth()) return;
      const nextDate = ('scheduled_date' in patch
        ? (patch.scheduled_date as string | null)
        : job.scheduled_date) ?? null;
      if (nextDate && ('scheduled_date' in patch || 'start_time' in patch || 'end_time' in patch || 'assigned_team' in patch)) {
        const proposed: BookedJob = {
          id: job.id,
          job_number: job.job_number,
          title: job.title,
          status: job.status,
          scheduled_date: nextDate,
          start_time: ('start_time' in patch ? patch.start_time as string | null : job.start_time),
          end_time: ('end_time' in patch ? patch.end_time as string | null : job.end_time),
          assigned_team: ('assigned_team' in patch ? patch.assigned_team as string[] : job.assigned_team),
        };
        const [{ data: siblings }, hoursRes] = await Promise.all([
          supabase
            .from('jobs')
            .select('id, job_number, title, status, scheduled_date, start_time, end_time, assigned_team')
            .eq('scheduled_date', nextDate)
            .neq('id', job.id),
          supabase
            .from('staff_hours')
            .select('member_id, date, working, start_time, end_time, reason')
            .eq('date', nextDate),
        ]);
        const hours = isMissingRelation(hoursRes.error) ? [] : (hoursRes.data ?? []).map(staffHoursFromRow);
        const warnings = bookingWarnings(proposed, (siblings ?? []) as BookedJob[], names, hours);
        if (warnings.length > 0 && !acknowledged) {
          setPending({ patch, warnings });
          return;
        }
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
    onError: (e: Error) => {
      showToast(e.message);
    },
  });

  const requestSave = (patch: Record<string, unknown>, acknowledged = false) => {
    setPending(null);
    save.mutate({ patch, acknowledged });
  };

  const toggleCrew = (memberId: string) => {
    const next = assigned.includes(memberId)
      ? assigned.filter(id => id !== memberId)
      : [...assigned, memberId];
    requestSave({ assigned_team: next });
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
        {pending && (
          <BookingWarningBanner
            warnings={pending.warnings}
            onBookAnyway={() => requestSave(pending.patch, true)}
            onDismiss={() => setPending(null)}
          />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <label className="block">
            <span className="ops-field-label">Date</span>
            <input
              type="date"
              value={job.scheduled_date ?? ''}
              onChange={e => requestSave({ scheduled_date: e.target.value || null })}
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="ops-field-label">Start</span>
            <input
              type="time"
              value={toTimeInput(job.start_time)}
              onChange={e => requestSave({ start_time: e.target.value || null })}
              className="form-input"
            />
          </label>
          <label className="block">
            <span className="ops-field-label">End</span>
            <input
              type="time"
              value={toTimeInput(job.end_time)}
              onChange={e => requestSave({ end_time: e.target.value || null })}
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
              onClick={() => requestSave({ assigned_team: [] })}
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
                  disabled={save.isPending}
                  className={`px-2.5 py-1.5 min-h-[44px] sm:min-h-0 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
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
      </div>
    </div>
  );
}
