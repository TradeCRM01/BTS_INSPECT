// Proves visit-note photo upload and the job Gallery against the real Supabase project.
// Run: PROVE_EMAIL=... PROVE_PASSWORD=... node scripts/prove-job-gallery.mjs
// Needs .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY), a dev server on LOOK_BASE_URL
// (default http://127.0.0.1:5173), and migration 077 applied. Writes docs/proof/job-gallery/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/job-gallery';
const JOB_TITLE = 'Gallery proof job';

function readEnv() {
  const env = { ...process.env };
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

const env = readEnv();
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
const email = env.PROVE_EMAIL;
const password = env.PROVE_PASSWORD;
if (!url || !anon || !email || !password) {
  throw new Error('need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, PROVE_EMAIL, PROVE_PASSWORD');
}

mkdirSync(OUT, { recursive: true });
const notes = { base: BASE, startedAt: new Date().toISOString() };
const failures = [];
function check(name, ok, detail) {
  notes[name] = { ok, ...detail };
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ? JSON.stringify(detail) : '');
}

const browser = await chromium.launch({ headless: true });

async function jpeg(label, color) {
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await page.setContent(`<body style="margin:0;background:${color};font:bold 28px sans-serif;color:#fff;display:grid;place-items:center;height:240px">${label}</body>`);
  const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
  await page.close();
  return buf;
}

