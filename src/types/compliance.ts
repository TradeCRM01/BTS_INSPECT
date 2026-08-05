export type ComplianceStatus = 'upcoming' | 'due_soon' | 'overdue' | 'completed' | 'paused';
export type RecurrenceUnit = 'days' | 'weeks' | 'months' | 'years';
export type ComplianceLogAction =
  | 'created' | 'updated' | 'completed' | 'reminder_sent'
  | 'reminder_email_failed' | 'job_linked' | 'paused' | 'resumed';

export interface ComplianceItem {
  id: string;
  company_id: string;
  client_id: string;
  title: string;
  description: string | null;
  standard_or_regulation: string | null;
  recurrence_interval: number;
  recurrence_unit: RecurrenceUnit;
  first_due_date: string;
  last_completed_date: string | null;
  next_due_date: string;
  reminder_days_before: number;
  reminder_sent_at: string | null;
  status: ComplianceStatus;
  linked_job_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceItemWithClient extends ComplianceItem {
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
}

export interface ComplianceLog {
  id: string;
  compliance_item_id: string;
  company_id: string;
  action: ComplianceLogAction;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
}

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  upcoming: 'Upcoming',
  due_soon: 'Due Soon',
  overdue: 'Overdue',
  completed: 'Completed',
  paused: 'Paused',
};

export const COMPLIANCE_STATUS_STYLES: Record<ComplianceStatus, string> = {
  upcoming: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  due_soon: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  overdue: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  completed: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  paused: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
};

export const RECURRENCE_UNIT_LABELS: Record<RecurrenceUnit, string> = {
  days: 'Days',
  weeks: 'Weeks',
  months: 'Months',
  years: 'Years',
};

export const COMPLIANCE_LOG_LABELS: Record<ComplianceLogAction, string> = {
  created: 'Created',
  updated: 'Updated',
  completed: 'Marked Complete',
  reminder_sent: 'Reminder Sent',
  reminder_email_failed: 'Reminder Failed',
  job_linked: 'Job Linked',
  paused: 'Paused',
  resumed: 'Resumed',
};
