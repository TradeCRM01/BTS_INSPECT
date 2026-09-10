import { startOfDay } from '../time';
import type { DateKey, Signals } from '../types';

/** Fixture signals so the paper can be read before any credential exists. */
export function demoSignals(today: DateKey, tz: string): Signals {
  const day = startOfDay(today, tz).getTime();
  const at = (h: number, m = 0) => new Date(day + (h * 60 + m) * 60_000).toISOString();
  const daysAgo = (n: number) => new Date(day - n * 86_400_000).toISOString();
  return {
    calendar: {
      ok: true,
      data: [
        { id: 'c1', title: 'Site walk, Bassendean', start: at(7, 30), end: at(9), allDay: false, location: 'Bassendean WA' },
        { id: 'c2', title: 'Call: Xero sync', start: at(14), end: at(14, 30), allDay: false, location: null },
        { id: 'c3', title: 'Invoice run', start: at(0), end: null, allDay: true, location: null },
      ],
    },
    mail: {
      ok: true,
      data: [
        { id: 'm1', subject: 'Quote for the Morley job', from: 'Dave Turner', lastMessageAt: daysAgo(6), url: 'https://mail.google.com/' },
        { id: 'm2', subject: 'Re: Stripe payout timing', from: 'Stripe Support', lastMessageAt: daysAgo(3), url: 'https://mail.google.com/' },
        { id: 'm3', subject: 'Insurance renewal', from: 'Sarah at Aon', lastMessageAt: daysAgo(2), url: 'https://mail.google.com/' },
      ],
    },
    grafter: {
      ok: true,
      data: {
        signups: ['Northside Plumbing'],
        companiesTotal: 14,
        activeCompanies: 3,
        quotesCreated: 5,
        jobsCreated: 2,
        paying: 4,
        trial: 8,
        pastDue: 1,
      },
    },
  };
}
