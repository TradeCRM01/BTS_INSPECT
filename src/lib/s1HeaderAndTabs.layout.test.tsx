import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { JOB_SHEET_TABS } from './jobSheetTabs';
import { Wordmark } from '../components/brand/Wordmark';

async function launchBrowser() {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/home/ubuntu/.cache/ms-playwright/chromium-1148/chrome-linux64/chrome',
    '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((path): path is string => !!path && existsSync(path));
  const executablePath = chromeCandidates[0];
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec) as { chromium: { launch: (opts: { headless: boolean; executablePath?: string }) => Promise<{
        newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<{
          goto: (url: string) => Promise<unknown>;
          evaluate: <T>(fn: () => T) => Promise<T>;
          setViewportSize: (size: { width: number; height: number }) => Promise<void>;
          close: () => Promise<void>;
        }>;
        close: () => Promise<void>;
      }> } };
      return await mod.chromium.launch({ headless: true, executablePath });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`chromium launch failed: ${errors.join('; ')}`);
}

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
const appShell = readFileSync(join(process.cwd(), 'src/components/layout/AppShell.tsx'), 'utf8');

function tabsHtml(): string {
  const tabs = JOB_SHEET_TABS.map((t, i) => (
    `<button type="button" class="job-sheet-tab${i === 0 ? ' is-on' : ''}">${t.label}</button>`
  )).join('');
  const wordmark = renderToStaticMarkup(<Wordmark size="header" />);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
<style>
  body { margin: 0; }
  .min-h-11 { min-height: 2.75rem; }
  .h-11 { height: 2.75rem; }
  .w-11 { width: 2.75rem; }
  .flex { display: flex; }
  .items-center { align-items: center; }
  .gap-2 { gap: 0.5rem; }
  .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
  .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
  .w-7 { width: 1.75rem; }
  .h-7 { height: 1.75rem; }
  .tracking-\\[0\\.16em\\] { letter-spacing: 0.16em; }
  .text-\\[13px\\] { font-size: 13px; }
  .hidden { display: none; }
  @media (min-width: 768px) {
    .md\\:flex { display: flex; }
    .md\\:block { display: block; }
  }
</style>
</head>
<body>
  <div class="hub-jobs-document" style="width:375px">
    <div class="job-sheet-tabs" role="tablist">${tabs}</div>
  </div>
  <button class="hidden md:flex items-center gap-2 px-2 py-1.5 min-h-11" data-s1-switcher>
    <div class="w-7 h-7"></div>
    <span>Grafter</span>
  </button>
  <button aria-label="Search" class="flex items-center justify-center w-11 h-11 min-h-11" data-s1-search>
    <span>S</span>
  </button>
  <div data-s1-wordmark-host>${wordmark}</div>
</body>
</html>`;
}

type TabMeasure = {
  height: number;
  width: number;
  gaps: number[];
  railScroll: number;
  railClient: number;
  minWidths: string[];
  pad: string[];
};

type HeaderMeasure = {
  switcherH: number;
  searchW: number;
  searchH: number;
  letterSpacing: string;
  fontSize: string;
};

let browser: Awaited<ReturnType<typeof launchBrowser>>;

beforeAll(async () => {
  browser = await launchBrowser();
}, 30000);

afterAll(async () => {
  await browser?.close();
});

describe('S1 phone tabs and 44px header chrome', () => {
  it('keeps a ≥12px gap and ≥44px height for all four job tabs at 375', async () => {
    expect(appShell).toMatch(/min-h-11/);
    const dir = mkdtempSync(join(tmpdir(), 's1-tabs-'));
    const file = join(dir, 'tabs.html');
    writeFileSync(file, tabsHtml());
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    try {
    await page.goto(pathToFileURL(file).href);
    const tabs = await page.evaluate((): TabMeasure => {
      const rail = document.querySelector('.job-sheet-tabs') as HTMLElement;
      const buttons = [...rail.querySelectorAll('.job-sheet-tab')] as HTMLElement[];
      const boxes = buttons.map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          left: r.left,
          right: r.right,
          height: r.height,
          width: r.width,
          padL: parseFloat(cs.paddingLeft) || 0,
          padR: parseFloat(cs.paddingRight) || 0,
        };
      });
      const gaps = boxes.slice(0, -1).map((box, i) => {
        const next = boxes[i + 1];
        return (next.left + next.padL) - (box.right - box.padR);
      });
      return {
        height: Math.min(...boxes.map((b) => b.height)),
        width: Math.min(...boxes.map((b) => b.width)),
        gaps,
        railScroll: rail.scrollWidth,
        railClient: rail.clientWidth,
        minWidths: buttons.map((el) => getComputedStyle(el).minWidth),
        pad: buttons.map((el) => getComputedStyle(el).padding),
      };
    });
    expect(tabs.gaps.length).toBe(3);
    expect(Math.min(...tabs.gaps)).toBeGreaterThanOrEqual(12);
    expect(tabs.height).toBeGreaterThanOrEqual(44);
    // People is the short column so Paperwork 12 / Materials 12 keep an 8px inset at 375.
    expect(tabs.width).toBeGreaterThanOrEqual(56);
    expect(tabs.railScroll).toBeLessThanOrEqual(tabs.railClient + 1);

    await page.setViewportSize({ width: 1024, height: 800 });
    const header = await page.evaluate((): HeaderMeasure => {
      const switcher = document.querySelector('[data-s1-switcher]') as HTMLElement;
      const search = document.querySelector('[data-s1-search]') as HTMLElement;
      const wm = document.querySelector('[data-grafter-wordmark]') as HTMLElement;
      return {
        switcherH: switcher.getBoundingClientRect().height,
        searchW: search.getBoundingClientRect().width,
        searchH: search.getBoundingClientRect().height,
        letterSpacing: getComputedStyle(wm).letterSpacing,
        fontSize: getComputedStyle(wm).fontSize,
      };
    });
    expect(header.switcherH).toBeGreaterThanOrEqual(44);
    expect(header.searchW).toBe(44);
    expect(header.searchH).toBe(44);
    expect(header.fontSize).toBe('13px');
    expect(header.letterSpacing).toBe('2.08px');
    } finally {
      await page.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});
