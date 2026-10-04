import { useState } from 'react';
import type { DispatchConflict } from '../../lib/dispatchResources';
import type { PlacementSummary } from '../../lib/schedulePlacement';

export function ScheduleOverrideDialog({
  summary,
  conflicts,
  memberBlocked,
  nextAction,
  onCancel,
  onConfirm,
}: {
  summary: PlacementSummary;
  conflicts: DispatchConflict[];
  memberBlocked?: boolean;
  nextAction?: string;
  onCancel: () => void;
  onConfirm?: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const warnings = conflicts.filter(c => c.severity === 'soft' || c.overridable);

  return (
    <div className="dc-place-dialog-back" role="presentation" onMouseDown={onCancel}>
      <div
        className="dc-place-dialog"
        role="dialog"
        aria-labelledby="schedule-override-title"
        onMouseDown={e => e.stopPropagation()}
      >
        <h2 id="schedule-override-title" className="ops-page-title text-xl">
          {memberBlocked ? 'This placement needs a change' : 'Confirm this placement'}
        </h2>
        <p className="ops-meta mt-2">
          {summary.jobLabel} · {summary.crewLabel} · {summary.whenLabel}
        </p>
        {summary.movingExisting && summary.previousWhen ? (
          <p className="ops-meta mt-1">Moves the existing booking from {summary.previousWhen}.</p>
        ) : null}
        <ul className="dc-place-warnings">
          {warnings.map(c => (
            <li key={`${c.kind}:${c.message}`}>{c.message}</li>
          ))}
        </ul>
        {memberBlocked ? (
          <p className="ops-meta">{nextAction}</p>
        ) : (
          <label className="block mt-3">
            <span className="ops-meta">Reason (required)</span>
            <textarea
              className="mt-1 w-full min-h-[88px] rounded-md border border-rule px-3 py-2"
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            />
          </label>
        )}
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button type="button" className="btn-secondary min-h-11" onClick={onCancel}>
            {memberBlocked ? 'Back' : 'Cancel'}
          </button>
          {!memberBlocked && onConfirm ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!reason.trim()}
              onClick={() => onConfirm(reason.trim())}
            >
              Save with reason
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
