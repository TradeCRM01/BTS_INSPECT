import { useState } from 'react';
import type { PlacementSummary } from '../../lib/schedulePlacement';

export function ScheduleTimeDialog({
  summary,
  onCancel,
  onConfirm,
}: {
  summary: PlacementSummary;
  onCancel: () => void;
  onConfirm: (startTime: string) => void;
}) {
  const [start, setStart] = useState('08:00');

  return (
    <div className="dc-place-dialog-back" role="presentation" onMouseDown={onCancel}>
      <div
        className="dc-place-dialog"
        role="dialog"
        aria-labelledby="schedule-time-title"
        onMouseDown={e => e.stopPropagation()}
      >
        <h2 id="schedule-time-title" className="ops-page-title text-xl">Set a start time</h2>
        <p className="ops-meta mt-2">
          {summary.jobLabel} · {summary.crewLabel} · {summary.whenLabel}
        </p>
        {summary.movingExisting ? (
          <p className="ops-meta mt-1">This moves the existing booking. Same job, no duplicate.</p>
        ) : null}
        <label className="block mt-3">
          <span className="ops-meta">Start</span>
          <input
            type="time"
            className="mt-1 min-h-11 w-full rounded-md border border-rule px-3"
            value={start}
            onChange={e => setStart(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button type="button" className="btn-secondary min-h-11" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onConfirm(start.length === 5 ? `${start}:00` : start)}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
