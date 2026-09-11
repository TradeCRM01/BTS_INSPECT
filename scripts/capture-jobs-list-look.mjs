import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/jobs?auditAuth=1&look=jobs-list';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-jobs-list-doc .hub-jobs-row', { timeout: 20000 });
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll('.hub-jobs-list-doc .hub-jobs-row')];
    const title = document.querySelector('.hub-jobs-list-doc .ops-page-title');
    return title?.textContent === 'Jobs'
      && rows.length >= 6
      && rows.some((row) => row.textContent?.includes('Northside Electrical'));
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function measure(page) {
  return page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const box = (el) => {
      const r = el?.getBoundingClientRect();
      return r ? { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null;
    };
    const cream = document.querySelector('.hub-jobs-list-doc.ops-page');
    const paper = document.querySelector('.hub-jobs-list-doc .hub-jobs-sheet');
    const body = document.querySelector('.hub-jobs-list-body');
    const title = document.querySelector('.hub-jobs-list-doc .ops-page-title');
    const primary = document.querySelector('.hub-jobs-list-tools .btn-primary');
    const thead = document.querySelector('.hub-jobs-list-doc .hub-jobs-thead');
    const rows = [...document.querySelectorAll('.hub-jobs-list-doc .hub-jobs-row')];
    const row = rows[0];
    const cells = row ? [...row.children] : [];
    const bodyBox = body?.getBoundingClientRect();
    const rowBox = row?.getBoundingClientRect();
    const bodyPad = body ? parseFloat(cs(body).paddingLeft) : 0;
    const usable = bodyBox ? Math.round(bodyBox.width - bodyPad * 2) : null;
    const headCells = thead
      ? [...thead.children].filter((el) => cs(el).display !== 'none').map((el) => ({ text: el.textContent, ...box(el) }))
      : [];
    return {
      viewW: window.innerWidth,
      cream: cs(cream)?.backgroundColor ?? null,
      paper: cs(paper)?.backgroundColor ?? null,
      paperShadow: cs(paper)?.boxShadow ?? null,
      paperW: box(paper)?.w ?? null,
      titleFont: title ? `${cs(title).fontFamily} ${cs(title).fontWeight} ${cs(title).fontSize}` : null,
      primaryH: box(primary)?.h ?? null,
      primaryBg: cs(primary)?.backgroundColor ?? null,
      rowCount: rows.length,
      rowW: rowBox ? Math.round(rowBox.width) : null,
      usableW: usable,
      rowSpansSheet: rowBox && usable ? Math.abs(Math.round(rowBox.width) - usable) <= 1 : false,
      rowH: rowBox ? Math.round(rowBox.height) : null,
      rowRule: cs(rows[1])?.borderTopColor ?? null,
      rowRuleW: cs(rows[1])?.borderTopWidth ?? null,
      rowBg: cs(row)?.backgroundColor ?? null,
      columns: cs(row)?.gridTemplateColumns ?? null,
      cells: cells.map((el) => ({ cls: el.className.replace('truncate ', ''), text: el.textContent, ...box(el) })),
      headCells,
      moreX: box(row?.querySelector('.hub-jobs-list-more'))?.x ?? null,
      rowRight: rowBox ? Math.round(rowBox.right) : null,
      refFont: cells[0] ? `${cs(cells[0]).fontFamily} ${cs(cells[0]).fontWeight}` : null,
      nameFont: cells[1] ? `${cs(cells[1]).fontFamily} ${cs(cells[1]).fontWeight}` : null,
    };
  });
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
const laptopPage = await laptop.newPage();
await openHarness(laptopPage);
console.log('laptop', JSON.stringify(await measure(laptopPage), null, 2));
await laptopPage.screenshot({ path: `${OUT}/jobs-list-laptop-1280.png`, type: 'png' });
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
const phonePage = await phone.newPage();
await openHarness(phonePage);
console.log('phone', JSON.stringify(await measure(phonePage), null, 2));
await phonePage.screenshot({ path: `${OUT}/jobs-list-phone-390.png`, type: 'png' });
await phone.close();

await browser.close();
console.log('wrote jobs-list LOOK frames');
