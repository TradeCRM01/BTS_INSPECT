import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.SHARE_PROOF_DIR || '/tmp/quote-invoice-share-proof';
const CONVERT_MISS = 'Set a date and crew on this tap before converting.';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function proveShareTray(page, {
  openPath,
  sendButton,
  title,
  shotPrefix,
}) {
  await page.goto(`${BASE}${openPath}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: sendButton }).first().click();
  await page.waitForSelector('.hub-quote-send, .hub-invoice-send', { timeout: 20000 });
  const dialog = page.locator('.hub-quote-send, .hub-invoice-send').first();
  await dialog.getByRole('heading', { name: title }).waitFor();
  const labels = await dialog.locator('button').allTextContents();
  if (!labels.some((t) => t.includes('Download PDF'))) throw new Error(`${title}: missing Download PDF`);
  if (!labels.some((t) => t.includes('Copy link'))) throw new Error(`${title}: missing Copy link`);
  if (!labels.some((t) => t.includes('Open mail draft'))) throw new Error(`${title}: missing Open mail draft`);
  if (labels.some((t) => t.includes('Company settings'))) throw new Error(`${title}: still asks for Company settings`);

  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await dialog.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  const pdfPath = `${OUT}/${shotPrefix}.pdf`;
  await download.saveAs(pdfPath);
  if (!download.suggestedFilename().endsWith('.pdf')) {
    throw new Error(`${title}: download was not a PDF`);
  }

  await page.screenshot({ path: `${OUT}/${shotPrefix}-laptop-1280.png`, type: 'png' });

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await dialog.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 10000 });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.includes('/p?t=')) throw new Error(`${title}: copied text is not a portal link`);
  if (/localhost|127\.0\.0\.1/.test(copied)) {
    throw new Error(`${title}: copied a localhost link the client cannot open`);
  }

  let mailtoHref = '';
  await page.route('mailto:**', async (route) => {
    mailtoHref = route.request().url();
    await route.abort();
  });
  await dialog.getByRole('button', { name: 'Open mail draft' }).click();
  const started = Date.now();
  while (!mailtoHref && Date.now() - started < 4000) {
    await page.waitForTimeout(100);
  }
  if (!mailtoHref.startsWith('mailto:')) throw new Error(`${title}: mailto did not fire`);
  if (!mailtoHref.includes('p%3Ft%3D') && !mailtoHref.includes('/p?t=')) {
    throw new Error(`${title}: mailto body missing portal link`);
  }

  return { pdfPath, copied, mailtoHref, filename: download.suggestedFilename() };
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await laptop.newPage();
page.on('pageerror', (err) => console.error('PAGEERROR', err.message));

const quoteTray = await proveShareTray(page, {
  openPath: '/quotes?auditAuth=1',
  sendButton: 'Send',
  title: 'Send quote',
  shotPrefix: 'quote-share',
});

await page.locator('.hub-quotes-row', { hasText: '#2002' }).click();
await page.waitForSelector('.hub-quote-convert', { timeout: 20000 });
const convertVisible = await page.getByRole('button', { name: 'Convert to job' }).first().isVisible();
if (!convertVisible) throw new Error('accepted quote is missing Convert to job');
const dateValue = await page.locator('.hub-quote-convert input[type="date"]').inputValue();
if (dateValue !== '2026-09-03') throw new Error(`convert date drifted: ${dateValue}`);
await page.locator('.hub-quote-convert input[type="date"]').fill('');
await page.getByRole('button', { name: 'Convert to job' }).first().click();
await page.locator('.hub-quote-convert-miss').waitFor();
const miss = await page.locator('.hub-quote-convert-miss').innerText();
if (miss !== CONVERT_MISS) {
  throw new Error(`convert miss drifted: ${miss}`);
}
await page.screenshot({ path: `${OUT}/quote-convert-need-date-laptop-1280.png`, type: 'png' });

const invoiceTray = await proveShareTray(page, {
  openPath: '/invoices?auditAuth=1',
  sendButton: 'Send',
  title: 'Send invoice',
  shotPrefix: 'invoice-share',
});

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const phonePage = await phone.newPage();
await phonePage.goto(`${BASE}/quotes?auditAuth=1`, { waitUntil: 'domcontentloaded' });
await phonePage.getByRole('button', { name: 'Send' }).first().click();
await phonePage.waitForSelector('.hub-quote-send', { timeout: 20000 });
await phonePage.screenshot({ path: `${OUT}/quote-share-phone-390.png`, type: 'png' });
await phone.close();

await laptop.close();
await browser.close();

const report = {
  ok: true,
  noGrafterSmtp: true,
  quote: quoteTray,
  invoice: invoiceTray,
  convertGate: CONVERT_MISS,
};
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
