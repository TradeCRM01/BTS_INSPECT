import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'grafter-proofs/sweep/pr372-r2';
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { w: 375, h: 812, tag: '375' },
  { w: 390, h: 844, tag: '390' },
  { w: 1280, h: 900, tag: '1280' },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.LOOK_CHROME || '/usr/bin/google-chrome-stable',
});

async function contextFor(width, height) {
  return browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, type: 'png', fullPage: false });
  console.log('wrote', path);
}

async function setNativeValue(page, selector, value) {
  await page.evaluate(({ selector, value }) => {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLInputElement)) throw new Error(`missing ${selector}`);
    const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    proto?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, { selector, value });
}

async function fillDate(page, value) {
  await page.locator('[data-date-field="au"]').first().waitFor({ timeout: 15000 });
  await setNativeValue(page, '[data-date-field="au"]', value);
}

async function fillTimes(page, start, end) {
  await page.locator('input[type="time"]').first().waitFor({ timeout: 15000 });
  await page.evaluate(({ start, end }) => {
    const els = [...document.querySelectorAll('input[type="time"]')];
    const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    const set = (el, v) => {
      proto?.set?.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    if (els[0]) set(els[0], start);
    if (els[1]) set(els[1], end);
  }, { start, end });
}

async function run(name, fn) {
  try {
    await fn();
  } catch (err) {
    console.error('FAIL', name, err instanceof Error ? err.message : err);
  }
}

for (const { w, h, tag } of WIDTHS) {
  await run(`reminder-edit-${tag}`, async () => {
    const ctx = await contextFor(w, h);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/reminders/audit-reminder?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-date-field="au"]').waitFor({ timeout: 20000 });
    await fillDate(page, '23102026');
    await setNativeValue(page, '#reminder-time', '07:30');
    await shot(page, `reminder-edit-23102026-${tag}`);
    await ctx.close();
  });

  await run(`reminder-needs-date-${tag}`, async () => {
    const ctx = await contextFor(w, h);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/reminders/audit-reminder?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-date-field="au"]').waitFor({ timeout: 20000 });
    await setNativeValue(page, '#reminder-time', '07:30');
    await page.locator('.reminder-save').click();
    await page.locator('[role="alert"]').waitFor({ timeout: 8000 });
    await shot(page, `reminder-time-needs-date-${tag}`);
    await ctx.close();
  });

  await run(`add-stage-${tag}`, async () => {
    const ctx = await contextFor(w, h);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('h1, .ops-page-title, .hub-jobs').first().waitFor({ timeout: 20000 });
    const more = page.locator('summary[aria-label="More actions"]');
    if (await more.count()) {
      await more.click();
      await page.getByRole('menuitem', { name: 'Details' }).click();
      await page.getByRole('button', { name: /Add a stage/i }).click({ timeout: 15000 });
    } else {
      await page.goto(`${BASE}/jobs?auditAuth=1`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /New job/i }).first().click({ timeout: 20000 });
      await page.getByRole('heading', { name: 'New Job' }).waitFor({ timeout: 15000 });
    }
    await page.locator('.hub-ops-form-sheet').waitFor({ timeout: 15000 });
    await fillDate(page, '31/02/2026');
    const title = page.locator('input[placeholder="e.g. Annual safety inspection"]').first();
    if (await title.count()) await title.fill('Follow-up');
    await page.getByRole('button', { name: /Create stage|Create Job/i }).click();
    await page.locator('[role="alert"]').waitFor({ timeout: 8000 }).catch(() => {});
    await shot(page, `add-stage-invalid-date-${tag}`);
    await ctx.close();
  });

  await run(`time-reversed-${tag}`, async () => {
    const ctx = await contextFor(w, h);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/timesheets?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Add Entry/i }).first().click({ timeout: 20000 });
    await page.getByRole('heading', { name: 'Add Time Entry' }).waitFor({ timeout: 15000 });
    await fillTimes(page, '16:30', '08:15');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.locator('[role="alert"]').waitFor({ timeout: 8000 });
    await shot(page, `time-entry-reversed-${tag}`);
    await ctx.close();
  });

  await run(`time-overlap-${tag}`, async () => {
    const ctx = await contextFor(w, h);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/timesheets?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Add Entry/i }).first().click({ timeout: 20000 });
    await page.getByRole('heading', { name: 'Add Time Entry' }).waitFor({ timeout: 15000 });
    const utc = new Date().toISOString().slice(0, 10);
    const [y, m, d] = utc.split('-');
    await fillDate(page, `${d}/${m}/${y}`);
    await fillTimes(page, '08:00', '09:00');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.locator('[role="alert"]').waitFor({ timeout: 8000 }).catch(() => {});
    await shot(page, `time-entry-overlap-${tag}`);
    await ctx.close();
  });

  await run(`overnight-${tag}`, async () => {
    const ctx = await contextFor(w, h);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/timesheets?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Add Entry/i }).first().click({ timeout: 20000 });
    await page.getByRole('heading', { name: 'Add Time Entry' }).waitFor({ timeout: 15000 });
    await fillTimes(page, '23:00', '01:00');
    await page.locator('label', { hasText: 'Ends next day' }).click();
    await shot(page, `time-entry-overnight-plus1-${tag}`);
    await ctx.close();
  });

  if (tag === '1280') {
    await run(`new-job-${tag}`, async () => {
      const ctx = await contextFor(w, h);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/jobs?auditAuth=1`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /New job/i }).first().click({ timeout: 20000 });
      await page.getByRole('heading', { name: 'New Job' }).waitFor({ timeout: 15000 });
      await page.locator('input[placeholder="e.g. Annual safety inspection"]').fill('Mixer tap');
      await fillTimes(page, '14:00', '09:00');
      await page.getByRole('button', { name: /Create Job/i }).click();
      await page.locator('[role="alert"]').waitFor({ timeout: 8000 }).catch(() => {});
      await shot(page, `new-job-end-before-start-${tag}`);
      await ctx.close();
    });
  }
}

await browser.close();
console.log('done', OUT);
