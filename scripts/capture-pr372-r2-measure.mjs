import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = process.env.LOOK_OUT_DIR || 'grafter-proofs/sweep/pr372-r2';
mkdirSync(OUT, { recursive: true });

const WIDTHS = [
  { w: 375, h: 812, tag: '375' },
  { w: 390, h: 844, tag: '390' },
  { w: 1024, h: 768, tag: '1024' },
  { w: 1280, h: 900, tag: '1280' },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.LOOK_CHROME || '/usr/bin/google-chrome-stable',
});

async function contextFor(width, height) {
  return browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    isMobile: width < 500,
    hasTouch: width < 500,
  });
}

async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, type: 'png', fullPage: false });
  console.log('wrote', path);
  return path;
}

async function setNativeValue(page, selector, value) {
  await page.evaluate(({ selector, value }) => {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLInputElement)) throw new Error(`missing ${selector}`);
    const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    proto?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }, { selector, value });
}

async function fillTimes(page, start, end) {
  await page.locator('input[type="time"]').first().waitFor({ timeout: 15000 });
  await page.evaluate(({ start, end }) => {
    const els = [...document.querySelectorAll('input[type="time"]')];
    const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    const set = (el, v) => {
      proto?.set?.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    if (els[0]) set(els[0], start);
    if (els[1]) set(els[1], end);
  }, { start, end });
}

async function measure(page, { focusSel, extraSels = [] }) {
  return page.evaluate(({ focusSel, extraSels }) => {
    const innerWidth = window.innerWidth;
    const innerHeight = window.innerHeight;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflowOk = scrollWidth <= innerWidth;

    const clipped = [];
    const seen = new Set();

    function textOf(el) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return (el.value || el.placeholder || '').trim();
      }
      const own = [...el.childNodes]
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent ?? '')
        .join('')
        .trim();
      return own || (el.childElementCount === 0 ? (el.textContent || '').trim() : '');
    }

    function check(el) {
      if (!(el instanceof Element) || seen.has(el)) return;
      seen.add(el);
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const text = textOf(el);
      if (!text) return;
      const hiddenX = style.overflowX === 'hidden' || style.overflow === 'hidden';
      const ellipsis = style.textOverflow === 'ellipsis';
      const boxClip = (hiddenX || ellipsis) && el.scrollWidth > el.clientWidth + 1;
      const viewportClip = r.right > innerWidth + 1 || r.left < -1;
      if (boxClip || viewportClip) {
        clipped.push({
          kind: boxClip && viewportClip ? 'box+viewport' : boxClip ? 'box' : 'viewport',
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
          text: text.slice(0, 80),
          left: Math.round(r.left),
          right: Math.round(r.right),
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
        });
      }
    }

    const roots = [];
    if (focusSel) {
      document.querySelectorAll(focusSel).forEach(el => roots.push(el));
    }
    extraSels.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => roots.push(el));
    });
    document.querySelectorAll('[data-date-field="au"]').forEach(el => {
      roots.push(el.closest('label') || el.parentElement || el);
    });

    for (const root of roots) {
      check(root);
      root.querySelectorAll('input, textarea, [role="alert"], label, span, p, td, th, h2, h3').forEach(check);
    }

    const errEl = document.querySelector('[role="alert"]');
    let error = null;
    if (errEl) {
      const r = errEl.getBoundingClientRect();
      const style = getComputedStyle(errEl);
      error = {
        text: (errEl.innerText || '').trim(),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        visibleWithoutScroll:
          style.display !== 'none'
          && style.visibility !== 'hidden'
          && r.width > 0
          && r.height > 0
          && r.top >= -1
          && r.bottom <= innerHeight + 1
          && r.left >= -1
          && r.right <= innerWidth + 1,
      };
    }

    return {
      innerWidth,
      innerHeight,
      scrollWidth,
      overflowOk,
      noClippedText: clipped.length === 0,
      clipped,
      error,
      dateFieldCount: document.querySelectorAll('[data-date-field="au"]').length,
    };
  }, { focusSel, extraSels });
}

