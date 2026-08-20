interface StatusStyle {
  label: string;
  cls: string;
}

type StatusMap = Record<string, StatusStyle>;

const DEFAULT_STYLES: StatusMap = {
  draft: { label: 'Draft', cls: 'ops-status-wait' },
  active: { label: 'Active', cls: 'ops-status-info' },
  scheduled: { label: 'Scheduled', cls: 'ops-status-info' },
  in_progress: { label: 'In Progress', cls: 'ops-status-progress' },
  completed: { label: 'Completed', cls: 'ops-status-ok' },
  issued: { label: 'Issued', cls: 'ops-status-info' },
  sent: { label: 'Sent', cls: 'ops-status-info' },
  accepted: { label: 'Accepted', cls: 'ops-status-ok' },
  declined: { label: 'Declined', cls: 'ops-status-bad' },
  expired: { label: 'Expired', cls: 'ops-status-progress' },
  paid: { label: 'Paid', cls: 'ops-status-ok' },
  overdue: { label: 'Overdue', cls: 'ops-status-bad' },
  pending: { label: 'Pending', cls: 'ops-status-progress' },
  cancelled: { label: 'Cancelled', cls: 'ops-status-bad' },
  approved: { label: 'Approved', cls: 'ops-status-ok' },
  rejected: { label: 'Rejected', cls: 'ops-status-bad' },
  open: { label: 'Open', cls: 'ops-status-info' },
  closed: { label: 'Closed', cls: 'ops-status-wait' },
};

interface StatusBadgeProps {
  status: string;
  customMap?: StatusMap;
  label?: string;
}

export function StatusBadge({ status, customMap, label }: StatusBadgeProps) {
  const map = customMap ?? DEFAULT_STYLES;
  const s = map[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), cls: 'ops-status-wait' };
  return (
    <span className={`ops-status ${s.cls}`}>
      {label ?? s.label}
    </span>
  );
}

export { DEFAULT_STYLES as DEFAULT_STATUS_STYLES };
export type { StatusStyle, StatusMap };
