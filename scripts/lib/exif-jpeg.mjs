// Builds a JPEG with an EXIF APP1 segment carrying DateTimeOriginal, OffsetTimeOriginal,
// and a GPS fix. Shared by the photoProvenance unit test and the job-photo prove scripts,
// so the same bytes are parsed in vitest and uploaded through the real page.

const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;

function ascii(text) {
  return Uint8Array.from([...text].map((c) => c.charCodeAt(0)).concat([0]));
}

function u32(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0);
  return out;
}

function rationals(pairs) {
  const out = new Uint8Array(pairs.length * 8);
  const view = new DataView(out.buffer);
  pairs.forEach(([num, den], i) => {
    view.setUint32(i * 8, num >>> 0);
    view.setUint32(i * 8 + 4, den >>> 0);
  });
  return out;
}

/** Degrees to EXIF degree/minute/second rationals, seconds to a thousandth. */
export function toDms(degrees) {
  const abs = Math.abs(degrees);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60 * 1000);
  return [[deg, 1], [min, 1], [sec, 1000]];
}

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Big-endian IFD table plus its value heap, laid out at `ifdOffset` inside the TIFF. */
function ifdBlock(entries, ifdOffset) {
  const tableSize = 2 + entries.length * 12 + 4;
  const table = new Uint8Array(tableSize);
  const view = new DataView(table.buffer);
  view.setUint16(0, entries.length);
  const heap = [];
  let heapAt = ifdOffset + tableSize;
  entries.forEach((entry, i) => {
    const row = 2 + i * 12;
    view.setUint16(row, entry.tag);
    view.setUint16(row + 2, entry.type);
    view.setUint32(row + 4, entry.count);
    if (entry.bytes.length <= 4) {
      table.set(entry.bytes, row + 8);
    } else {
      view.setUint32(row + 8, heapAt);
      const padded = entry.bytes.length % 2 ? concat([entry.bytes, new Uint8Array(1)]) : entry.bytes;
      heap.push(padded);
      heapAt += padded.length;
    }
  });
  return concat([table, ...heap]);
}

/**
 * Returns `jpeg` with an EXIF APP1 inserted right after SOI.
 * options: { dateTimeOriginal?: 'YYYY:MM:DD HH:MM:SS', offsetTimeOriginal?: '+10:00', lat?: number, lng?: number }
 */
export function withExif(jpeg, options) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG');
  const exifEntries = [];
  if (options.dateTimeOriginal) {
    const bytes = ascii(options.dateTimeOriginal);
    exifEntries.push({ tag: TAG_DATE_TIME_ORIGINAL, type: TYPE_ASCII, count: bytes.length, bytes });
  }
  if (options.offsetTimeOriginal) {
    const bytes = ascii(options.offsetTimeOriginal);
    exifEntries.push({ tag: TAG_OFFSET_TIME_ORIGINAL, type: TYPE_ASCII, count: bytes.length, bytes });
  }
  const hasFix = typeof options.lat === 'number' && typeof options.lng === 'number';
  const gpsEntries = hasFix ? [
    { tag: 1, type: TYPE_ASCII, count: 2, bytes: ascii(options.lat < 0 ? 'S' : 'N') },
    { tag: 2, type: TYPE_RATIONAL, count: 3, bytes: rationals(toDms(options.lat)) },
    { tag: 3, type: TYPE_ASCII, count: 2, bytes: ascii(options.lng < 0 ? 'W' : 'E') },
    { tag: 4, type: TYPE_RATIONAL, count: 3, bytes: rationals(toDms(options.lng)) },
  ] : [];

  const ifd0Entries = [];
  const ifd0Offset = 8;
  const ifd0Size = 2 + (exifEntries.length ? 1 : 0) * 12 + (gpsEntries.length ? 1 : 0) * 12 + 4;
  let next = ifd0Offset + ifd0Size;
  let exifBlock = new Uint8Array(0);
  if (exifEntries.length) {
    ifd0Entries.push({ tag: TAG_EXIF_IFD, type: TYPE_LONG, count: 1, bytes: u32(next) });
    exifBlock = ifdBlock(exifEntries, next);
    next += exifBlock.length;
  }
  let gpsBlock = new Uint8Array(0);
  if (gpsEntries.length) {
    ifd0Entries.push({ tag: TAG_GPS_IFD, type: TYPE_LONG, count: 1, bytes: u32(next) });
    gpsBlock = ifdBlock(gpsEntries, next);
  }
  const header = Uint8Array.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]);
  const tiff = concat([header, ifdBlock(ifd0Entries, ifd0Offset), exifBlock, gpsBlock]);
  const payload = concat([ascii('Exif'), new Uint8Array(1), tiff]);
  const marker = new Uint8Array(4);
  new DataView(marker.buffer).setUint16(0, 0xffe1);
  new DataView(marker.buffer).setUint16(2, payload.length + 2);
  return concat([jpeg.subarray(0, 2), marker, payload, jpeg.subarray(2)]);
}
