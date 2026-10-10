import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('jobs enquiries LOOK — same jobs paper', () => {
  it('keeps enquiries on the jobs sheet with cream, sheet, navy, and 44px taps', () => {
    const page = src('src/pages/JobsPage.tsx');
    const css = src('src/index.css');
    expect(page).toContain('data-jobs-view="enquiries"');
    expect(page).toContain('ENQUIRIES_VIEW');
    expect(src('src/lib/missedCallEnquiry.ts')).toContain("/jobs?view=enquiries");
    expect(page).toContain('From missed call');
    expect(page).toContain('approveMissedCallEnquiry');
    expect(src('src/lib/missedCallEnquiry.ts')).toContain("rpc('approve_missed_call_enquiry'");
    expect(css).toContain('.hub-jobs-enquiry-row');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(css).toContain('.hub-jobs-enquiry-tap');
    expect(css).toContain('min-height: 44px');
  });
});
