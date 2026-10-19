/**
 * @vitest-environment node
 */
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandLockup } from './BrandLockup';

async function launchBrowser() {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((path): path is string => !!path && existsSync(path));
  const executablePath = chromeCandidates[0];
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec) as {
        chromium: {
          launch: (opts: { headless: boolean; executablePath?: string; args?: string[] }) => Promise<{
            newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<{
              goto: (url: string) => Promise<unknown>;
              evaluate: <T>(fn: () => T) => Promise<T>;
              close: () => Promise<void>;
            }>;
            close: () => Promise<void>;
          }>;
        };
      };
      return await mod.chromium.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`chromium launch failed: ${errors.join('; ')}`);
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

describe('header Mitre mark size vs wordmark', () => {
  it('renders a 24px mark in the 56px header so mark/bar is 0.43, not 0.29 at 16px', async () => {
    const markup = renderToStaticMarkup(<BrandLockup size="header" />);
    const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  html, body { margin: 0; }
  .shell-header { height: 56px; display: flex; align-items: center; padding: 0 16px; }
  [data-grafter-mark="mitre"] { display: block; flex-shrink: 0; }
</style></head>
<body>
<header class="shell-header">${markup}</header>
</body></html>`;
    const dir = mkdtempSync(join(tmpdir(), 's2-mitre-'));
    temps.push(dir);
    const file = join(dir, 't.html');
    writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 1280, height: 80 } });
    await page.goto(pathToFileURL(file).href);
    const box = await page.evaluate(() => {
      const header = document.querySelector('.shell-header') as HTMLElement | null;
      const mark = document.querySelector('[data-grafter-mark="mitre"]') as SVGElement | null;
      if (!header || !mark) return null;
      const hr = header.getBoundingClientRect();
      const mr = mark.getBoundingClientRect();
      return {
        headerH: +hr.height.toFixed(2),
        markH: +mr.height.toFixed(2),
        markAttr: mark.getAttribute('height'),
        ratio: +(mr.height / hr.height).toFixed(3),
      };
    });
    await page.close();
    expect(box).not.toBeNull();
    expect(box!.headerH).toBe(56);
    expect(Math.abs(box!.ratio - 0.43)).toBeLessThanOrEqual(0.02);
    expect(box!.markH).toBe(24);
    expect(box!.markAttr).toBe('24');
    expect(box!.ratio).toBeGreaterThanOrEqual(0.41);
    expect(box!.ratio).toBeLessThanOrEqual(0.45);
  }, 30000);
});
