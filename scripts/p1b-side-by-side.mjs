import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const ART = '/opt/cursor/artifacts/p1b';
const DOC = 'docs/look/p1b';
mkdirSync(ART, { recursive: true });
mkdirSync(DOC, { recursive: true });

const pairs = [
  {
    name: 'p1b-today-390-mockup-vs-after.png',
    mock: '/workspace/docs/look/quote-paper-reference.png',
    after: join(DOC, 'p1b-today-after-390-view.png'),
    width: 900,
  },
  {
    name: 'p1b-today-1280-mockup-vs-after.png',
    mock: '/workspace/docs/look/jobs-list-laptop-1280-document.png',
    after: join(DOC, 'p1b-today-after-1280-view.png'),
    width: 1600,
  },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const pair of pairs) {
  const page = await browser.newPage({ viewport: { width: pair.width, height: 1100 } });
  await page.setContent(`<!doctype html>
<html><body style="margin:0;background:#E8E8EC;font-family:sans-serif">
  <div style="display:flex;gap:16px;padding:16px;align-items:flex-start">
    <figure style="margin:0">
      <figcaption style="margin:0 0 8px;font:600 13px sans-serif">Mockup</figcaption>
      <img src="${pathToFileURL(pair.mock).href}" style="max-width:100%;height:auto;background:#fff" />
    </figure>
    <figure style="margin:0">
      <figcaption style="margin:0 0 8px;font:600 13px sans-serif">After</figcaption>
      <img src="${pathToFileURL(pair.after).href}" style="max-width:100%;height:auto;background:#fff" />
    </figure>
  </div>
</body></html>`);
  await page.waitForTimeout(200);
  await page.screenshot({
    path: join(DOC, pair.name),
    type: 'png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.screenshot({
    path: join(ART, pair.name),
    type: 'png',
    fullPage: true,
    animations: 'disabled',
  });
  console.log('wrote', pair.name);
  await page.close();
}

await browser.close();
