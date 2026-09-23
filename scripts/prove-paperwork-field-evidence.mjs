import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/paperwork-field-evidence';
const JOB = '/jobs/audit-doc-job';

mkdirSync(OUT, { recursive: true });

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}

async function openPaperwork(page, look) {
  await page.goto(`${BASE}${JOB}?auditAuth=1&tab=paperwork&look=${look}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.job-sheet-tab.is-on[data-tab="paperwork"]', { timeout: 20_000 });
  await page.waitForSelector('#job-gallery', { state: 'visible' });
}

async function proveEmpty(context, viewportName) {
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await openPaperwork(page, 'testing-due-empty');

  const state = await page.evaluate(() => {
    const text = selector => document.querySelector(selector)?.textContent?.trim() ?? null;
    const visible = selector => {
      const element = document.querySelector(selector);
      return Boolean(element && element.checkVisibility());
    };
    const directText = selector => {
      const element = document.querySelector(selector);
      return [...(element?.childNodes ?? [])]
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    };
    return {
      galleryTitle: text('#job-gallery .ops-section-title .truncate'),
      galleryEmptyTitle: directText('#job-gallery .ops-tray-empty'),
      galleryHelper: text('#job-gallery .ops-tray-empty span'),
      addPhotosVisible: visible('#job-gallery .job-gallery-add'),
      galleryChips: document.querySelectorAll('#job-gallery [data-gallery-filter]').length,
      galleryPrimaries: document.querySelectorAll('#job-gallery .btn-primary').length,
      testingTitle: text('#job-testing-due .ops-section-title .truncate'),
      testingEmptyTitle: directText('#job-testing-due .ops-tray-empty p'),
      testingHelper: text('#job-testing-due .ops-tray-empty p span'),
      testingPrimaries: document.querySelectorAll('#job-testing-due .btn-primary').length,
      testingEmptyActions: document.querySelectorAll('#job-testing-due .ops-tray-empty-act').length,
    };
  });

  check(`${viewportName} empty helpers and actions`, (
    state.galleryTitle === 'Gallery'
    && state.galleryEmptyTitle === 'No photos on this job yet.'
    && state.galleryHelper === 'Site evidence before you leave.'
    && state.addPhotosVisible
    && state.galleryChips === 0
    && state.galleryPrimaries === 0
    && state.testingTitle === 'Testing due'
    && state.testingEmptyTitle === 'Nothing due on this job.'
    && state.testingHelper === 'Only overdue and due today — start an inspection above.'
    && state.testingPrimaries === 0
    && state.testingEmptyActions === 0
  ), state);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.click('#job-gallery .job-gallery-add');
  const chooser = await chooserPromise;
  const picker = await chooser.element().evaluate(element => ({
    id: element.id,
    accept: element.getAttribute('accept'),
    multiple: element.hasAttribute('multiple'),
  }));
  check(`${viewportName} Add photos opens existing picker`, (
    picker.id === 'job-gallery-photo-input'
    && picker.accept === 'image/*'
    && picker.multiple
  ), picker);

  await page.locator('#job-gallery').screenshot({
    path: `${OUT}/gallery-empty-${viewportName}.png`,
  });
  check(`${viewportName} has no page errors`, pageErrors.length === 0, pageErrors);
  await page.close();
}

async function provePopulatedAndRows(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'en-AU',
  });
  const galleryPage = await context.newPage();
  await openPaperwork(galleryPage, 'job-photos');
  const chips = await galleryPage.$$eval(
    '#job-gallery [data-gallery-filter]',
    elements => elements.map(element => element.textContent?.replace(/\s+/g, ' ').trim()),
  );
  check('populated Gallery restores source chips', (
    chips.length === 5
    && chips[0]?.startsWith('All')
    && chips[1]?.startsWith('Visit')
    && chips[2]?.startsWith('Job')
    && chips[3]?.startsWith('Inspection')
    && chips[4]?.startsWith('JHA')
  ), chips);
  await galleryPage.close();

  const duePage = await context.newPage();
  await openPaperwork(duePage, 'testing-due-rows');
  const hrefs = await duePage.$$eval(
    '#job-testing-due .ops-related-main',
    elements => elements.map(element => element.getAttribute('href')),
  );
  check('Testing due rows use existing inspection routes', (
    hrefs.length === 2
    && hrefs.every(href => href?.startsWith('/inspections/'))
  ), hrefs);
  const firstHref = hrefs[0];
  await Promise.all([
    duePage.waitForURL(url => url.pathname === firstHref),
    duePage.click('#job-testing-due .ops-related-main'),
  ]);
  check('Testing due row navigation reaches inspection route', (
    new URL(duePage.url()).pathname === firstHref
  ), { expected: firstHref, actual: new URL(duePage.url()).pathname });
  await duePage.close();
  await context.close();
}

const browser = await chromium.launch({ headless: true });
await proveEmpty(await browser.newContext({
  viewport: { width: 1280, height: 900 },
  locale: 'en-AU',
}), 'laptop-1280');
await proveEmpty(await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
}), 'phone-390');
await provePopulatedAndRows(browser);
await browser.close();

const result = {
  base: BASE,
  finishedAt: new Date().toISOString(),
  checks,
};
writeFileSync(`${OUT}/notes.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(`${checks.length} checks passed. Wrote ${OUT}/notes.json`);
