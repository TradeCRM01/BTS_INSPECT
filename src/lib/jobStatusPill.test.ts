import { describe, expect, it } from 'vitest';
import {
  JOB_PILL_DONE,
  JOB_PILL_IN_PROGRESS,
  JOB_PILL_NEEDS_CREW,
  JOB_PILL_NO_DATE,
  JOB_PILL_READY,
  JOB_PILL_SET_A_DATE,
  countJobsListFilter,
  jobMatchesListFilter,
  jobStatusPill,
} from './jobStatusPill';

describe('jobStatusPill D1', () => {
  it('marks uninvoiced and void-only completed jobs Ready to invoice', () => {
    expect(jobStatusPill({ status: 'completed', invoices: [] }).label).toBe(JOB_PILL_READY);
    expect(jobStatusPill({
      status: 'completed',
      invoices: [{ status: 'void' }],
    }).label).toBe(JOB_PILL_READY);
  });

  it('treats a draft as invoiced so the pill is Done', () => {
    expect(jobStatusPill({
      status: 'completed',
      invoices: [{ status: 'draft' }],
    }).label).toBe(JOB_PILL_DONE);
  });

  it('uses the parent invoice for a completed child visit', () => {
    expect(jobStatusPill({
      status: 'completed',
      invoices: [],
      parentInvoices: [{ status: 'sent' }],
    }).label).toBe(JOB_PILL_DONE);
  });

  it('keeps a parent with an open child on Done, not Ready to invoice', () => {
    expect(jobStatusPill({
      status: 'completed',
      invoices: [],
      children: [{ status: 'scheduled' }, { status: 'completed' }],
    }).label).toBe(JOB_PILL_DONE);
  });

  it('never shows Ready to invoice when the invoice read failed', () => {
    const pill = jobStatusPill({ status: 'completed', invoices: [], invoiceReadError: true });
    expect(pill.label).toBe(JOB_PILL_DONE);
    expect(pill.kind).not.toBe('ready_to_invoice');
  });

  it('uses the locked words for live, crew, undated, and cancelled jobs', () => {
    expect(jobStatusPill({ status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: [] }).label)
      .toBe(JOB_PILL_IN_PROGRESS);
    expect(jobStatusPill({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] }).label)
      .toBe(JOB_PILL_NEEDS_CREW);
    expect(jobStatusPill({ status: 'scheduled', scheduled_date: null, assigned_team: [] }).label)
      .toBe(JOB_PILL_NO_DATE);
    expect(jobStatusPill({ status: 'cancelled' }).label).toBe('Cancelled');
    expect(jobStatusPill({
      status: 'scheduled',
      scheduled_date: '2026-10-19',
      assigned_team: ['a'],
    }).label).toBe('Scheduled');
    expect(jobStatusPill({
      status: 'booked',
      scheduled_date: '2026-10-19',
      assigned_team: [],
    }).label).toBe(JOB_PILL_NEEDS_CREW);
    expect(jobStatusPill({
      status: 'booked',
      scheduled_date: '2026-10-19',
      assigned_team: [],
    }).label).not.toBe('Booked');
    expect(JOB_PILL_SET_A_DATE).toBe('Set a date');
  });

  it('filters Need crew and Ready to invoice from loaded rows', () => {
    const jobs = [
      { status: 'scheduled' as const, scheduled_date: '2026-10-19', assigned_team: [] },
      { status: 'scheduled' as const, scheduled_date: '2026-10-19', assigned_team: ['a'] },
      { status: 'in_progress' as const, scheduled_date: '2026-10-19', assigned_team: [] },
      { status: 'completed' as const, invoices: [] },
      { status: 'completed' as const, invoices: [{ status: 'draft' }], invoiceReadError: false },
    ];
    expect(countJobsListFilter(jobs, 'need_crew')).toBe(2);
    expect(countJobsListFilter(jobs, 'ready_to_invoice')).toBe(1);
    expect(jobMatchesListFilter(jobs[3], 'ready_to_invoice')).toBe(true);
    expect(jobMatchesListFilter({ ...jobs[3], invoiceReadError: true }, 'ready_to_invoice')).toBe(false);
  });
});
