import type { JobStatus } from '../types/crm';

export type FieldPathOutcome = 'all_done' | 'more_to_do';

/** All done closes the job. More to do keeps it live as in progress. */
export function nextJobStatusAfterField(outcome: FieldPathOutcome, current: JobStatus): JobStatus {
  if (current === 'cancelled') return current;
  if (outcome === 'all_done') return 'completed';
  return 'in_progress';
}

export function appendJobFieldNote(
  existing: string | null | undefined,
  note: string,
  at: Date,
): string | null {
  const text = note.trim();
  if (!text) return existing ?? null;
  const stamp = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const line = `${stamp}  ${text}`;
  const body = (existing ?? '').trim();
  return body ? `${body}\n${line}` : line;
}

export function isJobOnToday(
  job: { status: JobStatus; scheduled_date: string | null | undefined },
  now = new Date(),
): boolean {
  if (job.status === 'completed' || job.status === 'cancelled') return false;
  const day = job.scheduled_date?.slice(0, 10);
  if (!day) return false;
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return day === `${y}-${m}-${d}`;
}
