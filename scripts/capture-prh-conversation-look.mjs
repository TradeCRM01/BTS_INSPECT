import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || '/opt/cursor/artifacts/prh';

mkdirSync(OUT, { recursive: true });

const WIDTHS = [375, 390, 1280];
const HEIGHT = 844;

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function waitSettled(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const root = document.querySelector('.ops-page');
    if (!root) return false;
    const cs = getComputedStyle(root);
    return cs.opacity === '1';
  }, { timeout: 8000 }).catch(() => {});
}

async function clickReady(page, selector) {
  const handle = page.locator(selector).first();
  await handle.waitFor({ state: 'visible', timeout: 20000 });
  await handle.click();
}

async function capture(page, name) {
  await waitSettled(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

async function openClientThread(page) {
  await page.goto(`${BASE}/clients/audit-doc-client?auditAuth=1&look=conversation`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[data-enquiry-conversation="1"]', { timeout: 20000 });
  await clickReady(page, '[data-enquiry-conversation="1"] .ops-section-title');
  await page.locator('[data-sms-direction="inbound"]').first().scrollIntoViewIfNeeded();
}

async function openClientEmpty(page) {
  await page.goto(`${BASE}/clients/audit-doc-client?auditAuth=1&look=conversation-empty`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.hub-clients-document', { timeout: 20000 });
  await clickReady(page, '.hub-clients-hero');
}

async function openJobThread(page) {
  await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1&look=conversation`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[data-enquiry-conversation="1"]', { timeout: 20000 });
  const overview = page.locator('.job-sheet-tab').filter({ hasText: 'Overview' });
  if (await overview.count()) await overview.first().click();
  await clickReady(page, '[data-enquiry-conversation="1"] .ops-section-title');
  await page.locator('[data-enquiry-conversation="1"]').first().scrollIntoViewIfNeeded();
}

async function openJobEmpty(page) {
  await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1&look=conversation-empty`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.hub-jobs-document, .hub-jobs.is-record-open', { timeout: 20000 });
  const overview = page.locator('.job-sheet-tab').filter({ hasText: 'Overview' });
  if (await overview.count()) await overview.first().click();
}

for (const width of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width, height: width === 1280 ? 800 : HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await openClientThread(page);
  await capture(page, `client-conversation-${width}`);
  await openClientEmpty(page);
  await capture(page, `client-conversation-empty-${width}`);
  await openJobThread(page);
  await capture(page, `job-conversation-${width}`);
  await openJobEmpty(page);
  await capture(page, `job-conversation-empty-${width}`);
  await context.close();
}

await browser.close();
console.log(`wrote frames to ${OUT}`);
