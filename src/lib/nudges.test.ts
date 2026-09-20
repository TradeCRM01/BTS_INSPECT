import { describe, expect, it } from 'vitest';
import {
  deriveNudges,
  nudgeClockLabel,
  nudgeJobDetail,
  quoteChase,
  quoteChaseChipLabel,
  quoteChasePatch,
  type NudgeInvoice,
  type NudgeJob,
  type NudgeQuote,
} from './nudges';

const NOW = new Date(2026, 8, 11, 8, 30);
const ME = 'user-me';

function job(over: Partial<NudgeJob> & { id: string }): NudgeJob {
  return {
    job_number: 42,
    title: 'Switchboard upgrade',
    status: 'scheduled',
    scheduled_date: '2026-09-11',
    start_time: '09:00',
    assigned_team: [ME],
    address: '12 Workshop Rd, Perth WA 6000',
    ...over,
  };
}

function quote(over: Partial<NudgeQuote> & { id: string }): NudgeQuote {
  return { quote_number: 12, status: 'sent', updated_at: new Date(2026, 8, 5, 12).toISOString(), total: 1320, client_name: 'Sarah Lee', ...over };
}

function invoice(over: Partial<NudgeInvoice> & { id: string }): NudgeInvoice {
  return { invoice_number: 2002, status: 'sent', due_date: '2026-09-06', total: 836, client_name: 'Harbour Lights', ...over };
}

function derive(over: { jobs?: NudgeJob[]; quotes?: NudgeQuote[]; invoices?: NudgeInvoice[]; userId?: string | null; now?: Date }) {
  return deriveNudges({ jobs: [], quotes: [], invoices: [], userId: ME, now: NOW, ...over });
}

describe('leave_soon', () => {
  it('flags a scheduled job on my crew that starts inside the next hour', () => {
    expect(derive({ jobs: [job({ id: 'j1' })] })).toEqual([{
      key: 'leave_soon:j1',
      kind: 'leave_soon',
      label: 'Leave soon · 9:00 am',
      detail: '#0042 · Switchboard upgrade · Perth',
      href: '/jobs/j1',
    }]);
  });

  it('skips jobs already started, past the hour, on another crew, or not scheduled', () => {
    expect(derive({ jobs: [
      job({ id: 'started', start_time: '08:00' }),
      job({ id: 'later', start_time: '09:31' }),
      job({ id: 'daves', assigned_team: ['user-dave'] }),
      job({ id: 'onsite', status: 'in_progress' }),
      job({ id: 'allday', start_time: null }),
    ] })).toEqual([]);
    expect(derive({ jobs: [job({ id: 'unassigned', assigned_team: [] })] }).map(n => n.key)).toEqual(['leave_soon:unassigned']);
    expect(derive({ jobs: [job({ id: 'edge', start_time: '09:30' })] }).map(n => n.key)).toEqual(['leave_soon:edge']);
  });
});

describe('jobs_tomorrow', () => {
  it('lists up to three of tomorrow\'s jobs by start, all-day last', () => {
    const nudges = derive({ jobs: [
      job({ id: 't-allday', scheduled_date: '2026-09-12', start_time: null, title: 'Callout', job_number: 45, address: null }),
      job({ id: 't-late', scheduled_date: '2026-09-12', start_time: '13:00', title: 'Fit-off', job_number: 44 }),
      job({ id: 't-early', scheduled_date: '2026-09-12', start_time: '07:30', title: 'Rough-in', job_number: 43, address: '8 Wharf St, Fremantle WA 6160' }),
    ] });
    expect(nudges).toEqual([
      { key: 'jobs_tomorrow:t-early', kind: 'jobs_tomorrow', label: 'Tomorrow · 7:30 am', detail: '#0043 · Rough-in · Fremantle', href: '/jobs/t-early' },
      { key: 'jobs_tomorrow:t-late', kind: 'jobs_tomorrow', label: 'Tomorrow · 1:00 pm', detail: '#0044 · Fit-off · Perth', href: '/jobs/t-late' },
      { key: 'jobs_tomorrow:t-allday', kind: 'jobs_tomorrow', label: 'Tomorrow · All day', detail: '#0045 · Callout', href: '/jobs/t-allday' },
    ]);
  });

  it('rolls four or more into one schedule nudge', () => {
    const jobs = [46, 47, 48, 49].map(n => job({ id: `t-${n}`, scheduled_date: '2026-09-12', job_number: n, start_time: `0${n - 40}:00` }));
    expect(derive({ jobs })).toEqual([{
      key: 'jobs_tomorrow:all',
      kind: 'jobs_tomorrow',
      label: '4 jobs tomorrow',
      detail: '#0046 · #0047 · #0048',
      href: '/schedule',
    }]);
  });
});

