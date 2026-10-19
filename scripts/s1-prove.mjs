import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const AFTER = process.env.S1_AFTER_URL || 'http://127.0.0.1:5173';
const BEFORE = process.env.S1_BEFORE_URL || '';
const OUT = process.env.S1_OUT || 'docs/look/s1';
const LONG_NAME = 'Northside Plumbing & Gas Maintenance Pty Ltd';
const CLOCK = '2026-10-19T09:41:00+10:00';
const FRAME_WIDTHS = [375, 390, 1024, 1280];
const HEADER_WIDTHS = [375, 390, 768, 800, 900, 1000, 1024, 1280];
const HEIGHT = 844;
const DPR = 2;

const PAGES = [
  { page: 'header', path: `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(LONG_NAME)}`, wait: '.shell-header' },
  { page: 'signin', path: '/login', wait: '[data-grafter-lockup], .hub-auth-nav' },
  { page: 'jobs', path: `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(LONG_NAME)}`, wait: '.hub-jobs-list-doc, .shell-header' },
];

mkdirSync(OUT, { recursive: true });

function frameName(page, state, theme, side, width) {
  return `s1-${page}-${state}-${theme}-${side}-${width}.png`;
}

async function applyTheme(page, theme) {
  await page.evaluate((next) => {
    document.documentElement.dataset.theme = next;
  }, theme);
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vis = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const all = [...document.querySelectorAll('body *')].filter(vis);
    let maxRight = 0;
    for (const el of all) {
      if (el.closest('svg') && el.tagName !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) maxRight = r.right;
    }
    const header = document.querySelector('.shell-header');
    const headerRight = header && vis(header) ? header.getBoundingClientRect().right : 0;
    let headerChildMax = 0;
    if (header) {
      for (const el of header.querySelectorAll('*')) {
        if (!vis(el)) continue;
        if (el.closest('svg') && el.tagName !== 'svg') continue;
        const r = el.getBoundingClientRect();
        if (r.right > headerChildMax) headerChildMax = r.right;
      }
    }
    const headerButtons = header
      ? [...header.querySelectorAll('a,button,[role=button]')].filter(vis).map((el) => ({
        label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        ok: el.scrollWidth <= el.clientWidth + 1,
      }))
      : [];
    const name = document.querySelector('[data-shell-switcher-name]');
    const nameBox = name && vis(name)
      ? {
        text: name.textContent,
        scrollWidth: name.scrollWidth,
        clientWidth: name.clientWidth,
        ok: name.scrollWidth <= name.clientWidth + 1,
      }
      : { text: name?.textContent ?? null, hidden: true, ok: true };
    const clips = [];
    for (const el of all) {
      const cs = getComputedStyle(el);
      const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
        if (el.hasAttribute('data-shell-switcher-name') || el.classList.contains('truncate')) continue;
        clips.push(`ellipsis: ${el.textContent.trim().slice(0, 50)}`);
      }
      if (!tn.length || el.closest('svg')) continue;
      const er = el.getBoundingClientRect();
      for (const t of tn) {
        const rg = document.createRange();
        rg.selectNodeContents(t);
        const tr = rg.getBoundingClientRect();
        if (tr.right > vw + 0.5) clips.push(`text off screen: ${t.textContent.trim().slice(0, 40)}`);
      }
    }
    return {
      innerWidth: vw,
      scrollWidth: document.documentElement.scrollWidth,
      maxRight: +maxRight.toFixed(2),
      headerRight: +headerRight.toFixed(2),
      overflowOk: document.documentElement.scrollWidth <= vw && maxRight <= vw + 0.5,
      headerInMax: !header || headerRight <= maxRight + 0.5,
      headerChildMax: +headerChildMax.toFixed(2),
      headerContains: !header || headerChildMax <= headerRight + 0.5,
      headerButtons,
      headerButtonsOk: headerButtons.every((b) => b.ok),
      companyName: nameBox,
    };
  });
}

async function lockupBox(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-grafter-lockup], .hub-auth-nav, .shell-header [aria-label]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right };
  });
}

async function boot(page, url, wait) {
  await page.clock.install({ time: new Date(CLOCK) });
  await page.addInitScript(() => {
    try { localStorage.removeItem('grafter-theme'); } catch {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(wait, { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(250);
}

async function shoot({ browser, base, side, pageId, path, wait, width, theme, state }) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: DPR,
  });
  const page = await context.newPage();
  await boot(page, `${base}${path}`, wait);
  await applyTheme(page, theme);
  await page.waitForTimeout(80);
  const file = join(OUT, frameName(pageId, state, theme, side, width));
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true });
  const measure = await measureOverflow(page);
  await context.close();
  return { file, measure };
}

