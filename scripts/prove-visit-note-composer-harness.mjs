// Proves the Job notes & photos field flow posts one composed note, with a photo attached on
// the same update, on the real job sheet without Supabase credentials. Runs the DEV look
// harness (/jobs/audit-doc-job?look=visit-notes) against a dev server whose .env points
// VITE_SUPABASE_URL at a host this script intercepts, so the page's own handlers run end to
// end and the job_visit_notes / job_photos inserts are captured here.
// Run: node scripts/prove-visit-note-composer-harness.mjs
// Needs a dev server on LOOK_BASE_URL (default http://127.0.0.1:5173) started with that .env.
// Writes docs/proof/visit-note-composer/harness-*.png and harness-notes.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { plainPhotoFile, renderJpeg } from './lib/photo-proof.mjs';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/visit-note-composer';
const HARNESS = '/jobs/audit-doc-job?look=visit-notes';

const SECTION_KEYS = ['done', 'left', 'parts_used', 'parts_needed', 'customer_wants'];

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
const SECOND_DONE = 'Second pass done.';
const EXPECTED_SECOND_BODY = 'Done:\nSecond pass done.\n\nLeft to do:\nAll done';

function envValue(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env')) return null;
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

const supabaseUrl = envValue('VITE_SUPABASE_URL');
if (!supabaseUrl) throw new Error('need VITE_SUPABASE_URL in .env so the harness knows which host to intercept');

mkdirSync(OUT, { recursive: true });
const notes = { base: BASE, supabaseUrl, expectedBody: EXPECTED_BODY, expectedSecondBody: EXPECTED_SECOND_BODY, startedAt: new Date().toISOString() };
const failures = [];
function check(name, ok, detail) {
  notes[name] = { ok, ...detail };
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ? JSON.stringify(detail) : '');
}

