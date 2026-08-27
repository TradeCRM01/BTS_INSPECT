import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('job sheet cream paper look', () => {
  it('paints the sheet as a living job with one 44px primary', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const css = src('src/index.css');

    expect(page).toContain('hub-jobs');
    expect(page).toContain('hub-job-sheet');
    expect(page).toContain('hub-job-letterhead');
    expect(page).toContain('hub-job-kicker">Site');
    expect(page).toContain('hub-job-kicker">Client');
    expect(page).toContain('hub-job-more');
    expect(page).toContain('ops-next-control-block');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect(page).toContain('Job status');
    expect(page).not.toContain('ActionButton recommended');
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-job-sheet');
    expect(css).toContain('.hub-job-banner');
    expect(css).toContain('border-radius: 16px');
    expect(css).not.toMatch(/\.hub-jobs \.hub-job-toolbar \.btn-primary[\s\S]{0,120}#111|#000\b/);
  });

  it('keeps persist, schedule, reminder, and send writes on the existing path', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    expect(page).toContain('updateStatus.mutate');
    expect(page).toContain('id="job-schedule"');
    expect(page).toContain('JobDispatchPanel');
    expect(page).toContain('JobClientReminder');
    expect(page).toContain('sendJobDraftInvoice');
    expect(page).toContain('createInvoiceFromJobBill');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('InvoiceSendDialog');
  });

  it('LOOK frames cover job sheet desktop and phone only', () => {
    for (const rel of [
      'docs/look/job-sheet-desktop.png',
      'docs/look/job-sheet-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
