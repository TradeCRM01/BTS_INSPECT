import { timeToMinutes } from './dispatch';

export function bookingIntervalIssue(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const startM = timeToMinutes(start);
  const endM = timeToMinutes(end);
  if (startM == null && endM == null) return null;
  if (startM == null || endM == null) {
    return 'Set both start and end, or clear both.';
  }
  if (endM <= startM) {
    return 'End must be after start. Overnight work is not supported.';
  }
  return null;
}
