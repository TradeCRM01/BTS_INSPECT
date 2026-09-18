import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.SHARE_PROOF_DIR || '/tmp/quote-invoice-share-proof';
const CONVERT_MISS = 'Set a date and crew on this tap before converting.';
const MANUAL_HINT = 'Hold the link to copy it.';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

// Records every programmatic anchor click. Downloads pass through; mailto: is swallowed
// because headless Chromium has no mail handler.
function recordAnchorClicks() {
  window.__anchorClicks = [];
  window.__shareMailtoHref = '';
  const proto = HTMLAnchorElement.prototype;
  const orig = proto.click;
  proto.click = function click() {
    const href = typeof this.href === 'string' ? this.href : '';
    window.__anchorClicks.push({ href, download: this.download || '', connected: this.isConnected });
    if (href.startsWith('mailto:')) {
      window.__shareMailtoHref = href;
      return;
    }
    return orig.apply(this, arguments);
  };
}

function recordClipboardCalls() {
  window.__clipCalls = [];
  const clip = navigator.clipboard;
  if (!clip) return;
  for (const name of ['write', 'writeText']) {
    const fn = clip[name]?.bind(clip);
    if (!fn) continue;
    Object.defineProperty(clip, name, {
      configurable: true,
      value: (...args) => {
        window.__clipCalls.push(name);
        return fn(...args);
      },
    });
  }
}

// iOS Safari: writeText after a network await rejects NotAllowedError, but a ClipboardItem
// whose text is a promise, handed to write() inside the tap, is accepted.
function safariClipboard() {
  const store = { text: '' };
  window.__uteClipboard = store;
  window.__clipCalls = [];
  class FakeClipboardItem {
    constructor(record) { this.record = record; }
    getType(type) { return Promise.resolve(this.record[type]); }
  }
  Object.defineProperty(window, 'ClipboardItem', { value: FakeClipboardItem, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      async write(items) {
        window.__clipCalls.push('write');
        for (const item of items) {
          const blob = await item.getType('text/plain');
          store.text = await blob.text();
        }
      },
      async writeText() {
        window.__clipCalls.push('writeText');
        throw new DOMException('The request is not allowed by the user agent', 'NotAllowedError');
      },
    },
  });
}

// http:// LAN origin: no navigator.clipboard at all. execCommand('copy') copies the selection.
function lanClipboardExecWorks() {
  window.__execCopied = '';
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  const orig = document.execCommand;
  document.execCommand = function execCommand(cmd, ...rest) {
    if (cmd === 'copy') {
      window.__execCopied = String(document.getSelection());
      return true;
    }
    return orig.call(this, cmd, ...rest);
  };
}

// http:// LAN origin inside a webview that refuses execCommand('copy') too.
function lanClipboardDead() {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  document.execCommand = () => false;
}

function assertPdfFile(path, title) {
  const head = readFileSync(path).subarray(0, 5).toString('latin1');
  if (head !== '%PDF-') throw new Error(`${title}: ${path} does not start with %PDF-`);
  const size = statSync(path).size;
  if (size < 1000) throw new Error(`${title}: PDF is only ${size} bytes`);
  return size;
}

async function openTray(page, { openPath, sendButton, title, listFilter }) {
  await page.goto(`${BASE}${openPath}`, { waitUntil: 'domcontentloaded' });
  if (listFilter) {
    await page.getByRole('button', { name: listFilter, exact: true }).click();
  }
  await page.getByRole('button', { name: sendButton, exact: true }).click();
  await page.waitForSelector('.hub-quote-send, .hub-invoice-send', { timeout: 20000 });
  const dialog = page.locator('.hub-quote-send, .hub-invoice-send').first();
  await dialog.getByRole('heading', { name: title }).waitFor();
  return dialog;
}

