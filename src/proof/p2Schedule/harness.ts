import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';
import {
  BASE_SHA, BEFORE_DIR, CONTRAST, FOCUS, FROZEN_NOW, HOVERS, KILLS, SHEET, STATES, TAP_MIN, TIMEZONE, TRACK_PROBE, QUICK_BOOK_PHRASE,
  isTouch, viewportHeight,
  type Box, type Build, type FadeProbe, type FocusProbe, type FocusSide, type HoverProbe, type KillId, type Measure, type NowProbe,
  type PaletteCount, type Recipe, type Shot, type StateId, type StateSpec, type TrackProbe, type TrackShape, type TrayProbe,
} from './matrix.ts';
import type { Run } from './entry.tsx';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const MAIN_DIR = join(tmpdir(), `p2-main-${BASE_SHA.slice(0, 12)}`);
const PROOF_DIR = join(REPO_ROOT, 'src/proof/p2Schedule');
const SWAPS = ['lib/supabase', 'contexts/AuthContext', 'lib/useCompanyAiKey', 'components/ui/DevConsole', 'components/search/GlobalSearch'];
const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
const POOL = 4;
const SAVE_DATE = '24/10/2026';

const run = (cmd: string, args: string[], cwd: string) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).toString();

const TOKENS = readFileSync(join(REPO_ROOT, 'src/styles/tokens.css'), 'utf8');
/** The light value of a --g-* hex token, lowercased. The light block comes first in tokens.css. */
export function token(name: string): string {
  const m = TOKENS.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`tokens.css has no hex --${name}`);
  return m[1].toLowerCase();
}
const round = (v: number) => Math.round(v * 10) / 10;
const sum = (c: number[] | null) => (c ? round(c.reduce((a, b) => a + b, 0)) : -1);

