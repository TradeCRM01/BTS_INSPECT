// Proves the guided visit-note composer posts one composed note on the real job sheet
// without Supabase credentials. Runs the DEV look harness (/jobs/audit-doc-job?look=visit-notes)
// against a dev server whose .env points VITE_SUPABASE_URL at a host this script intercepts,
// so the page's own handlers run end to end and the job_visit_notes insert is captured here.
// Run: node scripts/prove-visit-note-composer-harness.mjs
// Needs a dev server on LOOK_BASE_URL (default http://127.0.0.1:5173) started with that .env.
// Writes docs/proof/visit-note-composer/harness-*.png and harness-notes.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/visit-note-composer';
const HARNESS = '/jobs/audit-doc-job?look=visit-notes';

const SECTION_KEYS = ['done', 'left', 'parts_used', 'parts_needed', 'customer_wants'];
const SECTION_LABELS = ['Done', 'Left to do', 'Parts used', 'Parts needed next visit', 'Customer wants'];

// parts_needed stays empty on purpose so the composed body proves omission.
const FILL = {
  done: '  Replaced the failed unit and tested the run.  ',
  left: 'Tidy the run and label the board.',
  parts_used: '1 unit, 3 m of 20 mm pipe, 4 saddles.',
  parts_needed: '',
  customer_wants: 'A quote for the upstairs run.',
};
const EXPECTED_BODY = [
  'Done:\nReplaced the failed unit and tested the run.',
  'Left to do:\nTidy the run and label the board.',
  'Parts used:\n1 unit, 3 m of 20 mm pipe, 4 saddles.',
  'Customer wants:\nA quote for the upstairs run.',
].join('\n\n');

function envValue(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env')) return null;
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

const supabaseUrl = envValue('VITE_SUPABASE_URL');
if (!supabaseUrl) throw new Error('need VITE_SUPABASE_URL in .env so the harness knows which host to intercept');

mkdirSync(OUT, { recursive: true });
const notes = { base: BASE, supabaseUrl, expectedBody: EXPECTED_BODY, startedAt: new Date().toISOString() };
const failures = [];
function check(name, ok, detail) {
  notes[name] = { ok, ...detail };
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ? JSON.stringify(detail) : '');
}

async function interceptSupabase(context, inserts) {
  await context.route(`${supabaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/rest/v1/job_visit_notes' && request.method() === 'POST') {
      inserts.push(JSON.parse(request.postData()));
      return json({ id: `harness-note-${inserts.length}` }, 201);
    }
    return json([]);
  });
}

async function waitFor(predicate, label, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-visit-notes .job-visit-log', { timeout: 30000 });
  await page.waitForFunction(() => {
    const tray = document.querySelector('#job-visit-notes');
    return tray?.textContent?.includes('Fitted the new unit') && tray?.textContent?.includes('Alex Reed');
  }, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
}

async function readComposer(page) {
  return page.evaluate((keys) => {
    const compose = document.querySelector('#job-visit-notes .job-visit-compose');
    const fields = keys.map((key) => {
      const el = compose?.querySelector(`[data-visit-section="${key}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        key,
        tag: el.tagName.toLowerCase(),
        ariaLabel: el.getAttribute('aria-label'),
        hairline: el.classList.contains('job-visit-hairline'),
        width: Math.round(r.width),
        height: Math.round(r.height),
        visible: r.width > 0 && r.height > 0,
      };
    });
    const post = document.querySelector('#job-visit-notes .job-visit-post');
    return {
      fields,
      order: [...(compose?.querySelectorAll('[data-visit-section]') ?? [])].map((el) => el.getAttribute('data-visit-section')),
      photoInput: !!document.querySelector('#job-visit-photo-input'),
      addPhotos: document.querySelector('#job-visit-notes .job-visit-photo-add')?.textContent?.trim() ?? null,
      postText: post?.textContent?.trim() ?? null,
      postDisabled: post ? post.disabled : null,
      postCount: document.querySelectorAll('#job-visit-notes .job-visit-post').length,
      textareaCount: document.querySelectorAll('#job-visit-notes .job-visit-compose textarea').length,
      viewW: window.innerWidth,
    };
  }, SECTION_KEYS);
}

async function readWall(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('#job-visit-notes .job-visit-log .job-visit-row')];
    return rows.map((row) => ({
      stamp: row.querySelector('.job-visit-stamp')?.textContent?.trim() ?? null,
      labels: [...row.querySelectorAll('.job-visit-body .job-visit-section-label')].map((el) => el.textContent.trim()),
      paragraphs: [...row.querySelectorAll('.job-visit-body p')].map((p) => p.textContent.trim()),
    }));
  });
}

async function fillComposer(page) {
  for (const key of SECTION_KEYS) {
    if (FILL[key]) await page.fill(`#job-visit-notes .job-visit-compose [data-visit-section="${key}"]`, FILL[key]);
  }
}

