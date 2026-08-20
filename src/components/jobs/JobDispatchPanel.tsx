import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui';
import type { Job } from '../../types/crm';

function toTimeInput(t: string | null | undefined): string {
  return (t ?? '').slice(0, 5);
}

export function JobDispatchPanel({
  job,
  teamMembers,
}: {
  job: Job;
  teamMembers: { id: string; name: string }[];
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const assigned = job.assigned_team ?? [];
  const scheduleHref = job.scheduled_date
    ? `/schedule?date=${job.scheduled_date}`
    : '/schedule';

  const save = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from('jobs')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', job.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', job.id] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
    },
    onError: (e: Error) => showToast(e.message),
  });

  const toggleCrew = (memberId: string) => {
    const next = assigned.includes(memberId)
      ? assigned.filter(id => id !== memberId)
      : [...assigned, memberId];
    save.mutate({ assigned_team: next });
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide flex items-center gap-1.5">
          <Calendar size={14} className="text-[#0A2540]" /> Schedule & crew
        </h2>
        <Link to={scheduleHref} className="text-sm text-[#2E75B6] hover:underline">
          View on board
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <label className="block">
          <span className="text-xs font-medium text-[#4A5568] mb-1 block">Date</span>
          <input
            type="date"
            value={job.scheduled_date ?? ''}
            onChange={e => save.mutate({ scheduled_date: e.target.value || null })}
            className="form-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[#4A5568] mb-1 block">Start</span>
          <input
            type="time"
            value={toTimeInput(job.start_time)}
            onChange={e => save.mutate({ start_time: e.target.value || null })}
            className="form-input"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-[#4A5568] mb-1 block">End</span>
          <input
            type="time"
            value={toTimeInput(job.end_time)}
            onChange={e => save.mutate({ end_time: e.target.value || null })}
            className="form-input"
          />
        </label>
      </div>
      <p className="text-xs text-[#9CA3AF] mb-4 flex items-center gap-1">
        <Clock size={11} /> Changing crew here does not clear the scheduled date. Unassign with the chips or Clear crew.
      </p>

      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-[#4A5568] flex items-center gap-1.5">
          <Users size={13} /> Crew
        </span>
        {assigned.length > 0 && (
          <button
            type="button"
            onClick={() => save.mutate({ assigned_team: [] })}
            className="text-xs text-[#2E75B6] hover:underline"
          >
            Clear crew
          </button>
        )}
      </div>
      {teamMembers.length === 0 ? (
        <p className="text-sm text-[#9CA3AF]">No team members to assign</p>
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
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-50 ${
                  selected
                    ? 'bg-[#0A2540] text-white'
                    : 'bg-gray-100 text-[#4A5568] hover:bg-gray-200'
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      )}
      {assigned.length === 0 && (
        <p className="text-xs text-[#9CA3AF] mt-2">Unassigned — still on the board if a date is set.</p>
      )}
    </div>
  );
}
