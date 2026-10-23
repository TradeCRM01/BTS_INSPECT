import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const DOC_OUT = 'docs/look/p1b';
const ART_OUT = '/opt/cursor/artifacts/p1b';
mkdirSync(DOC_OUT, { recursive: true });
mkdirSync(ART_OUT, { recursive: true });

const WIDTHS = [375, 390, 768, 1024, 1280];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

function save(name) {
  copyFileSync(`${DOC_OUT}/${name}`, `${ART_OUT}/${name}`);
  console.log('wrote', `${DOC_OUT}/${name}`);
}

async function overflowBox(page) {
  return page.evaluate(() => {
    const vis = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
    };
    const rights = [...document.querySelectorAll('body *')].filter(vis).map((el) => el.getBoundingClientRect().right);
    return {
      innerWidth: window.innerWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      maxRight: rights.length ? Math.max(...rights) : 0,
    };
  });
}

async function enterEdit(page) {
  await page.evaluate(async () => {
    const more = document.querySelector('.dashboard-home-more');
    if (!more) throw new Error('more menu missing');
    more.open = true;
    const btn = [...more.querySelectorAll('button')].find((el) => /Customize|Done editing/.test(el.textContent || ''));
    if (!btn) throw new Error('Customize missing');
    if (!/Done editing/.test(btn.textContent || '')) btn.click();
    for (let i = 0; i < 50; i += 1) {
      if ([...document.querySelectorAll('button, a')].some((el) => /Add widget/.test(el.textContent || ''))) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error('edit mode missing');
  });
}

const table = [];
for (const width of WIDTHS) {
  const phone = width <= 430;
  for (const mode of ['view', 'edit']) {
    const ctx = await browser.newContext({
      viewport: { width, height: phone ? 844 : 1100 },
      deviceScaleFactor: 1,
      isMobile: phone,
      hasTouch: phone,
      locale: 'en-AU',
      colorScheme: 'light',
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?auditAuth=1&look=dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 25000 });
    await page.evaluate(() => document.fonts.ready);
    if (mode === 'edit') await enterEdit(page);
    await page.waitForTimeout(400);
    const box = await overflowBox(page);
    const name = `p1b-today-after-${width}-${mode}.png`;
    await page.screenshot({ path: `${DOC_OUT}/${name}`, type: 'png', fullPage: true, animations: 'disabled' });
    save(name);
    table.push({ width, mode, ...box });
    await ctx.close();
  }
}

writeFileSync(`${ART_OUT}/overflow-table.json`, JSON.stringify(table, null, 2));
writeFileSync(`${DOC_OUT}/overflow-table.json`, JSON.stringify(table, null, 2));
console.log(JSON.stringify(table, null, 2));
await browser.close();
