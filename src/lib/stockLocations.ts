/** Encode a storage location for use in /stock/locations/:locationKey */
export const UNASSIGNED_LOCATION_KEY = 'unassigned';

export function encodeLocationKey(location: string | null | undefined): string {
  const trimmed = (location ?? '').trim();
  if (!trimmed) return UNASSIGNED_LOCATION_KEY;
  return encodeURIComponent(trimmed);
}

export function decodeLocationKey(key: string | undefined): string | null {
  if (!key || key === UNASSIGNED_LOCATION_KEY) return null;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

export function locationLabel(location: string | null | undefined): string {
  const trimmed = (location ?? '').trim();
  return trimmed || 'Unassigned';
}
