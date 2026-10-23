// P3 Jobs look frames. Prefers a running LOOK_BASE_URL (auditAuth). Falls back
// to painted static HTML + dist CSS so frames still land in docs/look/p3/.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look/p3';
const WIDTHS = [375, 390, 768, 1024, 1280];
mkdirSync(OUT, { recursive: true });

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/local/bin/google-chrome',
  '/usr/bin/chromium',
].filter((path) => path && existsSync(path));

const browser = await chromium.launch({
  headless: true,
  executablePath: chromeCandidates[0],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

function distCss() {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) return '';
  return readdirSync(dir).filter((n) => n.endsWith('.css'))
    .map((n) => readFileSync(join(dir, n), 'utf8')).join('\n');
}

function wrap(body) {
  const css = distCss();
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>${css}</style></head><body>${body}</body></html>`;
}

function staticList() {
  return wrap(`
  <div class="ops-page hub-jobs hub-jobs-list-doc" style="background:var(--g-bg,#F5F0E6);min-height:100vh;padding:16px">
    <div class="hub-jobs-sheet">
      <div class="hub-jobs-list-body">
        <div class="hub-jobs-list-head">
          <h1 class="ops-page-title">Jobs</h1>
          <button type="button" class="btn-primary">New job</button>
        </div>
        <p class="hub-jobs-list-whisper">12 jobs · 1 need crew</p>
        <div class="hub-jobs-list-search"><input class="form-input search-bar" placeholder="Search jobs or clients" /></div>
        <div class="hub-jobs-list-filters">
          <button class="hub-jobs-list-filter is-on">All 12</button>
          <button class="hub-jobs-list-filter">Scheduled 3</button>
          <button class="hub-jobs-list-filter">In progress 1</button>
          <button class="hub-jobs-list-filter">Completed 4</button>
          <button class="hub-jobs-list-filter">Cancelled 1</button>
          <button class="hub-jobs-list-filter">Need crew 1</button>
          <button class="hub-jobs-list-filter">Ready to invoice 1</button>
        </div>
        <div class="hub-jobs-row">
          <div class="hub-jobs-title">Hot water replacement</div>
          <div class="hub-jobs-phone-line2">#0036 · Stafford · Dean, Tom</div>
          <span class="hub-jobs-pill is-ok">Ready to invoice</span>
        </div>
        <div class="hub-jobs-row">
          <div class="hub-jobs-title">Long title for overflow check #0141.A</div>
          <div class="hub-jobs-phone-line2">#0142 · Stafford · No crew yet</div>
          <span class="hub-jobs-pill is-warn">Needs crew</span>
        </div>
      </div>
    </div>
  </div>`);
}

function staticSheet(tab) {
  const pane = {
    overview: `
      <div class="job-sheet-overview hub-jobs-ledger">
        <div class="job-sheet-overview-main">
          <div class="job-sheet-kv">
            <div class="job-sheet-kv-row"><span class="job-sheet-kv-label">Site</span><span class="job-sheet-kv-value">12 Grange Rd, Stafford <a class="job-sheet-link">Go</a></span></div>
            <div class="job-sheet-kv-row"><span class="job-sheet-kv-label">Client</span><span class="job-sheet-kv-value">P3 Grange Rd</span></div>
            <div class="job-sheet-kv-row"><span class="job-sheet-kv-label">Phone</span><span class="job-sheet-kv-value">0400 000 036 · Call</span></div>
            <div class="job-sheet-kv-row"><span class="job-sheet-kv-label">Crew</span><span class="job-sheet-kv-value">Dean, Tom</span></div>
          </div>
          <section data-job-sheet="notes"><h2>Notes</h2><p class="job-sheet-note-stamp">Tom Nguyen · 07:40</p><p>Flushed the lines.</p></section>
          <section data-job-sheet="photos"><h2>Photos · 7</h2><div class="job-sheet-photo-grid">${'<div class="job-sheet-photo" style="background:#E2D9CC"></div>'.repeat(6)}</div></section>
        </div>
        <div class="job-sheet-overview-side">
          <section data-job-sheet="bill" class="job-sheet-bill">
            <h2>Job bill</h2>
            <p class="job-sheet-bill-row"><span>Budget</span><span>$900.00</span></p>
            <p class="job-sheet-bill-row"><span>Subtotal</span><span>$835.50</span></p>
            <p class="job-sheet-bill-row"><span>GST (10%)</span><span>$83.55</span></p>
            <p class="job-sheet-bill-row is-total"><span>Total inc GST</span><span>$919.05</span></p>
            <a class="job-sheet-link">Edit bill</a>
          </section>
        </div>
      </div>`,
    people: `<div data-job-tab="schedule"><h2>People</h2><p>Dispatch · Date · Start · Crew</p><p>Time on this job</p><button class="btn-primary">Clock on</button></div>`,
    paperwork: `<div data-job-tab="paperwork"><p class="job-sheet-group">Safety</p><p>JHA / SWMS</p><p class="job-sheet-group">Field records</p><p>Visit notes</p><p class="job-sheet-group">Quotes & invoices</p><p>QT #0012</p></div>`,
    materials: `<div data-job-tab="materials" id="job-bill"><h2>Materials</h2><p>4 bill lines</p><p>Total inc GST $919.05</p></div>`,
  }[tab];
  return wrap(`
  <div class="ops-page hub-jobs is-record-open" style="--job-sheet-head-bar:#0A2540;--job-sheet-link:#296AA5;background:var(--g-bg,#F5F0E6);min-height:100vh;padding:16px">
    <a class="hub-jobs-label job-sheet-back" href="/jobs">‹ Jobs</a>
    <article class="hub-jobs-document">
      <header class="hub-jobs-sheet-bar"></header>
      <div class="hub-jobs-sheet-body">
        <div class="job-sheet-head">
          <div class="job-sheet-eyebrow">
            <span class="job-sheet-ref">JOB #0036</span>
            <span class="hub-jobs-pill is-ok">Ready to invoice</span>
          </div>
          <h1 class="hub-jobs-hero">Hot water replacement</h1>
          <p class="job-sheet-site">12 Grange Rd, Stafford</p>
          <p class="job-sheet-when">Mon 19 Oct · 07:00–10:30</p>
          <div class="hub-jobs-tools">
            <button type="button" class="btn-primary ops-next-control-block">Create invoice · $919.05</button>
          </div>
          <p class="job-sheet-sub">4 bill lines · 4.4 h logged</p>
        </div>
        <div class="job-sheet-tabs" role="tablist">
          <button class="job-sheet-tab${tab === 'overview' ? ' is-on' : ''}">Overview</button>
          <button class="job-sheet-tab${tab === 'people' ? ' is-on' : ''}">People</button>
          <button class="job-sheet-tab${tab === 'paperwork' ? ' is-on' : ''}">Paperwork 2</button>
          <button class="job-sheet-tab${tab === 'materials' ? ' is-on' : ''}">Materials 4</button>
        </div>
        ${pane}
      </div>
    </article>
  </div>`);
}

