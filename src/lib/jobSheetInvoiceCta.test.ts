import { describe, expect, it } from 'vitest';
import { formatMoney } from '../types/fsm';
import { canCreateJobInvoice, jobSheetInvoiceCtaLabel } from './jobSheetInvoiceCta';

describe('job sheet invoice CTA', () => {
  it('allows owner and admin and blocks every other role', () => {
    expect(canCreateJobInvoice('owner')).toBe(true);
    expect(canCreateJobInvoice('admin')).toBe(true);
    expect(canCreateJobInvoice('member')).toBe(false);
    expect(canCreateJobInvoice('tech')).toBe(false);
    expect(canCreateJobInvoice(null)).toBe(false);
  });

  it('prints Create invoice · $X with no spaces around the en dash money figure', () => {
    expect(jobSheetInvoiceCtaLabel(919.05)).toBe(`Create invoice · ${formatMoney(919.05)}`);
    expect(jobSheetInvoiceCtaLabel(919.05)).toBe('Create invoice · $919.05');
  });
});
