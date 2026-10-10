import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  JOB_INVOICE_CREATE_HOLD_CAP_MS,
  JOB_INVOICE_CREATE_HOLD_MS,
  clearJobInvoiceCreateHold,
  jobInvoiceCreateHoldActive,
  jobInvoiceCreateHoldPath,
  jobInvoiceCreateHoldUntil,
  releaseJobInvoiceCreateHold,
  setJobInvoiceCreateHold,
} from './jobInvoiceCreateHold';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('jobInvoiceCreateHold', () => {
  it('swallows taps for 400ms after create release so Jobs is not hit', () => {
    clearJobInvoiceCreateHold();
    setJobInvoiceCreateHold(true, 1000);
    expect(jobInvoiceCreateHoldActive(1000)).toBe(true);
    expect(jobInvoiceCreateHoldActive(1399)).toBe(true);
    releaseJobInvoiceCreateHold(1400);
    expect(JOB_INVOICE_CREATE_HOLD_MS).toBe(400);
    expect(jobInvoiceCreateHoldActive(1799)).toBe(true);
    expect(jobInvoiceCreateHoldActive(1800)).toBe(false);
    setJobInvoiceCreateHold(false, 2000);
    expect(jobInvoiceCreateHoldActive(2000)).toBe(false);
  });

  it('releases when the landing fetch fails', () => {
    clearJobInvoiceCreateHold();
    setJobInvoiceCreateHold(true, 1000);
    expect(jobInvoiceCreateHoldActive(5000)).toBe(true);
    clearJobInvoiceCreateHold();
    expect(jobInvoiceCreateHoldActive(5001)).toBe(false);
    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain('openedInvoiceError');
    expect(invoices).toMatch(/if \(openedInvoiceError\) \{\s*clearJobInvoiceCreateHold\(\);/);
  });

  it('releases when the landing fetch is empty', () => {
    clearJobInvoiceCreateHold();
    setJobInvoiceCreateHold(true, 1000);
    clearJobInvoiceCreateHold();
    expect(jobInvoiceCreateHoldActive(1000)).toBe(false);
    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toMatch(/if \(!openedInvoice\) \{\s*clearJobInvoiceCreateHold\(\);/);
  });

  it('releases at the cap', () => {
    clearJobInvoiceCreateHold();
    expect(JOB_INVOICE_CREATE_HOLD_CAP_MS).toBe(15_000);
    setJobInvoiceCreateHold(true, 1000);
    expect(jobInvoiceCreateHoldActive(15_999)).toBe(true);
    expect(jobInvoiceCreateHoldActive(16_000)).toBe(false);
    expect(jobInvoiceCreateHoldUntil(15_999)).toBe(16_000);
    expect(jobInvoiceCreateHoldUntil(16_000)).toBe(0);
  });

  it('scopes the overlay to the job page and invoice landing', () => {
    expect(jobInvoiceCreateHoldPath('/jobs/abc')).toBe(true);
    expect(jobInvoiceCreateHoldPath('/invoices')).toBe(true);
    expect(jobInvoiceCreateHoldPath('/invoices?id=x')).toBe(true);
    expect(jobInvoiceCreateHoldPath('/')).toBe(false);
    expect(jobInvoiceCreateHoldPath('/jobs')).toBe(false);
    const overlay = src('src/components/jobs/JobInvoiceCreateHoldOverlay.tsx');
    expect(overlay).toContain('jobInvoiceCreateHoldPath');
    expect(overlay).toContain('Creating invoice…');
    expect(overlay).toContain('subscribeJobInvoiceCreateHold');
    expect(overlay).toContain('jobInvoiceCreateHoldUntil');
    expect(overlay).not.toContain('setInterval');
    expect(src('src/components/layout/PageErrorBoundary.tsx')).toContain('clearJobInvoiceCreateHold()');
    expect(src('src/pages/JobDetailPage.tsx')).toContain('releaseJobInvoiceCreateHold()');
  });
});
