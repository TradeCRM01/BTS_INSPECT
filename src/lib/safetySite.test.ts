import { describe, expect, it } from 'vitest';
import { trimSafetySite } from './safetySite';

describe('trimSafetySite', () => {
  it('trims a leading space so Site cannot persist as " 6"', () => {
    expect(trimSafetySite(' 6')).toBe('6');
    expect(trimSafetySite('  14 Kedron Brook Rd  ')).toBe('14 Kedron Brook Rd');
    expect(trimSafetySite('')).toBe('');
  });
});
