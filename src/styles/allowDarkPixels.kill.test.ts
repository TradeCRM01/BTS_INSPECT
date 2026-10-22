import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  screenshot: (opts?: { type?: 'png' }) => Promise<Buffer>;
  evaluate: <T>(fn: () => T) => Promise<T>;
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

function fixture(attr: string): string {
  const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');
  return `<!doctype html>
<html${attr}>
<head>
<meta charset="utf-8" />
<style>
${tokens}
body, .shell-header { margin:0; background: var(--g-nav-bg); color: var(--g-nav-ink); }
.page { width: 320px; height: 80px; background: var(--g-bg); color: var(--g-ink); }
</style>
</head>
<body>
  <header class="shell-header"><div class="page">Grafter</div></header>
</body>
</html>`;
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

async function shoot(html: string): Promise<{ png: Buffer; bg: string; ink: string }> {
  const dir = mkdtempSync(join(tmpdir(), 's2-allow-dark-'));
  temps.push(dir);
  const file = join(dir, 't.html');
  writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: 320, height: 80 } });
  await page.goto(pathToFileURL(file).href);
  const vars = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      bg: cs.getPropertyValue('--g-bg').trim(),
      ink: cs.getPropertyValue('--g-ink').trim(),
    };
  });
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return { png, ...vars };
}

describe('allowDark tokens-only probe (not a kill; S1 loads built CSS on the real shell)', () => {
  it('tokens.css alone: hand-set data-theme=dark while allowDark is false leaves Light tokens (not a kill)', async () => {
    const light = await shoot(fixture(' data-theme="light"'));
    const forced = await shoot(fixture(' data-theme="dark"'));
    const allowed = await shoot(fixture(' data-allow-dark="true" data-theme="dark"'));
    expect(forced.bg).toBe(light.bg);
    expect(forced.ink).toBe(light.ink);
    expect(forced.bg).toBe('#F5F5F7');
    expect(Buffer.compare(forced.png, light.png)).toBe(0);
    expect(allowed.bg).toBe('#0A0A0B');
    expect(Buffer.compare(allowed.png, light.png)).not.toBe(0);
  }, 30000);
});