async function pixelDiff(browser, base, path, wait, width) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: DPR,
  });
  const page = await context.newPage();
  await boot(page, `${base}${path}`, wait);
  await page.waitForTimeout(200);
  const light = await page.screenshot({ fullPage: true });
  await applyTheme(page, 'dark');
  await page.waitForTimeout(200);
  const forced = await page.screenshot({ fullPage: true });
  const allow = await page.evaluate(() => document.documentElement.getAttribute('data-allow-dark'));
  const equal = light.equals(forced);
  await context.close();
  return { equal, bytes: light.length, allowDark: allow };
}

async function fontReflow(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 390, height: HEIGHT },
    deviceScaleFactor: DPR,
  });
  const page = await context.newPage();
  await page.route('**/fonts/Geist-Variable.woff2', (route) => route.abort());
  await boot(page, `${base}/login`, '[data-grafter-lockup], .hub-auth-nav');
  const blocked = await lockupBox(page);
  await context.close();

  const context2 = await browser.newContext({
    viewport: { width: 390, height: HEIGHT },
    deviceScaleFactor: DPR,
  });
  const page2 = await context2.newPage();
  await boot(page2, `${base}/login`, '[data-grafter-lockup], .hub-auth-nav');
  await page2.evaluate(() => document.fonts.ready).catch(() => {});
  const loaded = await lockupBox(page2);
  await context2.close();
  const dw = Math.abs((blocked?.w ?? 0) - (loaded?.w ?? 0));
  const dh = Math.abs((blocked?.h ?? 0) - (loaded?.h ?? 0));
  return { blocked, loaded, dw, dh, noJump: dw <= 1 && dh <= 1 };
}

