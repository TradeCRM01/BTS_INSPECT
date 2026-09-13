import { describe, expect, it } from 'vitest';
import { appendJobFieldNote, isJobOnToday, nextJobStatusAfterField } from './jobFieldPath';

describe('job field path', () => {
  it('completes on All done and keeps cancelled closed', () => {
    expect(nextJobStatusAfterField('all_done', 'in_progress')).toBe('completed');
    expect(nextJobStatusAfterField('more_to_do', 'scheduled')).toBe('in_progress');
    expect(nextJobStatusAfterField('all_done', 'cancelled')).toBe('cancelled');
  });

  it('appends a stamped note without wiping existing copy', () => {
    const at = new Date(2026, 8, 13, 15, 4);
    expect(appendJobFieldNote('Site access at rear', 'Meter boarded', at)).toBe(
      'Site access at rear\n2026-09-13 15:04  Meter boarded',
    );
    expect(appendJobFieldNote(null, '  ', at)).toBeNull();
  });

  it('treats only open jobs dated today as today work', () => {
    const now = new Date(2026, 8, 13);
    expect(isJobOnToday({ status: 'scheduled', scheduled_date: '2026-09-13' }, now)).toBe(true);
    expect(isJobOnToday({ status: 'completed', scheduled_date: '2026-09-13' }, now)).toBe(false);
    expect(isJobOnToday({ status: 'scheduled', scheduled_date: '2026-09-14' }, now)).toBe(false);
  });
});
