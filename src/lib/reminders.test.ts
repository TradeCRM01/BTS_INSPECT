import { describe, expect, it } from 'vitest';
import {
  canSeeReminder,
  decideQuickCapture,
  formatReminderJobOption,
  postponeTo,
  reminderDueFromInputs,
  reminderDueInputs,
  reminderDueLabel,
  reminderFromRow,
  reminderInScope,
  reminderInitials,
  reminderMetaLine,
  reminderSavePatch,
  reminderVisibilityNote,
  splitReminderLists,
  todayReminders,
  type Reminder,
  type ReminderRow,
} from './reminders';

const NOW = new Date(2026, 8, 11, 9, 30);
const ME = 'user-me';
const DAVE = 'user-dave';

function local(day: number, hour: number, minute = 0, month = 8): string {
  return new Date(2026, month, day, hour, minute).toISOString();
}

function reminder(over: Partial<Reminder> & { id: string }): Reminder {
  return {
    ownerId: ME,
    title: over.id,
    details: '',
    dueAt: null,
    jobId: null,
    completed: false,
    completedAt: null,
    visibility: 'private',
    taggedUserIds: [],
    createdAt: local(1, 8),
    ...over,
  };
}

const ROW: ReminderRow = {
  id: 'r-1',
  company_id: 'co-1',
  user_id: ME,
  title: 'Order the board',
  details: null,
  due_date: '2026-09-12T00:00:00+00:00',
  related_type: 'job',
  related_id: 'job-9',
  completed: false,
  completed_at: null,
  visibility: 'private',
  tagged_user_ids: null,
  created_at: '2026-09-10T01:00:00+00:00',
  updated_at: '2026-09-10T01:00:00+00:00',
};

describe('reminderFromRow', () => {
  it('lifts a job link and null-safes details and tags', () => {
    expect(reminderFromRow(ROW)).toEqual({
      id: 'r-1',
      ownerId: ME,
      title: 'Order the board',
      details: '',
      dueAt: '2026-09-12T00:00:00+00:00',
      jobId: 'job-9',
      completed: false,
      completedAt: null,
      visibility: 'private',
      taggedUserIds: [],
      createdAt: '2026-09-10T01:00:00+00:00',
    });
  });

  it('drops a non-job relation off jobId', () => {
    expect(reminderFromRow({ ...ROW, related_type: 'invoice', related_id: 'inv-1' }).jobId).toBeNull();
    expect(reminderFromRow({ ...ROW, tagged_user_ids: [DAVE], details: 'Bring the ladder' })).toMatchObject({
      taggedUserIds: [DAVE],
      details: 'Bring the ladder',
    });
  });
});

describe('decideQuickCapture', () => {
  it('inserts a private, untagged row from one trimmed line', () => {
    expect(decideQuickCapture({ companyId: 'co-1', userId: ME, title: '  Call Sarah about the quote  ' })).toEqual({
      action: 'insert',
      row: { company_id: 'co-1', user_id: ME, title: 'Call Sarah about the quote', visibility: 'private', tagged_user_ids: [] },
    });
  });

  it('misses on a blank title before it checks the session', () => {
    expect(decideQuickCapture({ companyId: 'co-1', userId: ME, title: '   ' })).toEqual({
      action: 'miss', reason: 'empty', message: 'Write what you need to remember.',
    });
    expect(decideQuickCapture({ companyId: null, userId: ME, title: 'x' })).toMatchObject({ reason: 'not_signed_in' });
    expect(decideQuickCapture({ companyId: 'co-1', userId: '', title: 'x' })).toMatchObject({ reason: 'not_signed_in' });
  });
});

