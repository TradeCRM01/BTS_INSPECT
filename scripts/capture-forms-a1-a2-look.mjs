import { copyFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const DOC_OUT = 'docs/look';
const ART_OUT = '/opt/cursor/artifacts';

mkdirSync(DOC_OUT, { recursive: true });
mkdirSync(ART_OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

function saveBoth(name) {
  copyFileSync(`${DOC_OUT}/${name}`, `${ART_OUT}/${name}`);
  console.log('wrote', `${DOC_OUT}/${name}`);
}

async function openNewJob(page) {
  await page.goto(`${BASE}/jobs?auditAuth=1&look=jobs-list`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New job/i }).click();
  await page.waitForSelector('.hub-ops-form-sheet h2');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function shotJob(page, name) {
  const panel = page.locator('.hub-ops-form-sheet').first();
  await panel.screenshot({ path: `${DOC_OUT}/${name}`, type: 'png' });
  saveBoth(name);
}

async function captureJobForm(width, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height: width <= 400 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();

  await openNewJob(page);
  await shotJob(page, `forms-new-job-${tag}-empty.png`);

  await page.getByPlaceholder(/Annual safety/i).fill('Switchboard upgrade');
  await shotJob(page, `forms-new-job-${tag}-not-scheduled.png`);

  await page.locator('input[type="date"]').first().fill('2026-09-15');
  await shotJob(page, `forms-new-job-${tag}-needs-crew.png`);

  const crewChip = page.locator('.hub-job-form-crew-chip').first();
  if (await crewChip.count()) {
    await crewChip.click();
    await shotJob(page, `forms-new-job-${tag}-booked.png`);
  }

  await ctx.close();
}

async function openTimeEntry(page) {
  await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1&look=job-hours#job-hours`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-hours', { timeout: 20000 });
  await page.locator('#job-hours button:has-text("Add hours")').click();
  await page.waitForSelector('.hub-ops-form-sheet h2', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

async function shotTime(page, name) {
  const panel = page.locator('.hub-ops-form-sheet').first();
  await panel.screenshot({ path: `${DOC_OUT}/${name}`, type: 'png' });
  saveBoth(name);
}

async function captureTimeEntry(width, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height: width <= 400 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  await openTimeEntry(page);
  await shotTime(page, `forms-time-entry-${tag}-empty.png`);
  const sheet = page.locator('.hub-ops-form-sheet');
  await sheet.locator('.job-time-chip', { hasText: '2h' }).click();
  await sheet.locator('textarea').fill('Pulled cable in roof space.');
  await shotTime(page, `forms-time-entry-${tag}-filled.png`);
  await ctx.close();
}

async function captureJobCrew(width, tag) {
  const ctx = await browser.newContext({
    viewport: { width, height: width <= 400 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1&look=crew2#job-schedule`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-schedule', { timeout: 20000 });
  await page.evaluate(() => {
    document.getElementById('job-schedule')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);
  const panel = page.locator('#job-schedule');
  await panel.screenshot({ path: `${DOC_OUT}/forms-job-crew-${tag}.png`, type: 'png' });
  saveBoth(`forms-job-crew-${tag}.png`);
  await ctx.close();
}

await captureJobForm(375, 'phone-375');
await captureJobForm(390, 'phone-390');
await captureJobForm(1280, 'laptop-1280');
await captureTimeEntry(375, 'phone-375');
await captureTimeEntry(390, 'phone-390');
await captureTimeEntry(1280, 'laptop-1280');
await captureJobCrew(390, 'phone-390');
await captureJobCrew(1280, 'laptop-1280');
await browser.close();
console.log('forms A1/A2 LOOK capture done');
