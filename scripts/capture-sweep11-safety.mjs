import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || '/opt/cursor/artifacts/sweep-11-safety/after';
const TAG = process.env.LOOK_TAG || 'after';

mkdirSync(OUT, { recursive: true });

const widths = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
];

const TAKE5 = '/jha/take5?auditAuth=1&jhaId=audit-jha-fill&id=audit-take5-fill';
const LIST = '/jha/take5?auditAuth=1&look=take5-list';
const JHA = '/jha/new?auditAuth=1&docId=audit-jha-fill';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function shot(page, name) {
  const path = `${OUT}/${TAG}-${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(path);
}

async function drawSig(page) {
  const canvas = page.locator('#take5-sign canvas, .hub-take5-sign canvas').first();
  if (!(await canvas.count())) return;
  const box = await canvas.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 50);
  await page.mouse.move(box.x + 40, box.y + 80);
  await page.mouse.up();
}

async function fillControl(page) {
  const areas = page.locator('#take5-checks textarea');
  const count = await areas.count();
  if (count >= 4) {
    const control = areas.nth(3);
    const value = await control.inputValue();
    if (!value.trim()) await control.fill('Lock out and test dead');
  }
}

for (const view of widths) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(`${BASE}${TAKE5}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-take5-document, .hub-take5-primary', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  await fillControl(page);
  const more = page.getByRole('button', { name: /More job details|Hide extra details/ });
  if (await more.count()) {
    const label = await more.first().textContent();
    if (label?.includes('More')) await more.first().click();
  }

  const save = page.getByRole('button', { name: 'Save draft' });
  if (await save.count()) {
    await save.first().click();
    await page.waitForTimeout(400);
  }
  await shot(page, `${view.name}-save-after-first-save`);

  await drawSig(page);
  await page.waitForTimeout(200);
  if (await save.count()) {
    await save.first().click();
    await page.waitForTimeout(400);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-take5-document, .hub-take5-primary', { timeout: 20000 });
  await page.waitForTimeout(400);
  const fillTab = page.getByRole('button', { name: 'Fill' });
  if (await fillTab.count()) await fillTab.click();
  await page.evaluate(() => document.getElementById('take5-sign')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(200);
  await shot(page, `${view.name}-signature-after-reload`);
  await shot(page, `${view.name}-signer-names`);

  const complete = page.locator('[data-take5-complete]').first();
  if (await complete.count()) {
    await complete.click();
    await page.waitForTimeout(800);
  } else {
    const next = page.locator('.hub-take5-primary').first();
    if (await next.count()) await next.click();
    await page.waitForTimeout(400);
  }
  const pdfTab = page.getByRole('button', { name: 'PDF' });
  if (await pdfTab.count()) await pdfTab.click();
  await page.waitForTimeout(400);
  await shot(page, `${view.name}-complete-then-pdf`);

  await page.goto(`${BASE}${JHA}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-jha-document, .hub-jha-primary', { timeout: 20000 });
  await page.waitForTimeout(400);
  const moreJha = page.getByRole('button', { name: /More job details|Hide extra details/ });
  if (await moreJha.count()) {
    const label = await moreJha.first().textContent();
    if (label?.includes('More')) await moreJha.first().click();
  }
  const jobSelect = page.locator('#jha-identity select').first();
  if (await jobSelect.count()) {
    await jobSelect.selectOption('');
    await page.waitForTimeout(200);
  }
  const site = page.locator('#jha-identity input[placeholder="Where is the work?"]');
  if (await site.count()) {
    await site.click();
    await site.fill('');
    await site.type(' 6 Kedron Brook', { delay: 40 });
    await page.waitForTimeout(200);
  }
  await shot(page, `${view.name}-jha-site-while-typing`);

  await page.goto(`${BASE}${LIST}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-take5-list-doc, .ops-page-title', { timeout: 20000 });
  await page.waitForTimeout(400);
  const done = page.locator('[role="tablist"][aria-label="Take 5 status"] [role="tab"]').filter({ hasText: 'Done' });
  if (await done.count()) await done.click();
  await page.waitForTimeout(200);
  await shot(page, `${view.name}-open-done-tabs`);

  await context.close();
}

await browser.close();
