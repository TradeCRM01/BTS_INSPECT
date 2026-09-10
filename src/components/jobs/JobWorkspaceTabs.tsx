import { Calendar, ClipboardList, Clock, Receipt } from 'lucide-react';

export type JobWorkspaceTab = 'schedule' | 'paperwork' | 'money' | 'time';

export const JOB_WORKSPACE_TABS: JobWorkspaceTab[] = ['schedule', 'paperwork', 'money', 'time'];

const TAB_META: Record<JobWorkspaceTab, { label: string; short: string; icon: typeof Calendar }> = {
  schedule: { label: 'Schedule & crew', short: 'Schedule', icon: Calendar },
  paperwork: { label: 'Paperwork', short: 'Paperwork', icon: ClipboardList },
  money: { label: 'Quotes & money', short: 'Money', icon: Receipt },
  time: { label: 'Time', short: 'Time', icon: Clock },
};

interface Props {
  active: JobWorkspaceTab;
  onChange: (tab: JobWorkspaceTab) => void;
  counts: Record<JobWorkspaceTab, number>;
}

/**
 * In-page navigation for the job sheet. Every tab stays reachable even at zero
 * records, because each one owns the only path to creating its first record.
 */
export default function JobWorkspaceTabs({ active, onChange, counts }: Props) {
  return (
    <div className="job-tabs" role="tablist" aria-label="Job sections">
      {JOB_WORKSPACE_TABS.map(tab => {
        const meta = TAB_META[tab];
        const Icon = meta.icon;
        const count = counts[tab];
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`job-panel-${tab}`}
            onClick={() => onChange(tab)}
            className={isActive ? 'job-tab is-active' : 'job-tab'}
          >
            <Icon size={14} aria-hidden="true" />
            <span className="job-tab-label">{meta.label}</span>
            <span className="job-tab-label-short">{meta.short}</span>
            {count > 0 && <span className="job-tab-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
