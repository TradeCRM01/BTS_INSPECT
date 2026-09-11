import { describe, expect, it } from 'vitest';
import { withExif } from '../../scripts/lib/exif-jpeg.mjs';
import {
  EMPTY_EXIF,
  describePhotoClock,
  describePhotoPlace,
  exifDateToIso,
  provenanceFromExif,
  readJpegExif,
  resolvePhotoProvenance,
  type PhotoPlace,
} from './photoProvenance';

process.env.TZ = 'UTC';

const BARE_JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
const BRISBANE = { lat: -27.4698, lng: 153.0251 };

function buffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const sitePhoto = withExif(BARE_JPEG, {
  dateTimeOriginal: '2026:09:08 09:15:30',
  offsetTimeOriginal: '+10:00',
  ...BRISBANE,
});

const devicePlace: PhotoPlace = { lat: -33.8688, lng: 151.2093, source: 'device', accuracyM: 12 };
const attachClock = new Date('2026-09-11T01:02:03.000Z');

describe('readJpegExif', () => {
  it('reads DateTimeOriginal, OffsetTimeOriginal, and the GPS fix from the APP1 segment', () => {
    const exif = readJpegExif(buffer(sitePhoto));
    expect(exif.dateTimeOriginal).toBe('2026:09:08 09:15:30');
    expect(exif.offsetTimeOriginal).toBe('+10:00');
    expect(exif.lat).toBeCloseTo(-27.4698, 6);
    expect(exif.lng).toBeCloseTo(153.0251, 6);
  });

  it('reads the same values from a little-endian (II) TIFF, the order most Android cameras write', () => {
    const exif = readJpegExif(buffer(withExif(BARE_JPEG, {
      dateTimeOriginal: '2026:09:08 09:15:30',
      offsetTimeOriginal: '+10:00',
      ...BRISBANE,
      little: true,
    })));
    expect(exif.dateTimeOriginal).toBe('2026:09:08 09:15:30');
    expect(exif.offsetTimeOriginal).toBe('+10:00');
    expect(exif.lat).toBeCloseTo(-27.4698, 6);
    expect(exif.lng).toBeCloseTo(153.0251, 6);
  });

  it('reads a fix west of Greenwich as negative longitude', () => {
    const exif = readJpegExif(buffer(withExif(BARE_JPEG, { lat: 51.5007, lng: -0.1246 })));
    expect(exif.lat).toBeCloseTo(51.5007, 6);
    expect(exif.lng).toBeCloseTo(-0.1246, 6);
    expect(exif.dateTimeOriginal).toBe(null);
  });

  it('reads a JPEG with no EXIF, a non-JPEG, and a truncated segment as empty', () => {
    expect(readJpegExif(buffer(BARE_JPEG))).toEqual(EMPTY_EXIF);
    expect(readJpegExif(buffer(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])))).toEqual(EMPTY_EXIF);
    expect(readJpegExif(buffer(sitePhoto.subarray(0, 40)))).toEqual(EMPTY_EXIF);
  });

  it('treats a zero/zero fix as no fix', () => {
    const exif = readJpegExif(buffer(withExif(BARE_JPEG, { lat: 0, lng: 0, dateTimeOriginal: '2026:01:02 03:04:05' })));
    expect(exif).toEqual({ ...EMPTY_EXIF, dateTimeOriginal: '2026:01:02 03:04:05' });
  });
});

describe('exifDateToIso', () => {
  it('uses OffsetTimeOriginal for the exact instant', () => {
    expect(exifDateToIso('2026:09:08 09:15:30', '+10:00')).toBe('2026-09-07T23:15:30.000Z');
  });

  it('reads wall time in this zone when the photo has no offset', () => {
    expect(exifDateToIso('2026:09:08 09:15:30', null)).toBe('2026-09-08T09:15:30.000Z');
    expect(exifDateToIso('2026:09:08 09:15:30', 'garbage')).toBe('2026-09-08T09:15:30.000Z');
  });

  it('refuses blank, malformed, pre-1900, and impossible-day clocks', () => {
    expect(exifDateToIso('0000:00:00 00:00:00', null)).toBe(null);
    expect(exifDateToIso('0050:01:01 00:00:00', null)).toBe(null);
    expect(exifDateToIso('2026:02:30 10:00:00', null)).toBe(null);
    expect(exifDateToIso('2026:02:30 10:00:00', '+10:00')).toBe(null);
    expect(exifDateToIso('2026:02:28 23:30:00', '-05:00')).toBe('2026-03-01T04:30:00.000Z');
    expect(exifDateToIso('yesterday', null)).toBe(null);
    expect(exifDateToIso(null, '+10:00')).toBe(null);
  });
});

