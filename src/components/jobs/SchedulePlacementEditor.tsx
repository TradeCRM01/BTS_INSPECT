import { useEffect, useMemo, useRef, useState } from 'react';
import type { DispatchConflict } from '../../lib/dispatchResources';
import { bookingIntervalIssue, normalizeClock } from '../../lib/booking';
import type { PlacementDraft, PlacementSummary } from '../../lib/schedulePlacement';

export function SchedulePlacementEditor({
  summary,
  crew,
  draft,
  conflicts = [],
  statusMessage = null,
  saving = false,
  reasonRequired = false,
  blocked = false,
  nextAction = null,
  onCancel,
  onChange,
  onSave,
}: {
  summary: PlacementSummary;
  crew: { id: string; name: string }[];
  draft: PlacementDraft;
  conflicts?: DispatchConflict[];
  statusMessage?: string | null;
  saving?: boolean;
  reasonRequired?: boolean;
  blocked?: boolean;
  nextAction?: string | null;
  onCancel: () => void;
  onChange: (next: PlacementDraft) => void;
  onSave: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const start = (draft.startTime ?? '').slice(0, 5);
  const end = (draft.endTime ?? '').slice(0, 5);
  const intervalIssue = bookingIntervalIssue(normalizeClock(start), normalizeClock(end || null));
  const warnings = conflicts.filter(c => c.severity === 'soft' || c.overridable);
  const canSave = !blocked && !intervalIssue && (!reasonRequired || !!reason.trim());

  useEffect(() => {
    const root = dialogRef.current;
    const first = root?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const crewLabel = useMemo(() => {
    if (!draft.employeeId) return 'Unassigned';
    return crew.find(m => m.id === draft.employeeId)?.name ?? 'Crew';
  }, [crew, draft.employeeId]);

  return (
    <div className="dc-place-dialog-back" role="presentation" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="dc-place-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-place-title"
        onMouseDown={e => e.stopPropagation()}
      >
        <h2 id="schedule-place-title" className="ops-page-title text-xl">Place job</h2>
        <p className="ops-meta mt-2">{summary.jobLabel}</p>
        {summary.movingExisting && summary.previousWhen ? (
          <p className="ops-meta mt-1">Moves the existing booking from {summary.previousWhen}. Same job, no duplicate.</p>
        ) : null}
        <p className="ops-meta mt-1" role="status">
          {draft.date} · {start && end ? `${start}–${end}` : start || 'untimed'} · {crewLabel}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <label className="block">
            <span className="ops-field-label">Date</span>
            <input
              type="date"
              className="form-input"
              value={draft.date}
              onChange={e => onChange({ ...draft, date: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="ops-field-label">Crew</span>
            <select
              className="form-input"
              value={draft.employeeId ?? ''}
              onChange={e => onChange({ ...draft, employeeId: e.target.value || null })}
            >
              <option value="">Unassigned</option>
              {crew.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="ops-field-label">Start</span>
            <input
              type="time"
              className="form-input"
              value={start}
              onChange={e => onChange({
                ...draft,
                startTime: normalizeClock(e.target.value),
                endTime: e.target.value ? draft.endTime : null,
              })}
            />
          </label>
          <label className="block">
            <span className="ops-field-label">End</span>
            <input
              type="time"
              className="form-input"
              value={end}
              onChange={e => onChange({ ...draft, endTime: normalizeClock(e.target.value) })}
            />
          </label>
        </div>
        <button
          type="button"
          className="ops-link mt-2 min-h-11"
          onClick={() => onChange({ ...draft, startTime: null, endTime: null })}
        >
          Clear times
        </button>
        {intervalIssue ? <p className="ops-meta mt-2 text-[#B42318]">{intervalIssue}</p> : null}

        {warnings.length > 0 ? (
          <ul className="dc-place-warnings">
            {warnings.map(c => (
              <li key={`${c.kind}:${c.message}`}>{c.message}</li>
            ))}
          </ul>
        ) : null}
        {blocked && nextAction ? <p className="ops-meta mt-2">{nextAction}</p> : null}
        {statusMessage ? <p className="ops-meta mt-2" role="status">{statusMessage}</p> : null}

        {reasonRequired ? (
          <label className="block mt-3">
            <span className="ops-field-label">Reason (required)</span>
            <textarea
              className="mt-1 w-full min-h-[88px] rounded-md border border-rule px-3 py-2"
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            />
          </label>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button type="button" className="btn-secondary min-h-11" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSave || saving}
            onClick={() => onSave(reason.trim())}
          >
            {saving ? 'Saving…' : 'Save placement'}
          </button>
        </div>
      </div>
    </div>
  );
}
