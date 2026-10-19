import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || '/opt/cursor/artifacts/hotfix-date';
mkdirSync(OUT, { recursive: true });

const widths = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1280', width: 1280, height: 800 },
];

const browser = await chromium.launch({
  headless: true,
  channel: process.env.LOOK_BROWSER_CHANNEL || 'chrome',
});

async function measure(page, { expectError = false } = {}) {
  return page.evaluate(({ expectError }) => {
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflowOk = scrollWidth <= innerWidth;

    const interesting = [
      '.hub-compliance-status',
      '.hub-compliance-name',
      '#compliance-first-due-date',
      '#compliance-first-due-date-error',
      '.overlay-panel-lg h2',
    ];
    const clipped = [];
    for (const sel of interesting) {
      for (const el of document.querySelectorAll(sel)) {
        const style = getComputedStyle(el);
        const text = (el.textContent ?? el.value ?? '').trim();
        if (!text) continue;
        const boxClip = el.scrollWidth > el.clientWidth + 1
          && (style.overflowX === 'hidden' || style.overflow === 'hidden' || style.textOverflow === 'ellipsis');
        if (boxClip) {
          clipped.push({
            sel,
            text: text.slice(0, 80),
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          });
        }
      }
    }

    const due = [...document.querySelectorAll('.hub-compliance-status, .hub-compliance-sheet')]
      .map(el => el.textContent ?? '')
      .find(t => t.includes('Due')) ?? '';
    const dueClipped = clipped.some(c => c.sel === '.hub-compliance-status');

    const err = document.getElementById('compliance-first-due-date-error');
    let errorInViewport = false;
    let errorBox = null;
    if (err) {
      const r = err.getBoundingClientRect();
      errorBox = {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
      };
      errorInViewport = r.width > 0 && r.height > 0
        && r.top >= 0
        && r.bottom <= innerHeight
        && r.left >= 0
        && r.right <= innerWidth + 1;
    }

    const overlay = document.querySelector('.overlay-body');
    const overlayScrolled = overlay ? overlay.scrollTop > 0 : false;

    return {
      innerWidth,
      innerHeight,
      scrollWidth,
      overflowOk,
      clipped,
      dueLabel: due.replace(/\s+/g, ' ').trim().slice(0, 80),
      dueClipped,
      errorText: err?.textContent ?? null,
      errorInViewport,
      errorBox,
      overlayScrolled,
      expectError,
      pass: overflowOk
        && !dueClipped
        && (!expectError || (Boolean(err) && errorInViewport && !overlayScrolled)),
    };
  }, { expectError });
}

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  console.log(path);
}

async function openList(page) {
  await page.goto(`${BASE}/compliance?auditAuth=1&look=hotfix-date-bad`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Backflow test delete ok').waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
}

async function openEdit(page) {
  await openList(page);
  await page.locator('.hub-compliance-row .hub-compliance-list-more summary').first().click();
  await page.getByRole('menuitem', { name: /^Edit$/ }).click();
  await page.waitForSelector('#compliance-first-due-date', { timeout: 10000 });
  await page.waitForTimeout(300);
}

async function openErrorNew(page) {
  await page.goto(`${BASE}/compliance?auditAuth=1&look=compliance-list`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New item/i }).click();
  await page.waitForSelector('#compliance-first-due-date', { timeout: 10000 });
  await page.fill('#compliance-first-due-date', '');
  await page.fill('#compliance-first-due-date', '21/10/212026');
  await page.locator('input[placeholder="e.g. Annual Fire Extinguisher Service"]').fill('Year guard item');
  await page.getByRole('button', { name: /Create Item/i }).click();
  await page.locator('#compliance-first-due-date-error').waitFor({ timeout: 10000 });
  await page.waitForTimeout(200);
}

async function openErrorEdit(page) {
  await openEdit(page);
  await page.fill('#compliance-first-due-date', '');
  await page.fill('#compliance-first-due-date', '21/10/212026');
  await page.getByRole('button', { name: /Save Changes/i }).click();
  await page.locator('#compliance-first-due-date-error').waitFor({ timeout: 10000 });
  await page.waitForTimeout(200);
}

const rows = [];

for (const view of widths) {
  const context = await browser.newContext({ viewport: { width: view.width, height: view.height } });
  const page = await context.newPage();

  await openList(page);
  const viewM = await measure(page, { expectError: false });
  await shot(page, `after-compliance-bad-row-view-${view.name}`);
  rows.push({ surface: '/compliance 212026 row', mode: 'view', width: view.name, ...viewM });

  await openEdit(page);
  const editM = await measure(page, { expectError: false });
  await shot(page, `after-compliance-bad-row-edit-${view.name}`);
  rows.push({ surface: '/compliance 212026 row', mode: 'edit', width: view.name, ...editM });

  await openErrorNew(page);
  const errViewM = await measure(page, { expectError: true });
  await shot(page, `after-year-guard-view-${view.name}`);
  rows.push({ surface: 'date-save error', mode: 'view', width: view.name, ...errViewM });

  await openErrorEdit(page);
  const errEditM = await measure(page, { expectError: true });
  await shot(page, `after-year-guard-edit-${view.name}`);
  rows.push({ surface: 'date-save error', mode: 'edit', width: view.name, ...errEditM });

  // keep the original filenames for 1024 list + error
  if (view.name === '1024') {
    await openList(page);
    await shot(page, 'after-compliance-bad-row-1024');
    await openErrorNew(page);
    await shot(page, 'after-year-guard-1024');
  }

  await context.close();
}

writeFileSync(`${OUT}/measures.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 2));
await browser.close();
