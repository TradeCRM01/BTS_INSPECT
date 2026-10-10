import { describe, expect, it } from 'vitest';
import {
  JOB_INVOICE_CREATE_HOLD_MS,
  jobInvoiceCreateHoldActive,
  releaseJobInvoiceCreateHold,
  setJobInvoiceCreateHold,
} from './jobInvoiceCreateHold';

describe('jobInvoiceCreateHold', () => {
  it('swallows taps for 400ms after create release so Jobs is not hit', () => {
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
});
