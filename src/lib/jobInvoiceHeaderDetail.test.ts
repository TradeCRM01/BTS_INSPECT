import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobInvoiceHeaderDetailContent } from './jobInvoiceHeaderDetail';

describe('jobInvoiceHeaderDetailContent', () => {
  it('reserves height while the invoice preview is loading', () => {
    const loading = jobInvoiceHeaderDetailContent({
      nextKey: 'invoice',
      headerPrimaryHeld: false,
      previewState: 'loading',
      detail: '',
    });
    expect(loading.reserveHeight).toBe(true);
    expect(loading.showSkeleton).toBe(true);

    const ready = jobInvoiceHeaderDetailContent({
      nextKey: 'invoice',
      headerPrimaryHeld: false,
      previewState: 'ready',
      detail: 'From job · 1 line · $365.75 inc GST',
    });
    expect(ready.reserveHeight).toBe(true);
    expect(ready.showSkeleton).toBe(false);
    expect(ready.text).toContain('inc GST');
  });

  it('JobDetailPage keeps the invoice preview wrapper and reserved detail', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/JobDetailPage.tsx'), 'utf8');
    expect(page).toContain('hub-job-invoice-next-preview');
    expect(page).toContain('data-job-invoice-detail-reserved');
    expect(page).toContain('jobInvoiceHeaderDetailContent');
  });
});
