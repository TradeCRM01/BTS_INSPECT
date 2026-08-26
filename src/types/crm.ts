export interface Client {
  id: string;
  company_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
}

export type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type JobPriority = 'low' | 'medium' | 'high';

export interface Job {
  id: string;
  company_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: JobStatus;
  priority: JobPriority;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  address: string | null;
  assigned_team: string[];
  inspection_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  job_number: number | null;
  color: string | null;
  budget: number | null;
  parent_job_id?: string | null;
  cost_code?: string | null;
  client_reminder_sent_at?: string | null;
  client_reminder_sent_for_date?: string | null;
}

export interface ClientWithStats extends Client {
  job_count?: number;
  active_jobs?: number;
  last_job_date?: string | null;
  quoted_total?: number;
  outstanding_total?: number;
  overdue_total?: number;
}

export interface JobWithClient extends Job {
  client_name?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  parent_job_number?: number | null;
}

import { colors } from '../lib/colors';

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  scheduled: 'ops-status-info',
  in_progress: 'ops-status-progress',
  completed: 'ops-status-ok',
  cancelled: 'ops-status-bad',
};

export const JOB_STATUS_RAIL: Record<JobStatus, string> = {
  scheduled: colors.accent,
  in_progress: colors.warning,
  completed: colors.pass,
  cancelled: colors.fail,
};

export const JOB_PRIORITY_LABELS: Record<JobPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const JOB_PRIORITY_STYLES: Record<JobPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-orange-100 text-orange-700',
  high: 'bg-red-100 text-red-700',
};

export const JOB_PRIORITY_DOT: Record<JobPriority, string> = {
  low: '#6B7280',
  medium: '#F7931A',
  high: '#B42318',
};
