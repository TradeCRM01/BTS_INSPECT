import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Clock3, Columns3, Plus } from 'lucide-react';
import { format, startOfWeek, endOfWeek } from 'date-fns';

type ViewMode = 'day' | 'week';

export function DispatchCommandBar({
  currentDate,
  viewMode,
  onViewMode,
  onToday,
  onPrev,
  onNext,
  summary,
  attentionOnly,
  attentionCount,
  onToggleAttention,
  hoursOpen,
  onToggleHours,
  extendedHours,
  onToggleExtended,
  outsideWorkdayCount,
  onNewJob,
  children,
}: {
  currentDate: Date;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  summary: string;
  attentionOnly: boolean;
  attentionCount: number;
  onToggleAttention: () => void;
  hoursOpen: boolean;
  onToggleHours: () => void;
  extendedHours: boolean;
  onToggleExtended: () => void;
  outsideWorkdayCount: number;
  onNewJob: () => void;
  children?: ReactNode;
}) {
  const range = viewMode === 'day'
    ? format(currentDate, 'EEE d MMM yyyy')
    : `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM')} – ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM yyyy')}`;

  return (
    <header className="dc-command">
      <div className="dc-command-lead">
        <div>
          <h1 className="ops-page-title">Schedule</h1>
          <p className="ops-meta mt-0.5">{summary}</p>
        </div>
        <button type="button" className="btn-primary min-h-11" onClick={onNewJob}>
          <Plus size={16} aria-hidden /> New Job
        </button>
      </div>

      <div className="dc-command-row" role="toolbar" aria-label="Dispatch controls">
        <div className="dc-command-dates">
          <button type="button" className="btn-secondary min-h-11" onClick={onToday}>Today</button>
          <div className="flex items-center">
            <button
              type="button"
              className="w-11 h-11 flex items-center justify-center rounded-l-md border border-rule hover:bg-zebra text-muted"
              onClick={onPrev}
              aria-label={viewMode === 'day' ? 'Previous day' : 'Previous week'}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="w-11 h-11 flex items-center justify-center rounded-r-md border-y border-r border-rule hover:bg-zebra text-muted"
              onClick={onNext}
              aria-label={viewMode === 'day' ? 'Next day' : 'Next week'}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <p className="dc-command-range">{range}</p>
        </div>

        <div className="flex ops-seg" role="group" aria-label="Schedule view">
          {([
            { mode: 'day' as const, label: 'Day', Icon: Columns3 },
            { mode: 'week' as const, label: 'Week', Icon: Clock3 },
          ]).map(({ mode, label, Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={`ops-seg-btn min-h-11 ${viewMode === mode ? 'ops-seg-btn-on' : 'ops-seg-btn-off'}`}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`btn-secondary min-h-11 ${attentionOnly ? 'ring-1 ring-navy' : ''}`}
          onClick={onToggleAttention}
          aria-pressed={attentionOnly}
        >
          Needs resources
          {attentionCount > 0 ? <span className="dc-count">{attentionCount}</span> : null}
        </button>

        <button
          type="button"
          className={`btn-secondary min-h-11 ${hoursOpen ? 'ring-1 ring-navy' : ''}`}
          onClick={onToggleHours}
          aria-expanded={hoursOpen}
          aria-controls="schedule-hours-panel"
        >
          Hours & leave
        </button>

        <button
          type="button"
          className={`btn-secondary min-h-11 ${extendedHours ? 'ring-1 ring-navy' : ''}`}
          onClick={onToggleExtended}
          aria-pressed={extendedHours}
        >
          {extendedHours ? '6am–8pm' : '7am–5pm'}
          {outsideWorkdayCount > 0 ? (
            <span className="dc-count">{outsideWorkdayCount}</span>
          ) : null}
        </button>
      </div>
      {children}
    </header>
  );
}
