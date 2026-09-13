import { describe, expect, it } from 'vitest';
import { isMissingColumnError } from './missingColumn';

describe('isMissingColumnError', () => {
  it('treats Postgres 42703 as a missing column', () => {
    expect(isMissingColumnError({ code: '42703', message: 'column inspections.due_on does not exist' })).toBe(true);
  });

  it('treats the PostgREST wording as a missing column', () => {
    expect(isMissingColumnError({ message: 'column due_on does not exist' })).toBe(true);
  });

  it('does not treat a network or RLS miss as a missing column', () => {
    expect(isMissingColumnError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingColumnError({ message: 'Failed to fetch' })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});
