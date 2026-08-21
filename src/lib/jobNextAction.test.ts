import { describe, expect, it } from 'vitest';
import { boardDispatchHint, jobCardHint, jobInvoiceActionFlags, jobListBucket, jobListNext, partitionScheduleJobs, pickJobDraftToSend, recommendJobAction } from './jobNextAction';

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