describe('reminderSavePatch', () => {
  it('writes the job link, null details, deduped tags, and updated_at', () => {
    const patch = reminderSavePatch({
      title: ' Order the board ',
      details: '  ',
      jobId: 'job-9',
      dueAt: '2026-09-12T00:00:00.000Z',
      visibility: 'company',
      taggedUserIds: [DAVE, DAVE, ' ', 'user-jack'],
    }, new Date('2026-09-11T01:30:00.000Z'));
    expect(patch).toEqual({
      title: 'Order the board',
      details: null,
      related_type: 'job',
      related_id: 'job-9',
      due_date: '2026-09-12T00:00:00.000Z',
      visibility: 'company',
      tagged_user_ids: [DAVE, 'user-jack'],
      updated_at: '2026-09-11T01:30:00.000Z',
    });
  });

  it('clears the job link when no job is picked and refuses a blank title', () => {
    expect(reminderSavePatch({
      title: 'x', details: 'Bring the ladder', jobId: '', dueAt: null, visibility: 'private', taggedUserIds: [],
    })).toMatchObject({ related_type: null, related_id: null, details: 'Bring the ladder', due_date: null });
    expect(() => reminderSavePatch({
      title: ' ', details: '', jobId: null, dueAt: null, visibility: 'private', taggedUserIds: [],
    })).toThrow('Write what you need to remember.');
  });
});

describe('canSeeReminder / reminderInScope', () => {
  const mine = reminder({ id: 'mine' });
  const daves = reminder({ id: 'daves', ownerId: DAVE });
  const tagged = reminder({ id: 'tagged', ownerId: DAVE, taggedUserIds: [ME] });
  const shared = reminder({ id: 'shared', ownerId: DAVE, visibility: 'company' });

  it('mirrors the RLS select predicate', () => {
    expect(canSeeReminder(mine, ME)).toBe(true);
    expect(canSeeReminder(daves, ME)).toBe(false);
    expect(canSeeReminder(tagged, ME)).toBe(true);
    expect(canSeeReminder(shared, ME)).toBe(true);
    expect(canSeeReminder({ ...daves, ownerId: null }, ME)).toBe(false);
  });

  it('filters the list by chip', () => {
    const all = [mine, daves, tagged, shared];
    const ids = (scope: 'all' | 'mine' | 'company' | 'tagged') =>
      all.filter(r => reminderInScope(r, scope, ME)).map(r => r.id);
    expect(ids('all')).toEqual(['mine', 'tagged', 'shared']);
    expect(ids('mine')).toEqual(['mine']);
    expect(ids('company')).toEqual(['shared']);
    expect(ids('tagged')).toEqual(['tagged']);
  });
});

describe('splitReminderLists', () => {
  it('sorts upcoming dated-first ascending then undated newest, completed by completedAt', () => {
    const { upcoming, completed } = splitReminderLists([
      reminder({ id: 'undated-old', createdAt: local(1, 8) }),
      reminder({ id: 'done-early', completed: true, completedAt: local(9, 8) }),
      reminder({ id: 'due-fri', dueAt: local(11, 15) }),
      reminder({ id: 'undated-new', createdAt: local(10, 8) }),
      reminder({ id: 'done-late', completed: true, completedAt: local(10, 8) }),
      reminder({ id: 'due-mon', dueAt: local(7, 9) }),
    ]);
    expect(upcoming.map(r => r.id)).toEqual(['due-mon', 'due-fri', 'undated-new', 'undated-old']);
    expect(completed.map(r => r.id)).toEqual(['done-late', 'done-early']);
  });
});

describe('reminderDueLabel', () => {
  it('names overdue, today, tomorrow, and later on the local calendar', () => {
    expect(reminderDueLabel(null, NOW)).toBeNull();
    expect(reminderDueLabel(local(8, 9), NOW)).toBe('Overdue · Tue 8 Sep');
    expect(reminderDueLabel(local(11, 8), NOW)).toBe('Today · 8:00 am');
    expect(reminderDueLabel(local(11, 15), NOW)).toBe('Today · 3:00 pm');
    expect(reminderDueLabel(local(12, 8), NOW)).toBe('Tomorrow · 8:00 am');
    expect(reminderDueLabel(local(18, 8, 0), NOW)).toBe('Fri 18 Sep · 8:00 am');
    expect(reminderDueLabel(local(2, 7, 30, 9), NOW)).toBe('Fri 2 Oct · 7:30 am');
  });
});

