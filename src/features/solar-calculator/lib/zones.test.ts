import { describe, expect, it } from 'vitest';
import { CER_POSTCODE_ZONE_RANGES } from './cerPostcodeZones';
import { ZONE_RATINGS } from './constants';
import {
  findCerRange,
  formatPostcode,
  lookupZone,
  parsePostcode,
  type SuburbZoneOverride,
} from './zones';

describe('CER postcode zone table integrity', () => {
  it('has 137 contiguous ranges covering 0–9999', () => {
    expect(CER_POSTCODE_ZONE_RANGES).toHaveLength(137);
    let prev = -1;
    for (const r of CER_POSTCODE_ZONE_RANGES) {
      expect(r.postcodeFrom).toBe(prev + 1);
      expect(r.postcodeFrom).toBeLessThanOrEqual(r.postcodeTo);
      expect(r.rating).toBe(ZONE_RATINGS[r.zone]);
      prev = r.postcodeTo;
    }
    expect(prev).toBe(9999);
  });
});

describe('parsePostcode', () => {
  it('accepts 3–4 digit AU postcodes', () => {
    expect(parsePostcode('4000')).toBe(4000);
    expect(parsePostcode('800')).toBe(800);
    expect(parsePostcode('0800')).toBe(800);
    expect(formatPostcode(800)).toBe('0800');
  });

  it('rejects invalid input', () => {
    expect(parsePostcode('')).toBeNull();
    expect(parsePostcode('40')).toBeNull();
    expect(parsePostcode('abc')).toBeNull();
  });
});

describe('lookupZone — CER ranges (QLD / AU samples)', () => {
  it('Brisbane 4000 → Zone 3 (1.382)', () => {
    const r = lookupZone({ postcode: '4000' });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.zone).toBe(3);
      expect(r.rating).toBe(1.382);
      expect(r.source).toBe('cer_range');
    }
  });

  it('Cairns 4870 → Zone 3 per official CER table', () => {
    // Commercial calculators sometimes get this wrong; CER Table 1 is authoritative.
    const r = lookupZone({ postcode: 4870 });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.zone).toBe(3);
      expect(findCerRange(4870)?.zone).toBe(3);
    }
  });

  it('Mount Isa 4825 → Zone 2', () => {
    const r = lookupZone({ postcode: '4825' });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.zone).toBe(2);
  });

  it('Birdsville 4482 → Zone 1', () => {
    const r = lookupZone({ postcode: '4482' });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.zone).toBe(1);
      expect(r.rating).toBe(1.622);
    }
  });

  it('Hobart 7000 → Zone 4', () => {
    const r = lookupZone({ postcode: '7000' });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.zone).toBe(4);
  });

  it('Darwin 0800 → Zone 2', () => {
    const r = lookupZone({ postcode: '0800' });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.zone).toBe(2);
  });
});

describe('lookupZone — split postcode / suburb selection', () => {
  const overrides: SuburbZoneOverride[] = [
    { postcode: 4870, suburb: 'Cairns City', zone: 3, rating: 1.382 },
    { postcode: 4870, suburb: 'Hypothetical Outback', zone: 2, rating: 1.536 },
  ];

  it('requires suburb when overrides disagree', () => {
    const r = lookupZone({ postcode: '4870', suburbOverrides: overrides });
    expect(r.status).toBe('needs_suburb');
    if (r.status === 'needs_suburb') {
      expect(r.suburbs).toHaveLength(2);
      expect(r.rangeFallback?.zone).toBe(3);
    }
  });

  it('resolves when suburb is selected', () => {
    const r = lookupZone({
      postcode: '4870',
      suburb: 'Hypothetical Outback',
      suburbOverrides: overrides,
    });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.zone).toBe(2);
      expect(r.suburb).toBe('Hypothetical Outback');
      expect(r.source).toBe('suburb_override');
    }
  });

  it('falls back to CER range when no overrides', () => {
    const r = lookupZone({ postcode: '4870', suburbOverrides: [] });
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') expect(r.source).toBe('cer_range');
  });
});