describe('quoteChase', () => {
  const now = new Date(2026, 8, 11, 9, 30);

  it('is quiet on a sent quote five calendar days after its last touch', () => {
    expect(quoteChase({ status: 'sent', updated_at: new Date(2026, 8, 5, 16).toISOString() }, now))
      .toEqual({ state: 'quiet', days: 6 });
    expect(quoteChase({ status: 'sent', updated_at: new Date(2026, 8, 6, 23, 59).toISOString() }, now))
      .toEqual({ state: 'quiet', days: 5 });
    expect(quoteChase({ status: 'sent', updated_at: new Date(2026, 8, 7, 0, 1).toISOString() }, now)).toBeNull();
    expect(quoteChase({ status: 'accepted', updated_at: new Date(2026, 8, 1).toISOString() }, now)).toBeNull();
    expect(quoteChase({ status: 'draft', updated_at: new Date(2026, 8, 1).toISOString() }, now)).toBeNull();
  });

  it('lapses once the validity day has passed, even on a fresh quote, and stays valid through that day', () => {
    const fresh = new Date(2026, 8, 9, 12).toISOString();
    expect(quoteChase({ status: 'sent', updated_at: fresh, validity_date: '2026-09-10' }, now))
      .toEqual({ state: 'lapsed', days: 2, daysPast: 1 });
    expect(quoteChase({ status: 'sent', updated_at: fresh, validity_date: '2026-09-11' }, now)).toBeNull();
    expect(quoteChase({ status: 'sent', updated_at: new Date(2026, 8, 1, 12).toISOString(), validity_date: '2026-09-08' }, now))
      .toEqual({ state: 'lapsed', days: 10, daysPast: 3 });
    expect(quoteChase({ status: 'sent', updated_at: new Date(2026, 8, 1, 12).toISOString(), validity_date: 'soon' }, now))
      .toEqual({ state: 'quiet', days: 10 });
    expect(quoteChase({ status: 'accepted', updated_at: fresh, validity_date: '2026-09-01' }, now)).toBeNull();
  });

  it('prints the chip label for both states', () => {
    expect(quoteChaseChipLabel({ state: 'quiet', days: 6 })).toBe('Chase · 6 days');
    expect(quoteChaseChipLabel({ state: 'quiet', days: 1 })).toBe('Chase · 1 day');
    expect(quoteChaseChipLabel({ state: 'lapsed', days: 9, daysPast: 3 })).toBe('Lapsed · 3 days');
    expect(quoteChaseChipLabel({ state: 'lapsed', days: 9, daysPast: 1 })).toBe('Lapsed · 1 day');
  });

  it('stamps updated_at after a re-share of a sent quote only', () => {
    expect(quoteChasePatch({ status: 'sent' }, now)).toEqual({ updated_at: now.toISOString() });
    expect(quoteChasePatch({ status: 'draft' }, now)).toBeNull();
    expect(quoteChasePatch({ status: 'accepted' }, now)).toBeNull();
  });
});

describe('quote_chase', () => {
  it('chases a sent quote five or more calendar days after its last update', () => {
    expect(derive({ quotes: [quote({ id: 'q1' })] })).toEqual([{
      key: 'quote_chase:q1',
      kind: 'quote_chase',
      label: 'Chase quote #0012',
      detail: 'Quiet 6 days · $1,320.00 · Sarah Lee',
      href: '/quotes?id=q1&send=1',
    }]);
    expect(derive({ quotes: [quote({ id: 'q-fresh', updated_at: new Date(2026, 8, 7, 12).toISOString() })] })).toEqual([]);
    expect(derive({ quotes: [quote({ id: 'q-five', updated_at: new Date(2026, 8, 6, 17).toISOString(), client_name: null, total: 0 })] })[0])
      .toMatchObject({ label: 'Chase quote #0012', detail: 'Quiet 5 days' });
    expect(derive({ quotes: [quote({ id: 'q-accepted', status: 'accepted' })] })).toEqual([]);
  });

  it('names a lapsed quote by its validity day and opens the editor, not the send dialog', () => {
    expect(derive({ quotes: [quote({ id: 'q-lapsed', validity_date: '2026-09-08', total: 2000 })] })).toEqual([{
      key: 'quote_chase:q-lapsed',
      kind: 'quote_chase',
      label: 'Quote #0012 lapsed',
      detail: 'Valid to 8 Sep · $2,000.00 · Sarah Lee',
      href: '/quotes?id=q-lapsed',
    }]);
    expect(derive({ quotes: [quote({ id: 'q-valid', validity_date: '2026-09-11' })] })[0])
      .toMatchObject({ label: 'Chase quote #0012', href: '/quotes?id=q-valid&send=1' });
  });

  it('rolls four or more stale quotes into one Sent filter nudge', () => {
    const quotes = [12, 13, 14, 15].map(n => quote({
      id: `q-${n}`,
      quote_number: n,
      updated_at: new Date(2026, 8, 17 - n, 12).toISOString(),
    }));
    expect(derive({ quotes })).toEqual([{
      key: 'quote_chase:all',
      kind: 'quote_chase',
      label: '4 quotes to chase',
      detail: '#0015 · #0014 · #0013',
      href: '/quotes?status=sent',
    }]);
  });
});

