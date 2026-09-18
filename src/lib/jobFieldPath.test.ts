import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendJobFieldNote, isJobOnToday, nextJobStatusAfterField } from './jobFieldPath';

describe('job field path', () => {
  it('closes the job on All done and keeps it live on More to do', () => {
    expect(nextJobStatusAfterField('all_done', 'in_progress')).toBe('completed');
    expect(nextJobStatusAfterField('more_to_do', 'scheduled')).toBe('in_progress');
    expect(nextJobStatusAfterField('all_done', 'cancelled')).toBe('cancelled');
  });

  it('stamps a field note without inventing a blank line', () => {
    expect(appendJobFieldNote(null, '  ', new Date('2026-09-16T10:00:00'))).toBeNull();
    expect(appendJobFieldNote(null, 'Board labelled', new Date('2026-09-16T10:05:00')))
      .toBe('2026-09-16 10:05  Board labelled');
  });

  it("treats only today's open jobs as on-site candidates", () => {
    expect(isJobOnToday({ status: 'scheduled', scheduled_date: '2026-09-16' }, new Date('2026-09-16T08:00:00'))).toBe(true);
    expect(isJobOnToday({ status: 'completed', scheduled_date: '2026-09-16' }, new Date('2026-09-16T08:00:00'))).toBe(false);
    expect(isJobOnToday({ status: 'scheduled', scheduled_date: '2026-09-15' }, new Date('2026-09-16T08:00:00'))).toBe(false);
  });

  it('keeps the On-site strip sticky on phones and hidden on desktop', () => {
    const src = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
    const bar = src('src/components/jobs/JobFieldPathBar.tsx');
    const css = src('src/index.css');
    expect(bar).toContain('job-field-path lg:hidden');
    expect(css).toMatch(/\.job-field-path \{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;/);
    expect(css).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*\.job-field-path \{[\s\S]*display:\s*none;/);
  });
});
