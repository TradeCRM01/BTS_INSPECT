// COST-2 LOOK fixtures — run with `npm run dev` and auditAuth harness.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(viewport, path, href, wait) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'en-AU',
    isMobile: viewport.width < 500,
    hasTouch: viewport.width < 500,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await wait(page);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path, type: 'png' });
  await context.close();
}

async function waitJobBill(page) {
  await page.waitForSelector('.job-bill-no-cost-flag, .job-bill-incomplete-flag', { timeout: 20000 });
}

async function waitTeamCostSelect(page) {
  await page.waitForSelector('#team-member-open', { timeout: 20000 });
  await page.waitForSelector('select[aria-label="Cost model"]', { timeout: 20000 });
}

async function waitTeamEmptyHint(page) {
  await page.waitForSelector('#team-member-open', { timeout: 20000 });
  await page.waitForSelector('.hub-team-muted-hint', { timeout: 20000 });
}

await shot(
  { width: 390, height: 844 },
  `${OUT}/p331-nocost-390.png`,
  '/jobs/audit-doc-job?auditAuth=1&look=p331-nocost&tab=materials',
  waitJobBill,
);

await shot(
  { width: 390, height: 844 },
  `${OUT}/p331-cost-filled-390.png`,
  '/jobs/audit-doc-job?auditAuth=1&look=p331-cost-filled&tab=materials',
  async (page) => {
    await page.waitForSelector('table tbody tr', { timeout: 20000 });
    await page.waitForFunction(() => {
      const cell = document.querySelector('table tbody tr td');
      return cell && !cell.textContent?.includes('No cost rate');
    });
  },
);

await shot(
  { width: 1280, height: 900 },
  `${OUT}/p331-bill-1280.png`,
  '/jobs/audit-doc-job?auditAuth=1&look=p331-bill&tab=materials',
  waitJobBill,
);

await shot(
  { width: 390, height: 844 },
  `${OUT}/p331-team-select-390.png`,
  '/settings/team?auditAuth=1&look=p331-team-select&id=look-team-alex',
  waitTeamCostSelect,
);

await browser.close();
console.log('wrote p331 COST-2 frames to', OUT);
