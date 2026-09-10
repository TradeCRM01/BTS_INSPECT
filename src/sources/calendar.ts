import { endOfDay, startOfDay } from '../time';
import type { CalendarEvent, DateKey } from '../types';
import { googleGet } from './google';

type GcalEvent = {
  id: string;
  summary?: string;
  location?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export async function fetchCalendar(token: string, day: DateKey, tz: string): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: startOfDay(day, tz).toISOString(),
    timeMax: endOfDay(day, tz).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const json = await googleGet<{ items?: GcalEvent[] }>(
    token,
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
  );
  return (json.items ?? [])
    .filter(e => e.status !== 'cancelled')
    .map(toEvent)
    .filter((e): e is CalendarEvent => e !== null);
}

function toEvent(e: GcalEvent): CalendarEvent | null {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime);
  const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00Z` : null);
  if (!start) return null;
  return {
    id: e.id,
    title: e.summary?.trim() || '(untitled)',
    start,
    end: e.end?.dateTime ?? null,
    allDay,
    location: e.location?.trim() || null,
  };
}
