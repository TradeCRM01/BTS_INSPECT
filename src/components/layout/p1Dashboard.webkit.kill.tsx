/** @vitest-environment node
 *
 * WebKit dashboard kills. Launch failure throws in beforeAll — 0 skips.
 * Run on Playwright 1.48.2 jammy (docker mcr.microsoft.com/playwright:v1.48.2-jammy).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: (() => T | Promise<T>) | ((arg: never) => T | Promise<T>), arg?: unknown) => Promise<T>;
  waitForSelector: (sel: string, opts?: { timeout?: number }) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  addInitScript: (script: string) => Promise<void>;
  mouse: {
    move: (x: number, y: number, opts?: { steps?: number }) => Promise<void>;
    down: () => Promise<void>;
    up: () => Promise<void>;
  };
  close: () => Promise<void>;
};

async function launchWebkit() {
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec) as {
        webkit: {
          launch: (opts: { headless: boolean }) => Promise<{
            newPage: (opts?: { viewport?: { width: number; height: number }; isMobile?: boolean }) => Promise<KillPage>;
            close: () => Promise<void>;
            version: () => string;
          }>;
        };
      };
      return await mod.webkit.launch({ headless: true });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`webkit launch failed: ${errors.join('; ')}`);
}

function serveDist(root: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
  };
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = join(root, rel);
      if (!file.startsWith(root)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      const fallback = !existsSync(file) || !statSync(file).isFile();
      const send = fallback ? join(root, 'index.html') : file;
      res.writeHead(200, { 'content-type': fallback ? 'text/html' : (mime[extname(send)] || 'application/octet-stream') });
      res.end(readFileSync(send));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('webkit dist listen failed'));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

let browser: Awaited<ReturnType<typeof launchWebkit>> | null = null;
let origin = '';
let server: { origin: string; close: () => Promise<void> } | null = null;
let launchErr: unknown = null;

beforeAll(async () => {
  try {
    const dist = join(process.cwd(), 'dist');
    if (!existsSync(join(dist, 'assets'))) throw new Error('dist/assets missing; run npm run build');
    server = await serveDist(dist);
    origin = server.origin;
    browser = await launchWebkit();
  } catch (err) {
    launchErr = err;
  }
}, 60000);

afterAll(async () => {
  await server?.close();
  await browser?.close();
});

function requireWebkit() {
  if (launchErr) throw launchErr;
  if (!browser) throw new Error('webkit did not launch');
  return browser;
}

async function openDashAt(root: string, width: number, path = '/?look=dashboard-full'): Promise<KillPage> {
  const page = await requireWebkit().newPage({ viewport: { width, height: 4000 }, isMobile: false });
  await page.addInitScript(`(function(){
    var Real = Date;
    var ms = Date.parse('2026-10-19T03:40:00.000Z');
    function FrozenDate() {
      if (arguments.length === 0) return new Real(ms);
      return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
    }
    FrozenDate.now = function(){ return ms; };
    FrozenDate.parse = Real.parse;
    FrozenDate.UTC = Real.UTC;
    FrozenDate.prototype = Real.prototype;
    window.Date = FrozenDate;
  })()`);
  await page.goto(`${root}${path}`);
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 25000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  return page;
}

async function openDash(width: number): Promise<KillPage> {
  return openDashAt(origin, width);
}

async function enterEdit(page: KillPage) {
  await page.evaluate(async () => {
    const more = document.querySelector('.dashboard-home-more') as HTMLDetailsElement | null;
    if (!more) throw new Error('more menu missing');
    more.open = true;
    const btn = [...more.querySelectorAll('button')].find((el) => /Customize|Done editing/.test(el.textContent || ''));
    if (!btn) throw new Error('Customize missing');
    if (!/Done editing/.test(btn.textContent || '')) (btn as HTMLButtonElement).click();
    for (let i = 0; i < 50; i += 1) {
      if ([...document.querySelectorAll('button, a')].some((el) => /Add widget/.test(el.textContent || ''))) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error('edit mode Add widget missing');
  });
}

function webkitBox() {
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const rights = [...document.querySelectorAll('body *')].filter(vis).map((el) => el.getBoundingClientRect().right);
  return {
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    bodyScrollWidth: document.body.scrollWidth,
    maxRight: rights.length ? Math.max(...rights) : 0,
  };
}

function webkitGateATextWalk() {
  const clips: Array<{ text: string; textRight: number; innerWidth: number }> = [];
  const iw = window.innerWidth;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const raw = node.textContent || '';
    if (raw.trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of [...range.getClientRects()]) {
        if (r.width < 1 || r.height < 1) continue;
        if (r.right > iw) clips.push({ text: raw.trim().slice(0, 48), textRight: r.right, innerWidth: iw });
      }
    }
    node = walker.nextNode();
  }
  return clips;
}

function webkitTextPastViewport() {
  const clips: Array<{ text: string; textRight: number; innerWidth: number }> = [];
  const iw = window.innerWidth;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const raw = node.textContent || '';
    const parent = node.parentElement;
    if (raw.trim() && parent) {
      const s = getComputedStyle(parent);
      const pr = parent.getBoundingClientRect();
      if (s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 && pr.width > 0 && pr.height > 0) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of [...range.getClientRects()]) {
          if (r.width < 1 || r.height < 1) continue;
          if (r.right > iw) clips.push({ text: raw.trim().slice(0, 48), textRight: r.right, innerWidth: iw });
        }
      }
    }
    node = walker.nextNode();
  }
  return clips;
}

function webkitTextPastCard() {
  const phone = window.innerWidth < 768;
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const clips: Array<{ id: string; text: string; textRight: number; cardRight: number }> = [];
  for (const host of document.querySelectorAll('[data-dashboard-widget-id]')) {
    if (!vis(host)) continue;
    const onPhone = !!host.closest('[data-dashboard-phone-stack]');
    if (phone ? !onPhone : onPhone) continue;
    const card = (host.querySelector('.dashboard-home-widget') as HTMLElement | null) ?? host as HTMLElement;
    const cardRight = card.getBoundingClientRect().right;
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const raw = node.textContent || '';
      if (raw.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of [...range.getClientRects()]) {
          if (r.width < 1 || r.height < 1) continue;
          if (r.right > cardRight) {
            clips.push({
              id: host.getAttribute('data-dashboard-widget-id') || '',
              text: raw.trim().slice(0, 48),
              textRight: r.right,
              cardRight,
            });
          }
        }
      }
      node = walker.nextNode();
    }
  }
  return clips;
}

function webkitAbsoluteBar() {
  const iw = window.innerWidth;
  const phone = iw < 768;
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const cards: Array<{
    id: string;
    clientWidth: number;
    right: number;
    minContent: number;
    chromeMinContent: number;
    widestChild: string;
    textPastCard: number;
    textPastViewport: number;
  }> = [];
  const probeMinContent = (el: HTMLElement) => {
    const prev = { w: el.style.width, min: el.style.minWidth, max: el.style.maxWidth };
    el.style.width = 'min-content';
    el.style.minWidth = 'min-content';
    el.style.maxWidth = 'none';
    const w = el.getBoundingClientRect().width;
    el.style.width = prev.w;
    el.style.minWidth = prev.min;
    el.style.maxWidth = prev.max;
    return w;
  };
  for (const host of document.querySelectorAll('[data-dashboard-widget-id]')) {
    if (!vis(host)) continue;
    const onPhone = !!host.closest('[data-dashboard-phone-stack]');
    if (phone ? !onPhone : onPhone) continue;
    const card = (host.querySelector('.dashboard-home-widget') as HTMLElement | null) ?? host as HTMLElement;
    const cr = card.getBoundingClientRect();
    let textPastCard = 0;
    let textPastViewport = 0;
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const raw = node.textContent || '';
      if (raw.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of [...range.getClientRects()]) {
          if (r.width < 1 || r.height < 1) continue;
          if (r.right > cr.right + 0.5) textPastCard += 1;
          if (r.right > iw) textPastViewport += 1;
        }
      }
      node = walker.nextNode();
    }
    const chromeSel = '.dashboard-home-phone-edit-bar, .dashboard-home-edit-chrome, .dashboard-home-edit-foot';
    const ink = (card.querySelector('.dashboard-home-widget-ink') as HTMLElement | null) ?? card;
    let chromeMinContent = 0;
    for (const child of [...card.querySelectorAll(chromeSel)].flatMap((el) => [el, ...el.querySelectorAll('*')])) {
      const el = child as HTMLElement;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      chromeMinContent = Math.max(chromeMinContent, probeMinContent(el));
    }
    let minContent = probeMinContent(ink);
    let widestChild = `ink:${minContent.toFixed(1)}`;
    for (const child of [...ink.querySelectorAll('*')]) {
      const el = child as HTMLElement;
      if (el.closest(chromeSel)) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      const w = probeMinContent(el);
      if (w > minContent) {
        minContent = w;
        const cls = (typeof el.className === 'string' ? el.className : el.tagName).toString().trim().slice(0, 48);
        widestChild = `${el.tagName.toLowerCase()}.${cls || 'anon'}:${w.toFixed(1)}`;
      }
    }
    cards.push({
      id: host.getAttribute('data-dashboard-widget-id') || '',
      clientWidth: card.clientWidth,
      right: cr.right,
      minContent,
      chromeMinContent,
      widestChild,
      textPastCard,
      textPastViewport,
    });
  }
  return {
    innerWidth: iw,
    bodyScrollWidth: document.body.scrollWidth,
    scrollX: window.scrollX,
    canvasScroll: (document.querySelector('.dashboard-home-canvas.is-editing') as HTMLElement | null)?.scrollLeft ?? 0,
    cards,
  };
}

describe('P1 dashboard WebKit kills (375/390 overflow and text)', () => {
  it('HF-403-768-webkit: launcher version and 0 skips', async () => {
    if (launchErr) throw launchErr;
    const launched = requireWebkit();
    const src = readFileSync(join(here, 'p1Dashboard.webkit.kill.tsx'), 'utf8');
    expect(src).toContain('webkit.launch');
    expect(src, 'webkit kill has no skips').not.toMatch(/\bit\.skip\(|describe\.skip\(|\bxit\(/);
    const version = launched.version();
    console.log(`WEBKIT_VERSION ${version}`);
    expect(version.length, 'webkit launched a real version').toBeGreaterThan(0);
  });

  it('HF-403-768-webkit: 320/375/390/768/1024/1280 docSW, maxRight, and text stay inside view and Customize', async () => {
    const src = readFileSync(join(here, 'p1Dashboard.webkit.kill.tsx'), 'utf8');
    expect(src).toContain('webkit.launch');
    expect(src, 'webkit kill has no skips').not.toMatch(/\bit\.skip\(|describe\.skip\(|\bxit\(/);
    for (const width of [320, 375, 390, 768, 1024, 1280] as const) {
      const view = await openDash(width);
      await view.setViewportSize({ width, height: 4000 });
      const viewBox = await view.evaluate(webkitBox);
      const viewVp = await view.evaluate(webkitTextPastViewport);
      const viewCard = await view.evaluate(webkitTextPastCard);
      await view.close();
      expect(viewBox.scrollWidth, `webkit docSW view ${width}`).toBeLessThanOrEqual(width);
      expect(viewBox.bodyScrollWidth, `webkit body.scrollWidth view ${width}`).toBeLessThanOrEqual(viewBox.innerWidth);
      expect(viewBox.maxRight, `webkit maxRight view ${width}`).toBeLessThanOrEqual(width);
      expect(viewVp, `webkit text past viewport view ${width}`).toEqual([]);
      expect(viewCard, `webkit text past card view ${width}`).toEqual([]);

      const edit = await openDash(width);
      await enterEdit(edit);
      await edit.setViewportSize({ width, height: width >= 768 ? 8000 : 4000 });
      const editBox = await edit.evaluate(webkitBox);
      const editVp = await edit.evaluate(webkitTextPastViewport);
      const editCard = await edit.evaluate(webkitTextPastCard);
      await edit.close();
      expect(editBox.scrollWidth, `webkit docSW edit ${width}`).toBeLessThanOrEqual(width);
      expect(editBox.bodyScrollWidth, `webkit body.scrollWidth edit ${width}`).toBeLessThanOrEqual(editBox.innerWidth);
      expect(editBox.maxRight, `webkit maxRight edit ${width}`).toBeLessThanOrEqual(width);
      expect(editVp, `webkit text past viewport edit ${width}`).toEqual([]);
      expect(editCard, `webkit text past card edit ${width}`).toEqual([]);
    }
  }, 360000);

  it('HF-403-768-a: WebKit text walk stays inside innerWidth at 320/375/390 in view and Customize', async () => {
    for (const width of [320, 375, 390] as const) {
      const view = await openDash(width);
      await view.setViewportSize({ width, height: 4000 });
      const viewWalk = await view.evaluate(webkitGateATextWalk);
      await view.close();
      expect(viewWalk, `webkit gate a text walk view ${width}: ${JSON.stringify(viewWalk.slice(0, 2))}`).toEqual([]);

      const edit = await openDash(width);
      await enterEdit(edit);
      await edit.setViewportSize({ width, height: 4000 });
      const editWalk = await edit.evaluate(webkitGateATextWalk);
      await edit.close();
      expect(editWalk, `webkit gate a text walk edit ${width}: ${JSON.stringify(editWalk.slice(0, 2))}`).toEqual([]);
    }
  }, 240000);

  it('HF-403-768-r2: WebKit Customize 768/1024/1280 stays inside card and viewport before scroll', async () => {
    for (const width of [768, 1024, 1280] as const) {
      const edit = await openDash(width);
      await enterEdit(edit);
      await edit.setViewportSize({ width, height: 8000 });
      const abs = await edit.evaluate(webkitAbsoluteBar);
      await edit.close();
      expect(abs.scrollX, `webkit ${width} window scrollX`).toBe(0);
      expect(abs.canvasScroll, `webkit ${width} canvas scrollLeft`).toBe(0);
      expect(abs.bodyScrollWidth, `webkit ${width} body.scrollWidth`).toBeLessThanOrEqual(abs.innerWidth);
      expect(abs.cards.length, `webkit ${width} Customize paints 26 cards`).toBe(26);
      for (const card of abs.cards) {
        expect(card.textPastCard, `webkit ${width} ${card.id} text past card`).toBe(0);
        expect(card.textPastViewport, `webkit ${width} ${card.id} text past viewport`).toBe(0);
        expect(card.right, `webkit ${width} ${card.id} card right`).toBeLessThanOrEqual(abs.innerWidth);
        expect(
          card.clientWidth + 1e-6,
          `webkit ${width} ${card.id} clientWidth ${card.clientWidth} >= min-content ${card.minContent}`,
        ).toBeGreaterThanOrEqual(card.minContent);
      }
    }
  }, 300000);

  function webkitPackGeometry() {
    const canvas = document.querySelector('.dashboard-home-canvas.is-editing') as HTMLElement | null;
    const vis = (el: Element) => {
      const s = getComputedStyle(el as HTMLElement);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const box = canvas?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('[data-dashboard-widget-id]')].filter((el) => (
      vis(el) && !el.closest('[data-dashboard-phone-stack]')
    )).map((host) => {
      const r = host.getBoundingClientRect();
      return {
        id: host.getAttribute('data-dashboard-widget-id') || '',
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        savedX: Number((host as HTMLElement).dataset.savedX ?? NaN),
        savedY: Number((host as HTMLElement).dataset.savedY ?? NaN),
        savedW: Number((host as HTMLElement).dataset.savedW ?? NaN),
        savedH: Number((host as HTMLElement).dataset.savedH ?? NaN),
      };
    }).sort((a, b) => (a.top - b.top) || (a.left - b.left));
    const mid = box ? box.left + box.width / 2 : 0;
    return {
      canvasLeft: box?.left ?? 0,
      canvasRight: box?.right ?? 0,
      leftGap: cards.length && box ? Math.min(...cards.map((c) => c.left)) - box.left : 0,
      rightGap: cards.length && box ? box.right - Math.max(...cards.map((c) => c.right)) : 0,
      cards,
      columns: cards.map((c) => ({ id: c.id, side: c.left + c.width / 2 < mid ? 'L' : 'R' })),
    };
  }

  function webkitViewGeometry() {
    const grid = document.querySelector('[data-dashboard-view-grid]') as HTMLElement | null;
    const vis = (el: Element) => {
      const s = getComputedStyle(el as HTMLElement);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const box = grid?.getBoundingClientRect();
    const cards = [...document.querySelectorAll('[data-dashboard-view-grid] [data-dashboard-widget-id]')].filter(vis).map((host) => {
      const r = host.getBoundingClientRect();
      return { id: host.getAttribute('data-dashboard-widget-id') || '', left: r.left, top: r.top, width: r.width };
    }).sort((a, b) => (a.top - b.top) || (a.left - b.left));
    const mid = box ? box.left + box.width / 2 : 0;
    return { columns: cards.map((c) => ({ id: c.id, side: c.left + c.width / 2 < mid ? 'L' : 'R' })) };
  }

  it('HF-403-768-r4: WebKit 768 two-up, view columns, saved drag, and height', async () => {
    const view = await openDash(768);
    await view.setViewportSize({ width: 768, height: 8000 });
    const viewGeo = await view.evaluate(webkitViewGeometry);
    const viewBottom = await view.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[data-dashboard-widget-id]')].map((el) => el.getBoundingClientRect().bottom)));
    await view.close();

    const edit = await openDash(768);
    await enterEdit(edit);
    await edit.setViewportSize({ width: 768, height: 8000 });
    const pack = await edit.evaluate(webkitPackGeometry);
    expect(pack.cards.length, 'webkit 768 paints 26 cards').toBe(26);
    for (const card of pack.cards) {
      expect(card.right, `webkit ${card.id} right`).toBeLessThanOrEqual(pack.canvasRight + 0.5);
    }
    expect(pack.columns.some((c) => c.side === 'L')).toBe(true);
    expect(pack.columns.some((c) => c.side === 'R')).toBe(true);
    const tall = Math.max(...pack.cards.map((c) => c.bottom - c.top));
    const leftAlone = pack.leftGap > 24 ? pack.cards.filter((c) => c.left - pack.canvasLeft > 24) : [];
    const rightAlone = pack.rightGap > 24 ? pack.cards.filter((c) => pack.canvasRight - c.right > 24) : [];
    if (leftAlone.length) {
      const span = Math.max(...leftAlone.map((c) => c.bottom)) - Math.min(...leftAlone.map((c) => c.top));
      expect(span, `webkit 768 left empty strip ${pack.leftGap}px over ${span}px`).toBeLessThanOrEqual(tall + 1);
    }
    if (rightAlone.length) {
      const span = Math.max(...rightAlone.map((c) => c.bottom)) - Math.min(...rightAlone.map((c) => c.top));
      expect(span, `webkit 768 right empty strip ${pack.rightGap}px over ${span}px`).toBeLessThanOrEqual(tall + 1);
    }
    expect(pack.columns.map((c) => c.id), 'webkit 768 order equals view').toEqual(viewGeo.columns.map((c) => c.id));
    expect(pack.columns.map((c) => c.side), 'webkit 768 L/R equals view').toEqual(viewGeo.columns.map((c) => c.side));
    const editBottom = Math.max(...pack.cards.map((c) => c.bottom));
    expect(editBottom, `webkit Customize height ${editBottom} <= 1.15 × view ${viewBottom}`).toBeLessThanOrEqual(viewBottom * 1.15);

    const weather = pack.cards.find((c) => c.id === 'full-weather-a');
    const weatherC = pack.cards.find((c) => c.id === 'full-weather-c');
    expect(weather).toBeTruthy();
    expect(weatherC).toBeTruthy();
    // Coach ruling (HF-403-768): no drag handle below 1024; the 768 no-handle check is the frozen K4.
    // The 'drag handle missing' assert moved to 1024 below.
    const handle = await edit.evaluate(() => {
      const host = document.querySelector('.dashboard-home-canvas [data-dashboard-widget-id="full-weather-a"]');
      const btn = host?.querySelector('button[title="Drag to move"]') as HTMLElement | null;
      if (!btn) return null;
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      if (r.width < 1) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (handle) {
      await edit.mouse.move(handle.x, handle.y);
      await edit.mouse.down();
      await edit.mouse.move(handle.x, handle.y + 80, { steps: 12 });
      await edit.mouse.up();
    }
    const after = await edit.evaluate(webkitPackGeometry);
    const dragged = after.cards.find((c) => c.id === 'full-weather-a');
    expect(dragged?.savedX, 'webkit vertical drag keeps saved x').toBe(weather!.savedX);
    expect(dragged?.savedW, 'webkit vertical drag keeps saved w').toBe(weather!.savedW);
    expect(dragged?.savedX, 'webkit vertical drag does not persist pack x').toBeGreaterThan(400);
    for (const card of after.cards) {
      if (card.id === 'full-weather-a') continue;
      const beforeCard = pack.cards.find((c) => c.id === card.id);
      expect(card.savedX, `webkit ${card.id} saved x after sibling drag`).toBe(beforeCard?.savedX);
      expect(card.savedW, `webkit ${card.id} saved w after sibling drag`).toBe(beforeCard?.savedW);
    }

    await edit.close();

    const edit1024 = await openDash(1024);
    await enterEdit(edit1024);
    await edit1024.setViewportSize({ width: 1024, height: 8000 });
    const pack1024 = await edit1024.evaluate(webkitPackGeometry);
    const abs1024 = await edit1024.evaluate(webkitAbsoluteBar);
    await edit1024.evaluate(() => {
      const host = document.querySelector('.dashboard-home-canvas [data-dashboard-widget-id="full-weather-a"]');
      const btn = host?.querySelector('button[title="Drag to move"]') as HTMLElement | null;
      if (!btn) throw new Error('drag handle missing');
      btn.scrollIntoView({ block: 'center' });
      const r = btn.getBoundingClientRect();
      if (r.width < 1) throw new Error('drag handle missing');
    });
    const weatherC1024 = pack1024.cards.find((c) => c.id === 'full-weather-c');
    const grip1024 = await edit1024.evaluate(() => {
      const host = document.querySelector('.dashboard-home-canvas [data-dashboard-widget-id="full-weather-c"]');
      const btn = host?.querySelector('.dashboard-home-widget-resize') as HTMLElement | null;
      const r = btn?.getBoundingClientRect();
      if (!r || r.width < 1) throw new Error('resize handle missing');
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await edit1024.mouse.move(grip1024.x, grip1024.y);
    await edit1024.mouse.down();
    await edit1024.mouse.move(grip1024.x - 10, grip1024.y + 20, { steps: 8 });
    await edit1024.mouse.up();
    const afterResize1024 = await edit1024.evaluate(webkitPackGeometry);
    const resized1024 = afterResize1024.cards.find((c) => c.id === 'full-weather-c');
    expect(resized1024?.savedX, 'webkit resize keeps saved x').toBe(weatherC1024!.savedX);
    expect(resized1024?.savedW, 'webkit resize changes saved w from saved geometry').toBe(weatherC1024!.savedW - 10);
    expect(resized1024?.savedH, 'webkit resize changes saved h from saved geometry').toBe(weatherC1024!.savedH + 20);
    await edit1024.close();
    for (const card of abs1024.cards) {
      expect(card.textPastCard, `webkit 1024 ${card.id} text past card`).toBe(0);
      expect(card.textPastViewport, `webkit 1024 ${card.id} text past viewport`).toBe(0);
    }
    for (let i = 0; i < pack1024.cards.length; i += 1) {
      for (let j = i + 1; j < pack1024.cards.length; j += 1) {
        const a = pack1024.cards[i];
        const b = pack1024.cards[j];
        const xGap = Math.max(a.left - b.right, b.left - a.right);
        const yGap = Math.max(a.top - b.bottom, b.top - a.bottom);
        const vertical = xGap < 0 && yGap >= 0;
        const horizontal = yGap < 0 && xGap >= 0;
        if (!vertical && !horizontal) continue;
        const between = pack1024.cards.some((c) => {
          if (c.id === a.id || c.id === b.id) return false;
          if (vertical) {
            const overlapX = Math.min(a.right, b.right, c.right) - Math.max(a.left, b.left, c.left);
            const midTop = Math.min(a.bottom, b.bottom);
            const midBot = Math.max(a.top, b.top);
            return overlapX > 0 && c.top < midBot && c.bottom > midTop;
          }
          const overlapY = Math.min(a.bottom, b.bottom, c.bottom) - Math.max(a.top, b.top, c.top);
          const midLeft = Math.min(a.right, b.right);
          const midRight = Math.max(a.left, b.left);
          return overlapY > 0 && c.left < midRight && c.right > midLeft;
        });
        if (between) continue;
        const gap = vertical ? yGap : xGap;
        expect(gap, `webkit 1024 gap ${a.id}/${b.id} ${gap}`).toBeLessThanOrEqual(40);
      }
    }

    const aad2Dist = existsSync(join('/workspace/.look-aad2eef7-dist', 'assets'))
      ? '/workspace/.look-aad2eef7-dist'
      : join('/tmp/aad2eef7-tsc', 'dist');
    if (!existsSync(join(aad2Dist, 'assets'))) {
      const aad2 = '/tmp/aad2eef7-tsc';
      execSync('npx vite build --outDir dist --emptyOutDir', {
        cwd: aad2,
        env: { ...process.env, VITE_LOOK_PROOF: '1' },
        stdio: 'pipe',
      });
    }
    const aad2Server = await serveDist(aad2Dist);
    const aad2Page = await openDashAt(aad2Server.origin, 1280, '/?look=dashboard');
    await enterEdit(aad2Page);
    const aad2Pack = await aad2Page.evaluate(webkitPackGeometry);
    await aad2Page.close();
    await aad2Server.close();

    const headFull = await openDash(1280);
    await enterEdit(headFull);
    await headFull.setViewportSize({ width: 1280, height: 8000 });
    const abs1280 = await headFull.evaluate(webkitAbsoluteBar);
    await headFull.close();
    for (const card of abs1280.cards) {
      expect(card.textPastCard, `webkit 1280 ${card.id} text past card`).toBe(0);
      expect(card.textPastViewport, `webkit 1280 ${card.id} text past viewport`).toBe(0);
    }

    const headDash = await openDashAt(origin, 1280, '/?look=dashboard');
    await enterEdit(headDash);
    const headPack = await headDash.evaluate(webkitPackGeometry);
    await headDash.close();
    expect(headPack.cards.map((c) => ({
      id: c.id, left: Math.round(c.left), top: Math.round(c.top), width: Math.round(c.width),
    })), 'webkit 1280 Customize equals in-run aad2eef7').toEqual(aad2Pack.cards.map((c) => ({
      id: c.id, left: Math.round(c.left), top: Math.round(c.top), width: Math.round(c.width),
    })));
  }, 360000);
});
