import { format, parseISO } from 'date-fns';

export type PhotoClockSource = 'exif' | 'upload';
export type PhotoPlaceSource = 'exif' | 'device';

export interface PhotoPlace {
  lat: number;
  lng: number;
  source: PhotoPlaceSource;
  accuracyM: number | null;
}

/** When and where a photo was taken, and which clock and which fix said so. */
export interface PhotoProvenance {
  takenAt: string;
  takenAtSource: PhotoClockSource;
  place: PhotoPlace | null;
}

export interface AttachedPhoto {
  file: File;
  provenance: PhotoProvenance;
}

/** What Grafter reads out of a photo's EXIF. Anything else in the file is ignored. */
export interface ExifCapture {
  dateTimeOriginal: string | null;
  offsetTimeOriginal: string | null;
  lat: number | null;
  lng: number | null;
}

export const EMPTY_EXIF: ExifCapture = {
  dateTimeOriginal: null,
  offsetTimeOriginal: null,
  lat: null,
  lng: null,
};

export const PHOTO_CLOCK_LABEL: Record<PhotoClockSource, string> = {
  exif: 'photo clock',
  upload: 'upload clock',
};

export const PHOTO_PLACE_LABEL: Record<PhotoPlaceSource, string> = {
  exif: 'photo GPS',
  device: 'device GPS',
};

export const PHOTO_NO_PLACE = 'No location on this photo.';

const JPEG_SOI = 0xffd8;
const JPEG_APP1 = 0xffe1;
const JPEG_SOS = 0xffda;
const EXIF_HEADER = 'Exif\0\0';
const TIFF_LITTLE = 0x4949;
const TIFF_BIG = 0x4d4d;
const TIFF_MAGIC = 42;
/** EXIF APP1 caps at 64 KiB and sits at the front of the file. */
export const EXIF_SCAN_BYTES = 256 * 1024;

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_GPS_LAT_REF = 0x0001;
const TAG_GPS_LAT = 0x0002;
const TAG_GPS_LNG_REF = 0x0003;
const TAG_GPS_LNG = 0x0004;

const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_BYTES: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8,
};

interface Tiff {
  view: DataView;
  base: number;
  little: boolean;
}

interface IfdEntry {
  type: number;
  count: number;
  /** Absolute byte offset of the value inside `view`. */
  at: number;
}

function readIfd(tiff: Tiff, ifdOffset: number): Map<number, IfdEntry> {
  const { view, base, little } = tiff;
  const entries = new Map<number, IfdEntry>();
  const start = base + ifdOffset;
  if (start + 2 > view.byteLength) return entries;
  const count = view.getUint16(start, little);
  for (let i = 0; i < count; i += 1) {
    const row = start + 2 + i * 12;
    if (row + 12 > view.byteLength) break;
    const tag = view.getUint16(row, little);
    const type = view.getUint16(row + 2, little);
    const n = view.getUint32(row + 4, little);
    const size = (TYPE_BYTES[type] ?? 1) * n;
    const at = size > 4 ? base + view.getUint32(row + 8, little) : row + 8;
    entries.set(tag, { type, count: n, at });
  }
  return entries;
}

