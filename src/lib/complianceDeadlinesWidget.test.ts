import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMPLIANCE_DEADLINES_EMPTY,
  COMPLIANCE_DEADLINES_LOAD_ERROR,
  COMPLIANCE_DEADLINES_SELECT,
  complianceDeadlinesCardCopy,
  complianceDeadlinesCardKind,
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
    const now = new Date('2026-09-03T00:00:00.000Z');
    const overdue = { id: 'o', title: 'Old ticket', next_due_date: '2026-08-01', status: 'overdue' };
    const upcoming = { id: 'u', title: 'Licence', next_due_date: '2026-09-18', status: 'upcoming' };
    const done = { id: 'd', title: 'Done', next_due_date: '2026-08-01', status: 'completed' };
    const split = splitComplianceDeadlines([overdue, upcoming, done], now);
    expect(split.overdue.map(row => row.id)).toEqual(['o']);
    expect(split.upcoming.map(row => row.id)).toEqual(['u']);
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
    expect(fn).not.toMatch(/Relovi|Littleloop/);
  });
});

function pageQueryBlockedSnippet(fn: string): boolean {
  return fn.includes('pageQueryBlocked(isError)');
}
