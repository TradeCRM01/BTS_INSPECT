import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.SWEEP1_OUT || '/opt/cursor/artifacts/sweep-1';
const HARNESS = '/?look=dashboard';

mkdirSync(OUT, { recursive: true });

const BEFORE = [
  ['1280-dashboard-edit-widgets-overlap.png', '/workspace/grafter-proofs/sweep/b1/1280-dashboard-edit-widgets-overlap.png'],
  ['1280-dashboard-edit-three-widgets-stacked.png', '/workspace/grafter-proofs/sweep/b1/1280-dashboard-edit-three-widgets-stacked.png'],
  ['1280-add-widget-bitcoin-crypto-tabs-jump.png', '/workspace/grafter-proofs/sweep/b1/1280-add-widget-bitcoin-crypto-tabs-jump.png'],
  ['390-dashboard-add-widget-picker.png', '/workspace/grafter-proofs/sweep/b1/390-dashboard-add-widget-picker.png'],
  ['1280-dashboard-edit-widget-header-icons-overlap.png', '/workspace/grafter-proofs/sweep/b1/1280-dashboard-edit-widget-header-icons-overlap.png'],
];

for (const [name, src] of BEFORE) {
  if (existsSync(src)) copyFileSync(src, `${OUT}/before-${name}`);
}

function overlapPairs(boxes) {
  const hits = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      if (overlap) hits.push([a.id, b.id]);
    }
  }
  return hits;
}

async function openDashboard(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
  await page.waitForSelector('[data-dashboard-widgets="1"]', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
}

async function openCustomize(page) {
  await page.locator('.dashboard-home-more summary').click();
  await page.getByRole('menuitem', { name: 'Customize' }).click();
  await page.getByRole('button', { name: 'Add widget' }).waitFor({ timeout: 8000 });
}

async function addWidget(page, tab, label) {
  await page.getByRole('button', { name: 'Add widget' }).click();
  await page.getByRole('heading', { name: 'Add a Widget' }).waitFor();
  await page.getByRole('button', { name: tab }).click();
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
  await page.getByRole('heading', { name: 'Add a Widget' }).waitFor({ state: 'hidden', timeout: 8000 });
}

async function pickerLabels(page) {
  await page.getByRole('button', { name: 'Add widget' }).click();
  await page.getByRole('heading', { name: 'Add a Widget' }).waitFor();
  const labels = {};
  for (const tab of ['Intelligence', 'Your App', 'Live Data', 'Tools', 'Extras']) {
    await page.getByRole('button', { name: tab }).click();
    labels[tab] = await page.locator('.overlay-panel-xl button p.text-sm').allTextContents();
  }
  return labels;
}

async function closePicker(page) {
  const heading = page.getByRole('heading', { name: 'Add a Widget' });
  if (await heading.isVisible()) {
    await page.locator('.overlay-panel-xl').locator('xpath=.//button[contains(@class,"w-8")]').click();
    await heading.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
}

async function shotWidgets(page, path) {
  const canvas = page.locator('.dashboard-home-canvas, [data-dashboard-widgets="1"]').first();
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await canvas.screenshot({ path, type: 'png' });
}

async function shotPickerLiveData(page, path) {
  await page.getByRole('button', { name: 'Add widget' }).click();
  await page.getByRole('heading', { name: 'Add a Widget' }).waitFor();
  await page.getByRole('button', { name: 'Live Data' }).click();
  await page.waitForTimeout(150);
  await page.locator('.overlay-panel-xl').screenshot({ path, type: 'png' });
}

async function editWidgetBoxes(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.dashboard-home-canvas');
    if (!canvas) return [];
    return [...canvas.querySelectorAll(':scope > .absolute')].map((el, i) => {
      const r = el.getBoundingClientRect();
      const title = el.querySelector('.text-xs.font-semibold, span.font-semibold')?.textContent?.trim() || `w${i}`;
      return { id: title, x: r.left, y: r.top, w: r.width, h: r.height };
    });
  });
}

