import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONVERT_QUOTE_HELPER, quoteConvertShowsInline } from './quoteJobFields';
import { quoteJobIsFinished, recommendQuoteAction } from './quoteNextAction';
import { scheduleBookedAddTimeLabel } from './scheduleBoard';
import {
  TIMESHEET_ENTRY_DELETE_BILLING_CHECK,
  timesheetEntryDeleteUiState,
} from './timesheetEntryDelete';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-5b phone taps — guards', () => {
  it('P1-4: quote TOTAL bar wraps on narrow phone without clipping', () => {
    const css = src('src/index.css');
    expect(css).toContain('.hub-quote-totalbar');
    expect(css).toContain('flex-wrap: wrap');
    expect(css).toContain('.hub-quote-totalbar .hub-quote-display-total');
    expect(css).toContain('clamp(28px');
  });

  it('P1-5: job bill table keeps Charge and Line visible on phone', () => {
    const css = src('src/index.css');
    const panel = src('src/components/jobs/JobCostingPanel.tsx');
    expect(panel).toContain('job-bill-lines-table');
    expect(css).toContain('#job-bill .job-bill-lines-table th:nth-child(8)');
    expect(css).toContain('#job-bill .job-bill-lines-table th:nth-child(9)');
    expect(css).toContain('table-layout: fixed');
    expect(css).toContain('overflow-x: hidden');
  });

  it('P1-6: converted quote with open job shows Open job on list and editor', () => {
    expect(quoteJobIsFinished('scheduled')).toBe(false);
    expect(recommendQuoteAction({
      status: 'accepted',
      hasClient: true,
      hasLines: true,
      jobId: 'job-73',
      invoiceId: null,
      jobFinished: false,
    }).label).toBe('Open job');
    const page = src('src/pages/QuotesPage.tsx');
    expect(page).toContain("select('id, title, address, status')");
    expect(page).toContain('job_status:');
    expect(page).toContain("next.key === 'open_job' && quote.job_id");
    expect(page).toContain('navigate(`/jobs/${quote.job_id}`)');
    expect(page).toContain("next.key === 'open_job' && form.job_id");
    expect(page).toContain('btn-primary');
  });

  it('P1-7: untimed booked jobs show Add a time and open the schedule sheet', () => {
    const label = scheduleBookedAddTimeLabel('2026-10-09');
    expect(label).toContain('Booked');
    expect(label).toContain('Add a time');
    const schedule = src('src/pages/SchedulePage.tsx');
    expect(schedule).toContain('openBoardJob');
    expect(schedule).toContain('if (!job.start_time)');
    expect(schedule).toContain('openScheduleSheet(job)');
    const dispatchTest = src('src/lib/dispatch.test.ts');
    expect(dispatchTest).toContain('placePickedOnCell');
    expect(dispatchTest).toContain('rescheduleJobPatch');
    expect(dispatchTest).toContain('start_time: null');
    expect(dispatchTest).toContain("scheduled_date: '2026-08-25'");
  });

  it('P2: dispatch blur reverts blank time without saving', () => {
    const panel = src('src/components/jobs/JobDispatchPanel.tsx');
    expect(panel).toContain('if (!raw || !isValidCompleteTimeValue(raw))');
    expect(panel).toContain('setStartDraft(server)');
  });

  it('P2: delete copy and confirm lock', () => {
    expect(TIMESHEET_ENTRY_DELETE_BILLING_CHECK).toBe("Couldn't check billing, try again");
    const ui = timesheetEntryDeleteUiState(
      { id: 'e1', end_time: '2026-10-06T10:00:00.000Z' },
      { loaded: true, billingCheckOk: false, ids: new Set() },
    );
    expect(ui.lockMessage).toBe(TIMESHEET_ENTRY_DELETE_BILLING_CHECK);
    const ctl = src('src/components/timesheets/TimesheetEntryDeleteControl.tsx');
    expect(ctl).toContain('confirmDisabled={deleteMutation.isPending}');
  });

  it('P2: convert validation shows once in the convert section', () => {
    expect(CONVERT_QUOTE_HELPER).toBe('Pick a day, crew and start time.');
    expect(quoteConvertShowsInline('Set start and end times before converting.')).toBe(true);
    const page = src('src/pages/QuotesPage.tsx');
    expect(page).toContain('quoteConvertShowsInline');
    expect(page).toContain('hub-quote-convert-miss');
  });
});
