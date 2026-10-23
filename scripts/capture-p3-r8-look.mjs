// P3 r8 LOOK frames. 390 sheet vs mockup comes from the kill pin (real mockup HTML | p3-0036).
// List / 1280 / edit come from the vite DEV app.
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const DOCS = 'docs/look/p3';
const ART = process.env.P3_R8_OUT || '/opt/cursor/artifacts/p3-r8';
mkdirSync(DOCS, { recursive: true });
mkdirSync(ART, { recursive: true });

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/local/bin/google-chrome',
  '/usr/bin/chromium',
].filter((path) => path && existsSync(path));

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeCandidates[0],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function open(width, height = width <= 430 ? 844 : 900) {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: 'Australia/Brisbane',
  });
  return { context, page: await context.newPage() };
}

async function waitReady(page, sel, extra = 250) {
  await page.waitForSelector(sel, { timeout: 30000, state: 'attached' });
  await page.waitForTimeout(extra);
}

const health = await fetch(`${BASE}/jobs?auditAuth=1&look=jobs-list`).then((res) => res.ok).catch(() => false);
if (!health) {
  await browser.close();
  throw new Error(`vite DEV is not up at ${BASE}`);
}

for (const w of [375, 390, 768, 1024, 1280]) {
  const { context, page } = await open(w);
  await page.goto(`${BASE}/jobs?auditAuth=1&look=jobs-list`, { waitUntil: 'domcontentloaded' });
  await waitReady(page, '.hub-jobs-list-whisper');
  await page.screenshot({ path: `${DOCS}/jobs-list-${w}.png`, type: 'png', fullPage: true, animations: 'disabled' });
  if (w === 390) {
    await page.screenshot({ path: `${ART}/390-list.png`, type: 'png', fullPage: true, animations: 'disabled' });
  }
  await context.close();
}

for (const w of [390, 1280]) {
  const { context, page } = await open(w);
  await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await waitReady(page, 'h1.hub-jobs-hero');
  if (w === 1280) {
    await page.screenshot({ path: `${ART}/1280-sheet.png`, type: 'png', fullPage: true, animations: 'disabled' });
  }
  await context.close();
}

{
  const { context, page } = await open(390);
  await page.goto(`${BASE}/jobs?auditAuth=1&look=jobs-list`, { waitUntil: 'domcontentloaded' });
  await waitReady(page, '.hub-jobs-list-whisper');
  const newBtn = page.locator('[data-jobs-new="1"]');
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForSelector('[data-job-form="1"]', { timeout: 15000 });
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: `${ART}/390-edit.png`, type: 'png', fullPage: true, animations: 'disabled' });
  await context.close();
}

await browser.close();
console.log(`wrote vite-DEV list/edit/1280 frames to ${ART}`);
