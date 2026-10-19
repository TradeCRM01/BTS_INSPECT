import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || '/tmp/pr378-fu-frames';
mkdirSync(OUT, { recursive: true });

const WIDTHS = [375, 390, 768, 800, 900, 1000, 1024, 1280];
const HEIGHT = 900;

const browser = await chromium.launch({ headless: true });
const rows = [];

function mockRest(page) {
  return page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE) || url.startsWith('http://127.0.0.1:5173') || url.startsWith('http://localhost:5173')) {
      await route.continue();
      return;
    }
    if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
      await route.continue();
      return;
    }
    if (url.includes('/rest/v1/templates')) {
      const method = route.request().method();
      const row = {
        id: 'tmpl-1',
        name: 'Board',
        archived: false,
        report_renderer: 'generic_inspection',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema: {
          meta: { requiresSiteName: true, requiresSiteAddress: true, requiresClientName: true, requiresJobNumber: false, customFields: [] },
          sections: [{ id: 's1', title: 'Board', questions: [{ id: 'q1', type: 'yes_no', label: 'RCD tested?' }] }],
        },
        version: 1,
        description: '',
      };
      if (method === 'GET') {
        const accept = route.request().headers()['accept'] || '';
        const body = accept.includes('vnd.pgrst.object+json') ? row : [row];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (url.includes('/rest/v1/inspection_renderers')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ key: 'generic_inspection', label: 'Generic Inspection', built_in: true }]),
      });
      return;
    }
    if (url.includes('/rest/v1/rpc/ensure_builtin_renderers')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (url.includes('supabase') || url.includes('/rest/v1/') || url.includes('/auth/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.continue();
  });
}

async function metricsOf(page) {
  return page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    let maxRight = 0;
    let maxRightExclHeader = 0;
    const clipped = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) maxRight = r.right;
      if (!el.closest('.shell-header') && r.right > maxRightExclHeader) {
        maxRightExclHeader = r.right;
      }
      if (el instanceof HTMLButtonElement && el.scrollWidth > el.clientWidth + 1) {
        clipped.push({ tag: 'button', text: (el.textContent || '').trim().slice(0, 40), sw: el.scrollWidth, cw: el.clientWidth });
      }
    }
    const headerOnlyOverflow = maxRight > innerWidth + 0.5 && maxRightExclHeader <= innerWidth + 0.5;
    return {
      innerWidth,
      scrollWidth,
      maxRight,
      maxRightExclHeader,
      scrollOk: scrollWidth <= innerWidth,
      rectOk: maxRight <= innerWidth + 0.5,
      rectOkExclHeader: maxRightExclHeader <= innerWidth + 0.5,
      headerOnlyOverflow,
      overflowButtons: clipped,
    };
  });
}

for (const mode of ['edit', 'view']) {
  const qs = mode === 'view' ? 'auditAuth=1&auditAccess=view' : 'auditAuth=1';
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: HEIGHT },
      deviceScaleFactor: 1,
      locale: 'en-AU',
      isMobile: width < 500,
      hasTouch: width < 500,
    });
    const page = await context.newPage();
    await mockRest(page);
    await page.goto(
      `${BASE}/templates/tmpl-1?${qs}`,
      { waitUntil: 'domcontentloaded' },
    );
    try {
      if (mode === 'view') {
        await page.getByText('No edit access').waitFor({ timeout: 20000 });
      } else {
        await page.locator('input[placeholder="Template name"]').waitFor({ timeout: 20000 });
      }
    } catch (err) {
      const failPath = `${OUT}/FAIL-${mode}-${width}.png`;
      await page.screenshot({ path: failPath, type: 'png', fullPage: true });
      const body = await page.evaluate(() => (document.body && document.body.innerText) || '');
      console.error(JSON.stringify({ mode, width, failPath, body: body.slice(0, 1500), err: String(err) }, null, 2));
      throw err;
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const metrics = await metricsOf(page);
    const path = `${OUT}/editor-${mode}-${width}.png`;
    await page.screenshot({ path, type: 'png', fullPage: true });
    rows.push({ mode, width, path, ...metrics });
    await context.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/metrics.json`, JSON.stringify(rows, null, 2));
const regressions = rows.filter(r =>
  !r.scrollOk
  || !r.rectOkExclHeader
  || (r.overflowButtons && r.overflowButtons.length)
);
const knownHeader = rows.filter(r => r.headerOnlyOverflow);
console.log(JSON.stringify({ rows, regressions, knownHeader }, null, 2));
if (regressions.length) {
  process.exit(1);
}
