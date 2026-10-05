/** Live `compliance_items` columns (migration 038). No type / expiry_date / assigned_to. */
export const COMPLIANCE_DEADLINES_SELECT = 'id, title, next_due_date, status' as const;

export const COMPLIANCE_DEADLINES_LOAD_ERROR = "Couldn't load compliance";
export const COMPLIANCE_DEADLINES_EMPTY = 'All compliant';
export const COMPLIANCE_DEADLINES_TZ = 'Australia/Perth';

export type ComplianceDeadlineRow = {
  next_due_date?: unknown;
  status?: unknown;
};

/** yyyy-mm-dd in Australia/Perth. Same Intl en-CA key as client-portal quote lapse. */
export function perthCalendarDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPLIANCE_DEADLINES_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function complianceDueKey(value: unknown): string | null {
  const day = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function addComplianceDueDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function complianceDueDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export function complianceUpcomingHint(due: string, today: string): string {
  if (due === today) return 'today';
  const [y1, m1, d1] = due.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  const days = Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  return '';
}

export function splitComplianceDeadlines<T extends ComplianceDeadlineRow>(
  items: T[],
  now = new Date(),
): { upcoming: T[]; overdue: T[]; all: T[] } {
  const today = perthCalendarDay(now);
  const until = addComplianceDueDays(today, 30);
  const upcoming = items.filter(i => {
    if (i.status === 'completed') return false;
    const due = complianceDueKey(i.next_due_date);
    return !!due && due >= today && due <= until;
  });
  const overdue = items.filter(i => {
    if (i.status === 'completed') return false;
    const due = complianceDueKey(i.next_due_date);
    return !!due && due < today;
  });
  return { upcoming, overdue, all: items };
}

export function complianceDeadlinesLookItems(now = new Date()): Array<{
  id: string;
  title: string;
  next_due_date: string;
  status: string;
}> {
  const today = perthCalendarDay(now);
  return [
    { id: 'look-w-comp-overdue', title: 'RCD test', next_due_date: addComplianceDueDays(today, -12), status: 'overdue' },
    { id: 'look-w-comp-licence', title: 'Licence EC-9988', next_due_date: today, status: 'upcoming' },
    { id: 'look-w-comp-soon', title: 'Plant ticket', next_due_date: addComplianceDueDays(today, 14), status: 'upcoming' },
    { id: 'look-w-comp-done', title: 'Old cert', next_due_date: addComplianceDueDays(today, -40), status: 'completed' },
  ];
}

export type ComplianceDeadlinesCardKind = 'loading' | 'error' | 'empty' | 'items';

export function complianceDeadlinesCardKind(opts: {
  isLoading: boolean;
  isError: boolean;
  overdueCount: number;
  upcomingCount: number;
}): ComplianceDeadlinesCardKind {
  if (opts.isError) return 'error';
  if (opts.isLoading) return 'loading';
  if (opts.overdueCount === 0 && opts.upcomingCount === 0) return 'empty';
  return 'items';
}

export function complianceDeadlinesCardCopy(kind: ComplianceDeadlinesCardKind): string {
  if (kind === 'error') return COMPLIANCE_DEADLINES_LOAD_ERROR;
  if (kind === 'loading') return 'Loading…';
  if (kind === 'empty') return COMPLIANCE_DEADLINES_EMPTY;
  return '';
}