function readAscii(tiff: Tiff, entry: IfdEntry | undefined): string | null {
  if (!entry || entry.type !== TYPE_ASCII) return null;
  if (entry.at + entry.count > tiff.view.byteLength) return null;
  let text = '';
  for (let i = 0; i < entry.count; i += 1) {
    const code = tiff.view.getUint8(entry.at + i);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  const trimmed = text.trim();
  return trimmed || null;
}

function readOffset(tiff: Tiff, entry: IfdEntry | undefined): number | null {
  if (!entry || entry.count !== 1 || entry.at + 4 > tiff.view.byteLength) return null;
  if (entry.type === TYPE_LONG) return tiff.view.getUint32(entry.at, tiff.little);
  if (entry.type === TYPE_SHORT) return tiff.view.getUint16(entry.at, tiff.little);
  return null;
}

function readRationals(tiff: Tiff, entry: IfdEntry | undefined): number[] | null {
  if (!entry || entry.type !== TYPE_RATIONAL) return null;
  if (entry.at + entry.count * 8 > tiff.view.byteLength) return null;
  const values: number[] = [];
  for (let i = 0; i < entry.count; i += 1) {
    const num = tiff.view.getUint32(entry.at + i * 8, tiff.little);
    const den = tiff.view.getUint32(entry.at + i * 8 + 4, tiff.little);
    values.push(den === 0 ? 0 : num / den);
  }
  return values;
}

function degreesFromDms(parts: number[] | null, ref: string | null, limit: number): number | null {
  if (!parts || parts.length === 0 || !ref) return null;
  const magnitude = parts[0] + (parts[1] ?? 0) / 60 + (parts[2] ?? 0) / 3600;
  if (!Number.isFinite(magnitude) || magnitude > limit) return null;
  const south = ref.toUpperCase() === 'S' || ref.toUpperCase() === 'W';
  return south ? -magnitude : magnitude;
}

function readTiff(view: DataView, base: number): ExifCapture {
  const order = view.getUint16(base);
  if (order !== TIFF_LITTLE && order !== TIFF_BIG) return EMPTY_EXIF;
  const little = order === TIFF_LITTLE;
  if (view.getUint16(base + 2, little) !== TIFF_MAGIC) return EMPTY_EXIF;
  const tiff: Tiff = { view, base, little };
  const ifd0 = readIfd(tiff, view.getUint32(base + 4, little));

  const exifOffset = readOffset(tiff, ifd0.get(TAG_EXIF_IFD));
  const exif = exifOffset === null ? new Map<number, IfdEntry>() : readIfd(tiff, exifOffset);
  const gpsOffset = readOffset(tiff, ifd0.get(TAG_GPS_IFD));
  const gps = gpsOffset === null ? new Map<number, IfdEntry>() : readIfd(tiff, gpsOffset);

  const lat = degreesFromDms(readRationals(tiff, gps.get(TAG_GPS_LAT)), readAscii(tiff, gps.get(TAG_GPS_LAT_REF)), 90);
  const lng = degreesFromDms(readRationals(tiff, gps.get(TAG_GPS_LNG)), readAscii(tiff, gps.get(TAG_GPS_LNG_REF)), 180);
  const hasFix = lat !== null && lng !== null && !(lat === 0 && lng === 0);
  return {
    dateTimeOriginal: readAscii(tiff, exif.get(TAG_DATE_TIME_ORIGINAL)),
    offsetTimeOriginal: readAscii(tiff, exif.get(TAG_OFFSET_TIME_ORIGINAL)),
    lat: hasFix ? lat : null,
    lng: hasFix ? lng : null,
  };
}

function hasExifHeader(view: DataView, at: number): boolean {
  if (at + EXIF_HEADER.length > view.byteLength) return false;
  for (let i = 0; i < EXIF_HEADER.length; i += 1) {
    if (view.getUint8(at + i) !== EXIF_HEADER.charCodeAt(i)) return false;
  }
  return true;
}

/** Pure. Walks JPEG segments to the EXIF APP1 and reads the clock and the fix. Anything malformed reads as empty. */
export function readJpegExif(buffer: ArrayBuffer): ExifCapture {
  try {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== JPEG_SOI) return EMPTY_EXIF;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if (marker === JPEG_SOS || (marker & 0xff00) !== 0xff00) break;
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      if (marker === JPEG_APP1 && hasExifHeader(view, offset + 4)) {
        return readTiff(view, offset + 4 + EXIF_HEADER.length);
      }
      offset += 2 + length;
    }
    return EMPTY_EXIF;
  } catch {
    return EMPTY_EXIF;
  }
}

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const EXIF_OFFSET = /^[+-]\d{2}:\d{2}$/;

/**
 * EXIF writes local wall time with no zone. With OffsetTimeOriginal the instant is exact.
 * Without it the wall time is read in this device's zone, which is the crew's zone on a job.
 */
