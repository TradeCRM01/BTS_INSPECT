import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire('/tmp/pw/package.json');
const { chromium } = require('playwright-core') as {
  chromium: {
    launch: (opts: { headless: boolean; executablePath?: string }) => Promise<{
      newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<{
        goto: (url: string) => Promise<unknown>;
        evaluate: (fn: (host: string) => unknown, host: string) => Promise<unknown>;
        close: () => Promise<void>;
      }>;
      close: () => Promise<void>;
    }>;
  };
};

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

function fixtureHtml(hostClass: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${css}</style>
<style>
  body { margin: 0; background: #F5F0E6; }
  .measure-host { width: 375px; }
</style>
</head>
<body>
  <div class="${hostClass} measure-host">
    <form class="job-client-phone">
      <input class="form-input-sm field-inline-invalid" value="abc" />
      <button type="button" class="job-client-phone-save">Save</button>
      <p class="field-inline-error text-fail">Enter an Australian phone number</p>
    </form>
  </div>
</body>
</html>`;
}

function measure(host: string) {
  const form = document.querySelector(`.${host} form.job-client-phone`) as HTMLElement | null;
  const input = form?.querySelector('input') as HTMLElement | null;
  const error = form?.querySelector('.field-inline-error') as HTMLElement | null;
  if (!form || !input || !error) return null;
  const formBox = form.getBoundingClientRect();
  const inputBox = input.getBoundingClientRect();
  const errorBox = error.getBoundingClientRect();
  return {
    inputWidth: inputBox.width,
    inputBottom: inputBox.bottom,
    errorTop: errorBox.top,
    errorRight: errorBox.right,
    formRight: formBox.right,
    innerWidth: window.innerWidth,
    clipped: inputBox.width < 40 || input.scrollWidth > input.clientWidth + 1,
  };
}

let browser: Awaited<ReturnType<typeof chromium.launch>>;

beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  });
}, 30000);

afterAll(async () => {
  await browser?.close();
});

async function measureHost(hostClass: string) {
  const dir = mkdtempSync(join(tmpdir(), 'job-client-layout-'));
  const file = join(dir, `${hostClass}.html`);
  writeFileSync(file, fixtureHtml(hostClass));
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto(pathToFileURL(file).href);
  const result = await page.evaluate(measure, hostClass);
  await page.close();
  return result;
}

describe('job client phone error layout', () => {
  it('puts the job sheet phone error under a full-width input at 375', async () => {
    const result = await measureHost('job-cal-host');
    expect(result).toBeTruthy();
    expect(result!.inputWidth).toBeGreaterThan(200);
    expect(result!.errorTop).toBeGreaterThanOrEqual(result!.inputBottom - 1);
    expect(result!.formRight).toBeLessThanOrEqual(result!.innerWidth + 1);
    expect(result!.clipped).toBe(false);
  }, 30000);

  it('puts the Quote Send SMS-To error under a full-width input at 375', async () => {
    const result = await measureHost('hub-invoice-send');
    expect(result).toBeTruthy();
    expect(result!.inputWidth).toBeGreaterThan(200);
    expect(result!.errorTop).toBeGreaterThanOrEqual(result!.inputBottom - 1);
    expect(result!.formRight).toBeLessThanOrEqual(result!.innerWidth + 1);
    expect(result!.clipped).toBe(false);
  }, 30000);
});