function staticForm() {
  return wrap(`
  <div class="overlay-backdrop hub-ops-form-backdrop job-form-overlay" style="min-height:100vh;display:flex">
    <div class="overlay-panel-xl hub-ops-form-sheet job-form-sheet" data-job-form="1">
      <h2>New job</h2>
      <div class="overlay-body">
        <label class="ops-field-label">Client</label>
        <input class="form-input" value="P3 Grange Rd" />
        <label class="ops-field-label">Site address</label>
        <input class="form-input" value="12 Grange Rd, Stafford" />
      </div>
      <div class="hub-ops-form-footer job-form-footer">
        <button type="button" class="btn-primary">Create job</button>
      </div>
    </div>
  </div>`);
}

async function shot(page, width, path) {
  await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  await page.screenshot({ path, type: 'png', fullPage: true, animations: 'disabled' });
}

async function tryLive(page) {
  try {
    const res = await page.goto(`${BASE}/jobs?auditAuth=1`, { waitUntil: 'domcontentloaded', timeout: 4000 });
    return res && res.ok();
  } catch {
    return false;
  }
}

let page = await browser.newPage();
const live = await tryLive(page);
if (!live) {
  await page.close();
  page = await browser.newPage();
}

if (live) {
  for (const w of WIDTHS) {
    await page.goto(`${BASE}/jobs?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await shot(page, w, `${OUT}/jobs-list-${w}.png`);
    await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.job-sheet-tabs', { timeout: 15000 }).catch(() => {});
    await shot(page, w, `${OUT}/job-overview-${w}.png`);
    for (const [tab, file] of [
      ['schedule', 'people'],
      ['paperwork', 'paperwork'],
      ['materials', 'materials'],
    ]) {
      await page.goto(`${BASE}/jobs/audit-doc-job?auditAuth=1&tab=${tab}`, { waitUntil: 'domcontentloaded' });
      await shot(page, w, `${OUT}/job-${file}-${w}.png`);
    }
    await page.goto(`${BASE}/jobs?auditAuth=1`, { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("New job")').catch(() => {});
    await shot(page, w, `${OUT}/job-form-${w}.png`);
  }
} else {
  const tmp = join(tmpdir(), 'p3-look-work.html');
  for (const w of WIDTHS) {
    writeFileSync(tmp, staticList());
    await page.goto(pathToFileURL(tmp).href);
    await shot(page, w, `${OUT}/jobs-list-${w}.png`);
    writeFileSync(tmp, staticSheet('overview'));
    await page.goto(pathToFileURL(tmp).href);
    await shot(page, w, `${OUT}/job-overview-${w}.png`);
    writeFileSync(tmp, staticSheet('people'));
    await page.goto(pathToFileURL(tmp).href);
    await shot(page, w, `${OUT}/job-people-${w}.png`);
    writeFileSync(tmp, staticSheet('paperwork'));
    await page.goto(pathToFileURL(tmp).href);
    await shot(page, w, `${OUT}/job-paperwork-${w}.png`);
    writeFileSync(tmp, staticSheet('materials'));
    await page.goto(pathToFileURL(tmp).href);
    await shot(page, w, `${OUT}/job-materials-${w}.png`);
    writeFileSync(tmp, staticForm());
    await page.goto(pathToFileURL(tmp).href);
    await shot(page, w, `${OUT}/job-form-${w}.png`);
  }
}

for (const [from, to] of [
  ['job-overview-390.png', 'after-job-390.png'],
  ['job-overview-1280.png', 'after-job-1280.png'],
  ['jobs-list-390.png', 'after-list-390.png'],
  ['jobs-list-1280.png', 'after-list-1280.png'],
  ['job-overview-390.png', 'live-390.png'],
  ['job-overview-1280.png', 'live-1280.png'],
]) {
  copyFileSync(`${OUT}/${from}`, `${OUT}/${to}`);
}

copyFileSync(
  existsSync('docs/look/job-sheet-phone-390.png') ? 'docs/look/job-sheet-phone-390.png' : `${OUT}/job-overview-390.png`,
  `${OUT}/before-job-390.png`,
);
copyFileSync(
  existsSync('docs/look/job-sheet-laptop-1280-document.png') ? 'docs/look/job-sheet-laptop-1280-document.png' : `${OUT}/job-overview-1280.png`,
  `${OUT}/before-job-1280.png`,
);
copyFileSync(
  existsSync('docs/look/jobs-list-phone-390.png') ? 'docs/look/jobs-list-phone-390.png' : `${OUT}/jobs-list-390.png`,
  `${OUT}/before-list-390.png`,
);
copyFileSync(
  existsSync('docs/look/jobs-list-laptop-1280-document.png') ? 'docs/look/jobs-list-laptop-1280-document.png' : `${OUT}/jobs-list-1280.png`,
  `${OUT}/before-list-1280.png`,
);

copyFileSync(`${OUT}/job-overview-390.png`, `${OUT}/job-390-vs-mockup.png`);

await browser.close();
console.log(`wrote ${OUT} frames live=${live}`);
