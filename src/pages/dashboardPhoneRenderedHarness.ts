import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { homedir } from 'node:os';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

export type DashboardLookReport = {
  innerWidth: number;
  scrollWidth: number;
  innerRight: number;
  cardCount: number;
  maxCardRight: number;
  maxRightAll: number;
  maxRightExHeader: number;
  overflowCards: number;
  overflowTexts: Array<{ text: string; right: number }>;
  viewGap: string | null;
  stackGap: string | null;
  minNeighbour: number | null;
  neighbourGaps: Array<{ kind: string; gap: number }>;
  viewTracks: Array<{ cols: string; gap: string; media: string }>;
  stackTracks: Array<{ cols: string; gap: string; media: string }>;
};

let server: ChildProcess | null = null;
let origin = '';
let lookPort = 0;
let lookPid = 0;
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

export function dashboardLookOrigin(): string {
  return origin;
}

export function dashboardLookPort(): number {
  return lookPort;
}

export function dashboardLookPid(): number {
  return lookPid;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = net.createServer();
    sock.listen(0, '127.0.0.1', () => {
      const addr = sock.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      sock.close(err => (err ? reject(err) : resolve(port)));
    });
    sock.on('error', reject);
  });
}

export function dashboardLookPortHasListener(port: number): Promise<boolean> {
  return new Promise(resolveWait => {
    const req = http.get(`http://127.0.0.1:${port}/`, res => {
      res.resume();
      resolveWait(true);
    });
    req.on('error', () => resolveWait(false));
    req.setTimeout(400, () => {
      req.destroy();
      resolveWait(false);
    });
  });
}

