import { NAV_WORDS } from '../../lib/brand';

export type PhoneTabId = 'today' | 'schedule' | 'jobs' | 'more';

export interface PhoneTab {
  id: PhoneTabId;
  label: string;
  /** null for More: it opens the phone menu, it is not a route. */
  to: string | null;
}

export const PHONE_TABS: readonly PhoneTab[] = [
  { id: 'today', label: NAV_WORDS.today, to: '/' },
  { id: 'schedule', label: NAV_WORDS.schedule, to: '/schedule' },
  { id: 'jobs', label: NAV_WORDS.jobs, to: '/jobs' },
  { id: 'more', label: NAV_WORDS.more, to: null },
];

function pathWithin(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/** Which tab is lit for a pathname. More is lit only while the phone menu is open. */
export function activePhoneTab(pathname: string, menuOpen: boolean): PhoneTabId | null {
  if (menuOpen) return 'more';
  if (pathname === '/') return 'today';
  if (pathWithin(pathname, '/schedule')) return 'schedule';
  if (pathWithin(pathname, '/jobs')) return 'jobs';
  return null;
}