function checkInsert(tag, inserts) {
  const row = inserts[0];
  check(`${tag}ExactlyOneInsert`, inserts.length === 1, { count: inserts.length });
  check(`${tag}BodyIsComposedInOrderWithEmptySectionOmitted`, row?.body === EXPECTED_BODY, { body: row?.body ?? null });
  check(`${tag}RowCarriesAuthorJobAndCompany`,
    typeof row?.author_name === 'string' && row.author_name.length > 0
    && typeof row?.job_id === 'string' && row.job_id.length > 0
    && typeof row?.company_id === 'string' && row.company_id.length > 0
    && typeof row?.author_id === 'string' && row.author_id.length > 0,
    { author_name: row?.author_name ?? null, job_id: row?.job_id ?? null, company_id: row?.company_id ?? null, author_id: row?.author_id ?? null });
}

async function proveViewport(browser, tag, viewport, shot) {
  const inserts = [];
  const context = await browser.newContext({ viewport, locale: 'en-AU', timezoneId: 'Australia/Brisbane', ...(tag === 'phone' ? { isMobile: true, hasTouch: true } : {}) });
  await interceptSupabase(context, inserts);
  const page = await context.newPage();
  page.on('pageerror', (err) => { notes.pageErrors = [...(notes.pageErrors || []), `${tag}: ${String(err)}`]; });
  await openHarness(page);

  const before = await readComposer(page);
  check(`${tag}ComposerHasFiveSectionFieldsInOrder`,
    before.order.join(',') === SECTION_KEYS.join(',')
    && before.textareaCount === 5
    && before.fields.every((f, i) => f && f.tag === 'textarea' && f.visible && f.hairline && f.ariaLabel === SECTION_LABELS[i]),
    { order: before.order, fields: before.fields, viewW: before.viewW });
  check(`${tag}PostDisabledWhileAllSectionsEmpty`, before.postDisabled === true && before.postCount === 1 && before.postText === 'Post note', { postDisabled: before.postDisabled, postText: before.postText, postCount: before.postCount });
  check(`${tag}KeepsAddPhotosBarAndInput`, before.photoInput && before.addPhotos === 'Add photos', { photoInput: before.photoInput, addPhotos: before.addPhotos });

  await fillComposer(page);
  const filled = await readComposer(page);
  check(`${tag}PostEnabledOnceASectionHasText`, filled.postDisabled === false, { postDisabled: filled.postDisabled });
  if (tag === 'phone') {
    check('phoneFieldsFitOneColumn', filled.fields.every((f) => f && f.width <= 390 && f.width >= 300 && f.height >= 28), { fields: filled.fields.map((f) => ({ key: f.key, width: f.width, height: f.height })) });
  }

  await page.evaluate(() => document.querySelector('#job-visit-notes')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${shot}` });

  await page.click('#job-visit-notes .job-visit-post');
  await waitFor(() => inserts.length >= 1, `${tag} visit-note insert`);
  await page.waitForTimeout(500);
  checkInsert(tag, inserts);
  const after = await readComposer(page);
  check(`${tag}ComposerClearsAfterPost`, after.postDisabled === true && (await page.$$eval('#job-visit-notes .job-visit-compose textarea', (els) => els.every((el) => el.value === ''))), { postDisabled: after.postDisabled });

  const wall = await readWall(page);
  const composed = wall.find((r) => r.paragraphs.some((p) => p.includes('Fitted the new unit')));
  const free = wall.find((r) => r.paragraphs.some((p) => p.includes('Pulled the old unit')));
  check(`${tag}WallShowsSectionLabelsOnComposedNote`,
    !!composed && composed.labels.join('|') === 'Done|Left to do|Parts used|Customer wants'
    && composed.paragraphs.length === 4
    && composed.paragraphs[0] === 'DoneFitted the new unit. Tested and running.',
    { labels: composed?.labels ?? null, paragraphs: composed?.paragraphs ?? null, stamp: composed?.stamp ?? null });
  check(`${tag}WallRendersFreeTextNoteWithoutLabels`,
    !!free && free.labels.length === 0 && free.paragraphs.length === 1 && free.paragraphs[0] === 'Pulled the old unit. Left the isolator tagged.',
    { labels: free?.labels ?? null, paragraphs: free?.paragraphs ?? null });

  notes[`${tag}Inserts`] = inserts;
  await context.close();
}

const browser = await chromium.launch({ headless: true });
await proveViewport(browser, 'laptop', { width: 1280, height: 900 }, 'harness-laptop-1280.png');
await proveViewport(browser, 'phone', { width: 390, height: 844 }, 'harness-phone-390.png');
await browser.close();

check('noPageErrors', !notes.pageErrors, { pageErrors: notes.pageErrors ?? [] });
notes.finishedAt = new Date().toISOString();
notes.failures = failures;
writeFileSync(`${OUT}/harness-notes.json`, JSON.stringify(notes, null, 2));
if (failures.length) {
  console.error('FAILED', failures);
  process.exitCode = 1;
} else {
  console.log('ALL PASS', `${OUT}/harness-notes.json`);
}
