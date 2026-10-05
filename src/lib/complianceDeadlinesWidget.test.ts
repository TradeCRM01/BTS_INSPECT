import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_DEADLINES_EMPTY,
  COMPLIANCE_DEADLINES_LOAD_ERROR,
  COMPLIANCE_DEADLINES_SELECT,
  COMPLIANCE_DEADLINES_TZ,
  addComplianceDueDays,
  complianceDeadlinesCardCopy,
  complianceDeadlinesCardKind,
  perthCalendarDay,
  splitComplianceDeadlines,
} from './complianceDeadlinesWidget';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('complianceDeadlinesCardKind', () => {
  it('after retries settle, error is Couldn\'t load compliance and never All compliant', () => {
    const kind = complianceDeadlinesCardKind({
      isLoading: false,
      isError: true,
      overdueCount: 0,
      upcomingCount: 0,
    });
    expect(kind).toBe('error');
    expect(complianceDeadlinesCardCopy(kind)).toBe("Couldn't load compliance");
    expect(complianceDeadlinesCardCopy(kind)).toBe(COMPLIANCE_DEADLINES_LOAD_ERROR);
    expect(complianceDeadlinesCardCopy(kind)).not.toBe(COMPLIANCE_DEADLINES_EMPTY);
    expect(complianceDeadlinesCardCopy(kind)).not.toBe('All compliant');
    expect(complianceDeadlinesCardCopy(kind)).not.toBe('Loading…');
  });

  it('error wins over a lingering Loading flag', () => {
    expect(complianceDeadlinesCardKind({
      isLoading: true,
      isError: true,
      overdueCount: 0,
      upcomingCount: 0,
    })).toBe('error');
  });

  it('true empty is All compliant only when the query succeeded', () => {
    const kind = complianceDeadlinesCardKind({
      isLoading: false,
      isError: false,
      overdueCount: 0,
      upcomingCount: 0,
    });
    expect(kind).toBe('empty');
    expect(complianceDeadlinesCardCopy(kind)).toBe('All compliant');
  });
});

describe('splitComplianceDeadlines', () => {
  it('splits on next_due_date, not expiry_date', () => {
    const now = new Date('2026-09-03T08:00:00.000Z');
    const overdue = { id: 'o', title: 'Old ticket', next_due_date: '2026-08-01', status: 'overdue' };
    const upcoming = { id: 'u', title: 'Licence', next_due_date: '2026-09-18', status: 'upcoming' };
    const done = { id: 'd', title: 'Done', next_due_date: '2026-08-01', status: 'completed' };
    const split = splitComplianceDeadlines([overdue, upcoming, done], now);
    expect(split.overdue.map(row => row.id)).toEqual(['o']);
    expect(split.upcoming.map(row => row.id)).toEqual(['u']);
  });

  it('keeps a Perth due-today row upcoming at 23:59, overdue the next Perth day', () => {
    expect(COMPLIANCE_DEADLINES_TZ).toBe('Australia/Perth');
    const dueToday = { id: 'today', title: 'Licence EC-9988', next_due_date: '2026-10-05', status: 'upcoming' };
    const perth2359 = new Date('2026-10-05T15:59:00.000Z');
    expect(perthCalendarDay(perth2359)).toBe('2026-10-05');
    const stillDue = splitComplianceDeadlines([dueToday], perth2359);
    expect(stillDue.overdue.map(row => row.id)).toEqual([]);
    expect(stillDue.upcoming.map(row => row.id)).toEqual(['today']);

    const nextPerthMorning = new Date('2026-10-05T16:30:00.000Z');
    expect(perthCalendarDay(nextPerthMorning)).toBe('2026-10-06');
    const after = splitComplianceDeadlines([dueToday], nextPerthMorning);
    expect(after.overdue.map(row => row.id)).toEqual(['today']);
    expect(after.upcoming.map(row => row.id)).toEqual([]);
  });

  it('does not treat UTC-midnight today as overdue after 10am Brisbane', () => {
    const brisbane10am = new Date('2026-10-05T00:00:00.000Z');
    expect(perthCalendarDay(brisbane10am)).toBe('2026-10-05');
    const row = { id: 'today', next_due_date: '2026-10-05', status: 'upcoming' };
    const split = splitComplianceDeadlines([row], brisbane10am);
    expect(split.overdue).toEqual([]);
    expect(split.upcoming.map(r => r.id)).toEqual(['today']);
  });

  it('excludes completed from overdue and upcoming', () => {
    const now = new Date('2026-10-05T08:00:00.000Z');
    const today = perthCalendarDay(now);
    const donePast = { id: 'done-past', next_due_date: addComplianceDueDays(today, -10), status: 'completed' };
    const doneSoon = { id: 'done-soon', next_due_date: addComplianceDueDays(today, 7), status: 'completed' };
    const split = splitComplianceDeadlines([donePast, doneSoon], now);
    expect(split.overdue).toEqual([]);
    expect(split.upcoming).toEqual([]);
  });
});

describe('ComplianceDeadlinesWidget query and error copy', () => {
  it('selects live columns and shows the failed copy, never All compliant, on isError', () => {
    const widget = src('src/widgets/IntelligenceWidgets.tsx');
    expect(COMPLIANCE_DEADLINES_SELECT).toBe('id, title, next_due_date, status');
    expect(widget).toContain('COMPLIANCE_DEADLINES_SELECT');
    expect(widget).toContain("order('next_due_date', { ascending: true })");
    expect(widget).toContain('isError');
    expect(widget).toContain('pageQueryBlocked(isError)');
    expect(widget).toContain('complianceDeadlinesCardKind');
    expect(widget).toContain("Couldn't load compliance");
    expect(src('src/lib/complianceDeadlinesWidget.ts')).toContain("Couldn't load compliance");
    const fn = widget.slice(
      widget.indexOf('export function ComplianceDeadlinesWidget'),
      widget.indexOf('export function CashFlowWidget'),
    );
    expect(fn).not.toContain('expiry_date');
    expect(fn).not.toContain("'type'");
    expect(fn).not.toMatch(/select\([^)]*type/);
    expect(fn).not.toContain('assigned_to');
    const errorAt = fn.indexOf("Couldn't load compliance");
    const emptyAt = fn.indexOf("kind === 'empty'");
    expect(errorAt).toBeGreaterThan(-1);
    expect(emptyAt).toBeGreaterThan(errorAt);
    expect(fn).toContain("kind === 'error'");
    expect(pageQueryBlockedSnippet(fn)).toBe(true);
    expect(fn).toContain('text-[#EF4444]');
    expect(fn).toContain('text-[#D97706]');
    expect(fn).not.toContain('text-red-500');
    expect(fn).not.toContain('text-amber-600');
    expect(fn).not.toContain('text-amber-500');
    expect(fn).not.toContain('new Date(item.next_due_date');
    expect(fn).not.toMatch(/Relovi|Littleloop/);
  });
});

function pageQueryBlockedSnippet(fn: string): boolean {
  return fn.includes('pageQueryBlocked(isError)');
}
