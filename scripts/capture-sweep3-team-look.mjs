import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/opt/cursor/artifacts';
const TAG = process.env.LOOK_TAG || 'after';

mkdirSync(OUT, { recursive: true });

const views = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
];

const browser = await chromium.launch({ headless: true });
const rows = [];

async function metricsOf(page) {
  return page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    let maxRight = 0;
    for (const el of document.querySelectorAll('*')) {
      const right = el.getBoundingClientRect().right;
      if (right > maxRight) maxRight = right;
    }
    return {
      innerWidth,
      scrollWidth,
      maxRight,
      scrollClipped: scrollWidth > innerWidth,
      rectClipped: maxRight > innerWidth + 0.5,
    };
  });
}

async function shot(viewport, name, href, wait) {
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
  const metrics = await metricsOf(page);
  const path = `${OUT}/sweep3-team-${TAG}-${name}-${viewport.width}.png`;
  await page.screenshot({ path, type: 'png', fullPage: true });
  rows.push({ tag: TAG, name, width: viewport.width, path, ...metrics });
  await context.close();
}

async function waitMember(page) {
  await page.waitForSelector('#team-member-open', { timeout: 20000 });
}

async function waitDenied(page) {
  await page.waitForSelector('[data-template-access="denied"]', { timeout: 20000 });
}

for (const viewport of views) {
  await shot(
    viewport,
    'edit',
    '/settings/team?auditAuth=1&look=p331-team-select&id=look-team-alex',
    async (page) => {
      await waitMember(page);
      await page.waitForSelector('select[aria-label="Cost model"], .hub-team-muted-hint', { timeout: 20000 });
    },
  );
  await shot(
    viewport,
    'view',
    '/settings/team?auditAuth=1&look=p331-team-select&id=look-team-jordan',
    waitMember,
  );
}

if (TAG !== 'before') {
  for (const viewport of views) {
    await shot(
      viewport,
      'fail',
      '/settings/team?auditAuth=1&look=p331-team-fail&id=look-team-alex',
      async (page) => {
        await waitMember(page);
        await page.waitForSelector('[role="alert"]', { timeout: 20000 });
      },
    );
    await shot(
      viewport,
      'noaccess',
      '/templates?auditAuth=1&look=p331-templates-none',
      waitDenied,
    );
  }

  const persistViewport = { width: 1280, height: 800 };
  const persistContext = await browser.newContext({
    viewport: persistViewport,
    deviceScaleFactor: 1,
    locale: 'en-AU',
  });
  const persistPage = await persistContext.newPage();
  await persistPage.route('**/rest/v1/rpc/update_member_settings', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'look-team-alex',
        expense_cost_model_id: 'audit-p331-loaded-hourly',
        template_access: 'view',
        role: 'member',
      }),
    });
  });
  await persistPage.goto(
    `${BASE}/settings/team?auditAuth=1&look=p331-team-persist&id=look-team-alex`,
    { waitUntil: 'domcontentloaded' },
  );
  await waitMember(persistPage);
  const costSelect = persistPage.locator('select[aria-label="Cost model"]');
  await costSelect.waitFor({ timeout: 20000 });
  const beforeValue = await costSelect.inputValue();
  await costSelect.selectOption('audit-p331-loaded-hourly');
  await persistPage.waitForTimeout(600);
  const afterValue = await costSelect.inputValue();
  const persistMetrics = await metricsOf(persistPage);
  const persistPath = `${OUT}/sweep3-team-${TAG}-save-session-1280.png`;
  await persistPage.screenshot({ path: persistPath, type: 'png', fullPage: true });
  rows.push({
    tag: TAG,
    name: 'save-session',
    width: 1280,
    path: persistPath,
    beforeValue,
    afterValue,
    ...persistMetrics,
  });
  await persistContext.close();
}

await browser.close();
writeFileSync(`${OUT}/sweep3-team-${TAG}-metrics.json`, JSON.stringify(rows, null, 2));
console.log(JSON.stringify(rows, null, 2));