async function openTimeView(page) {
  await page.goto(`${BASE}/timesheets?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.hub-timesheets-ledger, .hub-timesheets-tiles, .hub-timesheets-entries, .hub-timesheets-tools').first().waitFor({ timeout: 20000 });
}

async function openTimeEditError(page) {
  await openTimeView(page);
  await page.getByRole('button', { name: /Add Entry/i }).first().click({ timeout: 20000 });
  await page.getByRole('heading', { name: 'Add Time Entry' }).waitFor({ timeout: 15000 });
  await fillTimes(page, '16:30', '08:15');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('[role="alert"]').waitFor({ timeout: 8000 });
}

async function openQuoteView(page) {
  await page.goto(`${BASE}/quotes?id=audit-quote-gst&auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.hub-quote-sheet').waitFor({ timeout: 20000 });
}

async function openQuoteEdit(page) {
  await openQuoteView(page);
  await page.locator('summary[aria-label="More actions"]').click();
  await page.getByRole('menuitem', { name: 'Edit quote' }).click();
  await page.locator('.hub-quote-edit').waitFor({ timeout: 15000 });
  const field = page.locator('.hub-quote-edit [data-date-field="au"]').first();
  await field.waitFor({ timeout: 15000 });
  await field.scrollIntoViewIfNeeded();
}

async function openInvoiceView(page) {
  await page.goto(`${BASE}/invoices?id=audit-invoice-gst&auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.hub-invoice-sheet').waitFor({ timeout: 20000 });
}

async function openInvoiceEdit(page) {
  await openInvoiceView(page);
  await page.locator('summary[aria-label="More actions"]').click();
  await page.getByRole('menuitem', { name: 'Edit invoice' }).click();
  await page.locator('.hub-invoice-edit').waitFor({ timeout: 15000 });
  const field = page.locator('.hub-invoice-edit [data-date-field="au"]').first();
  await field.waitFor({ timeout: 15000 });
  await field.scrollIntoViewIfNeeded();
}

async function openExpenseView(page) {
  await page.goto(`${BASE}/expenses?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.hub-expenses').waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
}

async function openExpenseEdit(page) {
  await page.goto(`${BASE}/expenses?auditAuth=1&expenseNoAi=1&look=expense1-filled`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-expense-editor-overlay="1"]').waitFor({ timeout: 25000 });
  const field = page.locator('[data-expense-editor-overlay="1"] [data-date-field="au"]').first();
  await field.waitFor({ timeout: 15000 });
  await field.scrollIntoViewIfNeeded();
}

const SURFACES = [
  {
    key: 'time-entry-view',
    label: 'Time entry form · view (ledger)',
    expectError: false,
    focusSel: '.hub-timesheets-ledger, .hub-timesheets-tiles, .hub-timesheets-entries, .hub-timesheets-tools',
    extraSels: ['.hub-timesheets-ledger-date', '.hub-timesheets-tile-date', '.hub-timesheets-entry'],
    open: openTimeView,
  },
  {
    key: 'time-entry-edit',
    label: 'Time entry form · edit (reversed error)',
    expectError: true,
    focusSel: '.hub-ops-form-sheet',
    extraSels: ['.hub-ops-form-footer', '[role="alert"]'],
    open: openTimeEditError,
  },
  {
    key: 'quote-view',
    label: 'Quote date · view (Valid until)',
    expectError: false,
    focusSel: '.hub-quote-sheet, .hub-quote-banner-meta, .hub-quote-editor-title',
    extraSels: ['.hub-quote-banner-meta'],
    open: openQuoteView,
  },
  {
    key: 'quote-edit',
    label: 'Quote date · edit (Valid Until)',
    expectError: false,
    focusSel: '.hub-quote-edit',
    extraSels: ['.hub-quote-edit [data-date-field="au"]'],
    open: openQuoteEdit,
  },
  {
    key: 'invoice-view',
    label: 'Invoice date · view (Due)',
    expectError: false,
    focusSel: '.hub-invoice-sheet',
    extraSels: ['.hub-invoice-banner', '.hub-invoice-editor-title'],
    open: openInvoiceView,
  },
  {
    key: 'invoice-edit',
    label: 'Invoice date · edit (Due Date)',
    expectError: false,
    focusSel: '.hub-invoice-edit',
    extraSels: ['.hub-invoice-edit [data-date-field="au"]'],
    open: openInvoiceEdit,
  },
  {
    key: 'expense-view',
    label: 'Expense date · view (list Date)',
    expectError: false,
    focusSel: '.hub-expenses, .hub-expenses-table, .hub-expenses-sheet',
    extraSels: ['.hub-expenses-table td:first-child', '.hub-expenses-table th:first-child'],
    open: openExpenseView,
  },
  {
    key: 'expense-edit',
    label: 'Expense date · edit (Date field)',
    expectError: false,
    focusSel: '[data-expense-editor-overlay="1"]',
    extraSels: ['[data-expense-editor-overlay="1"] [data-date-field="au"]'],
    open: openExpenseEdit,
  },
];

const rows = [];

for (const { w, h, tag } of WIDTHS) {
  for (const surface of SURFACES) {
    const ctx = await contextFor(w, h);
    const page = await ctx.newPage();
    const row = {
      surface: surface.key,
      label: surface.label,
      width: w,
      tag,
      ok: false,
    };
    try {
      await surface.open(page);
      const metrics = await measure(page, {
        focusSel: surface.focusSel,
        extraSels: surface.extraSels,
      });
      const frame = `${surface.key}-${tag}`;
      await shot(page, frame);
      const errorVisible = metrics.error?.visibleWithoutScroll === true;
      const errorOk = surface.expectError
        ? errorVisible
        : true;
      row.ok = metrics.overflowOk && metrics.noClippedText && errorOk;
      row.innerWidth = metrics.innerWidth;
      row.scrollWidth = metrics.scrollWidth;
      row.overflowOk = metrics.overflowOk;
      row.noClippedText = metrics.noClippedText;
      row.clipped = metrics.clipped;
      row.dateFieldCount = metrics.dateFieldCount;
      row.error = metrics.error;
      row.expectError = surface.expectError;
      row.errorVisibleWithoutScroll = surface.expectError
        ? errorVisible
        : (metrics.error ? errorVisible : null);
      row.frame = `${OUT}/${frame}.png`;
      if (!row.ok) {
        console.error('MEASURE FAIL', surface.key, tag, JSON.stringify({
          overflowOk: metrics.overflowOk,
          scrollWidth: metrics.scrollWidth,
          innerWidth: metrics.innerWidth,
          noClippedText: metrics.noClippedText,
          clipped: metrics.clipped,
          error: metrics.error,
        }));
      } else {
        console.log('MEASURE OK', surface.key, tag, `scroll ${metrics.scrollWidth}<=${metrics.innerWidth}`, `clip ${metrics.noClippedText}`, surface.expectError ? `err ${errorVisible}` : 'err n/a');
      }
    } catch (err) {
      row.errorMessage = err instanceof Error ? err.message : String(err);
      console.error('OPEN FAIL', surface.key, tag, row.errorMessage);
    }
    rows.push(row);
    await ctx.close();
  }
}

if (WIDTHS.some(x => x.tag === '1024')) {
  const extras = [
    {
      name: 'time-entry-overlap-1024',
      run: async (page) => {
        await openTimeView(page);
        await page.getByRole('button', { name: /Add Entry/i }).first().click({ timeout: 20000 });
        await page.getByRole('heading', { name: 'Add Time Entry' }).waitFor({ timeout: 15000 });
        const utc = new Date().toISOString().slice(0, 10);
        const [y, m, d] = utc.split('-');
        await page.locator('[data-date-field="au"]').first().waitFor({ timeout: 15000 });
        await setNativeValue(page, '[data-date-field="au"]', `${d}/${m}/${y}`);
        await fillTimes(page, '08:00', '09:00');
        await page.getByRole('button', { name: 'Save' }).click();
        await page.locator('[role="alert"]').waitFor({ timeout: 8000 }).catch(() => {});
      },
    },
    {
      name: 'time-entry-overnight-plus1-1024',
      run: async (page) => {
        await openTimeView(page);
        await page.getByRole('button', { name: /Add Entry/i }).first().click({ timeout: 20000 });
        await page.getByRole('heading', { name: 'Add Time Entry' }).waitFor({ timeout: 15000 });
        await fillTimes(page, '23:00', '01:00');
        await page.locator('label', { hasText: 'Ends next day' }).click();
      },
    },
    {
      name: 'time-entry-reversed-1024',
      run: async (page) => {
        await openTimeEditError(page);
      },
    },
  ];
  for (const extra of extras) {
    const ctx = await contextFor(1024, 768);
    const page = await ctx.newPage();
    try {
      await extra.run(page);
      await shot(page, extra.name);
    } catch (err) {
      console.error('EXTRA FAIL', extra.name, err instanceof Error ? err.message : err);
    }
    await ctx.close();
  }
}

function cell(ok) {
  return ok === true ? 'pass' : ok === false ? 'FAIL' : 'n/a';
}

function errorCell(row) {
  if (row.tag !== '375' && !row.expectError) return 'n/a';
  if (row.expectError) return row.errorVisibleWithoutScroll ? 'visible' : 'NOT visible';
  if (row.error) return row.error.visibleWithoutScroll ? 'visible (unexpected)' : 'present, off-screen';
  return 'none';
}

const md = [
  '# PR372 r2 viewport measure',
  '',
  'Measured on Chromium (`document.documentElement.scrollWidth` vs `window.innerWidth`). Clipped text is scoped to the time-entry form / date field surfaces (overflow+ellipsis or horizontally outside the viewport). Error column is the time-entry reversed-time `role=alert` in the sticky footer; quote/invoice/expense date fields have no inline error in this PR.',
  '',
  '| Surface | Width | scrollWidth | innerWidth | scrollWidth ≤ innerWidth | no clipped text | error visible without scroll (375) | frame |',
  '|---|---:|---:|---:|:---:|:---:|:---:|---|',
  ...rows.map(row => {
    const err = errorCell(row);
    const errCol = row.tag === '375' || row.expectError ? err : 'n/a';
    return `| ${row.label} | ${row.width} | ${row.scrollWidth ?? '—'} | ${row.innerWidth ?? '—'} | ${cell(row.overflowOk)} | ${cell(row.noClippedText)} | ${errCol} | \`${row.frame ?? row.errorMessage ?? '—'}\` |`;
  }),
  '',
  'All rows pass: **' + String(rows.every(r => r.ok)) + '**.',
  '',
];

writeFileSync(`${OUT}/viewport-measure.json`, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
writeFileSync(`${OUT}/viewport-measure.md`, md.join('\n'));
console.log('wrote', `${OUT}/viewport-measure.json`);
console.log('wrote', `${OUT}/viewport-measure.md`);

await browser.close();
console.log('done', OUT);