async function measureDrag(page) {
  const handle = page.locator('.dashboard-home-canvas button[title="Drag to move"]').first();
  if (!(await handle.count())) return { tried: false };
  const before = await handle.evaluate(el => {
    const card = el.closest('.absolute');
    const r = card.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  const box = await handle.boundingBox();
  if (!box) return { tried: false };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2 + 40, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await handle.evaluate(el => {
    const card = el.closest('.absolute');
    const r = card.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  return {
    tried: true,
    before,
    after,
    moved: Math.abs(after.x - before.x) > 8 || Math.abs(after.y - before.y) > 8,
  };
}

const report = { viewports: {} };

const browser = await chromium.launch({ headless: true });

async function run1280() {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
    deviceScaleFactor: 1,
    locale: 'en-AU',
  });
  const page = await ctx.newPage();
  await openDashboard(page);
  await page.screenshot({ path: `${OUT}/after-1280-dashboard-view.png`, type: 'png' });
  await openCustomize(page);
  await page.screenshot({ path: `${OUT}/after-1280-customize.png`, type: 'png' });
  const labels = await pickerLabels(page);
  await closePicker(page);
  await shotPickerLiveData(page, `${OUT}/after-1280-picker-live-data.png`);
  await closePicker(page);
  await addWidget(page, 'Live Data', 'Weather');
  await shotWidgets(page, `${OUT}/after-1280-added-weather.png`);
  await addWidget(page, 'Intelligence', 'Compliance Deadlines');
  await shotWidgets(page, `${OUT}/after-1280-added-weather-compliance.png`);
  await page.screenshot({ path: `${OUT}/after-1280-added-weather-compliance-page.png`, type: 'png', fullPage: true });
  const boxes = await editWidgetBoxes(page);
  const drag = await measureDrag(page);
  await page.screenshot({ path: `${OUT}/after-1280-drag-probe.png`, type: 'png' });
  report.viewports[1280] = {
    picker: labels,
    boxes,
    overlaps: overlapPairs(boxes),
    drag,
    banned: ['Bitcoin Price', 'Crypto Price', 'Market Overview'].filter(name =>
      Object.values(labels).some(list => list.includes(name))),
  };
  await ctx.close();
}

async function runPhone(width, height) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'en-AU',
  });
  const page = await ctx.newPage();
  await openDashboard(page);
  await page.screenshot({ path: `${OUT}/after-${width}-dashboard-view.png`, type: 'png' });
  await openCustomize(page);
  await page.screenshot({ path: `${OUT}/after-${width}-customize.png`, type: 'png' });
  const labels = await pickerLabels(page);
  await closePicker(page);
  await shotPickerLiveData(page, `${OUT}/after-${width}-picker-live-data.png`);
  await closePicker(page);
  await addWidget(page, 'Live Data', 'Weather');
  await shotWidgets(page, `${OUT}/after-${width}-added-weather.png`);
  await addWidget(page, 'Intelligence', 'Compliance Deadlines');
  await shotWidgets(page, `${OUT}/after-${width}-added-weather-compliance.png`);
  await page.screenshot({ path: `${OUT}/after-${width}-added-weather-compliance-page.png`, type: 'png', fullPage: true });
  report.viewports[width] = {
    picker: labels,
    banned: ['Bitcoin Price', 'Crypto Price', 'Market Overview'].filter(name =>
      Object.values(labels).some(list => list.includes(name))),
  };
  await ctx.close();
}

await run1280();
await runPhone(390, 844);
await runPhone(375, 800);
await browser.close();

writeFileSync(`${OUT}/measure.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.viewports[1280].overlaps.length) {
  throw new Error(`overlap after add: ${JSON.stringify(report.viewports[1280].overlaps)}`);
}
if (report.viewports[1280].banned.length || report.viewports[390].banned.length || report.viewports[375].banned.length) {
  throw new Error(`retired widgets still in picker: ${JSON.stringify({
    1280: report.viewports[1280].banned,
    390: report.viewports[390].banned,
    375: report.viewports[375].banned,
  })}`);
}
console.log('sweep-1 frames ok');
