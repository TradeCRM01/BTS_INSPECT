import { describe, expect, it } from 'vitest';
import { boardDispatchHint, jobCardHint, jobInvoiceActionFlags, jobListBucket, jobListNext, jobOpenNext, partitionScheduleJobs, pickJobDraftToSend, recommendArrivingSheetNext, recommendJobAction } from './jobNextAction';
import {
  ARRIVING_NEXT_LABEL,
  CLOCK_IN_NEXT_LABEL,
  PHONE_NEXT_LABEL,
  VAN_TIME_ZONE,
  isJobArrivingWindow,
  todayYmd,
  withReminderNext,
} from './jobReminder';

const now = new Date(2026, 7, 20); // 20 Aug 2026 local

describe('jobListBucket', () => {
  it('puts completed and cancelled in closed', () => {
    expect(jobListBucket({ status: 'completed', scheduled_date: '2026-08-20' }, now)).toBe('closed');
    expect(jobListBucket({ status: 'cancelled', scheduled_date: null }, now)).toBe('closed');
  });

  it('does not drop open jobs with no date', () => {
    expect(jobListBucket({ status: 'scheduled', scheduled_date: null }, now)).toBe('needs_date');
    expect(jobListBucket({ status: 'in_progress', scheduled_date: null }, now)).toBe('needs_date');
  });

  it('keeps past-dated open jobs on the board, not in closed', () => {
    expect(jobListBucket({ status: 'in_progress', scheduled_date: '2026-08-18' }, now)).toBe('on_board');
    expect(jobListBucket({ status: 'scheduled', scheduled_date: '2026-08-20' }, now)).toBe('on_board');
  });

  it('buckets future dates as upcoming', () => {
    expect(jobListBucket({ status: 'scheduled', scheduled_date: '2026-08-22' }, now)).toBe('upcoming');
  });
});

describe('jobListNext', () => {
  it('opens schedule on the job for date and crew', () => {
    expect(jobListNext({
      id: 'job-1', status: 'scheduled', scheduled_date: null, assigned_team: ['a'],
    }, now)).toEqual({
      href: '/jobs/job-1#job-schedule', label: 'Set a date', actionable: true,
    });
    expect(jobListNext({
      id: 'job-1', status: 'scheduled', scheduled_date: '2026-08-22', assigned_team: [],
    }, now)).toEqual({
      href: '/jobs/job-1#job-schedule', label: 'Assign crew', actionable: true,
    });
  });

  it('opens the job hub for on-site and dated work', () => {
    expect(jobListNext({
      id: 'job-1', status: 'in_progress', scheduled_date: '2026-08-20', assigned_team: ['a'],
    }, now).href).toBe('/jobs/job-1');
    expect(jobListNext({
      id: 'job-1', status: 'scheduled', scheduled_date: '2026-08-20', assigned_team: ['a'],
    }, now)).toMatchObject({ href: '/jobs/job-1', label: 'Today', actionable: true });
  });

  it('does not treat closed jobs as a Next control', () => {
    expect(jobListNext({
      id: 'job-1', status: 'completed', scheduled_date: '2026-08-20', assigned_team: ['a'],
    }, now).actionable).toBe(false);
  });
});

describe('jobCardHint', () => {
  it('asks for a date or crew before anything else', () => {
    expect(jobCardHint({ status: 'scheduled', scheduled_date: null, assigned_team: ['a'] }, now)).toBe('Set a date');
    expect(jobCardHint({ status: 'scheduled', scheduled_date: '2026-08-22', assigned_team: [] }, now)).toBe('Assign crew');
  });

  it('labels today and overdue open jobs', () => {
    expect(jobCardHint({ status: 'scheduled', scheduled_date: '2026-08-20', assigned_team: ['a'] }, now)).toBe('Today');
    expect(jobCardHint({ status: 'scheduled', scheduled_date: '2026-08-01', assigned_team: ['a'] }, now)).toBe('Still open');
  });
});