describe('provenanceFromExif', () => {
  it('prefers the photo clock and photo GPS', () => {
    expect(provenanceFromExif(
      { dateTimeOriginal: '2026:09:08 09:15:30', offsetTimeOriginal: '+10:00', ...BRISBANE },
      { now: attachClock, place: devicePlace },
    )).toEqual({
      takenAt: '2026-09-07T23:15:30.000Z',
      takenAtSource: 'exif',
      place: { lat: -27.4698, lng: 153.0251, source: 'exif', accuracyM: null },
    });
  });

  it('falls back to the attach clock and the device fix', () => {
    expect(provenanceFromExif(EMPTY_EXIF, { now: attachClock, place: devicePlace })).toEqual({
      takenAt: '2026-09-11T01:02:03.000Z',
      takenAtSource: 'upload',
      place: devicePlace,
    });
  });

  it('mixes axes: photo clock with device fix, and no place when neither has one', () => {
    expect(provenanceFromExif(
      { ...EMPTY_EXIF, dateTimeOriginal: '2026:09:08 09:15:30' },
      { now: attachClock, place: devicePlace },
    )).toEqual({ takenAt: '2026-09-08T09:15:30.000Z', takenAtSource: 'exif', place: devicePlace });
    expect(provenanceFromExif(EMPTY_EXIF, { now: attachClock, place: null }).place).toBe(null);
  });
});

describe('resolvePhotoProvenance', () => {
  function jpegFile(name: string, bytes: Uint8Array): File {
    return new File([bytes], name, { type: 'image/jpeg' });
  }

  it('asks the device once for a batch where some photo lacks GPS, and stamps each photo', async () => {
    let locates = 0;
    const attached = await resolvePhotoProvenance(
      [jpegFile('site.jpg', sitePhoto), jpegFile('plain.jpg', BARE_JPEG)],
      { now: () => attachClock, locate: async () => { locates += 1; return devicePlace; } },
    );
    expect(locates).toBe(1);
    expect(attached.map(photo => photo.file.name)).toEqual(['site.jpg', 'plain.jpg']);
    expect(attached[0].provenance).toEqual({
      takenAt: '2026-09-07T23:15:30.000Z',
      takenAtSource: 'exif',
      place: { lat: expect.closeTo(-27.4698, 6), lng: expect.closeTo(153.0251, 6), source: 'exif', accuracyM: null },
    });
    expect(attached[1].provenance).toEqual({
      takenAt: '2026-09-11T01:02:03.000Z',
      takenAtSource: 'upload',
      place: devicePlace,
    });
  });

  it('skips the device when every photo carries its own fix', async () => {
    let locates = 0;
    const attached = await resolvePhotoProvenance(
      [jpegFile('a.jpg', sitePhoto), jpegFile('b.jpg', sitePhoto)],
      { now: () => attachClock, locate: async () => { locates += 1; return devicePlace; } },
    );
    expect(locates).toBe(0);
    expect(attached.map(photo => photo.provenance.place?.source)).toEqual(['exif', 'exif']);
  });

  it('leaves place empty when the device declines or the fix throws', async () => {
    const expected = {
      takenAt: '2026-09-11T01:02:03.000Z',
      takenAtSource: 'upload',
      place: null,
    };
    const declined = await resolvePhotoProvenance(
      [jpegFile('plain.jpg', BARE_JPEG)],
      { now: () => attachClock, locate: async () => null },
    );
    expect(declined[0].provenance).toEqual(expected);
    const threw = await resolvePhotoProvenance(
      [jpegFile('plain.jpg', BARE_JPEG)],
      { now: () => attachClock, locate: async () => { throw new Error('no geolocation'); } },
    );
    expect(threw[0].provenance).toEqual(expected);
  });
});

describe('describePhotoClock and describePhotoPlace', () => {
  it('writes the readable line the lightbox shows', () => {
    expect(describePhotoClock('2026-09-08T09:15:30.000Z', 'exif')).toBe('8 Sep 2026 · 09:15 · photo clock');
    expect(describePhotoClock('2026-09-11T01:02:03.000Z', 'upload')).toBe('11 Sep 2026 · 01:02 · upload clock');
    expect(describePhotoPlace(devicePlace)).toEqual({
      text: '-33.86880, 151.20930 · ±12 m · device GPS',
      mapUrl: 'https://www.google.com/maps?q=-33.8688,151.2093',
    });
    expect(describePhotoPlace({ ...BRISBANE, source: 'exif', accuracyM: null })).toEqual({
      text: '-27.46980, 153.02510 · photo GPS',
      mapUrl: 'https://www.google.com/maps?q=-27.4698,153.0251',
    });
    expect(describePhotoPlace(null)).toBe(null);
  });
});
