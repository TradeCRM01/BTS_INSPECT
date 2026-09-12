import { describe, expect, it } from 'vitest';
import { PHONE_TABS, activePhoneTab, type PhoneTabId } from './appShellPhoneNav';

describe('phone bottom nav tabs', () => {
  it('lists Today, Schedule, Jobs, More in that order', () => {
    expect(PHONE_TABS.map((tab) => tab.label)).toEqual(['Today', 'Schedule', 'Jobs', 'More']);
    expect(PHONE_TABS.map((tab) => tab.id)).toEqual(['today', 'schedule', 'jobs', 'more']);
  });

  it('routes Today, Schedule, Jobs and leaves More as a menu toggle', () => {
    expect(PHONE_TABS.map((tab) => tab.to)).toEqual(['/', '/schedule', '/jobs', null]);
  });
});

describe('activePhoneTab', () => {
  const cases: [pathname: string, menuOpen: boolean, expected: PhoneTabId | null][] = [
    ['/', false, 'today'],
    ['/schedule', false, 'schedule'],
    ['/schedule/2026-09-14', false, 'schedule'],
    ['/jobs', false, 'jobs'],
    ['/jobs/abc-123', false, 'jobs'],
    ['/jobsite', false, null],
    ['/quotes', false, null],
    ['/invoices/7', false, null],
    ['/reminders', false, null],
    ['/settings/company', false, null],
    ['/', true, 'more'],
    ['/jobs/abc-123', true, 'more'],
    ['/quotes', true, 'more'],
  ];

  it.each(cases)('%s with menuOpen=%s lights %s', (pathname, menuOpen, expected) => {
    expect(activePhoneTab(pathname, menuOpen)).toBe(expected);
  });
});