async function portalLight(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 390, height: HEIGHT },
    deviceScaleFactor: DPR,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('grafter-theme', 'dark'); } catch {}
  });
  await page.goto(`${base}/p?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#client-portal, .portal-doc', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(400);
  const info = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    portalTheme: document.getElementById('client-portal')?.getAttribute('data-theme') ?? null,
    bg: getComputedStyle(document.documentElement).getPropertyValue('--g-bg').trim(),
    ink: getComputedStyle(document.documentElement).getPropertyValue('--g-ink').trim(),
    pageBg: getComputedStyle(document.body).backgroundColor,
  }));
  const file = join(OUT, 's1-portal-forced-os-dark-after-390.png');
  await page.screenshot({ path: file, fullPage: true });
  await context.close();
  return { file, ...info };
}

async function quotePaper(browser, base) {
  const context = await browser.newContext({
    viewport: { width: 800, height: 1100 },
    deviceScaleFactor: DPR,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem('grafter-theme', 'dark'); } catch {}
  });
  await boot(page, `${base}/quotes?auditAuth=1&look=letterhead`, '.hub-quote-sheet, .hub-quote-letterhead');
  const info = await page.evaluate(() => {
    const sheet = document.querySelector('.hub-quote-sheet, .hub-quote-letterhead');
    const cs = sheet ? getComputedStyle(sheet) : getComputedStyle(document.body);
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      theme: document.documentElement.getAttribute('data-theme'),
    };
  });
  const file = join(OUT, 's1-quote-paper-forced-os-dark-after-800.png');
  await page.screenshot({ path: file, fullPage: true });
  await context.close();
  return { file, ...info };
}

async function emailLight(browser) {
  const { readFileSync, existsSync } = await import('node:fs');
  const invoicePath = '/tmp/s1-email-invoice.html';
  const quotePath = '/tmp/s1-email-quote.html';
  const html = existsSync(invoicePath)
    ? readFileSync(invoicePath, 'utf8')
    : `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:#F5F0E6;padding:24px">
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
    <div style="background:#0A2540;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <div style="font-size:12px;opacity:.7;letter-spacing:1px;text-transform:uppercase">Invoice</div>
      <h1 style="margin:8px 0 0;font-size:20px">#0041</h1>
    </div>
    <div style="border:1px solid #E5E7EB;border-top:none;padding:24px;border-radius:0 0 8px 8px;background:#fff">
      <p>Hi Alex,</p>
      <p>Northside Plumbing &amp; Gas Maintenance Pty Ltd has sent you invoice #0041.</p>
      <p style="color:#4A5568;font-size:15px;line-height:1.6;">Total (inc GST): <strong>$1,210.00</strong></p>
      <p>The invoice PDF is attached. Reply to this email if you have a question about the charges.</p>
    </div>
  </div>
</body></html>`;
  const context = await browser.newContext({
    viewport: { width: 640, height: 720 },
    deviceScaleFactor: DPR,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  const info = await page.evaluate(() => {
    const root = document.querySelector('div');
    const cs = getComputedStyle(root);
    return { color: cs.color, bg: getComputedStyle(document.body).backgroundColor };
  });
  const file = join(OUT, 's1-email-invoice-light-after-640.png');
  await page.screenshot({ path: file, fullPage: true });
  let quoteFile = null;
  if (existsSync(quotePath)) {
    await page.setContent(readFileSync(quotePath, 'utf8'), { waitUntil: 'domcontentloaded' });
    quoteFile = join(OUT, 's1-email-quote-light-after-640.png');
    await page.screenshot({ path: quoteFile, fullPage: true });
  }
  await context.close();
  return { file, quoteFile, ...info, source: 'invoiceSendHtml + quoteSendHtml' };
}

async function pdfRaster(browser, base) {
  const { writeFileSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await boot(page, `${base}/quotes?auditAuth=1&look=letterhead&print=1`, 'iframe[title="Document PDF preview"], .hub-quote-sheet');
  const iframe = await page.$('iframe[title="Document PDF preview"]');
  if (!iframe) {
    const file = join(OUT, 's1-quote-pdf-light-after-print.png');
    await page.screenshot({ path: file, fullPage: true });
    await context.close();
    return { file, mode: 'sheet-fallback' };
  }
  const pdfSrc = await iframe.getAttribute('src');
  const pdfBytes = await page.evaluate(async (src) => {
    const buf = await (await fetch(src)).arrayBuffer();
    return Array.from(new Uint8Array(buf));
  }, pdfSrc);
  const pdfPath = '/tmp/s1-quote.pdf';
  writeFileSync(pdfPath, Buffer.from(pdfBytes));
  const file = join(OUT, 's1-quote-pdf-light-after-print.png');
  const raster = spawnSync('python3', ['-c', `
import pymupdf
doc = pymupdf.open(${JSON.stringify(pdfPath)})
page = doc[0]
pix = page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6), alpha=False)
pix.save(${JSON.stringify(file)})
print(page.rect)
`], { encoding: 'utf8' });
  await context.close();
  if (raster.status !== 0) {
    return { file: null, mode: 'raster-failed', err: raster.stderr };
  }
  return { file, mode: 'pdf', rect: raster.stdout.trim() };
}

const report = {
  parent: 'aba845709199dd2815731f2ba86776adf0346085',
  frames: [],
  overflow: [],
  header: [],
  allowDark: null,
  fontReflow: null,
  portal: null,
};

const browser = await chromium.launch({ headless: true });

for (const side of BEFORE ? ['before', 'after'] : ['after']) {
  const base = side === 'before' ? BEFORE : AFTER;
  for (const spec of PAGES) {
    for (const theme of ['light', 'dark']) {
      for (const width of FRAME_WIDTHS) {
        const row = await shoot({
          browser,
          base,
          side,
          pageId: spec.page,
          path: spec.path,
          wait: spec.wait,
          width,
          theme,
          state: 'view',
        });
        report.frames.push({
          page: spec.page,
          theme,
          side,
          width,
          file: row.file,
        });
        report.overflow.push({
          page: spec.page,
          theme,
          side,
          width,
          ...row.measure,
        });
      }
    }
  }
}

const headerPage = PAGES[0];
for (const width of HEADER_WIDTHS) {
  const row = await shoot({
    browser,
    base: AFTER,
    side: 'after',
    pageId: 'header-guard',
    path: headerPage.path,
    wait: headerPage.wait,
    width,
    theme: 'light',
    state: 'view',
  });
  report.header.push({ width, ...row.measure, file: row.file });
}

report.allowDark = await pixelDiff(browser, AFTER, headerPage.path, headerPage.wait, 1280);
report.fontReflow = await fontReflow(browser, AFTER);
report.portal = await portalLight(browser, AFTER);
report.quotePaper = await quotePaper(browser, AFTER);
report.email = await emailLight(browser);
report.pdf = await pdfRaster(browser, AFTER);

const fav = await fetch(`${AFTER}/favicon.svg`);
const icon192 = await fetch(`${AFTER}/icon-192.png`);
const maskable = await fetch(`${AFTER}/icon-maskable-512.png`);
const apple = await fetch(`${AFTER}/apple-touch-icon.png`);
const html = await (await fetch(`${AFTER}/`)).text();
report.favicon = {
  svg: fav.status,
  icon192: icon192.status,
  maskable: maskable.status,
  apple: apple.status,
  htmlHasFavicon: html.includes('/favicon.svg'),
  htmlHasApple: html.includes('/apple-touch-icon.png'),
};

writeFileSync(join(OUT, 's1-prove.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  frames: report.frames.length,
  overflowFails: report.overflow.filter((r) => !r.overflowOk).length,
  headerFails: report.header.filter((r) => !r.headerButtonsOk || !r.companyName.ok || !r.headerContains).length,
  allowDarkEqual: report.allowDark.equal,
  fontNoJump: report.fontReflow.noJump,
  fontDelta: { dw: report.fontReflow.dw, dh: report.fontReflow.dh, blocked: report.fontReflow.blocked, loaded: report.fontReflow.loaded },
  portalTheme: report.portal.theme,
  portalNode: report.portal.portalTheme,
  portalBg: report.portal.bg,
  quotePaper: report.quotePaper,
  email: report.email,
  pdf: report.pdf,
  favicon: report.favicon,
}, null, 2));

await browser.close();
