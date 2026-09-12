// Proves photo time and place on the real job sheet without Supabase credentials.
// Runs the DEV look harness (/jobs/audit-doc-job?look=job-photos) against a dev server
// whose .env points VITE_SUPABASE_URL at a host this script intercepts, so the page's
// own handlers run end to end (EXIF read, device fix, compress, upload, insert) and the
// insert payloads are captured here instead of landing in a database.
// Run: node scripts/prove-job-photo-provenance-harness.mjs
// Needs a dev server on LOOK_BASE_URL (default http://127.0.0.1:5173) started with that .env.
// Writes docs/proof/job-photo-provenance/harness-*.png and harness-notes.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import {
  DEVICE_FIX,
  checkDeviceRow,
  checkExifRow,
  plainPhotoFile,
  readLightbox,
  renderJpeg,
  sitePhotoFile,
} from './lib/photo-proof.mjs';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/job-photo-provenance';
const HARNESS = '/jobs/audit-doc-job?look=job-photos';

function envValue(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env')) return null;
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

const supabaseUrl = envValue('VITE_SUPABASE_URL');
if (!supabaseUrl) throw new Error('need VITE_SUPABASE_URL in .env so the harness knows which host to intercept');

mkdirSync(OUT, { recursive: true });
const notes = { base: BASE, supabaseUrl, startedAt: new Date().toISOString() };
const failures = [];
function check(name, ok, detail) {
  notes[name] = { ok, ...detail };
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ? JSON.stringify(detail) : '');
}

const browser = await chromium.launch({ headless: true });
const siteJpeg = await renderJpeg(browser, 'SITE', '#2e75b6');
const plainJpeg = await renderJpeg(browser, 'PLAIN', '#0a2540');

const inserts = [];
let noteCount = 0;

async function interceptSupabase(context) {
  await context.route(`${supabaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname.startsWith('/storage/v1/object/') && request.method() === 'POST') {
      return json({ Key: url.pathname.replace('/storage/v1/object/', ''), Id: crypto.randomUUID() });
    }
    if (url.pathname === '/rest/v1/job_photos' && request.method() === 'POST') {
      const row = JSON.parse(request.postData());
      inserts.push(row);
      return json({ ...row, caption: null, created_at: new Date().toISOString() }, 201);
    }
    if (url.pathname === '/rest/v1/job_visit_notes' && request.method() === 'POST') {
      noteCount += 1;
      return json({ id: `harness-note-${noteCount}` }, 201);
    }
    return json([]);
  });
}

async function waitFor(predicate, label, timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function showTab(page, tab) {
  await page.click(`.job-sheet-tab[data-tab="${tab}"]`);
  await page.waitForSelector(`.job-sheet-tab.is-on[data-tab="${tab}"]`, { timeout: 5000 });
}

// Thumbnails are loading="lazy", so a tray only fetches them once its tab is showing.
async function waitForLoadedImages(page, selector, min) {
  await page.waitForFunction(({ selector, min }) => {
    const imgs = [...document.querySelectorAll(selector)];
    return imgs.length >= min && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, { selector, min }, { timeout: 30000 });
}

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-gallery .job-gallery-grid img', { state: 'attached', timeout: 30000 });
  await showTab(page, 'paperwork');
  await waitForLoadedImages(page, '#job-gallery .job-gallery-grid img, #job-visit-notes [data-visit-photo] img', 6);
  await page.evaluate(() => document.fonts.ready);
}

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'en-AU',
  timezoneId: 'Australia/Brisbane',
  geolocation: DEVICE_FIX,
  permissions: ['geolocation'],
});
await interceptSupabase(context);
const page = await context.newPage();
page.on('pageerror', (err) => { notes.pageErrors = [...(notes.pageErrors || []), String(err)]; });
await openHarness(page);

const galleryAttachedAt = new Date().toISOString();
await page.setInputFiles('#job-gallery-photo-input', [sitePhotoFile(siteJpeg), plainPhotoFile(plainJpeg)]);
await waitFor(() => inserts.filter((r) => r.visit_note_id === null).length >= 2, 'two Gallery inserts');
const galleryRows = inserts.filter((r) => r.visit_note_id === null);
const galleryExif = checkExifRow(galleryRows.find((r) => r.taken_at_source === 'exif'));
const galleryDevice = checkDeviceRow(galleryRows.find((r) => r.taken_at_source === 'upload'), galleryAttachedAt);
check('galleryAddWritesPhotoClockAndPhotoGps', galleryExif.ok, galleryExif);
check('galleryAddFallsBackToAttachClockAndDeviceFix', galleryDevice.ok, galleryDevice);
check('galleryAddStoragePathUnderCompanyJob', galleryRows.every((r) => /^[^/]+\/jobs\/audit-doc-job\/[^/]+\.jpg$/.test(r.storage_path)), { paths: galleryRows.map((r) => r.storage_path) });

const noteBody = `Provenance proof ${new Date().toISOString()}`;
await showTab(page, 'paperwork');
await page.fill('#job-visit-notes textarea[data-visit-section="done"]', noteBody);
await page.setInputFiles('#job-visit-photo-input', [sitePhotoFile(siteJpeg)]);
await page.waitForFunction(() => document.querySelector('#job-visit-notes .job-visit-photo-count')?.textContent?.trim() === '1 photo', null, { timeout: 30000 });
await page.click('#job-visit-notes .job-visit-post');
await waitFor(() => inserts.some((r) => r.visit_note_id === 'harness-note-1'), 'visit-wall insert');
const visitExif = checkExifRow(inserts.find((r) => r.visit_note_id === 'harness-note-1'));
check('visitWallPostWritesPhotoClockAndPhotoGps', visitExif.ok, visitExif);

const gridWhen = await page.$eval('[data-gallery-photo="visit:new-1"] [data-gallery-when]', (el) => ({ text: el.textContent.trim(), pin: !!el.querySelector('svg') }));
check('gridShowsTimeAndPin', gridWhen.text === '19:15' && gridWhen.pin, gridWhen);
const gridNoPin = await page.$eval('[data-gallery-photo="visit:mid-1"] [data-gallery-when]', (el) => ({ text: el.textContent.trim(), pin: !!el.querySelector('svg') }));
check('gridHidesPinWithoutPlace', gridNoPin.text === '18:00' && !gridNoPin.pin, gridNoPin);

await showTab(page, 'paperwork');
await page.click('[data-gallery-photo="visit:new-1"]');
await page.waitForSelector('dialog.job-photo-lightbox[open] img', { timeout: 10000 });
await page.waitForFunction(() => { const img = document.querySelector('dialog.job-photo-lightbox img'); return img && img.complete && img.naturalWidth > 0; });
const lightboxExif = await readLightbox(page);
check('lightboxShowsPhotoClockAndPhotoGps',
  lightboxExif.open && lightboxExif.key === 'visit:new-1'
  && lightboxExif.when === '8 Sep 2026 · 19:15 · photo clock'
  && lightboxExif.where === '-27.46980, 153.02510 · photo GPS'
  && lightboxExif.mapHref === 'https://www.google.com/maps?q=-27.4698,153.0251'
  && lightboxExif.imageLoaded,
  lightboxExif);
await page.evaluate(() => document.querySelector('#job-gallery')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/harness-lightbox-laptop-1280.png` });

