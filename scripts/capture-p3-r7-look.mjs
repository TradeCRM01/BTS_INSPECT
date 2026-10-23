// P3 r7 LOOK frames from the vite DEV app (auditAuth), not the esbuild harness.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const DOCS = 'docs/look/p3';
const ART = process.env.P3_R7_OUT || '/opt/cursor/artifacts/p3-r7';
mkdirSync(DOCS, { recursive: true });
mkdirSync(ART, { recursive: true });

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/local/bin/google-chrome',
  '/usr/bin/chromium',
].filter((path) => path && existsSync(path));

const DUPES = [
  `${DOCS}/after-job-390.png`,
  `${DOCS}/after-job-1280.png`,
  `${DOCS}/after-list-390.png`,
  `${DOCS}/after-list-1280.png`,
  `${DOCS}/live-390.png`,
  `${DOCS}/live-1280.png`,
  `${DOCS}/job-390-vs-mockup.png`,
];
for (const file of DUPES) {
  if (existsSync(file)) rmSync(file);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeCandidates[0],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function open(width, height = width <= 430 ? 844 : 900) {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: 'Australia/Brisbane',
  });
  const page = await context.newPage();
  return { context, page };
}

async function waitReady(page, sel, extra = 250) {
  await page.waitForSelector(sel, { timeout: 30000, state: 'attached' });
  await page.waitForTimeout(extra);
}

async function shot(page, path) {
  await page.screenshot({ path, type: 'png', fullPage: true, animations: 'disabled' });
}

const health = await fetch(`${BASE}/jobs?auditAuth=1&look=jobs-list`).then((res) => res.ok).catch(() => false);
if (!health) {
  await browser.close();
  throw new Error(`vite DEV is not up at ${BASE}`);
}

const listWidths = [375, 390, 768, 1024, 1280];
for (const w of listWidths) {
  const { context, page } = await open(w);
  await page.goto(`${BASE}/jobs?auditAuth=1&look=jobs-list`, { waitUntil: 'domcontentloaded' });
  await waitReady(page, '.hub-jobs-list-whisper');
  await shot(page, `${DOCS}/jobs-list-${w}.png`);
  if (w === 390) await shot(page, `${ART}/390-list.png`);
  await context.close();
}

const sheetTabs = ['overview', 'people', 'paperwork', 'materials'];
for (const w of listWidths) {
  const { context, page } = await open(w);
  await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1`, { waitUntil: 'domcontentloaded' });
  await waitReady(page, 'h1.hub-jobs-hero');
  await shot(page, `${DOCS}/job-overview-${w}.png`);
  if (w === 390) {
    await shot(page, `${ART}/390-sheet.png`);
    const tabs = page.locator('.job-sheet-tabs');
    if (await tabs.count()) {
      await tabs.screenshot({ path: `${ART}/390-tabs.png`, animations: 'disabled' });
    }
  }
  if (w === 1280) await shot(page, `${ART}/1280-sheet.png`);
  for (const tab of sheetTabs.slice(1)) {
    await page.evaluate((label) => {
      const el = [...document.querySelectorAll('.job-sheet-tab')].find((node) => (
        (node.textContent || '').toLowerCase().includes(label)
      ));
      el?.click();
    }, tab);
    await page.waitForTimeout(200);
    await shot(page, `${DOCS}/job-${tab}-${w}.png`);
  }
  await context.close();
}

for (const w of listWidths) {
  const { context, page } = await open(w);
  await page.goto(`${BASE}/jobs?auditAuth=1&look=jobs-list`, { waitUntil: 'domcontentloaded' });
  await waitReady(page, '.hub-jobs-list-whisper');
  const newBtn = page.locator('[data-jobs-new="1"]');
  if (await newBtn.count()) {
    await newBtn.click();
    await page.waitForSelector('[data-job-form="1"]', { timeout: 15000 });
    await page.waitForTimeout(200);
  }
  await shot(page, `${DOCS}/job-form-${w}.png`);
  if (w === 390) await shot(page, `${ART}/390-edit.png`);
  await context.close();
}

const mockCandidates = [
  '/home/ubuntu/.cursor/projects/workspace/uploads/job-390-light_dd3f.html',
  'html/job-390-light.html',
];
const mockSrc = mockCandidates.find((path) => existsSync(path));
if (mockSrc) {
  const raw = readFileSync(mockSrc, 'utf8');
  const tokens = existsSync('src/styles/tokens.css') ? readFileSync('src/styles/tokens.css', 'utf8') : '';
  const html = raw.replace('</head>', `<style>
html,body{margin:0;background:#F5F5F7;color:#0A0A0B}
.btn-primary{background:#0A0A0B;color:#fff}
.appbar .back svg,.appbar .back .ic{color:#2E75B6}
.eyebrow{text-transform:uppercase;letter-spacing:0.08em}
${tokens}
</style></head>`);
  const mockFile = join(tmpdir(), 'p3-r7-mock.html');
  writeFileSync(mockFile, html);
  const { context, page } = await open(390);
  await page.goto(pathToFileURL(mockFile).href);
  await page.waitForTimeout(200);
  await shot(page, `${ART}/390-mockup.png`);
  await context.close();

  const vs = await browser.newContext({ viewport: { width: 800, height: 900 } });
  const vsPage = await vs.newPage();
  const left = readFileSync(`${ART}/390-mockup.png`).toString('base64');
  const right = readFileSync(`${ART}/390-sheet.png`).toString('base64');
  await vsPage.setContent(`<!doctype html><html><body style="margin:0;background:#111;display:flex">
<div style="flex:1;background:#fff"><img src="data:image/png;base64,${left}" style="width:100%;display:block"/></div>
<div style="flex:1;background:#fff"><img src="data:image/png;base64,${right}" style="width:100%;display:block"/></div>
</body></html>`);
  await vsPage.waitForTimeout(100);
  await vsPage.screenshot({ path: `${ART}/390-sheet-vs-mockup.png`, type: 'png', fullPage: true, animations: 'disabled' });
  await vsPage.screenshot({ path: `${DOCS}/job-390-vs-mockup.png`, type: 'png', fullPage: true, animations: 'disabled' });
  await vs.close();
}

await browser.close();
console.log(`wrote unique vite-DEV frames to ${DOCS} and ${ART}`);
