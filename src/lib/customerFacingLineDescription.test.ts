import { describe, expect, it } from 'vitest';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import { customerFacingLineDescription } from './customerFacingLineDescription';

describe('customerFacingLineDescription', () => {
  const hyphenatedNames = ['Call-out fee', 'Re-pipe kitchen', 'Hot-water unit', 'T-piece 15mm'];

  it('keeps hyphenated trade names whole with no code', () => {
    for (const name of hyphenatedNames) {
      expect(customerFacingLineDescription(name)).toBe(name);
    }
  });

  it('keeps hyphenated trade names whole when a stored code is set but does not prefix the line', () => {
    for (const name of hyphenatedNames) {
      expect(customerFacingLineDescription(name, 'PB-DEL-06')).toBe(name);
    }
  });

  it('strips PB-DEL-06 with em dash when stored code matches', () => {
    expect(customerFacingLineDescription('PB-DEL-06 — Circuit labour hour', 'PB-DEL-06')).toBe('Circuit labour hour');
  });

  it('strips PB-DEL-06 with em dash heuristically when there is no stored code', () => {
    expect(customerFacingLineDescription('PB-DEL-06 — Circuit labour hour')).toBe('Circuit labour hour');
  });

  it('strips en dash and spaced hyphen variants', () => {
    expect(customerFacingLineDescription('PB-DEL-06 – Circuit labour hour')).toBe('Circuit labour hour');
    expect(customerFacingLineDescription('SKU-1 - Widget')).toBe('Widget');
  });

  it('with stored code X only strips that exact prefix and leaves other text intact', () => {
    expect(customerFacingLineDescription('X — Labour', 'X')).toBe('Labour');
    expect(customerFacingLineDescription('Call-out fee', 'X')).toBe('Call-out fee');
    expect(customerFacingLineDescription('Y — Labour', 'X')).toBe('Y — Labour');
  });

  it('does not strip at an unspaced hyphen', () => {
    expect(customerFacingLineDescription('Call-out fee')).toBe('Call-out fee');
    expect(customerFacingLineDescription('PB-DEL-06-Circuit labour')).toBe('PB-DEL-06-Circuit labour');
  });

  it('strips a price-book code prefix for typical invoice lines', () => {
    expect(customerFacingLineDescription('PB-DEL-01 — 20mm conduit delete ok')).toBe('20mm conduit delete ok');
    expect(customerFacingLineDescription('Site labour')).toBe('Site labour');
  });

  it('routes customer quote and invoice PDF lines through the helper', () => {
    const li = [{ description: 'PB-9 — LED batten', quantity: 1, unit_price: 42 }];
    expect(linesFromQuoteItems(li, 'invoice')[0]?.description).toBe('LED batten');
    expect(linesFromQuoteItems(li, 'quote')[0]?.description).toBe('LED batten');
  });
});