describe('boardDispatchHint', () => {
  it('only surfaces date and crew, matching the job card', () => {
    expect(boardDispatchHint({ status: 'scheduled', scheduled_date: null, assigned_team: ['a'] }, now)).toBe('Set a date');
    expect(boardDispatchHint({ status: 'scheduled', scheduled_date: '2026-08-20', assigned_team: [] }, now)).toBe('Assign crew');
    expect(boardDispatchHint({ status: 'scheduled', scheduled_date: '2026-08-20', assigned_team: ['a'] }, now)).toBeNull();
    expect(boardDispatchHint({ status: 'in_progress', scheduled_date: '2026-08-20', assigned_team: ['a'] }, now)).toBeNull();
  });
});

describe('partitionScheduleJobs', () => {
  it('keeps open jobs with no date findable, not on the dated board', () => {
    const jobs = [
      { id: '1', status: 'scheduled' as const, scheduled_date: null },
      { id: '2', status: 'scheduled' as const, scheduled_date: '2026-08-20' },
      { id: '3', status: 'cancelled' as const, scheduled_date: null },
      { id: '4', status: 'completed' as const, scheduled_date: '2026-08-20' },
    ];
    const { needsDate, onBoard } = partitionScheduleJobs(jobs, now);
    expect(needsDate.map(j => j.id)).toEqual(['1']);
    expect(onBoard.map(j => j.id).sort()).toEqual(['2', '4']);
  });
});

