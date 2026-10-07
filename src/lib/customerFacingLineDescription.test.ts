import { describe, expect, it } from 'vitest';
import { customerFacingLineDescription } from './customerFacingLineDescription';

describe('customerFacingLineDescription', () => {
  it('strips a price-book code prefix for client-facing invoice lines', () => {
    expect(customerFacingLineDescription('PB-DEL-01 — 20mm conduit delete ok')).toBe('20mm conduit delete ok');
    expect(customerFacingLineDescription('SKU-1 - Widget')).toBe('Widget');
    expect(customerFacingLineDescription('Site labour')).toBe('Site labour');
  });
});
