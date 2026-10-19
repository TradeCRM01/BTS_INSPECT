import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || '/opt/cursor/artifacts/hotfix-date';
mkdirSync(OUT, { recursive: true });

const helperPath = new URL('../src/lib/complianceList.ts', import.meta.url);
const helperSrc = readFileSync(helperPath, 'utf8');

const browser = await chromium.launch({
  headless: true,
  channel: process.env.LOOK_BROWSER_CHANNEL || 'chrome',
});

const widths = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1280', width: 1280, height: 800 },
];

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(path);
}

async function openList(page) {
  await page.goto(`${BASE}/compliance?auditAuth=1&look=hotfix-date-bad`, { waitUntil: 'domcontentloaded' });
  await page.locator('body').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const bodyText = await page.locator('body').innerText();
  if (
    !bodyText.includes('Backflow test delete ok')
    && !bodyText.includes('Invalid time value')
    && !bodyText.includes('This page ran into a problem')
  ) {
    throw new Error(`compliance look page did not settle: ${bodyText.slice(0, 400)}`);
  }
  await page.waitForTimeout(400);
}

async function setNativeDate(page, selector, value) {
  await page.locator(selector).evaluate((el, next) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function openGuard(page) {
  await page.goto(`${BASE}/compliance?auditAuth=1&look=compliance-list`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New item/i }).click();
  await page.waitForSelector('#compliance-first-due-date', { timeout: 10000 });
  await setNativeDate(page, '#compliance-first-due-date', '212026-02-11');
  await page.locator('input[placeholder="e.g. Annual Fire Extinguisher Service"]').fill('Year guard item');
  const client = page.locator('select').first();
  if (await client.count()) {
    const hasOption = await client.locator('option[value]:not([value=""])').count();
    if (hasOption > 0) {
      await client.selectOption({ index: 1 });
    }
  }
  await page.getByRole('button', { name: /Create Item/i }).click();
  await page.locator('#compliance-first-due-date-error').waitFor({ timeout: 10000 });
  await page.locator('#compliance-first-due-date-error').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
}

const crashed = helperSrc.replace(
  "return `Due ${safeFormatDate(nextDueDate, 'd MMM yyyy')}`;",
  "return `Due ${format(parseISO(nextDueDate), 'd MMM yyyy')}`;",
);
if (crashed === helperSrc) throw new Error('could not patch complianceListDueLabel for BEFORE frames');
writeFileSync(helperPath, crashed);

try {
  for (const view of widths) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
    const page = await context.newPage();
    await openList(page);
    await shot(page, `before-compliance-bad-row-${view.name}`);
    await context.close();
  }
} finally {
  writeFileSync(helperPath, helperSrc);
}

for (const view of widths) {
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const page = await context.newPage();
  await openList(page);
  await shot(page, `after-compliance-bad-row-${view.name}`);
  await openGuard(page);
  await shot(page, `after-year-guard-${view.name}`);
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/clients/audit-doc-client?auditAuth=1&look=hotfix-date-bad`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await shot(page, 'after-client-bad-row-1280');
  await context.close();
}

await browser.close();
