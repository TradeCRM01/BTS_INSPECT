import { describe, expect, it } from 'vitest';
import { jobFieldsFromQuote, padQuoteNumber } from './quoteJobFields';

describe('jobFieldsFromQuote', () => {
  const base = {
    quote_number: 12,
    client_id: 'client-1',
    description: 'Switchboard upgrade',
    scope_of_works: 'Replace main board and label circuits.',
    total: 4400.5,
  };

  it('copies client, scope, budget and client address', () => {
    expect(jobFieldsFromQuote(base, '12 Smith St, Geelong VIC')).toEqual({
      client_id: 'client-1',
      title: 'Switchboard upgrade',
      description: 'Replace main board and label circuits.',
      address: '12 Smith St, Geelong VIC',
      budget: 4400.5,
      status: 'scheduled',
      priority: 'medium',
    });
  });

  it('falls back to Job from Quote # when description is empty', () => {
    const fields = jobFieldsFromQuote({ ...base, description: '  ' }, null);
    expect(fields.title).toBe('Job from Quote #0012');
    expect(fields.address).toBeNull();
    expect(fields.description).toBe('Replace main board and label circuits.');
  });

  it('pads quote numbers', () => {
    expect(padQuoteNumber(7)).toBe('0007');
    expect(padQuoteNumber(null)).toBe('0000');
  });
});