describe('invoice_unpaid', () => {
  it('names sent-past-due and overdue invoices with days, client, total, and chased', () => {
    expect(derive({ invoices: [
      invoice({ id: 'i1' }),
      invoice({ id: 'i2', invoice_number: 2003, status: 'overdue', due_date: '2026-09-10', total: 1200.5, chased_at: '2026-09-11T00:00:00.000Z', client_name: null }),
    ] })).toEqual([
      { key: 'invoice_unpaid:i1', kind: 'invoice_unpaid', label: 'Unpaid invoice #2002', detail: '5 days overdue · Harbour Lights · $836.00', href: '/invoices?id=i1' },
      { key: 'invoice_unpaid:i2', kind: 'invoice_unpaid', label: 'Unpaid invoice #2003', detail: '1 day overdue · $1,200.50 · chased', href: '/invoices?id=i2' },
    ]);
  });

  it('leaves sent-and-not-yet-due, due today, paid, and draft alone', () => {
    expect(derive({ invoices: [
      invoice({ id: 'due-today', due_date: '2026-09-11' }),
      invoice({ id: 'due-later', due_date: '2026-09-20' }),
      invoice({ id: 'paid', status: 'paid', due_date: '2026-09-01' }),
      invoice({ id: 'draft', status: 'draft', due_date: '2026-09-01' }),
    ] })).toEqual([]);
    expect(derive({ invoices: [invoice({ id: 'no-date', status: 'overdue', due_date: null })] })[0].detail)
      .toBe('Overdue · Harbour Lights · $836.00');
  });
});

describe('deriveNudges', () => {
  it('orders leave soon, tomorrow, quotes, invoices and caps at six', () => {
    const nudges = derive({
      jobs: [
        job({ id: 'j-now' }),
        job({ id: 't1', scheduled_date: '2026-09-12', start_time: '07:00' }),
        job({ id: 't2', scheduled_date: '2026-09-12', start_time: '10:00' }),
      ],
      quotes: [quote({ id: 'q1' }), quote({ id: 'q2', quote_number: 13 })],
      invoices: [invoice({ id: 'i1' }), invoice({ id: 'i2', invoice_number: 2003 })],
    });
    expect(nudges.map(n => n.kind)).toEqual([
      'leave_soon', 'jobs_tomorrow', 'jobs_tomorrow', 'quote_chase', 'quote_chase', 'invoice_unpaid',
    ]);
    expect(nudges).toHaveLength(6);
  });

  it('shows an unassigned job to a signed-out viewer but not an assigned one', () => {
    expect(derive({ userId: null, jobs: [job({ id: 'mine' }), job({ id: 'open', assigned_team: null })] }).map(n => n.key))
      .toEqual(['leave_soon:open']);
  });
});

describe('job copy helpers', () => {
  it('prints the clock and the detail line', () => {
    expect(nudgeClockLabel({ scheduled_date: '2026-09-11', start_time: '14:05:00' })).toBe('2:05 pm');
    expect(nudgeClockLabel({ scheduled_date: '2026-09-11', start_time: null })).toBe('All day');
    expect(nudgeJobDetail(job({ id: 'x', address: null, client_address: '3 Bay Rd, Cottesloe WA 6011' })))
      .toBe('#0042 · Switchboard upgrade · Cottesloe');
  });
});
