import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type CdpNode = {
  backendNodeId?: number;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
};

type CdpSession = {
  send: (method: string, params?: Record<string, unknown>) => Promise<{
    root?: CdpNode;
    model?: { width: number; height: number };
  }>;
};

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: () => T) => Promise<T>;
  locator: (selector: string) => {
    click: () => Promise<void>;
    fill: (value: string) => Promise<void>;
    inputValue: () => Promise<string>;
  };
  context: () => { newCDPSession: (page: KillPage) => Promise<CdpSession> };
  close: () => Promise<void>;
};

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
      const mod = await import(spec) as {
        chromium: {
          launch: (opts: { headless: boolean; executablePath?: string }) => Promise<{
            newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<KillPage>;
            close: () => Promise<void>;
          }>;
        };
      };
      return await mod.chromium.launch({ headless: true, executablePath });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`chromium launch failed: ${errors.join('; ')}`);
}

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) {
    throw new Error('dist/assets missing; run npm run build');
  }
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (files.length === 0) {
    throw new Error('no dist CSS; run npm run build');
  }
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
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
    <input type="search" placeholder="Search…" class="w-full min-w-0 min-h-[44px]" />
  </div>
</body>
</html>`;
}

function findCancelButton(node: CdpNode | undefined): CdpNode | null {
  if (!node) return null;
  const attrs = node.attributes || [];
  for (let i = 0; i < attrs.length; i += 2) {
    if (attrs[i] === 'pseudo' && attrs[i + 1] === '-webkit-search-cancel-button') return node;
  }
  for (const shadow of node.shadowRoots || []) {
    const hit = findCancelButton(shadow);
    if (hit) return hit;
  }
  for (const child of node.children || []) {
    const hit = findCancelButton(child);
    if (hit) return hit;
  }
  return null;
}

let browser: Awaited<ReturnType<typeof launchBrowser>>;
const temps: string[] = [];

beforeAll(async () => {
  browser = await launchBrowser();
}, 60000);

afterAll(async () => {
  await browser?.close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe('overlay search hides Chromium native cancel on built CSS', () => {
  it('types into the dist CSS search input and leaves ::-webkit-search-cancel-button with no box', async () => {
    const css = readDistCss();
    const dir = mkdtempSync(join(tmpdir(), 'overlay-cancel-'));
    temps.push(dir);
    const file = join(dir, 'overlay.html');
    writeFileSync(file, fixtureHtml(css));
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(pathToFileURL(file).href);
    const input = page.locator('input[type="search"]');
    await input.click();
    await input.fill('pump');
    expect(await input.inputValue()).toBe('pump');

    const inputChrome = await page.evaluate(() => {
      const el = document.querySelector('input[type="search"]') as HTMLInputElement;
      const cs = getComputedStyle(el);
      const cancel = getComputedStyle(el, '::-webkit-search-cancel-button');
      return {
        appearance: cs.webkitAppearance || cs.getPropertyValue('-webkit-appearance'),
        height: cs.height,
        cancelAppearance: cancel.webkitAppearance || cancel.getPropertyValue('-webkit-appearance'),
      };
    });
    expect(inputChrome.appearance).toBe('textfield');
    expect(inputChrome.height).toBe('44px');

    const session = await page.context().newCDPSession(page);
    const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
    const cancel = findCancelButton(root);
    expect(cancel?.backendNodeId).toBeTruthy();
    const box = await session.send('DOM.getBoxModel', { backendNodeId: cancel!.backendNodeId });
    const width = box.model?.width ?? 0;
    const height = box.model?.height ?? 0;
    await page.close();
    // Chromium's getComputedStyle on this pseudo falls back to the input
    // (textfield). The kill is the UA cancel box: none, or no box.
    expect(
      inputChrome.cancelAppearance === 'none' || (width === 0 && height === 0),
    ).toBe(true);
    expect(width).toBe(0);
    expect(height).toBe(0);
  }, 30000);
});
