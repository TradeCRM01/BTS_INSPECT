import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire('/tmp/prg-look/package.json');
const { chromium } = require('playwright');

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT || '/opt/cursor/artifacts/prh';
const STORE = process.env.LOOK_STORE || '/cursor/stores/self/prh';

mkdirSync(OUT, { recursive: true });
mkdirSync(STORE, { recursive: true });

const views = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
];

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
});

async function waitFade(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => {
    const pageEl = document.querySelector('.ops-page');
    if (!pageEl) return false;
    const cs = getComputedStyle(pageEl);
    return cs.opacity === '1';
  }, { timeout: 8000 }).catch(() => {});
}

async function shot(page, name) {
  await waitFade(page);
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  copyFileSync(path, `${STORE}/${name}.png`);
  console.log(`wrote ${path}`);
}

async function openClientThread(page) {
  await page.goto(`${BASE}/clients/audit-doc-client?auditAuth=1&look=conversation`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[data-enquiry-conversation="1"]', { timeout: 20000 });
  await page.locator('.hub-clients-hero').click();
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-enquiry-conversation="1"]');
    const text = root?.textContent ?? '';
    return text.includes('Conversation')
      && text.includes('Out')
      && text.includes('Sent')
      && text.includes('Hot water is out, Paddington');
  });
}

async function openClientEmpty(page) {
  await page.goto(`${BASE}/clients/audit-doc-client?auditAuth=1&look=conversation-empty`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.hub-clients-document', { timeout: 20000 });
  await page.locator('.hub-clients-hero').click();
  await page.waitForFunction(() => !document.querySelector('[data-enquiry-conversation="1"]'));
}

async function openJobThread(page) {
  await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1&look=conversation`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.job-sheet-tab', { timeout: 20000 });
  await page.locator('.job-sheet-tab', { hasText: 'Overview' }).click();
  await page.waitForSelector('[data-enquiry-conversation="1"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const root = document.querySelector('[data-enquiry-conversation="1"]');
    const text = root?.textContent ?? '';
    return text.includes('Conversation')
      && text.includes('Out')
      && text.includes('Sent');
  });
}

async function openJobEmpty(page) {
  await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1&look=conversation-empty`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('.job-sheet-tab', { timeout: 20000 });
  await page.locator('.job-sheet-tab', { hasText: 'Overview' }).click();
  await page.waitForFunction(() => !document.querySelector('[data-enquiry-conversation="1"]'));
}

for (const view of views) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await openClientThread(page);
  await shot(page, `client-conversation-${view.name}`);
  await openClientEmpty(page);
  await shot(page, `client-conversation-empty-${view.name}`);
  await openJobThread(page);
  await shot(page, `job-conversation-${view.name}`);
  await openJobEmpty(page);
  await shot(page, `job-conversation-empty-${view.name}`);
  await context.close();
}

await browser.close();

const names = views.flatMap((view) => [
  `client-conversation-${view.name}.png`,
  `client-conversation-empty-${view.name}.png`,
  `job-conversation-${view.name}.png`,
  `job-conversation-empty-${view.name}.png`,
]);
const lines = names.map((name) => {
  const md5 = execSync(`md5sum ${OUT}/${name}`, { encoding: 'utf8' }).trim();
  copyFileSync(`${OUT}/${name}`, `${STORE}/${name}`);
  return md5;
});
const readme = [
  '# PR-H LOOK frames',
  '',
  'Real clicks at 375 / 390 / 1280 after fade-in. Conversation shows In/Out/state.',
  'Empty look hides the tray. No composer.',
  '',
  ...lines,
  '',
].join('\n');
writeFileSync(`${OUT}/README.md`, readme);
writeFileSync(`${STORE}/README.md`, readme);
console.log(readme);
