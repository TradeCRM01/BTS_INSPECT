import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('invoice PDF cream document look', () => {
  it('applies cream paper, navy total bar, and Newsreader totals to invoices', () => {
    const commercial = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(commercial).toContain("kind === 'invoice'");
    expect(commercial).toContain("kind === 'quote' || kind === 'invoice'");
    expect(commercial).toContain("backgroundColor: quote ? '#F5F0E6'");
    expect(commercial).toContain("'#E2D9CC'");
    expect(commercial).toContain("kind === 'invoice' ? 'Newsreader'");
    expect(commercial).not.toContain('Syne');
    expect(commercial).not.toContain('SpaceGrotesk');
    expect(commercial).toContain("backgroundColor: colors.navy");
    expect(commercial).toContain('formatMoney(data.subtotal)');
    expect(commercial).toContain('formatMoney(data.taxAmount)');
    expect(commercial).toContain('formatMoney(data.total)');
    expect(commercial).not.toMatch(/grafter|relovi|littleloop/i);

    const fonts = src('src/reports/shared/fonts.ts');
    expect(fonts).toContain("family: 'Newsreader'");
    expect(fonts).not.toContain('Syne');
    expect(fonts).not.toContain('SpaceGrotesk');

    const preview = src('src/components/invoicing/CommercialPdfPreviewModal.tsx');
    expect(preview).toContain("data.kind === 'invoice'");
    expect(preview).toContain('hub-invoice-pdf-preview');
  });

  it('does not change purchase order chrome tokens', () => {
    const commercial = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(commercial).toContain("kind === 'purchase_order'");
    expect(commercial).toContain('commercialDocumentColors');
    expect(commercial).toContain('company.report_theme');
  });

  it('LOOK frames cover invoice PDF desktop and phone only', () => {
    for (const rel of [
      'docs/look/invoice-pdf-desktop.png',
      'docs/look/invoice-pdf-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