export function snapshotTree(o: { treeish: string; dir: string; edit?: (root: string) => void }): string {
  if (existsSync(join(o.dir, '.p2-ready'))) return o.dir;
  const tmp = `${o.dir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync('bash', ['-c', [
    `git archive --format=tar ${o.treeish} -- . ':!docs' ':!grafter-proofs' | tar -x -C "${tmp}"`,
    `if git cat-file -e ${o.treeish}:docs/schema/p2-columns.json; then git archive --format=tar ${o.treeish} -- docs/schema | tar -x -C "${tmp}"; fi`,
  ].join(' && ')], { cwd: REPO_ROOT, stdio: 'pipe' });
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(tmp, 'node_modules'));
  o.edit?.(tmp);
  run('npx', ['vite', 'build', '--logLevel', 'error'], tmp);
  writeFileSync(join(tmp, '.p2-ready'), new Date().toISOString());
  rmSync(o.dir, { recursive: true, force: true });
  renameSync(tmp, o.dir);
  return o.dir;
}

function newestSrcMtime(dir: string): number {
  let newest = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) {
      if (p !== PROOF_DIR) newest = Math.max(newest, newestSrcMtime(p));
    } else {
      newest = Math.max(newest, statSync(p).mtimeMs);
    }
  }
  return newest;
}

function resolveFile(base: string): string | null {
  for (const ext of EXTS) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

type Artifacts = { url: string; supabaseInputs: string[] };
const artifactMemo = new Map<Build, Promise<Artifacts>>();

async function makeArtifacts(build: Build): Promise<Artifacts> {
  const root = build === 'main' ? snapshotTree({ treeish: BASE_SHA, dir: MAIN_DIR }) : REPO_ROOT;
  const dist = join(root, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`no dist in ${root}; run npm run build`);
  if (build === 'branch' && newestSrcMtime(join(root, 'src')) > statSync(join(dist, 'index.html')).mtimeMs) {
    throw new Error('stale dist: a src file is newer than dist/index.html; run npm run build');
  }
  const assets = join(dist, 'assets');
  const css = readdirSync(assets).filter(n => n.endsWith('.css')).map(n => readFileSync(join(assets, n), 'utf8')).join('\n')
    .replace(/url\(\/fonts\/([^)]+)\)/g, (_m, file: string) =>
      `url(data:font/woff2;base64,${readFileSync(join(dist, 'fonts', file)).toString('base64')})`);
  const mocks = join(PROOF_DIR, 'mocks.ts');
  const branchSrc = join(REPO_ROOT, 'src');
  const rootSrc = join(root, 'src');
  const result = await esbuild({
    absWorkingDir: REPO_ROOT,
    entryPoints: [join(PROOF_DIR, 'entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    metafile: true,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env': JSON.stringify({
        MODE: 'production', DEV: false, PROD: true, SSR: false, BASE_URL: '/',
        VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      }),
    },
    plugins: [{
      name: 'p2-boundaries',
      setup(b) {
        b.onResolve({ filter: /^\./ }, args => {
          const abs = resolve(args.resolveDir, args.path);
          if (abs.startsWith(PROOF_DIR)) return null;
          const fromRoot = abs.startsWith(rootSrc) ? relative(rootSrc, abs) : abs.startsWith(branchSrc) ? relative(branchSrc, abs) : null;
          if (fromRoot === null) return null;
          if (SWAPS.includes(fromRoot.replace(/\.tsx?$/, ''))) return { path: mocks };
          if (build === 'main') {
            const file = resolveFile(join(rootSrc, fromRoot));
            if (!file) throw new Error(`main has no ${fromRoot}`);
            return { path: file };
          }
          return null;
        });
      },
    }],
  });
  const js = result.outputFiles?.[0]?.text;
  if (!js) throw new Error('esbuild produced no P2 bundle');
  const dir = mkdtempSync(join(tmpdir(), `p2-run-${build}-`));
  temps.push(dir);
  writeFileSync(join(dir, 'p2.css'), css);
  writeFileSync(join(dir, 'p2.js'), js);
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html lang="en" data-theme="light" data-allow-dark="false"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><link rel="stylesheet" href="p2.css"></head><body><div id="root"></div><script src="p2.js"></script></body></html>');
  return {
    url: pathToFileURL(join(dir, 'index.html')).href,
    supabaseInputs: Object.keys(result.metafile?.inputs ?? {}).filter(p => p.includes('node_modules/@supabase/')),
  };
}

const artifacts = (build: Build) => {
  let p = artifactMemo.get(build);
  if (!p) {
    p = makeArtifacts(build);
    artifactMemo.set(build, p);
  }
  return p;
};

export async function bundleReport(build: Build = 'branch'): Promise<{ supabaseInputs: string[] }> {
  return { supabaseInputs: (await artifacts(build)).supabaseInputs };
}

const temps: string[] = [];
let browserPromise: Promise<Browser> | null = null;
const browser = () => {
  browserPromise ??= chromium.launch({
    headless: true,
    executablePath: ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome'].find(p => existsSync(p)),
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--host-resolver-rules=MAP * ~NOTFOUND'],
  });
  return browserPromise;
};

const ready = (page: Page) => page.evaluate(() => window.__p2.ready());
const press = (page: Page, w: StateSpec['w'], selector: string) =>
  page.locator(selector).first().click({ force: isTouch(w) });

async function orTimeout(wait: Promise<unknown>) {
  try {
    await wait;
  } catch (err) {
    if (!String(err).includes('Timeout')) throw err;
  }
}

async function openSheet(page: Page, _w: StateSpec['w']) {
  await page.evaluate(() => {
    const chip = document.querySelector<HTMLElement>('[data-schedule-unscheduled-chip]');
    if (chip?.getAttribute('aria-expanded') !== 'true') chip?.click();
  });
  await orTimeout(page.waitForSelector('[data-schedule-unscheduled-list] .hub-schedule-set-date', { timeout: 5_000 }));
  await page.locator('[data-schedule-unscheduled-list] .hub-schedule-set-date').first().evaluate(el => (el as HTMLElement).click());
  await page.waitForSelector('[role="dialog"]');
}

type Notes = { tray?: TrayProbe };

const RECIPES: Readonly<Record<Recipe, (page: Page, spec: StateSpec, notes: Notes) => Promise<void>>> = {
  none: async () => {},
  lineprobe: async page => {
    await page.locator('.hub-week-agenda-row').first().evaluate(el => {
      (el as HTMLElement).style.width = '90px';
    });
  },
  tray: async (page, _spec, notes) => {
    const before = await page.evaluate(() => window.__p2.tray());
    await page.locator('[data-schedule-unscheduled-chip]').first().evaluate(el => (el as HTMLElement).click());
    await orTimeout(page.waitForSelector('[data-schedule-unscheduled-list]', { timeout: 5_000 }));
    await ready(page);
    notes.tray = { before, after: await page.evaluate(() => window.__p2.tray()) };
    await page.evaluate(() => {
      document.querySelector('[data-schedule-unscheduled-after-week]')?.scrollIntoView({ block: 'end' });
      document.querySelector('[data-schedule-unscheduled-chip]')?.scrollIntoView({ block: 'nearest' });
      document.querySelector('[data-schedule-unscheduled-list] .hub-schedule-set-date')?.scrollIntoView({ block: 'nearest' });
    });
  },
  rail: async page => {
    await page.locator('[data-schedule-rail]').first().evaluate(el => el.scrollIntoView({ block: 'start' }));
  },
  sheet: async (page, spec) => openSheet(page, spec.w),
  prefill: async (page, spec) => {
    const toggle = page.locator('[data-schedule-quickbook-toggle]');
    if (spec.w < 768 && await toggle.count() && await toggle.getAttribute('aria-expanded') !== 'true') {
      await press(page, spec.w, '[data-schedule-quickbook-toggle]');
    }
    await page.locator('#hub-schedule-voice-text').waitFor({ state: 'visible' });
    await page.fill('#hub-schedule-voice-text', QUICK_BOOK_PHRASE);
    await press(page, spec.w, '.hub-schedule-voice-go');
    await page.waitForSelector('.hub-schedule-voice-hint, .hub-schedule-voice-picks, .hub-schedule-voice-new');
  },
  more: async (page, spec) => {
    await press(page, spec.w, '[data-schedule-crew-filter] summary');
    await orTimeout(page.waitForSelector('[data-schedule-crew-filter][open], .hub-schedule-crew-menu', { timeout: 5_000 }));
  },
  empty: async () => {},
  jobserror: async () => {},
  search: async (page) => {
    const box = page.locator('[data-schedule-search] input, .hub-week-search input').first();
    await box.fill('Luke');
    await orTimeout(page.waitForSelector('[data-schedule-search] [data-schedule-open-job], .hub-schedule-search-panel', { timeout: 5_000 }));
  },
  save: async (page, spec) => {
    await openSheet(page, spec.w);
    const date = page.locator('[role="dialog"] input[inputmode="numeric"]').first();
    await date.fill(SAVE_DATE);
    await date.blur();
    await press(page, spec.w, '[role="dialog"] .hub-editor-sticky-save');
    await page.waitForFunction(() => window.__p2.ledger().writes.length > 0, undefined, { timeout: 10_000 });
  },
  tab: async (page, spec) => {
    await press(page, spec.w, '[data-phone-tab="schedule"]');
    await orTimeout(page.waitForFunction(path => window.__p2.path() !== path, spec.path, { timeout: 5_000 }));
  },
  field: async page => {
    await page.locator('[data-shell-nav-group="Field"]').click();
    await page.waitForSelector('.shell-menu');
  },
};

const settle = async (page: Page) => {
  await page.waitForTimeout(450);
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
};

async function probeTrack(id: StateId, build: Build, shape: TrackShape, sink: Pick<Opened, 'blocked' | 'websockets' | 'pageErrors'>): Promise<TrackProbe> {
  const o = await openState(id, build, TRACK_PROBE.viewportH);
  try {
    return { ...shape, ...await wheelTrack(o.page) };
  } finally {
    await o.close();
    sink.blocked.push(...o.blocked);
    sink.websockets.push(...o.websockets);
    sink.pageErrors.push(...o.pageErrors);
  }
}

async function wheelTrack(page: Page): Promise<Pick<TrackProbe, 'wheelAt' | 'wheelX' | 'wheelY'>> {
  const info = await page.evaluate(() => window.__p2.prepTrack());
  if (!info) return { wheelAt: 'no hit point inside the track', wheelX: { trackLeft: 0 }, wheelY: { deltaY: 0, pageMoved: 0, trackTop: 0 } };
  await settle(page);
  await page.mouse.move(info.x, info.y);
  await page.mouse.wheel(TRACK_PROBE.wheelPx, 0);
  await settle(page);
  const afterX = await page.evaluate(() => window.__p2.scrollState());
  await page.evaluate(() => window.__p2.resetTrack());
  await settle(page);
  const before = await page.evaluate(() => window.__p2.scrollState());
  const deltaY = before.roomDown > 4 ? TRACK_PROBE.wheelPx : before.roomUp > 4 ? -TRACK_PROBE.wheelPx : 0;
  await page.mouse.move(info.x, info.y);
  await page.mouse.wheel(0, deltaY);
  await settle(page);
  const afterY = await page.evaluate(() => window.__p2.scrollState());
  return {
    wheelAt: `${info.x},${info.y} ${info.hit}`,
    wheelX: { trackLeft: afterX.trackLeft },
    wheelY: {
      deltaY,
      pageMoved: Math.abs(afterY.mainTop - before.mainTop) + Math.abs(afterY.docTop - before.docTop),
      trackTop: afterY.trackTop,
    },
  };
}

type Png = Partial<Record<Shot, Buffer>>;
type Measured = Measure & { png: Png };

type Opened = { page: Page; spec: StateSpec; notes: Notes; blocked: string[]; websockets: string[]; pageErrors: string[]; close: () => Promise<void> };

export async function openState(id: StateId, build: Build = 'branch', height = viewportHeight(STATES[id].w)): Promise<Opened> {
  const spec: StateSpec = STATES[id];
  const { url } = await artifacts(build);
  const context = await (await browser()).newContext({
    viewport: { width: spec.w, height },
    deviceScaleFactor: 1,
    hasTouch: isTouch(spec.w),
    timezoneId: TIMEZONE,
    locale: 'en-AU',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
  });
  const blocked: string[] = [];
  const websockets: string[] = [];
  const pageErrors: string[] = [];
  try {
    await context.clock.setFixedTime(new Date(FROZEN_NOW));
    await context.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith('file:') || u.startsWith('data:')) return route.continue();
      blocked.push(`${route.request().method()} ${u}`);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('websocket', ws => websockets.push(ws.url()));
    page.on('pageerror', err => pageErrors.push(err.message));
    await page.addInitScript((boot: { path: string; empty?: boolean; jobsError?: boolean }) => {
      window.__P2_BOOT__ = boot;
    }, {
      path: spec.path,
      empty: spec.recipe === 'empty',
      jobsError: spec.recipe === 'jobserror',
    });
    await page.goto(url);
    await page.waitForFunction(() => !!window.__p2);
    await ready(page);
    const notes: Notes = {};
    await RECIPES[spec.recipe](page, spec, notes);
    await ready(page);
    return { page, spec, notes, blocked, websockets, pageErrors, close: () => context.close() };
  } catch (err) {
    await context.close();
    throw err;
  }
}

async function shoot(page: Page, what: string): Promise<Buffer> {
  let prev = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(150);
    const next = await page.screenshot({ animations: 'disabled', caret: 'hide' });
    if (next.equals(prev)) return next;
    prev = next;
  }
  throw new Error(`${what} frame never settled`);
}

const coverage = (page: Page, png: Buffer, base: Buffer | null, list: Run[], ink: string) =>
  page.evaluate(([a, b, l, k]) => window.__p2.runs(a, b, l, k), [png.toString('base64'), base?.toString('base64') ?? null, list, ink] as const);

/** Outward runs from the middle of each box edge, with each pixel's distance from that edge as painted. */
function ringRuns(b: Box): { side: FocusSide['side']; run: Run; d: number[] }[] {
  const n = FOCUS.runPx;
  const x = Math.round(b.x + b.w / 2);
  const y = Math.round(b.y + b.h / 2);
  // Chrome snaps fractional border boxes to whole pixels before it paints the outline.
  const [l, r, t, btm] = [b.x, b.x + b.w, b.y, b.y + b.h].map(Math.round);
  const d = (f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i) + 0.5);
  return [
    { side: 'left', run: { x: l - 1, y, dx: -1, dy: 0, n }, d: d(i => i) },
    { side: 'right', run: { x: r, y, dx: 1, dy: 0, n }, d: d(i => i) },
    { side: 'top', run: { x, y: t - 1, dx: 0, dy: -1, n }, d: d(i => i) },
    { side: 'bottom', run: { x, y: btm, dx: 0, dy: 1, n }, d: d(i => i) },
  ];
}

/** Tabs to each track button and reads its ring against the same frame with outlines suppressed. */
async function focusRings(page: Page, what: string, png: Png, keep: boolean): Promise<FocusProbe[]> {
  const marks = await page.evaluate(() => window.__p2.focusMark());
  const accent = token('g-accent');
  const out: FocusProbe[] = marks.map(m => ({ label: m.label, reached: false, fill: '', hit: m.hit, sides: [], skipped: [] }));
  for (let i = 0; i < FOCUS.maxTabs && out.some(f => !f.reached); i += 1) {
    await page.keyboard.press('Tab');
    const at = await page.evaluate(() => Number(document.activeElement?.getAttribute('data-p2-focus') ?? -1));
    if (at < 0 || out[at].reached) continue;
    const box = (await page.evaluate(() => window.__p2.focusMark()))[at].box;
    const on = await shoot(page, `${what} focus ${at}`);
    await page.evaluate(() => window.__p2.focusRing(false));
    const off = await shoot(page, `${what} focus ${at} off`);
    await page.evaluate(() => window.__p2.focusRing(true));
    if (keep && at === 0) png.focus = on;
    const runs = ringRuns(box);
    const cov = await coverage(page, on, off, runs.map(r => r.run), accent);
    const inside = [{ x: Math.floor(box.x) + 3, y: box.y + box.h / 2 }];
    const [fill] = await page.evaluate(([b64, p]) => window.__p2.pixels(b64, p), [off.toString('base64'), inside] as const);
    const f = out[at];
    f.reached = true;
    f.fill = fill;
    runs.forEach((r, k) => {
      const c = cov[k];
      if (!c) {
        f.skipped.push(r.side);
        return;
      }
      const width = c.reduce((a, v) => a + v, 0);
      const centre = width ? c.reduce((a, v, i) => a + v * r.d[i], 0) / width : 0;
      f.sides.push({ side: r.side, width: round(width), offset: round(width ? centre - width / 2 : 0) });
    });
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  return out;
}

async function nowProbe(page: Page, what: string): Promise<NowProbe> {
  await page.evaluate(() => window.__p2.nowPrep());
  await settle(page);
  const at = await page.evaluate(() => window.__p2.nowPoints());
  const png = await shoot(page, `${what} now`);
  const accent = token('g-accent');
  const lines = await coverage(page, png, null, at.lines, accent);
  const heads = await coverage(page, png, null, at.heads, accent);
  const dots = await page.evaluate(([b64, p]) => window.__p2.pixels(b64, p), [png.toString('base64'), at.dots] as const);
  const reduce = await page.evaluate(() => window.__p2.nowAnimations());
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await settle(page);
  const motion = await page.evaluate(() => window.__p2.nowAnimations());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return {
    lines: lines.map(sum),
    dots,
    heads: at.heads.map((h, i) => ({ date: h.date, bar: sum(heads[i]) })),
    agenda: at.agenda,
    animations: { reduce, motion },
  };
}

/** Reads the fade alpha over a black pattern at the middle and at the end of the track. */
async function fadeProbe(page: Page, what: string, png: Png, keep: boolean): Promise<FadeProbe> {
  const g = await page.evaluate(() => window.__p2.fadeFind());
  if (!g) return { found: false, alphas: [], endAlphas: [], hitThrough: false, hit: 'no fade' };
  const surface = token('g-surface');
  const at = async (where: 'middle' | 'end') => {
    await page.evaluate(w => window.__p2.trackTo(w), where);
    await settle(page);
    if (where === 'end') {
      await page.evaluate(() => document.querySelector('.hub-day-board')?.classList.add('is-track-end'));
    }
    if (keep) png[where] = await shoot(page, `${what} ${where}`);
    await page.evaluate(() => window.__p2.fadePattern(true));
    const shot = await shoot(page, `${what} ${where} pattern`);
    await page.evaluate(() => window.__p2.fadePattern(false));
    return page.evaluate(([b64, geo, s]) => window.__p2.fadeAlphas(b64, geo, s), [shot.toString('base64'), g, surface] as const);
  };
  const alphas = await at('middle');
  const { hitThrough, hit } = await page.evaluate(geo => window.__p2.fadeHit(geo), g);
  return { found: true, alphas, endAlphas: await at('end'), hitThrough, hit };
}

async function hover(page: Page, target: string): Promise<HoverProbe> {
  const el = page.locator(`${target}:visible`).first();
  const read = () => el.evaluate(e => window.__p2.paintOf(e));
  const before = await read();
  await el.hover();
  await settle(page);
  const after = await read();
  const label = await el.evaluate(e => (e.getAttribute('aria-label') || (e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40));
  await page.mouse.move(0, 0);
  return { target, label, before, after };
}

async function safeArea(page: Page): Promise<{ plain: number; inset: number }> {
  const cdp = await page.context().newCDPSession(page);
  const send = cdp.send.bind(cdp) as (method: string, params: object) => Promise<unknown>;
  const plain = await page.evaluate(() => window.__p2.saveGap());
  await send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: SHEET.safeAreaPx } });
  await settle(page);
  const inset = await page.evaluate(() => window.__p2.saveGap());
  await cdp.detach();
  return { plain, inset };
}

async function measureOne(id: StateId, build: Build): Promise<Measured> {
  const { page, spec, notes, blocked, websockets, pageErrors, close } = await openState(id, build);
  const what = `${build} ${id}`;
  const has = (kill: KillId) => build === 'branch' && KILLS[kill].states.includes(id);
  try {
    const palette = (png: Buffer, shot: PaletteCount['shot'], masks: unknown) =>
      page.evaluate(([b64, m, s]) => window.__p2.palette(b64 as string, m as never, s as PaletteCount['shot']), [png.toString('base64'), masks, shot] as const);

    const scheme = async (s: 'light' | 'dark') => {
      await page.emulateMedia({ colorScheme: s });
      await page.evaluate(v => { document.documentElement.dataset.theme = v; }, s);
      await ready(page);
    };
    const topMasks = await page.evaluate(() => window.__p2.masks());
    const top = await shoot(page, what);
    // Any emulateMedia call re-rasters a few anti-aliased edge pixels by one level, light to light
    // included, so dark is diffed against a light frame taken after the same re-toggle.
    await scheme('light');
    const light = await shoot(page, what);
    await scheme('dark');
    const dark = await shoot(page, what);
    await scheme('light');
    const darkChangedPx = await page.evaluate(([a, b]) => window.__p2.changedPx(a, b), [light.toString('base64'), dark.toString('base64')] as const);
    const paletteCounts = [await palette(top, 'top', topMasks)];
    const png: Png = { top, dark };
    if ('scrolled' in spec.frames) {
      await page.evaluate(() => window.__p2.scrollPage());
      await settle(page);
      const masks = await page.evaluate(() => window.__p2.masks());
      png.scrolled = await shoot(page, what);
      paletteCounts.push(await palette(png.scrolled, 'scrolled', masks));
      await page.evaluate(() => window.__p2.restoreScroll());
      await settle(page);
    }
    const dom = await page.evaluate(() => window.__p2.measureDom());
    const shape = KILLS['P2-day-track'].states.includes(id) ? await page.evaluate(() => window.__p2.trackShape()) : null;
    if (build === 'branch' && spec.frames.chips) {
      const clip = await page.evaluate(() => window.__p2.chipCrop());
      if (clip) png.chips = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
    }
    const focus = has('P2-focus') ? await focusRings(page, what, png, !!spec.frames.focus) : [];
    if (build === 'branch' && spec.frames.empty) {
      await page.evaluate(() => window.__p2.showEmptyDay());
      await settle(page);
      png.empty = await shoot(page, `${what} empty day`);
      await page.evaluate(() => window.__p2.restoreScroll());
      await settle(page);
    }
    const safe = has('P2-sheet') && dom.sheet ? await safeArea(page) : null;
    const now = has('P2-now') ? await nowProbe(page, what) : null;
    const fade = has('P2-scroller') ? await fadeProbe(page, what, png, !!spec.frames.middle) : null;
    const target = build === 'branch' ? HOVERS[id] : undefined;
    const hovers = target ? [await hover(page, target)] : [];
    const led = await page.evaluate(() => window.__p2.ledger());
    await close();
    return {
      ...dom, id, build, palette: paletteCounts, darkChangedPx,
      track: shape ? await probeTrack(id, build, shape, { blocked, websockets, pageErrors }) : null,
      hovers, focus, fade, now, tray: notes.tray ?? null, safeArea: safe,
      blocked, websockets, writes: led.writes, reads: led.reads ?? [], unmocked: led.unmocked, pageErrors, png,
    };
  } finally {
    await close();
  }
}

const memo = new Map<string, Promise<Measured>>();
let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= POOL) await new Promise<void>(r => waiting.push(r));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

export function measure(id: StateId, build: Build = 'branch'): Promise<Measure> {
  const key = `${build}:${id}`;
  let p = memo.get(key);
  if (!p) {
    p = slot(() => measureOne(id, build));
    memo.set(key, p);
  }
  return p;
}

export const measureAll = (ids: readonly StateId[], build: Build = 'branch') => Promise.all(ids.map(id => measure(id, build)));

export async function closeHarness(): Promise<void> {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = null;
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
}

type Row = Record<string, unknown>;
const shares = (m: Measure, shot: 'top' | 'scrolled') => {
  const p = m.palette.find(x => x.shot === shot);
  return p ? { navyPct: +(100 * p.navyPx / p.framePx).toFixed(2), creamPct: +(100 * p.creamPx / p.framePx).toFixed(2), scannedPct: +(100 * p.scannedPx / p.framePx).toFixed(1) } : null;
};
const low = (m: Measure) => m.texts.filter(t => t.ratio < CONTRAST[t.role]);

function row(m: Measure): Row {
  const [view, w] = m.id.split('-');
  return {
    view, w: Number(w) || m.iw, state: m.id, iw: m.iw, docSW: m.docSW, bodySW: m.bodySW, maxRight: m.maxRight, maxEl: m.maxEl,
    offenders: m.offenders,
    minContrast: m.texts.length ? Math.min(...m.texts.map(t => t.ratio)) : null,
    minByRole: Object.fromEntries((Object.keys(CONTRAST) as (keyof typeof CONTRAST)[]).map(role => {
      const r = m.texts.filter(t => t.role === role).map(t => t.ratio);
      return [role, r.length ? Math.min(...r) : null];
    })),
    lowCount: low(m).length,
    low: low(m),
    tapsUnder44: m.taps.filter(t => t.w < TAP_MIN || t.h < TAP_MIN).length,
    taps: m.taps.filter(t => t.w < TAP_MIN || t.h < TAP_MIN),
    agendaRows: m.rows.map(r => ({ time: r.time.lines, title: r.title.lines, meta: r.meta.lines, x: [r.time.left, r.title.left] })),
    pageBg: m.pageBg,
    docH: m.docH,
    top: shares(m, 'top'),
    scrolled: shares(m, 'scrolled'),
    darkChangedPx: m.darkChangedPx,
    track: m.track,
    tracker: m.tracker,
    chips: m.chips,
    dayBoard: m.dayBoard,
    sheet: m.sheet,
    hovers: m.hovers,
    focus: m.focus,
    fade: m.fade,
    now: m.now,
    tray: m.tray,
    safeArea: m.safeArea,
    pageErrors: m.pageErrors,
  };
}

export async function writeCapture(dir: string): Promise<{ written: string[] }> {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const results: Row[] = [];
  const extra: Row[] = [];
  const baseline: Row[] = [];
  const mocks: Row[] = [];
  const failed: Row[] = [];
  for (const [key, p] of memo) {
    const m = await p.catch((err: Error) => {
      failed.push({ state: key, error: err.message.split('\n')[0] });
      return null;
    });
    if (!m) continue;
    if (m.build === 'main') {
      baseline.push(row(m));
      continue;
    }
    const spec: StateSpec = STATES[m.id];
    for (const [shot, name] of Object.entries(spec.frames) as [Shot, string][]) {
      const buf = m.png[shot];
      if (!buf) continue;
      writeFileSync(join(dir, name), buf);
      written.push(name);
    }
    (spec.recipe === 'none' || m.id === 'sheet-390' ? results : extra).push(row(m));
    mocks.push({ state: key, blocked: m.blocked, websockets: m.websockets, writes: m.writes, unmocked: m.unmocked });
  }
  const before = existsSync(join(BEFORE_DIR, 'measure.json')) ? JSON.parse(readFileSync(join(BEFORE_DIR, 'measure.json'), 'utf8')) as { results: Row[] } : { results: [] };
  const beforeNames = existsSync(BEFORE_DIR) ? readdirSync(BEFORE_DIR).filter(n => n.endsWith('.png')).sort() : [];
  const measureJson = {
    base: BASE_SHA,
    head: run('git', ['rev-parse', 'HEAD'], REPO_ROOT).trim(),
    dirty: run('git', ['status', '--porcelain'], REPO_ROOT).split('\n').filter(Boolean),
    frozenNow: FROZEN_NOW,
    timezone: TIMEZONE,
    bundle: await bundleReport('branch'),
    mocks,
    failed,
    results,
    extra,
    baseline,
    frames: {
      written: written.sort(),
      beforeNames,
      missingBeforeNames: beforeNames.filter(n => !written.includes(n)),
      extras: written.filter(n => !beforeNames.includes(n)),
    },
  };
  writeFileSync(join(dir, 'measure.json'), `${JSON.stringify(measureJson, null, 2)}\n`);
  writeFileSync(join(dir, 'tables.md'), tables([...results, ...extra], before.results));
  return { written };
}

function tables(after: Row[], before: Row[]): string {
  const b = (r: Row) => before.find(x => x.view === r.view && x.w === r.w);
  const out: string[] = [];
  out.push('## Overflow (docSW and max rect.right, before then after)', '', '| state | iw | docSW | maxRight raw | offenders and their nearest scroller |', '|---|---|---|---|---|');
  for (const r of after) {
    const old = b(r);
    const offenders = (r.offenders as Measure['offenders']).slice(0, 3).map(o => `${o.el} ${o.right} in ${o.scroller ? `.${o.scroller.classes.slice(0, 2).join('.')} (right ${o.scroller.right})` : 'no scroller'}`).join('; ') || 'none';
    out.push(`| ${r.state} | ${r.iw} | ${old ? `${old.docSW} → ` : ''}${r.docSW} | ${old ? `${old.maxRight} → ` : ''}${r.maxRight} | ${offenders} |`);
  }
  out.push('', '## Contrast, lowest ratio per role (before overall min in brackets)', '', '| state | text | cta | chip | pill | link | below bar |', '|---|---|---|---|---|---|---|');
  for (const r of after) {
    const m = r.minByRole as Record<string, number | null>;
    const old = b(r);
    out.push(`| ${r.state}${old ? ` [${old.minContrast}]` : ''} | ${m.text ?? '-'} | ${m.cta ?? '-'} | ${m.chip ?? '-'} | ${m.pill ?? '-'} | ${m.link ?? '-'} | ${r.lowCount} |`);
  }
  out.push('', '## Taps under 44 (effective hit area, before count in brackets)', '', '| state | count | worst |', '|---|---|---|');
  for (const r of after) {
    const taps = r.taps as Measure['taps'];
    const old = b(r);
    out.push(`| ${r.state} | ${old ? `[${old.tapsUnder44}] ` : ''}${r.tapsUnder44} | ${taps.slice(0, 4).map(t => `${t.label || t.cls} ${t.w}×${t.h}`).join('; ') || 'none'} |`);
  }
  out.push('', '## Forced dark, changed px (before in brackets)', '', '| state | changed px |', '|---|---|');
  for (const r of after) {
    const old = b(r);
    out.push(`| ${r.state} | ${old ? `[${old.darkChangedPx ?? '-'}] ` : ''}${r.darkChangedPx} |`);
  }
  out.push('', '## Hover (computed paint at rest, then under a real mouse hover)', '', '| state | target | label | background | box-shadow | ink |', '|---|---|---|---|---|---|');
  for (const r of after) {
    for (const h of r.hovers as HoverProbe[]) {
      const cell = (k: 'shadow' | 'color') => `${h.before[k]} → ${h.after[k]}`;
      out.push(`| ${r.state} | \`${h.target}\` | ${h.label.replace(/\|/g, '/')} | ${h.before.bg} a${h.before.bgA} → ${h.after.bg} a${h.after.bgA} | ${cell('shadow')} | ${cell('color')} |`);
    }
  }
  return `${out.join('\n')}\n`;
}
