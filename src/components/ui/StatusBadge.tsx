interface StatusStyle {
  label: string;
  cls: string;
}

type StatusMap = Record<string, StatusStyle>;

const DEFAULT_STYLES: StatusMap = {
  draft: { label: 'Draft', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  active: { label: 'Active', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  scheduled: { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  in_progress: { label: 'In Progress', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  completed: { label: 'Completed', cls: 'bg-green-50 text-green-700 ring-green-200' },
  issued: { label: 'Issued', cls: 'bg-[#0A2540]/10 text-[#0A2540] ring-[#0A2540]/20' },
  sent: { label: 'Sent', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  accepted: { label: 'Accepted', cls: 'bg-green-50 text-green-700 ring-green-200' },
  declined: { label: 'Declined', cls: 'bg-red-50 text-red-700 ring-red-200' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-600 ring-gray-200' },
  paid: { label: 'Paid', cls: 'bg-green-50 text-green-700 ring-green-200' },
  overdue: { label: 'Overdue', cls: 'bg-red-50 text-red-700 ring-red-200' },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600 ring-gray-200' },
  approved: { label: 'Approved', cls: 'bg-green-50 text-green-700 ring-green-200' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-700 ring-red-200' },
  open: { label: 'Open', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  closed: { label: 'Closed', cls: 'bg-gray-100 text-gray-600 ring-gray-200' },
};

interface StatusBadgeProps {
  status: string;
  customMap?: StatusMap;
  label?: string;
}

export function StatusBadge({ status, customMap, label }: StatusBadgeProps) {
  const map = customMap ?? DEFAULT_STYLES;
  const s = map[status] ?? { label: status.charAt(0).toUpperCase() + status.slice(1), cls: 'bg-gray-100 text-gray-600 ring-gray-200' };
  return (
    <span className={`badge ${s.cls}`}>
      {label ?? s.label}
    </span>
  );
}

export { DEFAULT_STYLES as DEFAULT_STATUS_STYLES };
export type { StatusStyle, StatusMap };
