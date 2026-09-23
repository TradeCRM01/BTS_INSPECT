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
    expect(commercial).toContain("const titleFace = quote ? 'Rajdhani'");
    expect(commercial).toContain("const bodyFace = quote ? 'Source Sans 3'");
    expect(commercial).not.toContain('Newsreader');
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

  it('fits the existing quote PDF iframe inside phones without changing the renderer', () => {
    const css = src('src/index.css');
    const preview = src('src/components/invoicing/CommercialPdfPreviewModal.tsx');

    expect(css).toContain('@media (max-width: 639px)');
    expect(css).toContain(".hub-quote-pdf-sheet iframe[title='Document PDF preview']");
    expect(css).toContain('width: calc(100% / 0.72) !important');
    expect(css).toContain('transform: scale(0.72)');
    expect(css).toContain('overflow-x: hidden');
    expect(preview).toContain('<iframe');
    expect(preview).toContain('src={url}');
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
