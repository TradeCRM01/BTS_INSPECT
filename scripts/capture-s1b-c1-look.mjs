import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const HARNESS = '/jobs?auditAuth=1&look=jobs-list';
const ARTIFACT = process.env.S1B_C1_ARTIFACT || '/opt/cursor/artifacts/s1b-375-c1.png';
const LOOK = 'docs/look/s1b-375-c1.png';

mkdirSync('/opt/cursor/artifacts', { recursive: true });
mkdirSync('docs/look', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(process.env.LOOK_BROWSER_CHANNEL ? { channel: process.env.LOOK_BROWSER_CHANNEL } : {}),
});

const phone = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
const page = await phone.newPage();
await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-jobs-phone-list] [data-jobs-phone-row]', { timeout: 20000 });
await page.waitForFunction(() => {
  const title = document.querySelector('.hub-jobs-list-doc .ops-page-title');
  const rows = [...document.querySelectorAll('[data-jobs-phone-row]')];
  return title?.textContent === 'Jobs'
    && rows.some((row) => /Warehouse lights|#0043|In Progress/i.test(row.textContent ?? ''));
});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);

const proof = await page.evaluate(() => {
  const cream = getComputedStyle(document.querySelector('.hub-jobs-list-doc.ops-page')).backgroundColor;
  const paper = getComputedStyle(document.querySelector('.hub-jobs-list-doc .hub-jobs-sheet')).backgroundColor;
  const primary = document.querySelector('.hub-jobs-list-tools .btn-primary');
  const primaryCs = primary ? getComputedStyle(primary) : null;
  const rows = [...document.querySelectorAll('[data-jobs-phone-row]')].map((row) => {
    const next = row.querySelector('[data-jobs-phone-next]');
    return {
      text: row.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      status: row.querySelector('.hub-jobs-phone-status')?.textContent ?? '',
      next: next?.textContent?.trim() ?? null,
    };
  });
  const inProgress = rows.find((row) => row.status === 'In Progress' || /#0043|Warehouse lights/.test(row.text));
  return {
    cream,
    paper,
    primaryH: primary ? Math.round(primary.getBoundingClientRect().height) : null,
    primaryBg: primaryCs?.backgroundColor ?? null,
    rowCount: rows.length,
    rows,
    inProgress,
  };
});

if (!proof.inProgress) {
  throw new Error(`In Progress row missing: ${JSON.stringify(proof.rows)}`);
}
if (/arriv/i.test(proof.inProgress.next ?? '')) {
  throw new Error(`In Progress Next still arriving: ${JSON.stringify(proof.inProgress)}`);
}
if (proof.inProgress.next === 'Send on-my-way' || proof.inProgress.next === 'Arriving shortly') {
  throw new Error(`In Progress Next is arriving verb: ${JSON.stringify(proof.inProgress)}`);
}

await page.screenshot({ path: ARTIFACT, type: 'png', fullPage: false });
await page.screenshot({ path: LOOK, type: 'png', fullPage: false });
await phone.close();
await browser.close();
console.log(JSON.stringify({ artifact: ARTIFACT, look: LOOK, proof }, null, 2));
