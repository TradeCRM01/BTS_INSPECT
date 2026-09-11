// Shared by the job-photo provenance prove scripts: the two photos they attach and the
// row checks they make. SITE_SHOT carries its own clock and fix. PLAIN carries nothing,
// so the page must fall back to the attach clock and the device fix Playwright supplies.
import { withExif } from './exif-jpeg.mjs';

export const SITE_SHOT = {
  dateTimeOriginal: '2026:09:08 09:15:30',
  offsetTimeOriginal: '+10:00',
  lat: -27.4698,
  lng: 153.0251,
};
export const SITE_SHOT_TAKEN_AT = '2026-09-07T23:15:30.000Z';

export const DEVICE_FIX = { latitude: -33.8688, longitude: 151.2093, accuracy: 12 };

export async function renderJpeg(browser, label, color) {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await page.setContent(`<body style="margin:0;background:${color};font:bold 28px sans-serif;color:#fff;display:grid;place-items:center;height:240px">${label}</body>`);
  const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
  await page.close();
  return new Uint8Array(buf);
}

export function sitePhotoFile(jpeg) {
  return { name: 'site.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(withExif(jpeg, SITE_SHOT)) };
}

export function plainPhotoFile(jpeg) {
  return { name: 'plain.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) };
}

const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-6;
// Postgres returns timestamptz as `+00:00`, the browser writes `.000Z`. Compare instants, not strings.
const instant = (s) => (typeof s === 'string' ? Date.parse(s) : NaN);

/** A row written from SITE_SHOT: photo clock in +10:00, photo GPS, no accuracy. */
export function checkExifRow(row) {
  const ok = !!row
    && instant(row.taken_at) === Date.parse(SITE_SHOT_TAKEN_AT)
    && row.taken_at_source === 'exif'
    && near(row.lat, SITE_SHOT.lat)
    && near(row.lng, SITE_SHOT.lng)
    && row.location_source === 'exif'
    && row.location_accuracy_m === null;
  return { ok, row: pickProvenance(row) };
}

/** A row written from PLAIN: attach clock no earlier than `sinceIso`, device fix with accuracy. */
export function checkDeviceRow(row, sinceIso) {
  const ok = !!row
    && row.taken_at_source === 'upload'
    && instant(row.taken_at) >= Date.parse(sinceIso)
    && instant(row.taken_at) <= Date.now() + 60_000
    && near(row.lat, DEVICE_FIX.latitude)
    && near(row.lng, DEVICE_FIX.longitude)
    && row.location_source === 'device'
    && row.location_accuracy_m === DEVICE_FIX.accuracy;
  return { ok, row: pickProvenance(row) };
}

export function pickProvenance(row) {
  if (!row) return null;
  const { id, visit_note_id, taken_at, taken_at_source, lat, lng, location_source, location_accuracy_m } = row;
  return { id, visit_note_id, taken_at, taken_at_source, lat, lng, location_source, location_accuracy_m };
}

export async function readLightbox(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('dialog.job-photo-lightbox');
    const link = dialog?.querySelector('[data-photo-where] a');
    const where = dialog?.querySelector('[data-photo-where] span') ?? dialog?.querySelector('[data-photo-where]');
    return {
      open: !!dialog?.open,
      key: dialog?.getAttribute('data-photo-lightbox') ?? null,
      when: dialog?.querySelector('[data-photo-when]')?.textContent?.trim() ?? null,
      where: where?.textContent?.trim() ?? null,
      mapHref: link?.getAttribute('href') ?? null,
      imageLoaded: (() => { const img = dialog?.querySelector('img'); return !!img && img.complete && img.naturalWidth > 0; })(),
    };
  });
}