await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('dialog.job-photo-lightbox')?.open);
check('escapeClosesLightbox', !(await readLightbox(page)).open);

await page.click('[data-gallery-photo="job:job-1"]');
await page.waitForSelector('dialog.job-photo-lightbox[open]');
const lightboxDevice = await readLightbox(page);
check('lightboxShowsDeviceFixWithAccuracy',
  lightboxDevice.where === '-27.47050, 153.02600 · ±14 m · device GPS'
  && lightboxDevice.when === '8 Sep 2026 · 00:30 · photo clock',
  lightboxDevice);
await page.click('dialog.job-photo-lightbox .job-photo-lightbox-close');
await page.waitForFunction(() => !document.querySelector('dialog.job-photo-lightbox')?.open);

await page.click('[data-gallery-photo="visit:mid-1"]');
await page.waitForSelector('dialog.job-photo-lightbox[open]');
const lightboxNoPlace = await readLightbox(page);
check('lightboxSaysNoLocation', lightboxNoPlace.where === 'No location on this photo.' && lightboxNoPlace.mapHref === null, lightboxNoPlace);
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('dialog.job-photo-lightbox')?.open);

await showTab(page, 'paperwork');
await page.click('[data-visit-photo="visit:new-1"]');
await page.waitForSelector('dialog.job-photo-lightbox[open]');
const fromVisitWall = await readLightbox(page);
check('visitWallThumbOpensSameLightbox', fromVisitWall.key === 'visit:new-1' && fromVisitWall.when === '8 Sep 2026 · 19:15 · photo clock', fromVisitWall);
await page.keyboard.press('Escape');
await context.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
  timezoneId: 'Australia/Brisbane',
});
await interceptSupabase(phone);
const pp = await phone.newPage();
await openHarness(pp);
await showTab(pp, 'paperwork');
await pp.evaluate(() => document.querySelector('#job-gallery')?.scrollIntoView({ block: 'start' }));
await pp.waitForTimeout(300);
await pp.screenshot({ path: `${OUT}/harness-gallery-phone-390.png` });
await pp.click('[data-gallery-photo="visit:new-1"]');
await pp.waitForSelector('dialog.job-photo-lightbox[open] img');
await pp.waitForFunction(() => { const img = document.querySelector('dialog.job-photo-lightbox img'); return img && img.complete && img.naturalWidth > 0; });
const phoneLightbox = await readLightbox(pp);
check('phoneLightboxShowsClockAndPlace', phoneLightbox.when === '8 Sep 2026 · 19:15 · photo clock' && phoneLightbox.where.startsWith('-27.46980, 153.02510'), phoneLightbox);
await pp.screenshot({ path: `${OUT}/harness-lightbox-phone-390.png` });
await phone.close();

notes.inserts = inserts;
notes.finishedAt = new Date().toISOString();
notes.failures = failures;
writeFileSync(`${OUT}/harness-notes.json`, JSON.stringify(notes, null, 2));
await browser.close();
if (failures.length) {
  console.error('FAILED', failures);
  process.exitCode = 1;
} else {
  console.log('ALL PASS', `${OUT}/harness-notes.json`);
}