describe('recommendJobAction', () => {
  const base = {
    status: 'scheduled' as const,
    scheduledDate: '2026-08-20',
    crewCount: 1,
    jhaCount: 1,
    inspectionCount: 1,
    invoiceCount: 0,
    hasAcceptedQuote: false,
    hasBillLines: false,
    clockedOn: false,
  };

  it('schedules first when there is no date', () => {
    expect(recommendJobAction({ ...base, scheduledDate: null }).key).toBe('schedule');
  });

  it('asks for crew before paperwork', () => {
    expect(recommendJobAction({ ...base, crewCount: 0 }).key).toBe('crew');
  });

  it('starts JHA before inspection when both are missing', () => {
    expect(recommendJobAction({ ...base, jhaCount: 0, inspectionCount: 0 }).key).toBe('jha');
  });

  it('invoices from an accepted quote or a bill', () => {
    expect(recommendJobAction({
      ...base,
      status: 'completed',
      clockedOn: true,
      hasAcceptedQuote: true,
    }).key).toBe('invoice');
    expect(recommendJobAction({
      ...base,
      status: 'completed',
      clockedOn: true,
      hasBillLines: true,
    })).toMatchObject({ key: 'invoice', label: 'Invoice', detail: 'Invoice from the job bill.' });
    expect(recommendJobAction({
      ...base,
      hasBillLines: true,
    }).key).toBe('invoice');
  });

  it('does not nag for clock-on after the job is invoiced', () => {
    expect(recommendJobAction({
      ...base,
      status: 'completed',
      invoiceCount: 1,
      clockedOn: false,
    }).key).toBe('none');
  });

  it('sends the draft when the job has one and none is sent', () => {
    expect(recommendJobAction({
      ...base,
      status: 'completed',
      invoiceCount: 1,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
      clockedOn: true,
    })).toMatchObject({
      key: 'send',
      label: 'Send',
      detail: 'Email this invoice to the client. Status becomes sent only if it delivers.',
    });
    expect(recommendJobAction({
      ...base,
      status: 'in_progress',
      invoiceCount: 1,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
      clockedOn: true,
    }).key).toBe('send');
  });

  it('keeps Invoiced when every invoice is already sent, paid, or overdue', () => {
    expect(recommendJobAction({
      ...base,
      status: 'completed',
      invoiceCount: 1,
      hasDraftInvoice: false,
      hasIssuedInvoice: true,
      clockedOn: true,
    })).toMatchObject({ key: 'none', label: 'Invoiced' });
    expect(recommendJobAction({
      ...base,
      status: 'completed',
      invoiceCount: 2,
      hasDraftInvoice: true,
      hasIssuedInvoice: true,
      clockedOn: true,
    }).label).toBe('Invoiced');
  });

  it('matches list arriving Next on today — Arriving shortly, not Start JHA / Start inspection', () => {
    const today = {
      ...base,
      scheduledDate: '2026-08-20',
      jhaCount: 0,
      inspectionCount: 0,
      arrivingWindow: true,
      arrivingSent: false,
      phoneRowKind: 'tel' as const,
      phoneStored: '0412 345 678',
    };
    expect(recommendJobAction(today)).toMatchObject({
      key: 'arriving',
      label: ARRIVING_NEXT_LABEL,
    });
    expect(recommendArrivingSheetNext(today)?.key).toBe('arriving');
    const perthNow = new Date('2026-08-20T08:00:00.000Z');
    const wrapped = withReminderNext(
      { id: 'job-1', status: 'scheduled', scheduled_date: '2026-08-20', assigned_team: ['a'] },
      { href: '/jobs/job-1', label: recommendJobAction(today).label, actionable: true },
      perthNow,
    );
    expect(wrapped.label).toBe(ARRIVING_NEXT_LABEL);
    expect(isJobArrivingWindow({ status: 'scheduled', scheduled_date: '2026-08-20' }, perthNow)).toBe(true);
  });

  it('writes the number when arriving-window and the phone row is empty', () => {
    expect(recommendJobAction({
      ...base,
      jhaCount: 0,
      arrivingWindow: true,
      phoneRowKind: 'edit',
      phoneStored: '',
    })).toMatchObject({ key: 'phone', label: PHONE_NEXT_LABEL });
  });

  it('falls back to Clock In after arriving is sent, or when there is no sendable phone after write', () => {
    expect(recommendJobAction({
      ...base,
      jhaCount: 0,
      arrivingWindow: true,
      arrivingSent: true,
      phoneRowKind: 'tel',
      phoneStored: '0412 345 678',
    })).toMatchObject({ key: 'clock', label: CLOCK_IN_NEXT_LABEL });
    expect(recommendJobAction({
      ...base,
      jhaCount: 0,
      arrivingWindow: true,
      phoneRowKind: 'edit',
      phoneStored: 'call me',
    })).toMatchObject({ key: 'clock', label: CLOCK_IN_NEXT_LABEL });
    expect(recommendJobAction({
      ...base,
      jhaCount: 0,
      arrivingWindow: true,
      phoneRowKind: 'none',
      phoneStored: '',
    })).toMatchObject({ key: 'clock', label: CLOCK_IN_NEXT_LABEL });
    const perthNow = new Date('2026-08-20T08:00:00.000Z');
    expect(withReminderNext(
      { id: 'job-1', status: 'scheduled', scheduled_date: '2026-08-20', assigned_team: ['a'] },
      { href: '/jobs/job-1', label: CLOCK_IN_NEXT_LABEL, actionable: true },
      perthNow,
    ).label).toBe(CLOCK_IN_NEXT_LABEL);
    expect(withReminderNext(
      { id: 'job-1', status: 'scheduled', scheduled_date: '2026-08-20', assigned_team: ['a'] },
      { href: '/jobs/job-1', label: PHONE_NEXT_LABEL, actionable: true },
      perthNow,
    ).label).toBe(PHONE_NEXT_LABEL);
  });

  it('does not put Send ahead of date, crew, or paperwork', () => {
    const draft = {
      invoiceCount: 1,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
    };
    expect(recommendJobAction({ ...base, ...draft, scheduledDate: null }).key).toBe('schedule');
    expect(recommendJobAction({ ...base, ...draft, crewCount: 0 }).key).toBe('crew');
    expect(recommendJobAction({ ...base, ...draft, jhaCount: 0 }).key).toBe('jha');
    expect(recommendJobAction({ ...base, ...draft, inspectionCount: 0 }).key).toBe('inspect');
  });

  it('G1 — Clock off + no invoice → Invoice, not Start JHA / inspect / Take 5', () => {
    const afterClockOff = {
      ...base,
      status: 'in_progress' as const,
      jhaCount: 0,
      inspectionCount: 0,
      invoiceCount: 0,
      clockedOn: false,
      clockedOff: true,
      arrivingWindow: true,
      arrivingSent: true,
    };
    expect(recommendJobAction(afterClockOff)).toMatchObject({
      key: 'invoice',
      label: 'Invoice',
    });
    expect(recommendJobAction(afterClockOff).label).not.toBe('Start JHA');
    expect(recommendJobAction(afterClockOff).label).not.toBe('Start inspection');
    expect(recommendJobAction(afterClockOff).label).not.toBe('Start Take 5');
    expect(recommendJobAction(afterClockOff).label).not.toBe(CLOCK_IN_NEXT_LABEL);
    expect(recommendArrivingSheetNext(afterClockOff)).toBeNull();
    expect(recommendJobAction({
      ...afterClockOff,
      arrivingWindow: false,
      status: 'scheduled',
    }).key).toBe('invoice');
  });

  it('G2 — Clock off + draft unsent on that job → Send', () => {
    expect(recommendJobAction({
      ...base,
      status: 'in_progress',
      jhaCount: 0,
      inspectionCount: 0,
      invoiceCount: 1,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
      clockedOn: false,
      clockedOff: true,
      arrivingWindow: true,
      arrivingSent: true,
    })).toMatchObject({
      key: 'send',
      label: 'Send',
    });
  });

  it('office can still invoice a job that never clocked', () => {
    expect(recommendJobAction({
      ...base,
      status: 'completed',
      clockedOn: false,
      clockedOff: false,
      jhaCount: 0,
      inspectionCount: 0,
    }).key).toBe('invoice');
    expect(recommendJobAction({
      ...base,
      hasBillLines: true,
      clockedOn: false,
      clockedOff: false,
    }).key).toBe('invoice');
  });
});

