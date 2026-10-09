import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('FIX-6 P1 invoice PDF and payment', () => {
  it('P1: invoice PDF preview uses FitH and the phone scale frame', () => {
    const preview = src('src/components/invoicing/CommercialPdfPreviewModal.tsx');
    const css = src('src/index.css');
    expect(preview).toContain('hub-invoice-pdf-frame');
    expect(preview).toContain("creamLook ? `${url}#toolbar=0&navpanes=0&view=FitH` : url");
    expect(css).toContain('.overlay-backdrop.hub-invoice-pdf-preview');
    expect(css).toContain('.hub-invoice-pdf-frame');
    expect(css).toContain(".hub-invoice-pdf-sheet iframe[title='Document PDF preview']");
    expect(css).toContain('transform: scale(calc(100cqi / var(--quote-pdf-page)))');
  });

  it('P1: phone invoice TOTAL bar wraps without clipping', () => {
    const css = src('src/index.css');
    expect(css).toContain('.hub-invoice-totalbar');
    expect(css).toContain('flex-wrap: wrap');
    expect(css).toContain('.hub-invoice-totalbar .hub-invoice-display-total');
    expect(css).toContain('clamp(28px');
  });

  it('P1: record payment primary stays 44px and How to pay stays on the invoice PDF', () => {
    const css = src('src/index.css');
    const page = src('src/pages/InvoicesPage.tsx');
    const pdf = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(page).toContain('InvoiceRecordPaymentSheet');
    expect(page).toContain('Record payment received');
    expect(css).toContain('.hub-invoice-payment-actions .btn-primary');
    expect(css).toMatch(/\.hub-invoice-payment-actions \.btn-primary \{[\s\S]{0,80}min-height:\s*44px/);
    expect(pdf).toContain('How to pay');
    expect(pdf).toContain('Payments to date');
    expect(pdf).toContain('Balance due');
  });
});
