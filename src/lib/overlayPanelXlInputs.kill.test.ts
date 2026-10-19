import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

async function compileIndexCss(): Promise<string> {
  const src = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
  const result = await postcss([
    tailwindcss({ config: join(process.cwd(), 'tailwind.config.js') }),
    autoprefixer,
  ]).process(src, { from: join(process.cwd(), 'src/index.css') });
  return result.css;
}

function fixtureHtml(css: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
</head>
<body>
  <div class="overlay-panel-xl" style="width:1024px">
    <input
      type="color"
      class="h-7 w-10 cursor-pointer rounded border border-rule bg-white"
      aria-label="Another colour"
    />
    <label>
      <input type="checkbox" class="rounded border-gray-300" aria-label="Include employee" />
      Worker
    </label>
    <input type="search" placeholder="Search…" class="w-full min-w-0" />
  </div>
</body>
</html>`;
}

type Boxes = { colour: number; checkbox: number; search: number };

let browser: Awaited<ReturnType<typeof launchBrowser>>;
let css: string;

beforeAll(async () => {
  css = await compileIndexCss();
  browser = await launchBrowser();
}, 60000);

afterAll(async () => {
  await browser?.close();
});

describe('overlay-panel-xl does not stretch non-search inputs', () => {
  it('keeps the Job details colour picker at 40px and the expense checkbox unstretched', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'overlay-xl-'));
    const file = join(dir, 'overlay.html');
    writeFileSync(file, fixtureHtml(css));
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(pathToFileURL(file).href);
    const boxes = await page.evaluate((): Boxes => {
      const colour = document.querySelector('input[aria-label="Another colour"]') as HTMLElement;
      const checkbox = document.querySelector('input[aria-label="Include employee"]') as HTMLElement;
      const search = document.querySelector('input[type="search"]') as HTMLElement;
      return {
        colour: colour.getBoundingClientRect().width,
        checkbox: checkbox.getBoundingClientRect().width,
        search: search.getBoundingClientRect().width,
      };
    });
    await page.close();
    expect(boxes.colour).toBe(40);
    expect(boxes.checkbox).toBeLessThan(40);
    expect(boxes.search).toBeGreaterThan(300);
  }, 30000);
});
