// Proves photo time and place end to end against the real Supabase project: attach on the
// job sheet, read the job_photos row back, open the lightbox, read the value.
// Run: PROVE_EMAIL=... PROVE_PASSWORD=... node scripts/prove-job-photo-provenance.mjs
// Needs .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY), a dev server on LOOK_BASE_URL
// (default http://127.0.0.1:5173), and migrations 077 and 078 applied.
// Writes docs/proof/job-photo-provenance/live-*.png and live-notes.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import {
  DEVICE_FIX,
  checkDeviceRow,
  checkExifRow,
  pickProvenance,
  plainPhotoFile,
  readLightbox,
  renderJpeg,
  sitePhotoFile,
} from './lib/photo-proof.mjs';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/job-photo-provenance';
const JOB_TITLE = 'Photo time and place proof job';
const PROVENANCE_COLUMNS = 'id, visit_note_id, storage_path, created_at, taken_at, taken_at_source, lat, lng, location_source, location_accuracy_m';

function readEnv() {
  const env = { ...process.env };
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

const env = readEnv();
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon, PROVE_EMAIL: email, PROVE_PASSWORD: password } = env;
if (!url || !anon || !email || !password) {
  throw new Error('need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, PROVE_EMAIL, PROVE_PASSWORD');
}

mkdirSync(OUT, { recursive: true });
const notes = { base: BASE, startedAt: new Date().toISOString() };
const failures = [];
function check(name, ok, detail) {
  notes[name] = { ok, ...detail };
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ? JSON.stringify(detail) : '');
}

