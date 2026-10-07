import { copyFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const DOC_OUT = 'docs/look';
const ART_OUT = '/opt/cursor/artifacts';
const PROOFS_OUT = '/workspace/grafter-proofs/expense1';

mkdirSync(DOC_OUT, { recursive: true });
mkdirSync(ART_OUT, { recursive: true });
mkdirSync(PROOFS_OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openAddExpense(page, look) {
  const q = look === 'filled'
    ? '?auditAuth=1&expenseNoAi=1&look=expense1-filled'
    : '?auditAuth=1&expenseNoAi=1&look=expense1-empty';
  await page.goto(`${BASE}/expenses${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-expense-editor-overlay="1"]', { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

function saveAll(name) {
  for (const dir of [ART_OUT, PROOFS_OUT]) {
    copyFileSync(`${DOC_OUT}/${name}`, `${dir}/${name}`);
  }
  console.log('wrote', `${DOC_OUT}/${name}`);
}

async function capture(width, look) {
  const ctx = await browser.newContext({
    viewport: { width, height: width <= 400 ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: width <= 400,
    hasTouch: width <= 400,
    locale: 'en-AU',
    timezoneId: 'Australia/Perth',
  });
  const page = await ctx.newPage();
  await openAddExpense(page, look);
  const name = `expense1-${look}-${width}.png`;
  await page.screenshot({ path: `${DOC_OUT}/${name}`, type: 'png', fullPage: true });
  saveAll(name);
  await ctx.close();
}

for (const look of ['empty', 'filled']) {
  for (const w of [375, 390, 1280]) {
    await capture(w, look);
  }
}

await browser.close();
console.log('expense1 LOOK capture done');