async function downloadPdf(page, dialog, { title, pdfPath }) {
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await dialog.getByRole('button', { name: 'Download PDF' }).click();
  const download = await downloadPromise;
  await download.saveAs(pdfPath);
  if (!download.suggestedFilename().endsWith('.pdf')) {
    throw new Error(`${title}: download was not a PDF`);
  }
  const bytes = assertPdfFile(pdfPath, title);
  const click = await page.evaluate(() => window.__anchorClicks.find(c => c.download));
  if (!click) throw new Error(`${title}: no download anchor click recorded`);
  if (!click.connected) throw new Error(`${title}: download anchor was not in the document`);
  const blobAlive = await page.evaluate(
    href => fetch(href).then(r => r.ok).catch(() => false),
    click.href,
  );
  if (!blobAlive) throw new Error(`${title}: blob URL was revoked before the browser could read it`);
  return { filename: download.suggestedFilename(), bytes, blobAlive };
}

async function openMailto(page, dialog, { title }) {
  await dialog.getByRole('button', { name: 'Open mail draft' }).click();
  const started = Date.now();
  let mailtoHref = '';
  while (!mailtoHref && Date.now() - started < 4000) {
    mailtoHref = await page.evaluate(() => window.__shareMailtoHref || '');
    if (!mailtoHref) await page.waitForTimeout(100);
  }
  if (!mailtoHref.startsWith('mailto:')) throw new Error(`${title}: mailto did not fire`);
  const url = new URL(mailtoHref);
  const subject = url.searchParams.get('subject') || '';
  const body = url.searchParams.get('body') || '';
  if (!subject) throw new Error(`${title}: mailto has no subject`);
  if (!body.includes('/p?t=')) throw new Error(`${title}: mailto body missing portal link`);
  const click = await page.evaluate(() => window.__anchorClicks.find(c => c.href.startsWith('mailto:')));
  if (!click?.connected) throw new Error(`${title}: mailto anchor was not in the document`);
  return { mailtoHref, subject };
}

async function proveLaptopTray(page, spec) {
  const dialog = await openTray(page, spec);
  const labels = await dialog.locator('button').allTextContents();
  if (!labels.some((t) => t.includes('Download PDF'))) throw new Error(`${spec.title}: missing Download PDF`);
  if (!labels.some((t) => t.includes('Copy link'))) throw new Error(`${spec.title}: missing Copy link`);
  if (!labels.some((t) => t.includes('Open mail draft'))) throw new Error(`${spec.title}: missing Open mail draft`);
  if (labels.some((t) => t.includes('Company settings'))) throw new Error(`${spec.title}: still asks for Company settings`);

  const pdf = await downloadPdf(page, dialog, { title: spec.title, pdfPath: `${OUT}/${spec.shotPrefix}.pdf` });
  await page.screenshot({ path: `${OUT}/${spec.shotPrefix}-laptop-1280.png`, type: 'png' });

  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await dialog.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 10000 });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.includes('/p?t=')) throw new Error(`${spec.title}: copied text is not a portal link`);
  if (/localhost|127\.0\.0\.1/.test(copied)) {
    throw new Error(`${spec.title}: copied a localhost link the client cannot open`);
  }
  const clipCalls = await page.evaluate(() => window.__clipCalls);

  const mail = await openMailto(page, dialog, { title: spec.title });
  return { ...pdf, copied, clipCalls, ...mail };
}

