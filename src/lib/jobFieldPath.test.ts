import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendJobFieldNote, isJobOnToday, nextJobStatusAfterField } from './jobFieldPath';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

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

  it('keeps the phone On-site strip as the only sticky primary', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const css = src('src/index.css');
    const bar = src('src/components/jobs/JobFieldPathBar.tsx');
    expect(page).toMatch(/ops-sticky[\s\S]*hidden lg:block/);
    expect(bar).toContain('job-field-path lg:hidden');
    expect(bar).toContain('onStartJha');
    expect(bar).toContain('onStartTake5');
    expect(bar).toContain('take5Ready');
    expect(bar).toContain('Start a JHA first — Take 5 needs that SWMS.');
    expect(page).toContain('take5Ready={(jhas ?? []).length > 0}');
    expect(page).not.toContain("showToast('Start a JHA / SWMS first, then Start Take 5')");
    expect(css).toMatch(/\.job-field-path \{[\s\S]*position:\s*sticky;[\s\S]*bottom:\s*0;/);
    expect(css).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*\.job-field-path \{[\s\S]*display:\s*none;/);
  });

  it('treats only open jobs dated today as today work', () => {
    const now = new Date(2026, 8, 13);
    expect(isJobOnToday({ status: 'scheduled', scheduled_date: '2026-09-13' }, now)).toBe(true);
    expect(isJobOnToday({ status: 'completed', scheduled_date: '2026-09-13' }, now)).toBe(false);
    expect(isJobOnToday({ status: 'scheduled', scheduled_date: '2026-09-14' }, now)).toBe(false);
  });
});
