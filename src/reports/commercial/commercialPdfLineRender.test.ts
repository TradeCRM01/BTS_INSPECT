import { describe, expect, it } from 'vitest';
import { CommercialDocumentPdf } from './CommercialDocumentPdf';

function collectTexts(node: unknown, out: string[] = []): string[] {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectTexts(child, out);
    return out;
  }
  if (typeof node === 'object' && node !== null && 'props' in node) {
    collectTexts((node as { props?: { children?: unknown } }).props?.children, out);
  }
  return out;
}

describe('Commercial PDF render site pins 1.5 × 87.35 at $131.03', () => {
  it('renders the line Amount cell as $131.03, not $131.02', () => {
    const tree = CommercialDocumentPdf({
      data: {
        kind: 'quote',
        title: 'Pricing breakdown',
        docNumber: 'Q-0001',
        dateLabel: 'Date',
        dateValue: '19 Oct 2026',
        clientName: 'Northside',
        company: { name: 'QA Co' },
        inclusions: [],
        exclusions: [],
        lines: [{ description: 'Labour', quantity: 1.5, unit_price: 87.35 }],
        subtotal: 999,
        taxRate: 10,
        taxAmount: 99.9,
        total: 1098.9,
      },
    });
    const texts = collectTexts(tree);
    expect(texts).toContain('$131.03');
    expect(texts).not.toContain('$131.02');
  });
});