// One phone scenario per clipboard model. Each proves all three actions on a 390px frame.
async function provePhoneTray(spec, { mode, init, shot }) {
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  await phone.addInitScript(recordAnchorClicks);
  await phone.addInitScript(init);
  const page = await phone.newPage();
  page.on('pageerror', (err) => console.error('PAGEERROR', mode, err.message));
  const title = `${spec.title} [${mode}]`;
  try {
    const dialog = await openTray(page, spec);
    const pdf = await downloadPdf(page, dialog, { title, pdfPath: `${OUT}/${spec.shotPrefix}-${mode}.pdf` });

    await dialog.getByRole('button', { name: 'Copy link' }).click();
    let copy;
    if (mode === 'safari') {
      await dialog.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 10000 });
      const text = await page.evaluate(() => window.__uteClipboard.text);
      if (!text.includes('/p?t=')) throw new Error(`${title}: Safari clipboard did not receive the portal link`);
      const calls = await page.evaluate(() => window.__clipCalls);
      copy = { kind: 'copied', via: 'clipboard.write', text, calls };
    } else if (mode === 'lan-exec') {
      await dialog.getByRole('button', { name: 'Copied' }).waitFor({ timeout: 10000 });
      const text = await page.evaluate(() => window.__execCopied);
      if (!text.includes('/p?t=')) throw new Error(`${title}: execCommand copy did not select the portal link`);
      copy = { kind: 'copied', via: 'execCommand', text };
    } else {
      const input = dialog.getByRole('textbox', { name: 'Portal link' });
      await input.waitFor({ timeout: 10000 });
      const text = await input.inputValue();
      if (!text.includes('/p?t=')) throw new Error(`${title}: manual link field is not a portal link`);
      await dialog.getByText(MANUAL_HINT, { exact: true }).waitFor();
      await input.click();
      const selected = await page.evaluate(() => String(document.getSelection()));
      if (selected !== text) throw new Error(`${title}: tapping the link did not select it for copying`);
      copy = { kind: 'manual', text };
    }
    if (shot) await page.screenshot({ path: `${OUT}/${shot}`, type: 'png' });

    const mail = await openMailto(page, dialog, { title });
    return { mode, ...pdf, copy, ...mail };
  } finally {
    await phone.close();
  }
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  permissions: ['clipboard-read', 'clipboard-write'],
});
await laptop.addInitScript(recordAnchorClicks);
await laptop.addInitScript(recordClipboardCalls);
const page = await laptop.newPage();
page.on('pageerror', (err) => console.error('PAGEERROR', err.message));

const quoteSpec = {
  openPath: '/quotes?auditAuth=1',
  sendButton: 'Send',
  title: 'Send quote',
  shotPrefix: 'quote-share',
};
const invoiceSpec = {
  openPath: '/invoices?auditAuth=1',
  sendButton: 'Send',
  title: 'Send invoice',
  shotPrefix: 'invoice-share',
  listFilter: 'Draft',
};

const quoteTray = await proveLaptopTray(page, quoteSpec);

await page.goto(`${BASE}/quotes?auditAuth=1`, { waitUntil: 'domcontentloaded' });
await page.locator('.hub-quotes-row', { hasText: '#2002' }).click();
await page.waitForSelector('.hub-quote-convert', { timeout: 20000 });
const convertBtn = page.locator('.hub-quote-editor').getByRole('button', { name: 'Convert to job', exact: true });
if (!(await convertBtn.isVisible())) throw new Error('accepted quote is missing Convert to job');
const dateValue = await page.locator('.hub-quote-convert input[type="date"]').inputValue();
if (dateValue !== '2026-09-03') throw new Error(`convert date drifted: ${dateValue}`);
await page.locator('.hub-quote-convert input[type="date"]').fill('');
await convertBtn.click();
await page.locator('.hub-quote-convert-miss').waitFor();
const miss = await page.locator('.hub-quote-convert-miss').innerText();
if (miss !== CONVERT_MISS) {
  throw new Error(`convert miss drifted: ${miss}`);
}
await page.screenshot({ path: `${OUT}/quote-convert-need-date-laptop-1280.png`, type: 'png' });

const invoiceTray = await proveLaptopTray(page, invoiceSpec);
await laptop.close();

const phoneModes = [
  { mode: 'safari', init: safariClipboard },
  { mode: 'lan-exec', init: lanClipboardExecWorks },
  { mode: 'lan-manual', init: lanClipboardDead },
];
const quotePhone = [];
for (const m of phoneModes) {
  quotePhone.push(await provePhoneTray(quoteSpec, {
    ...m,
    shot: m.mode === 'safari' ? 'quote-share-phone-390.png'
      : m.mode === 'lan-manual' ? 'quote-share-phone-390-manual-link.png' : null,
  }));
}
const invoicePhone = [];
for (const m of phoneModes) {
  invoicePhone.push(await provePhoneTray(invoiceSpec, {
    ...m,
    shot: m.mode === 'lan-manual' ? 'invoice-share-phone-390-manual-link.png' : null,
  }));
}

await browser.close();

const report = {
  ok: true,
  noGrafterSmtp: true,
  quote: quoteTray,
  invoice: invoiceTray,
  quotePhone,
  invoicePhone,
  convertGate: CONVERT_MISS,
};
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
