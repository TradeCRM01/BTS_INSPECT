/**
 * Postcode → STC zone lookup.
 * Uses official CER Table 1 ranges; suburb overrides for split postcodes.
 * Pure functions — no React / Supabase imports.
 */

import { ZONE_RATINGS, type StcZone } from './constants';
import {
  CER_POSTCODE_ZONE_RANGES,
  CER_ZONE_TABLE_AS_AT,
  CER_ZONE_TABLE_SOURCE_URL,
  type CerZoneRange,
} from './cerPostcodeZones';

export type SuburbZoneOverride = {
  postcode: number;
  suburb: string;
  zone: StcZone;
  rating: number;
};

export type ZoneLookupResolved = {
  status: 'resolved';
  postcode: string;
  zone: StcZone;
  rating: number;
  /** Suburb used when a split postcode was disambiguated */
  suburb: string | null;
  source: 'cer_range' | 'suburb_override';
  tableAsAt: string;
  sourceUrl: string;
};

export type ZoneLookupNeedsSuburb = {
  status: 'needs_suburb';
  postcode: string;
  suburbs: Array<{ suburb: string; zone: StcZone; rating: number }>;
  /** Range-based fallback if suburb not chosen (same for all CER ranges; overrides differ) */
  rangeFallback: { zone: StcZone; rating: number } | null;
  tableAsAt: string;
  sourceUrl: string;
};

export type ZoneLookupInvalid = {
  status: 'invalid_postcode';
  postcode: string;
  message: string;
};

export type ZoneLookupResult =
  | ZoneLookupResolved
  | ZoneLookupNeedsSuburb
  | ZoneLookupInvalid;

/** Normalise AU postcode input to 0–9999 integer, or null if invalid. */
export function parsePostcode(raw: string | number): number | null {
  const digits = String(raw ?? '').replace(/\s+/g, '').trim();
  if (!/^\d{3,4}$/.test(digits)) return null;
  const n = Number(digits);
  if (n < 0 || n > 9999) return null;
  return n;
}

/** Format as 4-digit AU postcode string (e.g. 800 → "0800"). */
export function formatPostcode(n: number): string {
  return String(n).padStart(4, '0');
}

export function findCerRange(
  postcode: number,
  ranges: readonly CerZoneRange[] = CER_POSTCODE_ZONE_RANGES,
): CerZoneRange | null {
  // Ranges are contiguous and sorted — linear scan is fine (137 rows)
  for (const r of ranges) {
    if (postcode >= r.postcodeFrom && postcode <= r.postcodeTo) return r;
  }
  return null;
}

function normaliseSuburb(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Look up STC zone for a postcode.
 * If `suburbOverrides` contains multiple suburbs for this postcode and no suburb
 * (or an unmatched suburb) is provided, returns `needs_suburb`.
 */
export function lookupZone(input: {
  postcode: string | number;
  suburb?: string | null;
  suburbOverrides?: readonly SuburbZoneOverride[];
  ranges?: readonly CerZoneRange[];
}): ZoneLookupResult {
  const n = parsePostcode(input.postcode);
  if (n == null) {
    return {
      status: 'invalid_postcode',
      postcode: String(input.postcode ?? ''),
      message: 'Enter a valid Australian postcode (3–4 digits).',
    };
  }

  const pc = formatPostcode(n);
  const overrides = (input.suburbOverrides ?? []).filter(o => o.postcode === n);
  const range = findCerRange(n, input.ranges ?? CER_POSTCODE_ZONE_RANGES);
  const rangeFallback = range
    ? { zone: range.zone, rating: range.rating }
    : null;

  if (overrides.length > 0) {
    const suburbRaw = input.suburb?.trim() ?? '';
    if (!suburbRaw) {
      // Distinct zone/suburb choices — require selection when more than one override,
      // or when overrides disagree with the range zone.
      const uniqueZones = new Set(overrides.map(o => o.zone));
      if (overrides.length > 1 || (range && !uniqueZones.has(range.zone))) {
        return {
          status: 'needs_suburb',
          postcode: pc,
          suburbs: overrides.map(o => ({
            suburb: o.suburb,
            zone: o.zone,
            rating: o.rating,
          })),
          rangeFallback,
          tableAsAt: CER_ZONE_TABLE_AS_AT,
          sourceUrl: CER_ZONE_TABLE_SOURCE_URL,
        };
      }
    } else {
      const match = overrides.find(
        o => normaliseSuburb(o.suburb) === normaliseSuburb(suburbRaw),
      );
      if (match) {
        return {
          status: 'resolved',
          postcode: pc,
          zone: match.zone,
          rating: match.rating,
          suburb: match.suburb,
          source: 'suburb_override',
          tableAsAt: CER_ZONE_TABLE_AS_AT,
          sourceUrl: CER_ZONE_TABLE_SOURCE_URL,
        };
      }
      // Unknown suburb with overrides present → ask again
      return {
        status: 'needs_suburb',
        postcode: pc,
        suburbs: overrides.map(o => ({
          suburb: o.suburb,
          zone: o.zone,
          rating: o.rating,
        })),
        rangeFallback,
        tableAsAt: CER_ZONE_TABLE_AS_AT,
        sourceUrl: CER_ZONE_TABLE_SOURCE_URL,
      };
    }
  }

  if (!range) {
    return {
      status: 'invalid_postcode',
      postcode: pc,
      message: 'Postcode not found in CER zone table.',
    };
  }

  // Prefer ZONE_RATINGS constant so rating always matches zone key
  const rating = ZONE_RATINGS[range.zone];

  return {
    status: 'resolved',
    postcode: pc,
    zone: range.zone,
    rating,
    suburb: null,
    source: 'cer_range',
    tableAsAt: CER_ZONE_TABLE_AS_AT,
    sourceUrl: CER_ZONE_TABLE_SOURCE_URL,
  };
}

/** Map Supabase `stc_zones` rows into override records. */
export function suburbOverridesFromRows(
  rows: Array<{ postcode: number | string; suburb: string; zone: number; rating: number | string }>,
): SuburbZoneOverride[] {
  return rows.map(r => {
    const zone = Number(r.zone) as StcZone;
    return {
      postcode: Number(r.postcode),
      suburb: String(r.suburb),
      zone,
      rating: Number(r.rating) || ZONE_RATINGS[zone],
    };
  });
}
