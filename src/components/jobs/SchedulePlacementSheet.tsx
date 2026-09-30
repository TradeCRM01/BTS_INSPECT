import { useState } from 'react';
import { AppDialog } from '../ui/AppDialog';
import { bookingIntervalIssue } from '../../lib/booking';
import { TIME_NOT_SET_LABEL } from '../../lib/scheduleBoard';

export type PlacementDraft = {
  jobId: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  assigned_team: string[];
};

export function SchedulePlacementSheet({
  draft,
  crew,
  saving,
  onCancel,
  onSave,
}: {
  draft: PlacementDraft;
  crew: { id: string; name: string }[];
  saving?: boolean;
  onCancel: () => void;
  onSave: (next: PlacementDraft) => void;
}) {
  const [date, setDate] = useState(draft.scheduled_date);
  const [start, setStart] = useState((draft.start_time ?? '').slice(0, 5));
  const [end, setEnd] = useState((draft.end_time ?? '').slice(0, 5));
  const [team, setTeam] = useState<string[]>(draft.assigned_team);
  const issue = bookingIntervalIssue(start || null, end || null);

  const toggle = (id: string) => {
    setTeam(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  return (
    <AppDialog
      open
      onClose={onCancel}
      title="Place job"
      panelClassName="overlay-panel-md animate-slide-up"
    >
      <div className="px-5 py-4 border-b border-[#E2D9CC]">
        <h2 className="text-base font-semibold text-[#0A2540]">Place {draft.title || 'job'}</h2>
        <p className="text-sm text-[#5B6B7C] mt-1">
          {date || 'No date'} · {start && end ? `${start} – ${end}` : TIME_NOT_SET_LABEL}
        </p>
      </div>
      <div className="p-5 space-y-3">
        <label className="block">
          <span className="ops-field-label">Date</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="ops-field-label">Start</span>
            <input type="time" value={start} onChange={e => setStart(e.target.value)} className="form-input" />
          </label>
          <label className="block">
            <span className="ops-field-label">End</span>
            <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="form-input" />
          </label>
        </div>
        <div className="flex gap-3">
          <button type="button" className="ops-link text-sm" onClick={() => { setStart(''); setEnd(''); }}>
            Clear times
          </button>
          <button type="button" className="ops-link text-sm" onClick={() => setTeam([])}>
            Clear crew
          </button>
        </div>
        {issue && <p className="text-sm text-[#B42318]">{issue}</p>}
        <div>
          <span className="ops-field-label">Crew</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {crew.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className={`px-2.5 min-h-[44px] rounded-md text-xs font-medium ${
                  team.includes(m.id) ? 'bg-navy text-white' : 'bg-zebra text-muted border border-rule'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-5 py-4 border-t border-[#E2D9CC] flex justify-end gap-2">
        <button type="button" className="btn-secondary min-h-[44px]" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn-primary min-h-[44px]"
          disabled={!!issue || !date || saving}
          onClick={() => onSave({
            ...draft,
            scheduled_date: date,
            start_time: start,
            end_time: end,
            assigned_team: team,
          })}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </AppDialog>
  );
}
