import { describe, expect, it } from 'vitest';
import { todayCommandStats } from './todayCommand';

describe('todayCommandStats', () => {
  const now = new Date(2026, 8, 13); // 13 Sep 2026

  it('counts today, unassigned dated work, missing dates and overdue invoices', () => {
    expect(todayCommandStats(
      [
        { status: 'scheduled', scheduled_date: '2026-09-13', assigned_team: ['a'] },
        { status: 'scheduled', scheduled_date: '2026-09-13', assigned_team: [] },
        { status: 'scheduled', scheduled_date: null, assigned_team: [] },
        { status: 'completed', scheduled_date: '2026-09-13', assigned_team: ['a'] },
      ],
      [
        { status: 'sent', due_date: '2026-09-01' },
        { status: 'sent', due_date: '2026-09-20' },
      ],
      now,
    )).toEqual({
      todayOpen: 2,
      unassignedDated: 1,
      needsDate: 1,
      overdueInvoices: 1,
    });
  });
});
