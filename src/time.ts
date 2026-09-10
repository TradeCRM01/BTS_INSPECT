import type { DateKey } from './types';

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: string };

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'long',
      hour12: false,
    });
    partsCache.set(tz, f);
  }
  return f;
}

export function localParts(date: Date, tz: string): Parts {
  const out: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    weekday: out.weekday ?? '',
  };
}

export function dateKey(date: Date, tz: string): DateKey {
  const p = localParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function keyToUtcMs(key: DateKey, dayOffset = 0): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d + dayOffset);
}

export function shiftKey(key: DateKey, days: number): DateKey {
  return new Date(keyToUtcMs(key, days)).toISOString().slice(0, 10);
}

export function daysBetween(fromKey: DateKey, toKey: DateKey): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / 86_400_000);
}

/** Offset of tz from UTC in minutes at the given instant. */
function tzOffsetMinutes(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

/** Start of the local calendar day, as an instant. */
export function startOfDay(key: DateKey, tz: string): Date {
  const guess = new Date(keyToUtcMs(key));
  const offset = tzOffsetMinutes(guess, tz);
  return new Date(guess.getTime() - offset * 60_000);
}

export function endOfDay(key: DateKey, tz: string): Date {
  return startOfDay(shiftKey(key, 1), tz);
}

/** "Thursday 11 September" */
export function headingDate(key: DateKey, tz: string): string {
  const at = new Date(startOfDay(key, tz).getTime() + 12 * 3_600_000);
  return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(at);
}

/** "7:30am" */
export function clock(iso: string, tz: string): string {
  const p = localParts(new Date(iso), tz);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const suffix = p.hour < 12 ? 'am' : 'pm';
  return `${h12}:${String(p.minute).padStart(2, '0')}${suffix}`;
}

export function minutesOfDay(iso: string, tz: string): number {
  const p = localParts(new Date(iso), tz);
  return p.hour * 60 + p.minute;
}

export function clockFromMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

export function durationLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
