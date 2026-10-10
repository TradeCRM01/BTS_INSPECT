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
    expect(page).toContain('shouldQueryLiveEnquiries');
    expect(page).toContain('retry: false');
    expect(page).toContain('data-enquiry-review={reviewCount}');
    expect(page).toContain("event.key !== 'Escape'");
    expect(page).toContain('data-dismiss-error');
    expect(page).toContain('flight.reason === reason.key');
    expect(src('src/lib/missedCallEnquiry.ts')).toContain("/jobs?view=enquiries");
    expect(src('src/lib/missedCallEnquiry.ts')).toContain('ENQUIRY_SURFACE_LIVE = false');
    expect(page).toContain('From missed call');
    expect(page).toContain('Call back');
    expect(page).toContain('enquiryCallback');
    expect(page).toContain('OverlayPortal');
    expect(page).toContain('data-dismiss-cancel');
    expect(page).toContain("showEnquiries ? null : (");
    expect(page).toContain('hub-jobs-list-mark">List');
    expect(page).toContain("import.meta.env.DEV ? searchParams.get('look') : null");
    expect(page).toContain('ALREADY_APPROVED_TOAST');
    expect(page).not.toMatch(/\+614(?!18893602)\d+/);
    expect(css).toContain('calc(var(--shell-bottom-nav-h, 0px) + 12px)');
    expect(src('src/lib/missedCallEnquiry.ts')).toContain("if (!import.meta.env.DEV) return null");
    expect(src('src/lib/missedCallEnquiry.ts')).toContain("digits.startsWith('61') && digits.length === 11");
    expect(page).toContain('approveMissedCallEnquiry');
    expect(page).toContain('presetClientName={approving?.clientName ?? null}');
    expect(src('src/lib/missedCallEnquiry.ts')).toContain("rpc('approve_missed_call_enquiry'");
    expect(src('src/components/crm/JobFormModal.tsx')).toContain('clientsForSelect');
    expect(src('src/components/crm/JobFormModal.tsx')).toContain('data-job-creating');
    expect(css).toContain('.hub-jobs-enquiry-row');
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).toContain('background: #F5F0E6');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(css).toContain('.hub-jobs-enquiry-tap');
    expect(css).toContain('min-height: 44px');
  });

  it('ignores Escape while a dismiss is in flight, the same as the backdrop', () => {
    const page = src('src/pages/JobsPage.tsx');
    const escape = page.slice(
      page.indexOf("if (event.key !== 'Escape') return"),
      page.indexOf("window.addEventListener('keydown', onKey)"),
    );
    expect(escape).toContain('if (flight) return');
    expect(escape).not.toContain('setFlight(null)');
    const backdrop = page.slice(
      page.indexOf('aria-label="Dismiss enquiry"'),
      page.indexOf('hub-jobs-enquiry-dismiss-sheet'),
    );
    expect(backdrop).toContain('if (flight) return');
  });

  it('toasts already-approved only when approve hits already-decided', () => {
    const page = src('src/pages/JobsPage.tsx');
    const decidedAt = page.indexOf('if (result.alreadyDecided)');
    const decided = page.slice(decidedAt, decidedAt + 280);
    expect(decided).toContain('showToast(ALREADY_APPROVED_TOAST)');
    const openAt = page.lastIndexOf('Open job');
    const openJob = page.slice(openAt - 160, openAt + 12);
    expect(openJob).toContain('to={jobHref}');
    expect(openJob).not.toContain('showToast');
    expect(openJob).not.toContain('ALREADY_APPROVED_TOAST');
  });
});