const sb = createClient(url, anon, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await sb.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;
const userId = signIn.user.id;
const { data: profile } = await sb.from('profiles').select('company_id').eq('id', userId).single();
const companyId = profile.company_id;
notes.company = companyId;

async function findOrCreateJob() {
  const { data: found } = await sb.from('jobs').select('id').eq('company_id', companyId).eq('title', JOB_TITLE).maybeSingle();
  if (found) return found.id;
  const { data, error } = await sb.from('jobs').insert({
    company_id: companyId,
    title: JOB_TITLE,
    created_by: userId,
    address: '1 Proof St, Brisbane QLD',
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function rowsSince(sinceIso) {
  const { data, error } = await sb.from('job_photos').select(PROVENANCE_COLUMNS).eq('job_id', jobId).gte('created_at', sinceIso).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

const jobId = await findOrCreateJob();
notes.jobId = jobId;

const browser = await chromium.launch({ headless: true });
const siteJpeg = await renderJpeg(browser, 'SITE', '#2e75b6');
const plainJpeg = await renderJpeg(browser, 'PLAIN', '#0a2540');

const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'en-AU',
  timezoneId: 'Australia/Brisbane',
  geolocation: DEVICE_FIX,
  permissions: ['geolocation'],
});
const page = await context.newPage();
page.on('pageerror', (err) => { notes.pageErrors = [...(notes.pageErrors || []), String(err)]; });

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });

await page.goto(`${BASE}/jobs/${jobId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#job-visit-notes', { timeout: 30000 });
await page.waitForSelector('[data-job-gallery="1"]', { timeout: 30000 });

const galleryAttachedAt = new Date().toISOString();
const jobBefore = await page.$$eval('[data-gallery-source="job"]', (els) => els.length);
await page.setInputFiles('#job-gallery-photo-input', [sitePhotoFile(siteJpeg), plainPhotoFile(plainJpeg)]);
await page.waitForFunction((n) => document.querySelectorAll('[data-gallery-source="job"]').length >= n + 2, jobBefore, { timeout: 60000 });
const galleryRows = (await rowsSince(galleryAttachedAt)).filter((r) => r.visit_note_id === null);
const exifRow = galleryRows.find((r) => r.taken_at_source === 'exif');
const deviceRow = galleryRows.find((r) => r.taken_at_source === 'upload');
const galleryExif = checkExifRow(exifRow);
const galleryDevice = checkDeviceRow(deviceRow, galleryAttachedAt);
check('dbGalleryAddRowHasPhotoClockAndPhotoGps', galleryExif.ok, galleryExif);
check('dbGalleryAddRowFallsBackToAttachClockAndDeviceFix', galleryDevice.ok, galleryDevice);

const noteBody = `Provenance proof ${new Date().toISOString()}`;
const visitAttachedAt = new Date().toISOString();
await page.fill('#job-visit-notes .job-visit-hairline', noteBody);
await page.setInputFiles('#job-visit-photo-input', [sitePhotoFile(siteJpeg)]);
await page.waitForFunction(() => document.querySelector('#job-visit-notes .job-visit-photo-count')?.textContent?.includes('1 photo(s) attached'), null, { timeout: 30000 });
await page.click('#job-visit-notes .job-visit-post');
await page.waitForFunction((body) => (
  [...document.querySelectorAll('.job-visit-row')].some((row) => row.textContent.includes(body) && row.querySelector('[data-visit-photo] img'))
), noteBody, { timeout: 60000 });
const visitRow = (await rowsSince(visitAttachedAt)).find((r) => r.visit_note_id);
const visitExif = checkExifRow(visitRow);
check('dbVisitWallRowHasPhotoClockAndPhotoGps', visitExif.ok, visitExif);

await page.waitForFunction(() => [...document.querySelectorAll('[data-gallery-photo] img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 30000 });

if (exifRow) {
  await page.click(`[data-gallery-photo="job:${exifRow.id}"]`);
  await page.waitForSelector('dialog.job-photo-lightbox[open] img', { timeout: 10000 });
  await page.waitForFunction(() => { const img = document.querySelector('dialog.job-photo-lightbox img'); return img && img.complete && img.naturalWidth > 0; });
  const lightbox = await readLightbox(page);
  check('lightboxShowsPhotoClockAndPhotoGps',
    lightbox.when === '8 Sep 2026 · 09:15 · photo clock'
    && lightbox.where === '-27.46980, 153.02510 · photo GPS'
    && lightbox.mapHref === 'https://www.google.com/maps?q=-27.4698,153.0251'
    && lightbox.imageLoaded,
    lightbox);
  await page.evaluate(() => document.querySelector('#job-gallery')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/live-lightbox-exif-laptop-1280.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.job-photo-lightbox')?.open);
}

if (deviceRow) {
  await page.click(`[data-gallery-photo="job:${deviceRow.id}"]`);
  await page.waitForSelector('dialog.job-photo-lightbox[open] img', { timeout: 10000 });
  const lightbox = await readLightbox(page);
  check('lightboxShowsUploadClockAndDeviceFix',
    lightbox.when?.endsWith(' · upload clock')
    && lightbox.where === '-33.86880, 151.20930 · ±12 m · device GPS'
    && lightbox.mapHref === 'https://www.google.com/maps?q=-33.8688,151.2093',
    lightbox);
  await page.screenshot({ path: `${OUT}/live-lightbox-device-laptop-1280.png` });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.job-photo-lightbox')?.open);
}

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
  timezoneId: 'Australia/Brisbane',
  storageState: await context.storageState(),
});
const pp = await phone.newPage();
await pp.goto(`${BASE}/jobs/${jobId}#job-gallery`, { waitUntil: 'domcontentloaded' });
await pp.waitForSelector('[data-gallery-photo] img', { timeout: 30000 });
if (exifRow) {
  await pp.click(`[data-gallery-photo="job:${exifRow.id}"]`);
  await pp.waitForSelector('dialog.job-photo-lightbox[open] img', { timeout: 10000 });
  await pp.waitForFunction(() => { const img = document.querySelector('dialog.job-photo-lightbox img'); return img && img.complete && img.naturalWidth > 0; });
  const lightbox = await readLightbox(pp);
  check('phoneLightboxShowsClockAndPlace', lightbox.when === '8 Sep 2026 · 09:15 · photo clock' && lightbox.where === '-27.46980, 153.02510 · photo GPS', lightbox);
  await pp.screenshot({ path: `${OUT}/live-lightbox-phone-390.png` });
}
await phone.close();

notes.rows = { exif: pickProvenance(exifRow), device: pickProvenance(deviceRow), visit: pickProvenance(visitRow) };
notes.finishedAt = new Date().toISOString();
notes.failures = failures;
writeFileSync(`${OUT}/live-notes.json`, JSON.stringify(notes, null, 2));
await browser.close();
if (failures.length) {
  console.error('FAILED', failures);
  process.exitCode = 1;
} else {
  console.log('ALL PASS', `${OUT}/live-notes.json`);
}
