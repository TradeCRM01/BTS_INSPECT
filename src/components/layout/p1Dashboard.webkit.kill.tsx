/** @vitest-environment node
 *
 * Phone-width dashboard kills (320/375/390). Stays green on aad2eef7 and on
 * M-hf403-768-clamp because those squeeze md+ Customize, not the phone stack.
 * Launch failure throws in beforeAll — this file has 0 skips.
 */
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
  close: () => Promise<void>;
};

async function launchWebkit() {
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec) as {
        webkit: {
          launch: (opts: { headless: boolean }) => Promise<{
            newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<KillPage>;
            close: () => Promise<void>;
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

let browser: Awaited<ReturnType<typeof launchWebkit>>;
let origin = '';
let server: { origin: string; close: () => Promise<void> } | null = null;

beforeAll(async () => {
  const dist = join(process.cwd(), 'dist');
  if (!existsSync(join(dist, 'assets'))) throw new Error('dist/assets missing; run npm run build');
  server = await serveDist(dist);
  origin = server.origin;
  browser = await launchWebkit();
}, 60000);

afterAll(async () => {
  await server?.close();
  await browser?.close();
});

async function openDash(width: number): Promise<KillPage> {
  const page = await browser.newPage({ viewport: { width, height: 4000 } });
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
  await page.goto(`${origin}/?look=dashboard-full`);
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 25000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  return page;
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

describe('P1 dashboard WebKit kills (375/390 overflow and text)', () => {
  it('HF-403-768-webkit: 375/390 docSW, maxRight, and text stay inside view and Customize', async () => {
    const src = readFileSync(join(here, 'p1Dashboard.webkit.kill.tsx'), 'utf8');
    expect(src).toContain('webkit.launch');
    expect(src, 'webkit kill has no skips').not.toMatch(/\bit\.skip\(|describe\.skip\(|\bxit\(/);
    for (const width of [375, 390] as const) {
      const view = await openDash(width);
      await view.setViewportSize({ width, height: 4000 });
      const viewBox = await view.evaluate(webkitBox);
      const viewVp = await view.evaluate(webkitTextPastViewport);
      const viewCard = await view.evaluate(webkitTextPastCard);
      await view.close();
      expect(viewBox.scrollWidth, `webkit docSW view ${width}`).toBeLessThanOrEqual(width);
      expect(viewBox.maxRight, `webkit maxRight view ${width}`).toBeLessThanOrEqual(width);
      expect(viewVp, `webkit text past viewport view ${width}`).toEqual([]);
      expect(viewCard, `webkit text past card view ${width}`).toEqual([]);

      const edit = await openDash(width);
      await enterEdit(edit);
      await edit.setViewportSize({ width, height: 4000 });
      const editBox = await edit.evaluate(webkitBox);
      const editVp = await edit.evaluate(webkitTextPastViewport);
      const editCard = await edit.evaluate(webkitTextPastCard);
      await edit.close();
      expect(editBox.scrollWidth, `webkit docSW edit ${width}`).toBeLessThanOrEqual(width);
      expect(editBox.maxRight, `webkit maxRight edit ${width}`).toBeLessThanOrEqual(width);
      expect(editVp, `webkit text past viewport edit ${width}`).toEqual([]);
      expect(editCard, `webkit text past card edit ${width}`).toEqual([]);
    }
  }, 240000);

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
});
