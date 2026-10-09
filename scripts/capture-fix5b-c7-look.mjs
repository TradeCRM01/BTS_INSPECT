import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.FIX5B_C7_OUT || '/opt/cursor/artifacts/fix5b-c7';

mkdirSync(OUT, { recursive: true });

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

const browser = await chromium.launch({ headless: true });

async function captureConvertTap({ width, height, mobile }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    isMobile: mobile,
    hasTouch: mobile,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/quotes?id=audit-quote-convert&auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#quote-convert-start', { timeout: 30000 });
  await page.waitForSelector('.hub-quote-convert .btn-primary', { timeout: 15000 });

  const start = page.locator('#quote-convert-start');
  const convertBtn = page.locator('.hub-quote-convert .btn-primary');

  await start.click();
  await page.keyboard.type('0930', { delay: 40 });

  const beforeBlur = await convertBtn.boundingBox();
  const layoutLog = await page.evaluate(async () => {
    const btn = document.querySelector('.hub-quote-convert .btn-primary');
    const before = btn?.getBoundingClientRect();
    const startEl = document.querySelector('#quote-convert-start');
    startEl?.blur();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = btn?.getBoundingClientRect();
    return {
      before: before ? { x: before.x, y: before.y, w: before.width, h: before.height } : null,
      after: after ? { x: after.x, y: after.y, w: after.width, h: after.height } : null,
      deltaY: before && after ? after.y - before.y : null,
    };
  });

  writeFileSync(
    `${OUT}/fix5b-c7-convert-bbox-${width}.json`,
    JSON.stringify({ playwrightBox: beforeBlur, domBlur: layoutLog }, null, 2),
  );

  if (layoutLog.deltaY !== null && Math.abs(layoutLog.deltaY) > 1) {
    throw new Error(`[convert@${width}] button shifted ${layoutLog.deltaY}px on blur`);
  }

  await convertBtn.click({ timeout: 5000 });
  await page.waitForTimeout(800);

  const miss = page.locator('.hub-quote-convert-miss');
  const onJob = page.url().includes('/jobs/');
  const missVisible = await miss.isVisible().catch(() => false);
  if (!onJob && !missVisible) {
    throw new Error(`[convert@${width}] expected convert or inline miss, url=${page.url()}`);
  }

  const outPath = `${OUT}/fix5b-c7-convert-one-tap-${width}.png`;
  if (onJob) {
    await page.screenshot({ path: outPath, fullPage: false });
  } else {
    await page.locator('.hub-quote-convert').screenshot({ path: outPath });
  }
  await context.close();
  return { outPath, md5: md5File(outPath), layoutLog };
}

async function captureBillDelete390() {
  const width = 390;
  const height = 844;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(
    `${BASE}/jobs/audit-doc-job?auditAuth=1&look=p331-bill&tab=materials`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForSelector('#job-bill', { timeout: 30000 });
  await page.locator('#job-bill').scrollIntoViewIfNeeded();
  await page.waitForSelector('#job-bill .job-bill-line-btn-delete', { timeout: 30000 });
  await page.locator('#job-bill .job-bill-line-btn-delete').first().click();
  await page.waitForSelector('h3:text("Delete this line?")', { timeout: 10000 });
  const outPath = `${OUT}/fix5b-c7-bill-delete-confirm-390.png`;
  await page.screenshot({ path: outPath, fullPage: false });
  await context.close();
  return { outPath, md5: md5File(outPath) };
}

async function captureEnGbNoHint() {
  const width = 390;
  const height = 844;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(
    `${BASE}/jobs/audit-doc-job?auditAuth=1&look=crew2#job-schedule`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForSelector('#job-schedule input[type="time"]', { timeout: 30000 });
  const timeInput = page.locator('#job-schedule input[type="time"]').first();
  await timeInput.click();
  await page.keyboard.type('0930', { delay: 40 });
  const visibleHints = await page.locator('.time-field-am-pm-hint.is-visible').count();
  if (visibleHints > 0) {
    throw new Error(`[en-GB] expected no visible AM/PM hint, got ${visibleHints}`);
  }
  const outPath = `${OUT}/fix5b-c7-dispatch-24h-no-hint-390.png`;
  await page.locator('#job-schedule').screenshot({ path: outPath });
  await context.close();
  return { outPath, md5: md5File(outPath) };
}

const results = {
  convert1280: await captureConvertTap({ width: 1280, height: 800, mobile: false }),
  convert390: await captureConvertTap({ width: 390, height: 844, mobile: true }),
  billDelete390: await captureBillDelete390(),
  enGb390: await captureEnGbNoHint(),
};

writeFileSync(`${OUT}/fix5b-c7-manifest.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

await browser.close();
