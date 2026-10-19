import { describe, expect, it } from 'vitest';
import { isFinalisedInspection } from './isFinalisedInspection';

describe('isFinalisedInspection', () => {
  it('treats completed, issued, sent, and archived as finalised', () => {
    expect(isFinalisedInspection('completed')).toBe(true);
    expect(isFinalisedInspection('issued')).toBe(true);
    expect(isFinalisedInspection('sent')).toBe(true);
    expect(isFinalisedInspection('archived')).toBe(true);
  });

  it('treats an archived flag as finalised even on a draft status', () => {
    expect(isFinalisedInspection('draft', true)).toBe(true);
  });

  it('leaves draft and in-progress rows writable', () => {
    expect(isFinalisedInspection('draft')).toBe(false);
    expect(isFinalisedInspection('draft', false)).toBe(false);
    expect(isFinalisedInspection(null)).toBe(false);
    expect(isFinalisedInspection(undefined, false)).toBe(false);
  });
});