describe('jobInvoiceActionFlags / pickJobDraftToSend', () => {
  const now = new Date(2026, 7, 20);

  it('flags a draft-only job as Send, not issued', () => {
    expect(jobInvoiceActionFlags([
      { id: 'inv-1', status: 'draft', due_date: null },
    ], now)).toEqual({
      invoiceCount: 1,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
    });
  });

  it('treats sent, paid, and overdue as issued — including sent past due', () => {
    expect(jobInvoiceActionFlags([{ id: 's', status: 'sent', due_date: '2026-09-01' }], now).hasIssuedInvoice).toBe(true);
    expect(jobInvoiceActionFlags([{ id: 'p', status: 'paid', due_date: '2026-08-01' }], now).hasIssuedInvoice).toBe(true);
    expect(jobInvoiceActionFlags([{ id: 'o', status: 'overdue', due_date: '2026-08-01' }], now).hasIssuedInvoice).toBe(true);
    expect(jobInvoiceActionFlags([{ id: 'late', status: 'sent', due_date: '2026-08-01' }], now)).toEqual({
      invoiceCount: 1,
      hasDraftInvoice: false,
      hasIssuedInvoice: true,
    });
  });

  it('picks the draft only when none is issued', () => {
    expect(pickJobDraftToSend([
      { id: 'newer', status: 'draft', due_date: null },
      { id: 'older', status: 'draft', due_date: null },
    ], now)?.id).toBe('newer');
    expect(pickJobDraftToSend([
      { id: 'draft', status: 'draft', due_date: null },
      { id: 'sent', status: 'sent', due_date: '2026-09-01' },
    ], now)).toBeNull();
    expect(pickJobDraftToSend([], now)).toBeNull();
  });
});