async function interceptSupabase(context, inserts, photoInserts) {
  await context.route(`${supabaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/rest/v1/job_visit_notes' && request.method() === 'POST') {
      inserts.push(JSON.parse(request.postData()));
      return json({ id: `harness-note-${inserts.length}` }, 201);
    }
    if (url.pathname.startsWith('/storage/v1/object/') && request.method() === 'POST') {
      return json({ Key: url.pathname.replace('/storage/v1/object/', ''), Id: crypto.randomUUID() });
    }
    if (url.pathname === '/rest/v1/job_photos' && request.method() === 'POST') {
      const row = JSON.parse(request.postData());
      photoInserts.push(row);
      return json({ ...row, caption: null, created_at: new Date().toISOString() }, 201);
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
  await page.waitForSelector('#job-visit-notes .job-notes-compose', { timeout: 30000 });
  await page.waitForFunction(() => {
    const tray = document.querySelector('#job-visit-notes');
    return tray?.textContent?.includes('Job notes & photos') && tray?.textContent?.includes('New update');
  }, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
}

async function readComposer(page) {
  return page.evaluate((keys) => {
    const compose = document.querySelector('#job-visit-notes .job-notes-compose');
    const visibleRect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // checkVisibility sees through a closed <details>, whose children still report a box in Chrome.
      return { width: Math.round(r.width), height: Math.round(r.height), visible: el.checkVisibility() };
    };
    const fields = Object.fromEntries(keys.map((key) => {
      const el = compose?.querySelector(`textarea[data-visit-section="${key}"]`);
      return [key, el ? { ...visibleRect(el), value: el.value, ariaLabel: el.getAttribute('aria-label') } : null];
    }));
    const post = document.querySelector('#job-visit-notes .job-notes-post');
    const primary = document.querySelector('#job-visit-notes .job-notes-primary');
    const tabs = [...document.querySelectorAll('#job-visit-notes .job-notes-tab')];
    return {
      fields,
      selectedTab: tabs.find((t) => t.getAttribute('aria-selected') === 'true')?.getAttribute('data-tab') ?? null,
      historyCount: document.querySelector('#job-visit-notes .job-notes-tab-count')?.textContent?.trim() ?? null,
      photoInput: !!document.querySelector('#job-visit-photo-input'),
      galleryInput: !!document.querySelector('#job-visit-gallery-input'),
      photoCount: document.querySelector('#job-visit-notes .job-visit-photo-count')?.textContent?.trim() ?? null,
      primaryText: primary?.textContent?.trim() ?? null,
      primaryFilled: primary?.classList.contains('is-filled') ?? null,
      primaryRect: visibleRect(primary),
      postText: post?.textContent?.trim() ?? null,
      postDisabled: post ? post.disabled : null,
      postFilled: post?.classList.contains('is-filled') ?? null,
      postRect: visibleRect(post),
      postCount: document.querySelectorAll('#job-visit-notes .job-visit-post').length,
      outcome: [...document.querySelectorAll('#job-visit-notes [data-outcome]')].find((b) => b.getAttribute('aria-pressed') === 'true')?.getAttribute('data-outcome') ?? null,
      moreOpen: document.querySelector('#job-visit-notes details.job-notes-more')?.open ?? null,
      textareaCount: document.querySelectorAll('#job-visit-notes .job-notes-compose textarea').length,
      visibleTextareaCount: [...document.querySelectorAll('#job-visit-notes .job-notes-compose textarea')].filter((el) => visibleRect(el).visible).length,
      viewW: window.innerWidth,
    };
  }, SECTION_KEYS);
}

function fieldSelector(key) {
  return `#job-visit-notes .job-notes-compose textarea[data-visit-section="${key}"]`;
}

function allFieldsEmpty(state) {
  return Object.values(state.fields).every((f) => !f || f.value === '');
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

function checkInsert(tag, inserts, index, expectedBody) {
  const row = inserts[index];
  check(`${tag}InsertCount${index + 1}`, inserts.length === index + 1, { count: inserts.length });
  check(`${tag}Body${index + 1}IsComposedInOrderWithEmptySectionOmitted`, row?.body === expectedBody, { body: row?.body ?? null, expected: expectedBody });
  check(`${tag}Row${index + 1}CarriesAuthorJobAndCompany`,
    typeof row?.author_name === 'string' && row.author_name.length > 0
    && typeof row?.job_id === 'string' && row.job_id.length > 0
    && typeof row?.company_id === 'string' && row.company_id.length > 0
    && typeof row?.author_id === 'string' && row.author_id.length > 0,
    { author_name: row?.author_name ?? null, job_id: row?.job_id ?? null, company_id: row?.company_id ?? null, author_id: row?.author_id ?? null });
}

async function proveViewport(browser, tag, viewport, shot, photoJpeg) {
  const inserts = [];
  const photoInserts = [];
  const context = await browser.newContext({ viewport, locale: 'en-AU', timezoneId: 'Australia/Brisbane', ...(tag === 'phone' ? { isMobile: true, hasTouch: true } : {}) });
  await interceptSupabase(context, inserts, photoInserts);
  const page = await context.newPage();
  page.on('pageerror', (err) => { notes.pageErrors = [...(notes.pageErrors || []), `${tag}: ${String(err)}`]; });
  await openHarness(page);

  const before = await readComposer(page);
  check(`${tag}NewUpdateTabSelectedWithHistoryCount`, before.selectedTab === 'new' && before.historyCount === '3', { selectedTab: before.selectedTab, historyCount: before.historyCount });
  check(`${tag}OnlyDoneFieldVisibleBeforeInteraction`,
    before.visibleTextareaCount === 1
    && before.fields.done?.visible === true && before.fields.done?.ariaLabel === 'What did you do?'
    && before.fields.left === null && before.moreOpen === false
    && ['parts_used', 'parts_needed', 'customer_wants'].every((key) => before.fields[key]?.visible === false),
    { visibleTextareaCount: before.visibleTextareaCount, fields: before.fields, moreOpen: before.moreOpen, viewW: before.viewW });
  check(`${tag}PostUpdateDisabledWhileEmpty`, before.postDisabled === true && before.postCount === 1 && before.postText === 'Post update' && before.postFilled === false, { postDisabled: before.postDisabled, postText: before.postText, postCount: before.postCount, postFilled: before.postFilled });
  check(`${tag}TakePhotosIsTheFilledPrimaryWhileEmpty`,
    before.primaryText === 'Take photos' && before.primaryFilled === true && before.primaryRect?.height === 44
    && before.photoInput && before.galleryInput && before.photoCount === '0 photos',
    { primaryText: before.primaryText, primaryFilled: before.primaryFilled, primaryRect: before.primaryRect, photoInput: before.photoInput, galleryInput: before.galleryInput, photoCount: before.photoCount });

  await page.fill(fieldSelector('done'), FILL.done);
  await page.click('#job-visit-notes [data-outcome="more_to_do"]');
  await page.waitForSelector(fieldSelector('left'), { timeout: 5000 });
  await page.fill(fieldSelector('left'), FILL.left);
  await page.click('#job-visit-notes details.job-notes-more > summary');
  await page.waitForFunction(() => document.querySelector('#job-visit-notes details.job-notes-more')?.open === true, null, { timeout: 5000 });
  await page.fill(fieldSelector('parts_used'), FILL.parts_used);
  await page.fill(fieldSelector('customer_wants'), FILL.customer_wants);
  const filled = await readComposer(page);
  check(`${tag}MoreToDoRevealsLeftAndDisclosureRevealsParts`,
    filled.outcome === 'more_to_do' && filled.moreOpen === true && filled.visibleTextareaCount === 5
    && SECTION_KEYS.every((key) => filled.fields[key]?.visible)
    && filled.fields.parts_needed?.value === '',
    { outcome: filled.outcome, moreOpen: filled.moreOpen, visibleTextareaCount: filled.visibleTextareaCount, fields: filled.fields });
  check(`${tag}PostEnabledOnceDoneHasText`, filled.postDisabled === false, { postDisabled: filled.postDisabled });
  if (tag === 'phone') {
    check('phoneFieldsFitOneColumn',
      SECTION_KEYS.every((key) => filled.fields[key] && filled.fields[key].width <= 390 && filled.fields[key].width >= 300 && filled.fields[key].height >= 44)
      && filled.primaryRect?.width >= 300 && filled.postRect?.width >= 300,
      { fields: filled.fields, primaryRect: filled.primaryRect, postRect: filled.postRect });
  }

  // The photo attach stays on this same update: one photo rides on the same Post.
  await page.setInputFiles('#job-visit-photo-input', [plainPhotoFile(photoJpeg)]);
  await page.waitForFunction(() => document.querySelector('#job-visit-notes .job-visit-photo-count')?.textContent?.trim() === '1 photo', null, { timeout: 30000 });
  const withPhoto = await readComposer(page);
  check(`${tag}PhotoAttachesOnSameUpdate`,
    withPhoto.photoCount === '1 photo' && withPhoto.primaryText === 'Take more photos'
    && inserts.length === 0 && photoInserts.length === 0
    && (await page.$$eval('#job-visit-notes .job-notes-strip img', (els) => els.length)) === 1,
    { photoCount: withPhoto.photoCount, primaryText: withPhoto.primaryText, insertsBeforePost: inserts.length, photoInsertsBeforePost: photoInserts.length });
  check(`${tag}PrimaryWeightSwapsToPostWhenReady`,
    withPhoto.postFilled === true && withPhoto.primaryFilled === false && withPhoto.postRect?.height === 44,
    { postFilled: withPhoto.postFilled, primaryFilled: withPhoto.primaryFilled, postRect: withPhoto.postRect });

  await page.evaluate(() => document.querySelector('#job-visit-notes')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${shot}` });

  await page.click('#job-visit-notes .job-notes-post');
  await waitFor(() => inserts.length >= 1 && photoInserts.length >= 1, `${tag} visit-note and photo inserts`);
  await page.waitForTimeout(500);
  checkInsert(tag, inserts, 0, EXPECTED_BODY);
  const photoRow = photoInserts[0];
  check(`${tag}OnePhotoRowBoundToTheOneNote`,
    photoInserts.length === 1 && photoRow?.visit_note_id === 'harness-note-1'
    && photoRow?.job_id === inserts[0]?.job_id && photoRow?.company_id === inserts[0]?.company_id
    && typeof photoRow?.storage_path === 'string' && photoRow.storage_path.length > 0,
    { photoInserts: photoInserts.length, visit_note_id: photoRow?.visit_note_id ?? null, job_id: photoRow?.job_id ?? null, storage_path: photoRow?.storage_path ?? null });
  const after = await readComposer(page);
  check(`${tag}ComposerClearsAfterPost`,
    after.postDisabled === true && after.postFilled === false && after.primaryFilled === true
    && allFieldsEmpty(after) && after.outcome === null && after.fields.left === null
    && after.photoCount === '0 photos' && after.primaryText === 'Take photos',
    { postDisabled: after.postDisabled, postFilled: after.postFilled, primaryFilled: after.primaryFilled, fields: after.fields, outcome: after.outcome, photoCount: after.photoCount });

  // A second update takes the All done path: the choice, not typed text, writes Left to do.
  await page.fill(fieldSelector('done'), SECOND_DONE);
  await page.click('#job-visit-notes [data-outcome="all_done"]');
  const second = await readComposer(page);
  check(`${tag}AllDoneKeepsLeftFieldHidden`, second.outcome === 'all_done' && second.fields.left === null && second.postDisabled === false, { outcome: second.outcome, left: second.fields.left, postDisabled: second.postDisabled });
  await page.click('#job-visit-notes .job-notes-post');
  await waitFor(() => inserts.length >= 2, `${tag} second visit-note insert`);
  await page.waitForTimeout(300);
  checkInsert(tag, inserts, 1, EXPECTED_SECOND_BODY);
  check(`${tag}SecondPostCarriesNoPhotoRow`, photoInserts.length === 1, { photoInserts: photoInserts.length });

  await page.click('#job-visit-notes .job-notes-tab[data-tab="history"]');
  await page.waitForSelector('#job-visit-notes .job-visit-log', { timeout: 5000 });
  const historyState = await page.evaluate(() => ({
    selectedTab: [...document.querySelectorAll('#job-visit-notes .job-notes-tab')].find((t) => t.getAttribute('aria-selected') === 'true')?.getAttribute('data-tab') ?? null,
    composeShown: !!document.querySelector('#job-visit-notes .job-notes-compose'),
    rows: document.querySelectorAll('#job-visit-notes .job-visit-log .job-visit-row').length,
  }));
  check(`${tag}HistoryTabShowsTheLogAndHidesTheComposer`, historyState.selectedTab === 'history' && historyState.composeShown === false && historyState.rows === 3, historyState);

  const wall = await readWall(page);
  const composed = wall.find((r) => r.paragraphs.some((p) => p.includes('Fitted the new unit')));
  const free = wall.find((r) => r.paragraphs.some((p) => p.includes('Pulled the old unit')));
  check(`${tag}WallShowsSectionLabelsOnComposedNote`,
    !!composed && composed.labels.join('|') === 'Done|Left to do|Parts used|Parts needed next visit|Customer wants'
    && composed.paragraphs.length === 5
    && composed.paragraphs[0] === 'DoneFitted the new unit. Tested and running.',
    { labels: composed?.labels ?? null, paragraphs: composed?.paragraphs ?? null, stamp: composed?.stamp ?? null });
  check(`${tag}WallRendersFreeTextNoteWithoutLabels`,
    !!free && free.labels.length === 0 && free.paragraphs.length === 1 && free.paragraphs[0] === 'Pulled the old unit. Left the isolator tagged.',
    { labels: free?.labels ?? null, paragraphs: free?.paragraphs ?? null });

  notes[`${tag}Inserts`] = inserts;
  notes[`${tag}PhotoInserts`] = photoInserts;
  await context.close();
}

const browser = await chromium.launch({ headless: true, channel: process.env.LOOK_BROWSER_CHANNEL || undefined });
const photoJpeg = await renderJpeg(browser, 'SITE', '#2e75b6');
await proveViewport(browser, 'laptop', { width: 1280, height: 900 }, 'harness-laptop-1280.png', photoJpeg);
await proveViewport(browser, 'phone', { width: 390, height: 844 }, 'harness-phone-390.png', photoJpeg);
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