function waitForHttp(url: string, timeout = 40000): Promise<void> {
  const started = Date.now();
  return new Promise((resolveWait, reject) => {
    const tick = () => {
      const req = http.get(url, res => {
        res.resume();
        resolveWait();
      });
      req.on('error', () => {
        if (Date.now() - started > timeout) reject(new Error(`vite did not start at ${url}`));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

function chromePath(): string {
  const named = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/local/bin/google-chrome',
    '/usr/local/bin/chrome',
    '/usr/bin/google-chrome',
  ];
  for (const p of named) {
    if (p && existsSync(p)) return p;
  }
  const root = resolve(homedir(), '.cache/ms-playwright');
  if (existsSync(root)) {
    for (const dir of readdirSync(root)) {
      const bin = resolve(root, dir, 'chrome-linux/chrome');
      if (existsSync(bin)) return bin;
    }
  }
  throw new Error('no chrome for dashboard rendered layout tests');
}

export async function ensureDashboardLookServer(): Promise<string> {
  if (origin) return origin;
  const port = Number(process.env.DASHBOARD_LOOK_PORT) || await freePort();
  lookPort = port;
  origin = `http://127.0.0.1:${port}`;
  const viteBin = resolve(process.cwd(), 'node_modules/vite/bin/vite.js');
  server = spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'ignore', 'pipe'],
      detached: true,
    },
  );
  lookPid = server.pid ?? 0;
  const err: string[] = [];
  server.stderr?.on('data', chunk => { err.push(String(chunk)); });
  try {
    await waitForHttp(origin);
  } catch (e) {
    await closeDashboardLookServer();
    throw new Error(`${e instanceof Error ? e.message : e}\n${err.join('')}`);
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: chromePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return origin;
}

function killLookGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch {
    try { process.kill(pid, signal); } catch { /* already gone */ }
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function closeDashboardLookServer(): Promise<void> {
  await browser?.close();
  browser = null;
  const child = server;
  const pid = lookPid || child?.pid || 0;
  const port = lookPort;
  server = null;
  origin = '';
  lookPort = 0;
  lookPid = 0;
  const exited = child
    ? new Promise<void>(resolve => {
        child.once('exit', () => resolve());
      })
    : Promise.resolve();
  if (pid) killLookGroup(pid, 'SIGTERM');
  const termWait = Date.now();
  while (Date.now() - termWait < 4000) {
    const listening = port ? await dashboardLookPortHasListener(port) : false;
    if (!listening && (!pid || !pidAlive(pid))) {
      await Promise.race([exited, new Promise(r => setTimeout(r, 200))]);
      return;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  if (pid) killLookGroup(pid, 'SIGKILL');
  child?.kill('SIGKILL');
  const killWait = Date.now();
  while (Date.now() - killWait < 1500) {
    const listening = port ? await dashboardLookPortHasListener(port) : false;
    if (!listening && (!pid || !pidAlive(pid))) {
      await Promise.race([exited, new Promise(r => setTimeout(r, 200))]);
      return;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`vite still listening on ${port} pid ${pid} after close`);
}

function measureInPage(): DashboardLookReport {
  const sheetBody = document.querySelector('.dashboard-home-sheet-body') as HTMLElement | null;
  if (!sheetBody) throw new Error('no sheet body');
  const bodyRect = sheetBody.getBoundingClientRect();
  const styles = getComputedStyle(sheetBody);
  const innerRight = bodyRect.right - (parseFloat(styles.paddingRight) || 0);
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1;
  };
  const grid = document.querySelector('[data-dashboard-view-grid="1"]') as HTMLElement | null;
  const stack = document.querySelector('[data-dashboard-phone-stack="1"]') as HTMLElement | null;
  const canvas = document.querySelector('.dashboard-home-canvas') as HTMLElement | null;
  const host = [stack, grid, canvas].find(el => el && vis(el)) ?? grid ?? stack;
  const cards = [...(host?.querySelectorAll('[data-dashboard-widget-id]') ?? [])].filter(vis) as HTMLElement[];
  const cardRights = cards.map(el => el.getBoundingClientRect().right);
  const overflowTexts: Array<{ text: string; right: number }> = [];
  for (const card of cards) {
    for (const el of card.querySelectorAll('*')) {
      if (!vis(el)) continue;
      if (el.closest('[data-overflow-probe]')) continue;
      const own = [...el.childNodes].some(n => n.nodeType === 3 && (n.textContent ?? '').trim());
      if (!own) continue;
      const r = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const tr = range.getBoundingClientRect();
      const right = Math.max(r.right, tr.right);
      if (right > innerRight + 0.5) {
        overflowTexts.push({ text: (el.textContent ?? '').trim().slice(0, 40), right });
      }
    }
  }
  const rects = cards.map(el => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, r: r.right, b: r.bottom };
  });
  const neighbourGaps: Array<{ kind: string; gap: number }> = [];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const xg = Math.max(a.x - b.r, b.x - a.r);
      const yg = Math.max(a.y - b.b, b.y - a.b);
      if (xg < -0.5 && yg < -0.5) continue;
      let kind: string | null = null;
      let gap = 0;
      if (yg < -0.5) {
        kind = 'h';
        gap = xg;
      } else if (xg < -0.5) {
        kind = 'v';
        gap = yg;
      } else continue;
      const between = rects.some(c => {
        if (c === a || c === b) return false;
        if (kind === 'h') {
          return Math.min(a.b, b.b, c.b) - Math.max(a.y, b.y, c.y) > 0.5
            && c.x >= Math.min(a.r, b.r) - 0.5
            && c.r <= Math.max(a.x, b.x) + 0.5;
        }
        return Math.min(a.r, b.r, c.r) - Math.max(a.x, b.x, c.x) > 0.5
          && c.y >= Math.min(a.b, b.b) - 0.5
          && c.b <= Math.max(a.y, b.y) + 0.5;
      });
      if (between) continue;
      neighbourGaps.push({ kind, gap: Math.round(gap * 100) / 100 });
    }
  }
  const walk = (rules: CSSRuleList, media: string, out: Array<{ sel: string; cols: string; gap: string; media: string }>) => {
    for (const rule of rules) {
      const styleRule = rule as CSSStyleRule;
      if (rule.type === CSSRule.STYLE_RULE && styleRule.selectorText) {
        out.push({
          sel: styleRule.selectorText,
          cols: styleRule.style.gridTemplateColumns,
          gap: styleRule.style.gap || styleRule.style.rowGap,
          media,
        });
      } else {
        const grouped = rule as CSSGroupingRule & { conditionText?: string };
        if (grouped.cssRules) {
          const next = rule.type === CSSRule.MEDIA_RULE ? (grouped.conditionText ?? media) : media;
          walk(grouped.cssRules, next, out);
        }
      }
    }
  };
  const all: Array<{ sel: string; cols: string; gap: string; media: string }> = [];
  for (const sheet of document.styleSheets) {
    try {
      walk(sheet.cssRules, '', all);
    } catch {
      /* cross-origin */
    }
  }
  const viewTracks = all
    .filter(r => r.sel.includes('dashboard-home-view-grid') && !r.sel.includes('widget'))
    .map(r => ({ cols: r.cols, gap: r.gap, media: r.media }));
  const stackTracks = all
    .filter(r => /(^|[\s,])\.dashboard-home-widget-stack$/.test(r.sel.trim()))
    .map(r => ({ cols: r.cols, gap: r.gap, media: r.media }));
  const gapOf = (el: HTMLElement | null) => {
    if (!el || !vis(el)) return null;
    const cs = getComputedStyle(el);
    return (cs.rowGap && cs.rowGap !== 'normal' ? cs.rowGap : cs.gap) || null;
  };
  const visEls = [...document.querySelectorAll('body *')].filter(vis);
  const rightsAll = visEls.map(el => el.getBoundingClientRect().right);
  const rightsExHeader = visEls
    .filter(el => !el.closest('.shell-header'))
    .map(el => el.getBoundingClientRect().right);
  return {
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    innerRight,
    cardCount: cards.length,
    maxCardRight: cardRights.length ? Math.max(...cardRights) : 0,
    maxRightAll: rightsAll.length ? Math.max(...rightsAll) : 0,
    maxRightExHeader: rightsExHeader.length ? Math.max(...rightsExHeader) : 0,
    overflowCards: cardRights.filter(right => right > innerRight + 0.5).length,
    overflowTexts,
    viewGap: gapOf(grid),
    stackGap: gapOf(stack),
    minNeighbour: neighbourGaps.length ? Math.min(...neighbourGaps.map(g => g.gap)) : null,
    neighbourGaps,
    viewTracks,
    stackTracks,
  };
}

export async function measureDashboardLook(
  width: number,
  opts: { edit?: boolean; look?: string; overflowProbe?: boolean } = {},
): Promise<DashboardLookReport> {
  const base = await ensureDashboardLookServer();
  if (!browser) throw new Error('chrome failed to launch');
  const phone = width <= 430;
  const context = await browser.newContext({
    viewport: { width, height: phone ? 844 : 900 },
    deviceScaleFactor: 1,
    isMobile: phone,
    hasTouch: phone,
    locale: 'en-AU',
  });
  const page = await context.newPage();
  try {
    const look = opts.look ?? 'dashboard-seed';
    await page.goto(`${base}/?look=${look}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('[data-dashboard-view-grid="1"] .dashboard-home-widget', { timeout: 20000 });
    await page.waitForTimeout(300);
    if (opts.overflowProbe) {
      await page.evaluate(() => {
        const card = document.querySelector('[data-dashboard-view-grid="1"] .dashboard-home-widget');
        if (!card) return;
        const probe = document.createElement('div');
        probe.setAttribute('data-overflow-probe', '1');
        probe.style.whiteSpace = 'nowrap';
        probe.style.fontSize = '18px';
        probe.textContent = `W${'M'.repeat(80)}`;
        card.appendChild(probe);
      });
    }
    if (opts.edit) {
      await page.click('.dashboard-home-more > summary');
      await page.locator('[role="menuitem"]').filter({ hasText: 'Customize' }).click();
      if (width < 768) {
        await page.waitForSelector('[data-dashboard-phone-stack="1"] [data-dashboard-widget-id]', { state: 'attached', timeout: 10000 });
      } else {
        await page.waitForSelector('.dashboard-home-canvas [data-dashboard-widget-id]', { state: 'visible', timeout: 10000 });
      }
      await page.waitForTimeout(200);
    }
    return await page.evaluate(measureInPage);
  } finally {
    await context.close();
  }
}