describe('jobOpenNext — scheduled today in Australia/Brisbane', () => {
  /** 08:00 Wednesday 2 Sep 2026 in Australia/Brisbane. UTC is still Tuesday 1 Sep. */
  const brisbaneMorning = new Date('2026-09-01T22:00:00.000Z');
  const todayJob = {
    id: 'job-1',
    status: 'scheduled' as const,
    scheduled_date: '2026-09-02',
    assigned_team: ['crew-1'],
  };
  const sheet = {
    jhaCount: 0,
    inspectionCount: 0,
    invoiceCount: 0,
    hasAcceptedQuote: false,
    hasBillLines: false,
    clockedOn: false,
    arrivingSent: false,
    phoneRowKind: 'tel' as const,
    phoneStored: '0412 345 678',
  };

  it('treats 2 Sep Brisbane as today — not UTC 1 Sep and not leftover Perth', () => {
    expect(VAN_TIME_ZONE).toBe('Australia/Brisbane');
    expect(todayYmd(brisbaneMorning, VAN_TIME_ZONE)).toBe('2026-09-02');
    expect(todayYmd(brisbaneMorning, 'UTC')).toBe('2026-09-01');
    expect(jobCardHint(todayJob, brisbaneMorning)).toBe('Today');
    expect(jobCardHint({ ...todayJob, scheduled_date: '2026-09-01' }, brisbaneMorning)).toBe('Still open');
    expect(isJobArrivingWindow(todayJob, brisbaneMorning)).toBe(true);
    expect(isJobArrivingWindow({ ...todayJob, scheduled_date: '2026-09-01' }, brisbaneMorning)).toBe(false);
  });

  it('early 2 Sep Brisbane is not leftover Perth 1 Sep', () => {
    // 01:00 2 Sep Brisbane = 23:00 1 Sep Perth
    const brisbaneEarly = new Date('2026-09-01T15:00:00.000Z');
    expect(todayYmd(brisbaneEarly, 'Australia/Perth')).toBe('2026-09-01');
    expect(todayYmd(brisbaneEarly, VAN_TIME_ZONE)).toBe('2026-09-02');
    expect(jobCardHint(todayJob, brisbaneEarly)).toBe('Today');
    expect(isJobArrivingWindow(todayJob, brisbaneEarly)).toBe(true);
  });

  it('scheduled today derives Arriving shortly without the caller passing arrivingWindow', () => {
    expect(recommendJobAction({
      status: 'scheduled',
      scheduledDate: '2026-09-02',
      crewCount: 1,
      jhaCount: 0,
      inspectionCount: 0,
      invoiceCount: 0,
      hasAcceptedQuote: false,
      hasBillLines: false,
      clockedOn: false,
      phoneRowKind: 'tel',
      phoneStored: '0412 345 678',
    }, brisbaneMorning)).toMatchObject({
      key: 'arriving',
      label: ARRIVING_NEXT_LABEL,
    });
  });

  it('sheet Next matches card — Arriving shortly, then Clock In; Start JHA is not primary', () => {
    const card = jobOpenNext(todayJob, undefined, brisbaneMorning);
    const arriving = jobOpenNext(todayJob, sheet, brisbaneMorning);
    expect(card.label).toBe(ARRIVING_NEXT_LABEL);
    expect(arriving.label).toBe(card.label);
    expect(arriving.action.key).toBe('arriving');
    expect(arriving.action.label).not.toBe('Start JHA');

    const clocked = jobOpenNext(todayJob, { ...sheet, arrivingSent: true }, brisbaneMorning);
    expect(clocked.label).toBe(CLOCK_IN_NEXT_LABEL);
    expect(clocked.action.key).toBe('clock');
    expect(clocked.action.label).not.toBe('Start JHA');

    const afterClockOff = jobOpenNext(todayJob, {
      ...sheet,
      arrivingSent: true,
      clockedOn: false,
      clockedOff: true,
    }, brisbaneMorning);
    expect(afterClockOff.label).toBe('Invoice');
    expect(withReminderNext(
      todayJob,
      { href: '/jobs/job-1', label: 'Invoice', actionable: true },
      brisbaneMorning,
    ).label).toBe('Invoice');
    expect(afterClockOff.action.key).toBe('invoice');
    expect(afterClockOff.action.label).not.toBe('Start JHA');
    expect(afterClockOff.action.label).not.toBe('Start inspection');
    expect(afterClockOff.action.label).not.toBe(CLOCK_IN_NEXT_LABEL);

    const afterClockOffDraft = jobOpenNext(todayJob, {
      ...sheet,
      arrivingSent: true,
      clockedOn: false,
      clockedOff: true,
      invoiceCount: 1,
      hasDraftInvoice: true,
      hasIssuedInvoice: false,
    }, brisbaneMorning);
    expect(afterClockOffDraft.label).toBe('Send');
    expect(afterClockOffDraft.action.key).toBe('send');
  });

  it('is honest when the job is not today', () => {
    const yesterday = jobOpenNext(
      { ...todayJob, scheduled_date: '2026-09-01' },
      sheet,
      brisbaneMorning,
    );
    expect(yesterday.label).toBe('Still open');
    expect(yesterday.action.key).toBe('none');
    expect(yesterday.action.label).not.toBe('Start JHA');

    const later = jobOpenNext(
      { ...todayJob, scheduled_date: '2026-09-04' },
      sheet,
      brisbaneMorning,
    );
    expect(later.label).toBe('Scheduled');
    expect(later.action.label).not.toBe('Start JHA');
    expect(later.action.label).not.toBe(ARRIVING_NEXT_LABEL);
  });
});
