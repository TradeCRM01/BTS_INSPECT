import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const PHASE = process.env.SWEEP_AI_PHASE || 'after';
const OUT = process.env.SWEEP_AI_OUT || `/opt/cursor/artifacts/sweep-ai/${PHASE}`;

mkdirSync(OUT, { recursive: true });

const WIDTHS = [375, 390, 1024, 1280];
const HEIGHT = 844;

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
});

async function measure(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const clipped = [...document.querySelectorAll('h1, h2, p, span, label, button, a')]
      .filter((el) => {
        const s = getComputedStyle(el);
        if (s.overflow === 'hidden' && s.textOverflow === 'ellipsis') return false;
        return el.scrollWidth > el.clientWidth + 1;
      })
      .slice(0, 8)
      .map((el) => ({
        tag: el.tagName,
        text: (el.textContent || '').trim().slice(0, 80),
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
      }));
    let maxRight = 0;
    let maxRightNoHeader = 0;
    for (const el of document.querySelectorAll('*')) {
      const right = el.getBoundingClientRect().right;
      if (right > maxRight) maxRight = right;
      if (!el.closest('.shell-header') && right > maxRightNoHeader) maxRightNoHeader = right;
    }
    return {
      title: document.title,
      href: location.href,
      heading: document.querySelector('h1')?.textContent?.trim() ?? null,
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 240),
      innerWidth: window.innerWidth,
      scrollWidth: root.scrollWidth,
      overflow: root.scrollWidth > window.innerWidth,
      maxRight,
      maxRightNoHeader,
      clipped,
    };
  });
}

async function shot(page, name) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function openPage(page, path, query) {
  await page.goto(`${BASE}${path}?${query}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => document.fonts.ready).catch(() => {});
}

const rows = [];

for (const width of WIDTHS) {
  for (const role of ['customer-admin', 'operator']) {
    const context = await browser.newContext({
      viewport: { width, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const query = role === 'operator' ? 'operatorAudit=1' : 'auditAuth=1';

    await openPage(page, '/settings/ai', query);
    const settingsView = await measure(page);
    const settingsViewShot = await shot(page, `${PHASE}-settings-ai-${role}-${width}-view`);
    rows.push({ page: '/settings/ai', role, width, mode: 'view', ...settingsView, shot: settingsViewShot });

    const addKey = page.getByRole('button', { name: /Add key|Replace/i });
    if (await addKey.count()) {
      await addKey.first().click();
      await page.waitForTimeout(250);
    }
    const settingsEdit = await measure(page);
    const settingsEditShot = await shot(page, `${PHASE}-settings-ai-${role}-${width}-edit`);
    rows.push({ page: '/settings/ai', role, width, mode: 'edit', ...settingsEdit, shot: settingsEditShot });

    await openPage(page, '/ai-console', query);
    const consoleView = await measure(page);
    const consoleViewShot = await shot(page, `${PHASE}-ai-console-${role}-${width}-view`);
    rows.push({ page: '/ai-console', role, width, mode: 'view', ...consoleView, shot: consoleViewShot });

    const input = page.locator('textarea').first();
    if (await input.count()) {
      await input.fill('Show me this company');
      await page.waitForTimeout(200);
    }
    const consoleEdit = await measure(page);
    const consoleEditShot = await shot(page, `${PHASE}-ai-console-${role}-${width}-edit`);
    rows.push({ page: '/ai-console', role, width, mode: 'edit', ...consoleEdit, shot: consoleEditShot });

    await context.close();
  }
}

await browser.close();

const table = rows.map((row) => ({
  phase: PHASE,
  page: row.page,
  role: row.role,
  width: row.width,
  mode: row.mode,
  innerWidth: row.innerWidth,
  scrollWidth: row.scrollWidth,
  overflow: row.overflow,
  maxRight: row.maxRight,
  maxRightNoHeader: row.maxRightNoHeader,
  heading: row.heading,
  href: row.href,
  clippedCount: row.clipped.length,
  shot: row.shot,
}));

writeFileSync(`${OUT}/measured.json`, JSON.stringify({ phase: PHASE, rows: table, detail: rows }, null, 2));
console.log(JSON.stringify(table, null, 2));