export function exifDateToIso(dateTime: string | null, offset: string | null): string | null {
  const match = dateTime?.match(EXIF_DATE);
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map(Number);
  if (y < 1900) return null;
  const zone = offset && EXIF_OFFSET.test(offset) ? offset : null;
  const date = zone
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${zone}`)
    : new Date(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(date.getTime())) return null;
  // Date rolls an impossible day (30 Feb) forward instead of rejecting it. Read the wall day back.
  const wall = zone ? new Date(date.getTime() + zoneMinutes(zone) * 60_000) : date;
  const [wallMonth, wallDay] = zone
    ? [wall.getUTCMonth() + 1, wall.getUTCDate()]
    : [wall.getMonth() + 1, wall.getDate()];
  return wallMonth === mo && wallDay === d ? date.toISOString() : null;
}

function zoneMinutes(zone: string): number {
  const [hours, minutes] = zone.slice(1).split(':').map(Number);
  return (zone.startsWith('-') ? -1 : 1) * (hours * 60 + minutes);
}

/** Pure. EXIF wins on both axes. The fallback clock and fix fill whatever EXIF lacks. */
export function provenanceFromExif(
  exif: ExifCapture,
  fallback: { now: Date; place: PhotoPlace | null },
): PhotoProvenance {
  const exifAt = exifDateToIso(exif.dateTimeOriginal, exif.offsetTimeOriginal);
  const place: PhotoPlace | null = exif.lat !== null && exif.lng !== null
    ? { lat: exif.lat, lng: exif.lng, source: 'exif', accuracyM: null }
    : fallback.place;
  return exifAt
    ? { takenAt: exifAt, takenAtSource: 'exif', place }
    : { takenAt: fallback.now.toISOString(), takenAtSource: 'upload', place };
}

export async function readFileExif(file: Blob): Promise<ExifCapture> {
  try {
    return readJpegExif(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
  } catch {
    return EMPTY_EXIF;
  }
}

export interface ProvenanceDeps {
  now: () => Date;
  locate: () => Promise<PhotoPlace | null>;
}

/**
 * Reads EXIF from every file first, then asks the device for one fix only if some photo
 * has no GPS of its own. That keeps the permission prompt to one, and only when needed.
 */
export async function resolvePhotoProvenance(
  files: File[],
  deps: ProvenanceDeps,
): Promise<AttachedPhoto[]> {
  const exifs = await Promise.all(files.map(readFileExif));
  const needsFix = exifs.some(exif => exif.lat === null || exif.lng === null);
  const devicePlace = needsFix ? await deps.locate().catch(() => null) : null;
  const now = deps.now();
  return files.map((file, i) => ({
    file,
    provenance: provenanceFromExif(exifs[i], { now, place: devicePlace }),
  }));
}

export const DEVICE_FIX_TIMEOUT_MS = 8000;
const DEVICE_FIX_MAX_AGE_MS = 5 * 60 * 1000;

/** Boundary. Resolves null on denial, timeout, or no geolocation. Never throws. */
export function deviceLocation(): Promise<PhotoPlace | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        source: 'device',
        accuracyM: Number.isFinite(position.coords.accuracy)
          ? Math.round(position.coords.accuracy)
          : null,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: DEVICE_FIX_TIMEOUT_MS, maximumAge: DEVICE_FIX_MAX_AGE_MS },
    );
  });
}

export const BROWSER_PROVENANCE_DEPS: ProvenanceDeps = {
  now: () => new Date(),
  locate: deviceLocation,
};

export function describePhotoClock(takenAt: string, source: PhotoClockSource): string {
  return `${format(parseISO(takenAt), 'd MMM yyyy · HH:mm')} · ${PHOTO_CLOCK_LABEL[source]}`;
}

export function describePhotoPlace(place: PhotoPlace | null): { text: string; mapUrl: string } | null {
  if (!place) return null;
  const coords = `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
  const accuracy = place.accuracyM === null ? '' : ` · ±${place.accuracyM} m`;
  return {
    text: `${coords}${accuracy} · ${PHOTO_PLACE_LABEL[place.source]}`,
    mapUrl: `https://www.google.com/maps?q=${place.lat},${place.lng}`,
  };
}
