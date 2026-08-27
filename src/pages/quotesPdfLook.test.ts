import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('quote PDF Looplet document look', () => {
  it('applies cream paper, navy total bar, and hairline to quotes only', () => {
    const commercial = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(commercial).toContain("kind === 'quote'");
    expect(commercial).toContain("backgroundColor: quote ? '#F5F0E6'");
    expect(commercial).toContain("'#E2D9CC'");
    expect(commercial).toContain("backgroundColor: colors.navy");
    expect(commercial).toContain('formatMoney(data.subtotal)');
    expect(commercial).toContain('formatMoney(data.taxAmount)');
    expect(commercial).toContain('formatMoney(data.total)');
    expect(commercial).not.toMatch(/grafter|relovi|littleloop/i);

    const preview = src('src/components/invoicing/CommercialPdfPreviewModal.tsx');
    expect(preview).toContain("data.kind === 'quote'");
    expect(preview).toContain('hub-quote-pdf-preview');
  });

  it('does not change invoice or purchase order chrome tokens', () => {
    const commercial = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(commercial).toContain("kind === 'invoice'");
    expect(commercial).toContain("kind === 'purchase_order'");
    expect(commercial).toContain('commercialDocumentColors');
    expect(commercial).toContain('company.report_theme');
  });

  it('LOOK frames cover quote PDF desktop and phone only', () => {
    for (const rel of [
      'docs/look/quote-pdf-desktop.png',
      'docs/look/quote-pdf-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