describe('postponeTo', () => {
  it('rounds later today up to the next full hour and lands tomorrow and next week at 8:00', () => {
    expect(postponeTo('later_today', NOW)).toEqual(new Date(2026, 8, 11, 13, 0));
    expect(postponeTo('later_today', new Date(2026, 8, 11, 9, 0))).toEqual(new Date(2026, 8, 11, 12, 0));
    expect(postponeTo('tomorrow', NOW)).toEqual(new Date(2026, 8, 12, 8, 0));
    expect(postponeTo('next_week', NOW)).toEqual(new Date(2026, 8, 18, 8, 0));
    expect(postponeTo('tomorrow', new Date(2026, 8, 30, 22, 0))).toEqual(new Date(2026, 9, 1, 8, 0));
  });
});

describe('todayReminders', () => {
  it('puts overdue first, then today, then undated, and leaves the future off the strip', () => {
    const list = [
      reminder({ id: 'undated-old', createdAt: local(1, 8) }),
      reminder({ id: 'tomorrow', dueAt: local(12, 8) }),
      reminder({ id: 'today-late', dueAt: local(11, 16) }),
      reminder({ id: 'undated-new', createdAt: local(10, 8) }),
      reminder({ id: 'overdue', dueAt: local(8, 9) }),
      reminder({ id: 'today-early', dueAt: local(11, 7) }),
    ];
    expect(todayReminders(list, NOW).map(r => r.id)).toEqual([
      'overdue', 'today-early', 'today-late', 'undated-new', 'undated-old',
    ]);
    expect(todayReminders(list, NOW, 2).map(r => r.id)).toEqual(['overdue', 'today-early']);
  });
});

describe('reminderVisibilityNote', () => {
  it('reads who can see the reminder', () => {
    expect(reminderVisibilityNote({ visibility: 'private', taggedUserIds: [] }, 'Harbour Plumbing'))
      .toBe('Only you can see this reminder');
    expect(reminderVisibilityNote({ visibility: 'private', taggedUserIds: [DAVE] }, 'Harbour Plumbing'))
      .toBe('Only you and 1 tagged teammate can see this reminder');
    expect(reminderVisibilityNote({ visibility: 'private', taggedUserIds: [DAVE, 'user-jack'] }, null))
      .toBe('Only you and 2 tagged teammates can see this reminder');
    expect(reminderVisibilityNote({ visibility: 'company', taggedUserIds: [] }, 'Harbour Plumbing'))
      .toBe('Everyone at Harbour Plumbing can see this reminder');
    expect(reminderVisibilityNote({ visibility: 'company', taggedUserIds: [] }, '  '))
      .toBe('Everyone in your company can see this reminder');
  });
});

describe('row copy helpers', () => {
  it('prints the job option with the existing job ref', () => {
    expect(formatReminderJobOption({ job_number: 1043, title: 'Upstairs lighting' })).toBe('#1043 · Upstairs lighting');
    expect(formatReminderJobOption({ job_number: null, title: 'Callout' })).toBe('JOB · Callout');
  });

  it('joins the meta line and hides the owner on my own rows', () => {
    expect(reminderMetaLine({
      jobLabel: '#1043 · Upstairs lighting', dueLabel: 'Today · 3:00 pm', ownerName: 'Dave', isMine: false, visibility: 'company',
    })).toBe('#1043 · Upstairs lighting · Today · 3:00 pm · Dave · Company');
    expect(reminderMetaLine({
      jobLabel: null, dueLabel: null, ownerName: 'Dave', isMine: true, visibility: 'private',
    })).toBe('');
  });

  it('makes initials for the tagged chips', () => {
    expect(reminderInitials('Alex Reed')).toBe('AR');
    expect(reminderInitials('sam')).toBe('S');
    expect(reminderInitials('  ')).toBe('?');
  });
});

describe('reminderDueFromInputs / reminderDueInputs', () => {
  it('lands a date without a time at 08:00 local and round-trips date + time', () => {
    const dateOnly = reminderDueFromInputs('2026-09-12', '');
    expect(dateOnly).not.toBeNull();
    expect(new Date(dateOnly!).getHours()).toBe(8);
    expect(reminderDueInputs(dateOnly)).toEqual({ date: '2026-09-12', time: '08:00' });
    expect(reminderDueInputs(reminderDueFromInputs('2026-09-12', '14:15'))).toEqual({ date: '2026-09-12', time: '14:15' });
    expect(reminderDueFromInputs('', '14:15')).toBeNull();
    expect(reminderDueInputs(null)).toEqual({ date: '', time: '' });
  });
});