const sb = createClient(url, anon, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await sb.auth.signInWithPassword({ email, password });
if (signInError) throw signInError;
const userId = signIn.user.id;
const { data: profile } = await sb.from('profiles').select('company_id, name').eq('id', userId).single();
const companyId = profile.company_id;
notes.company = companyId;

async function findOrCreateJob() {
  const { data: found } = await sb.from('jobs').select('id').eq('company_id', companyId).eq('title', JOB_TITLE).maybeSingle();
  if (found) return found.id;
  const { data, error } = await sb.from('jobs').insert({
    company_id: companyId,
    title: JOB_TITLE,
    created_by: userId,
    address: '1 Proof St, Brisbane QLD',
  }).select('id').single();
  if (error) throw error;
  return data.id;
}

async function seedInspectionPhoto(jobId) {
  const { data: existing } = await sb.from('inspections').select('id').eq('crm_job_id', jobId).limit(1).maybeSingle();
  let inspectionId = existing?.id;
  if (!inspectionId) {
    const { data: template, error: tErr } = await sb.from('templates').insert({
      company_id: companyId,
      created_by: userId,
      name: 'Gallery proof template',
    }).select('id, schema').single();
    if (tErr) throw tErr;
    const { data: inspection, error: iErr } = await sb.from('inspections').insert({
      template_id: template.id,
      template_snapshot: template.schema,
      inspector_id: userId,
      crm_job_id: jobId,
    }).select('id').single();
    if (iErr) throw iErr;
    inspectionId = inspection.id;
  }
  const path = `${inspectionId}/proof-q1/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await sb.storage.from('photos').upload(path, await jpeg('INSPECTION', '#7a4b2a'), { contentType: 'image/jpeg' });
  if (upErr) throw upErr;
  const { error: rowErr } = await sb.from('photos').insert({ inspection_id: inspectionId, question_id: 'proof-q1', storage_path: path });
  if (rowErr) throw rowErr;
  return { inspectionId, path };
}

function proofStep(photos) {
  return { id: 'step-1', description: 'Proof step', hazards: 'Proof hazard', consequence: '', likelihood: '', controls: '', initialRisk: '', residualRisk: '', photos };
}

async function seedJhaPhoto(jobId) {
  const { data: existing } = await sb.from('jha_documents').select('id, steps').eq('job_id', jobId).limit(1).maybeSingle();
  let docId = existing?.id;
  let photos = existing?.steps?.[0]?.photos ?? [];
  if (!docId) {
    const { data: template, error: tErr } = await sb.from('jha_templates').insert({
      company_id: companyId,
      created_by: userId,
      name: 'Gallery proof JHA',
    }).select('id').single();
    if (tErr) throw tErr;
    docId = crypto.randomUUID();
    const { error: dErr } = await sb.from('jha_documents').insert({
      id: docId,
      template_id: template.id,
      template_snapshot: {},
      company_id: companyId,
      created_by: userId,
      job_id: jobId,
      steps: [proofStep([])],
    });
    if (dErr) throw dErr;
  }
  const path = `jha/${docId}/step-1/${crypto.randomUUID()}.jpg`;
  const { error: upErr } = await sb.storage.from('photos').upload(path, await jpeg('JHA', '#2a5a7a'), { contentType: 'image/jpeg' });
  if (upErr) throw upErr;
  photos = [...photos, { id: crypto.randomUUID(), storagePath: path }];
  const { error: sErr } = await sb.from('jha_documents').update({ steps: [proofStep(photos)] }).eq('id', docId);
  if (sErr) throw sErr;
  return { docId, path };
}

const jobId = await findOrCreateJob();
notes.jobId = jobId;
notes.inspection = await seedInspectionPhoto(jobId);
notes.jha = await seedJhaPhoto(jobId);

const visitFile = { name: 'visit.jpg', mimeType: 'image/jpeg', buffer: await jpeg('VISIT', '#2e75b6') };
const jobFile = { name: 'job.jpg', mimeType: 'image/jpeg', buffer: await jpeg('JOB', '#0a2540') };

async function galleryItems(page) {
  return page.$$eval('[data-gallery-photo]', (els) => els.map((el) => ({
    key: el.getAttribute('data-gallery-photo'),
    source: el.getAttribute('data-gallery-source'),
    visible: el.getBoundingClientRect().height > 0,
    loaded: (() => { const img = el.querySelector('img'); return !!img && img.complete && img.naturalWidth > 0; })(),
  })));
}

async function waitForImages(page) {
  await page.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('[data-gallery-photo] img, [data-visit-photo] img')];
    return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, null, { timeout: 30000 });
}

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-AU' });
const page = await context.newPage();
page.on('pageerror', (err) => { notes.pageErrors = [...(notes.pageErrors || []), String(err)]; });

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
notes.loginLandedOn = new URL(page.url()).pathname;

await page.goto(`${BASE}/jobs/${jobId}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#job-visit-notes', { timeout: 30000 });
await page.waitForSelector('[data-job-gallery="1"]', { timeout: 30000 });
await page.waitForSelector('[data-gallery-source="inspection"] img', { timeout: 30000 });
await page.waitForSelector('[data-gallery-source="jha"] img', { timeout: 30000 });

const before = await galleryItems(page);
notes.galleryBefore = before;

const noteBody = `Proof visit ${new Date().toISOString()}`;
await page.fill('#job-visit-notes .job-visit-hairline', noteBody);
await page.setInputFiles('#job-visit-photo-input', [visitFile]);
await page.click('#job-visit-notes .job-visit-post');
await page.waitForFunction((body) => (
  [...document.querySelectorAll('.job-visit-row')].some((row) => row.textContent.includes(body) && row.querySelector('[data-visit-photo] img'))
), noteBody, { timeout: 40000 });
const visitRowHasThumb = await page.evaluate((body) => {
  const row = [...document.querySelectorAll('.job-visit-row')].find((r) => r.textContent.includes(body));
  const img = row?.querySelector('[data-visit-photo] img');
  return !!img;
}, noteBody);
check('visitNotePostsWithPhoto', visitRowHasThumb, { noteBody });

const jobBefore = await page.$$eval('[data-gallery-source="job"]', (els) => els.length);
await page.setInputFiles('#job-gallery-photo-input', [jobFile]);
await page.waitForFunction((n) => document.querySelectorAll('[data-gallery-source="job"]').length > n, jobBefore, { timeout: 40000 });
await waitForImages(page);

const after = await galleryItems(page);
notes.galleryAfter = after;
const sources = new Set(after.map((i) => i.source));
check('galleryListsAllFourSources', ['visit', 'job', 'inspection', 'jha'].every((s) => sources.has(s)), { sources: [...sources], count: after.length });
check('galleryThumbnailsLoadFromSignedUrls', after.every((i) => i.loaded), { unloaded: after.filter((i) => !i.loaded).map((i) => i.key) });

const { data: rows, error: rowsErr } = await sb.from('job_photos').select('id, visit_note_id, storage_path').eq('job_id', jobId);
if (rowsErr) throw rowsErr;
const visitRows = rows.filter((r) => r.visit_note_id);
const jobRows = rows.filter((r) => !r.visit_note_id);
check('dbJobPhotosRowsMatchUpload', visitRows.length >= 1 && jobRows.length >= 1 && rows.every((r) => r.storage_path.startsWith(`${companyId}/jobs/${jobId}/`)), { visitRows: visitRows.length, jobRows: jobRows.length, samplePath: rows[0]?.storage_path });

const { data: objects } = await sb.storage.from('uploaded-pdfs').list(`${companyId}/jobs/${jobId}`);
check('storageObjectsExistUnderCompanyJobPrefix', (objects || []).length >= rows.length, { objects: (objects || []).length, rows: rows.length });

await page.click('[data-gallery-filter="visit"]');
await page.waitForTimeout(200);
const visitOnly = await galleryItems(page);
check('filterVisitShowsOnlyVisit', visitOnly.length > 0 && visitOnly.every((i) => i.source === 'visit'), { shown: visitOnly.length });
await page.click('[data-gallery-filter="all"]');
await page.waitForTimeout(200);

await page.evaluate(() => document.querySelector('#job-gallery')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/gallery-laptop-1280.png` });
await page.evaluate(() => document.querySelector('#job-visit-notes')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/visit-notes-laptop-1280.png` });

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-AU', storageState: await context.storageState() });
const pp = await phone.newPage();
await pp.goto(`${BASE}/jobs/${jobId}#job-gallery`, { waitUntil: 'domcontentloaded' });
await pp.waitForSelector('[data-gallery-photo] img', { timeout: 30000 });
await pp.evaluate(() => document.querySelector('#job-gallery')?.scrollIntoView({ block: 'start' }));
await pp.waitForTimeout(500);
await pp.screenshot({ path: `${OUT}/gallery-phone-390.png` });

notes.finishedAt = new Date().toISOString();
notes.failures = failures;
writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
await browser.close();
if (failures.length) {
  console.error('FAILED', failures);
  process.exitCode = 1;
} else {
  console.log('ALL PASS', `${OUT}/notes.json`);
}
