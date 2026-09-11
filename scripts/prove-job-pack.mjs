// Proves the job pack tick path on the real job sheet, phone first: pick a pack, tick items,
// survive a reload, untick, add an item, tick the lot until Packed.
//
// Harness mode (no credentials):
//   node scripts/prove-job-pack.mjs
//   Runs /jobs/audit-doc-job?look=job-pack against a dev server on LOOK_BASE_URL (default
//   http://127.0.0.1:5173). That dev server must be started with a .env whose VITE_SUPABASE_URL
//   is the host this script intercepts; job_pack_items reads and writes land in an in-memory
//   PostgREST fake here, so the page's own handlers run end to end.
//
// Real mode:
//   PROVE_EMAIL=... PROVE_PASSWORD=... node scripts/prove-job-pack.mjs
//   Signs in with supabase-js, creates a fresh job, logs in through /login on the same dev
//   server, and ticks against the real project. Needs migration 079 applied.
//
// Writes docs/proof/job-pack/pack-phone-390.png, pack-phone-390-packed.png,
// pack-laptop-1280.png and notes.json. Exit code 1 on any failed check.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/job-pack';
const HARNESS = '/jobs/audit-doc-job?look=job-pack';
const PACK_KEYS = ['plumbing', 'electrical', 'hvac', 'carpentry', 'general'];
const GROUP_KEYS = ['tools', 'materials', 'photos', 'safety'];
const PLUMBING_COUNT = 17;
const ADDED_LABEL = 'Spare washers';
const TICK_KEYS = ['ticked_at', 'ticked_by', 'ticked_by_name'];

function envValue(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env')) return null;
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}

const supabaseUrl = envValue('VITE_SUPABASE_URL');
if (!supabaseUrl) throw new Error('need VITE_SUPABASE_URL in .env');
const email = process.env.PROVE_EMAIL;
const password = process.env.PROVE_PASSWORD;
const REAL = Boolean(email && password);

mkdirSync(OUT, { recursive: true });
const notes = { base: BASE, supabaseUrl, mode: REAL ? 'real' : 'harness', startedAt: new Date().toISOString(), requests: [] };
const failures = [];
function check(name, ok, detail) {
  notes[name] = { ok, ...detail };
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ? JSON.stringify(detail) : '');
}

async function waitFor(predicate, label, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${label}`);
}

// In-memory PostgREST for /rest/v1/job_pack_items. Lives in the script so it persists
// across browser contexts and reloads the same way the real table would.
const store = [];
function eqParam(url, key) {
  const value = url.searchParams.get(key);
  return value && value.startsWith('eq.') ? value.slice(3) : null;
}
async function interceptSupabase(context) {
  await context.route(`${supabaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const raw = request.postData();
    const body = raw ? JSON.parse(raw) : null;
    notes.requests.push({ method, path: `${url.pathname}${url.search}`, body });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (url.pathname !== '/rest/v1/job_pack_items') return json([]);
    if (method === 'GET') {
      const companyId = eqParam(url, 'company_id');
      const jobId = eqParam(url, 'job_id');
      const rows = store
        .filter((r) => (!companyId || r.company_id === companyId) && (!jobId || r.job_id === jobId))
        .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
      return json(rows);
    }
    if (method === 'POST') {
      const rows = (Array.isArray(body) ? body : [body]).map((r) => ({ ...r, id: crypto.randomUUID(), created_at: new Date().toISOString() }));
      store.push(...rows);
      return json(rows, 201);
    }
    if (method === 'PATCH') {
      const id = eqParam(url, 'id');
      const row = store.find((r) => r.id === id);
      if (!row) return json([]);
      Object.assign(row, body);
      return json([row]);
    }
    return json([]);
  });
}

let sb = null;
let userId = null;
let jobId = null;
let sheetPath = HARNESS;
if (REAL) {
  const { createClient } = await import('@supabase/supabase-js');
  const anon = envValue('VITE_SUPABASE_ANON_KEY');
  if (!anon) throw new Error('need VITE_SUPABASE_ANON_KEY in .env for real mode');
  sb = createClient(supabaseUrl, anon, { auth: { persistSession: false } });
  const { data: signIn, error: signInError } = await sb.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  userId = signIn.user.id;
  const { data: profile, error: profileError } = await sb.from('profiles').select('company_id').eq('id', userId).single();
  if (profileError) throw profileError;
  // No DELETE grant on job_pack_items, so a fresh job per run keeps the pack empty at the start.
  const { data: job, error: jobError } = await sb.from('jobs').insert({
    company_id: profile.company_id,
    title: `Job pack proof ${Date.now()}`,
    created_by: userId,
    address: '1 Proof St, Brisbane QLD',
  }).select('id').single();
  if (jobError) throw jobError;
  jobId = job.id;
  sheetPath = `/jobs/${jobId}`;
  notes.userId = userId;
  notes.jobId = jobId;
}

async function tickedRows() {
  if (!REAL) return store.filter((r) => r.ticked_at !== null && r.ticked_at !== undefined);
  const { data, error } = await sb.from('job_pack_items').select('id, ticked_at, ticked_by').eq('job_id', jobId);
  if (error) throw error;
  return data.filter((r) => r.ticked_at !== null);
}

async function allRows() {
  if (!REAL) return store;
  const { data, error } = await sb.from('job_pack_items').select('id, label, ticked_at, ticked_by').eq('job_id', jobId);
  if (error) throw error;
  return data;
}

async function readPack(page) {
  return page.evaluate(() => {
    const height = (el) => Math.round(el.getBoundingClientRect().height);
    return {
      starts: [...document.querySelectorAll('[data-job-pack-start]')].map((el) => ({ key: el.getAttribute('data-job-pack-start'), height: height(el) })),
      groups: [...document.querySelectorAll('[data-job-pack-group]')].map((el) => el.getAttribute('data-job-pack-group')),
      items: [...document.querySelectorAll('[data-job-pack-item]')].map((el) => ({
        id: el.getAttribute('data-job-pack-item'),
        checked: el.getAttribute('aria-checked') === 'true',
        label: el.querySelector('.flex-1')?.textContent?.trim() ?? null,
        group: el.closest('[data-job-pack-group]')?.getAttribute('data-job-pack-group') ?? null,
        height: height(el),
      })),
      progress: document.querySelector('[data-job-pack-progress]')?.getAttribute('data-job-pack-progress') ?? null,
      packed: !!document.querySelector('[data-job-pack-packed]'),
    };
  });
}

async function waitItems(page, count) {
  await page.waitForFunction((n) => document.querySelectorAll('[data-job-pack-item]').length === n, count, { timeout: 30000 });
}

async function waitProgress(page, value) {
  await page.waitForFunction((v) => document.querySelector('[data-job-pack-progress]')?.getAttribute('data-job-pack-progress') === v, value, { timeout: 30000 });
}

async function openSheet(page) {
  await page.goto(`${BASE}${sheetPath}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-pack', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
}

async function shoot(page, file) {
  await page.evaluate(() => document.querySelector('#job-pack')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${file}` });
}

const browser = await chromium.launch({ headless: true });
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-AU', isMobile: true, hasTouch: true });
if (!REAL) await interceptSupabase(phone);
const page = await phone.newPage();
page.on('pageerror', (err) => { notes.pageErrors = [...(notes.pageErrors || []), String(err)]; });

if (REAL) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
  notes.loginLandedOn = new URL(page.url()).pathname;
}

await openSheet(page);
const empty = await readPack(page);
check('emptyStateOffersAllFivePacksAt44px',
  empty.starts.map((s) => s.key).join(',') === PACK_KEYS.join(',') && empty.starts.every((s) => s.height >= 44) && empty.items.length === 0,
  { starts: empty.starts, items: empty.items.length, progress: empty.progress });

await page.click('[data-job-pack-start="plumbing"]');
await waitItems(page, PLUMBING_COUNT);
const started = await readPack(page);
check('plumbingPackSeedsSeventeenItemsInGroupOrder',
  started.items.length === PLUMBING_COUNT && started.groups.join(',') === GROUP_KEYS.join(',') && started.items[0].label === 'Pipe wrench set' && started.progress === `0/${PLUMBING_COUNT}`,
  { count: started.items.length, groups: started.groups, first: started.items[0]?.label, progress: started.progress });
check('everyItemButtonIsAtLeast44pxTall', started.items.every((i) => i.height >= 44), { heights: started.items.map((i) => i.height) });

const firstThree = started.items.slice(0, 3).map((i) => i.id);
for (const id of firstThree) await page.click(`[data-job-pack-item="${id}"]`);
await page.waitForFunction(() => document.querySelectorAll('[data-job-pack-item][aria-checked="true"]').length === 3, null, { timeout: 30000 });
await waitProgress(page, `3/${PLUMBING_COUNT}`);
await waitFor(async () => (await tickedRows()).length === 3, 'three ticks written');
const three = await readPack(page);
check('threeTicksShowThreeOverSeventeen',
  three.progress === `3/${PLUMBING_COUNT}` && three.items.filter((i) => i.checked).map((i) => i.id).join(',') === firstThree.join(','),
  { progress: three.progress, checked: three.items.filter((i) => i.checked).map((i) => i.label) });
await shoot(page, 'pack-phone-390.png');

await openSheet(page);
await waitItems(page, PLUMBING_COUNT);
const reloaded = await readPack(page);
check('ticksPersistAcrossReload',
  reloaded.progress === `3/${PLUMBING_COUNT}` && firstThree.every((id) => reloaded.items.find((i) => i.id === id)?.checked === true),
  { progress: reloaded.progress, checked: reloaded.items.filter((i) => i.checked).map((i) => i.id) });

await page.click(`[data-job-pack-item="${firstThree[0]}"]`);
await page.waitForFunction((id) => document.querySelector(`[data-job-pack-item="${id}"]`)?.getAttribute('aria-checked') === 'false', firstThree[0], { timeout: 30000 });
await waitProgress(page, `2/${PLUMBING_COUNT}`);
await waitFor(async () => (await tickedRows()).length === 2, 'untick written');
await openSheet(page);
await waitItems(page, PLUMBING_COUNT);
const unticked = await readPack(page);
check('untickPersistsAcrossReload',
  unticked.progress === `2/${PLUMBING_COUNT}` && unticked.items.find((i) => i.id === firstThree[0])?.checked === false,
  { progress: unticked.progress, first: unticked.items.find((i) => i.id === firstThree[0]) });

await page.fill('[data-job-pack-add] input', ADDED_LABEL);
await page.selectOption('[data-job-pack-add] select', 'materials');
await page.click('[data-job-pack-add] button[type="submit"]');
await waitItems(page, PLUMBING_COUNT + 1);
await waitProgress(page, `2/${PLUMBING_COUNT + 1}`);
const added = await readPack(page);
const addedItem = added.items.find((i) => i.label === ADDED_LABEL);
check('addedItemLandsInMaterialsAndGrowsTheTotal',
  !!addedItem && addedItem.group === 'materials' && addedItem.checked === false && added.progress === `2/${PLUMBING_COUNT + 1}`,
  { added: addedItem, progress: added.progress });
check('addInputClearsAfterSubmit', (await page.$eval('[data-job-pack-add] input', (el) => el.value)) === '', {});

for (;;) {
  const now = await readPack(page);
  const next = now.items.find((i) => !i.checked);
  if (!next) break;
  await page.click(`[data-job-pack-item="${next.id}"]`);
  await page.waitForFunction((id) => document.querySelector(`[data-job-pack-item="${id}"]`)?.getAttribute('aria-checked') === 'true', next.id, { timeout: 30000 });
}
await page.waitForSelector('[data-job-pack-packed]', { timeout: 30000 });
await waitProgress(page, `${PLUMBING_COUNT + 1}/${PLUMBING_COUNT + 1}`);
await waitFor(async () => (await tickedRows()).length === PLUMBING_COUNT + 1, 'all ticks written');
const packed = await readPack(page);
check('allTickedShowsPacked', packed.packed && packed.progress === `${PLUMBING_COUNT + 1}/${PLUMBING_COUNT + 1}`, { progress: packed.progress, packed: packed.packed });
await shoot(page, 'pack-phone-390-packed.png');

const rows = await allRows();
if (REAL) {
  check('dbHoldsEighteenTickedRowsByThisUser',
    rows.length === PLUMBING_COUNT + 1 && rows.every((r) => r.ticked_at !== null && r.ticked_by === userId),
    { rows: rows.length, unticked: rows.filter((r) => !r.ticked_at).length, otherUser: rows.filter((r) => r.ticked_by !== userId).length });
} else {
  const patches = notes.requests.filter((r) => r.method === 'PATCH' && r.path.startsWith('/rest/v1/job_pack_items'));
  check('fakeStoreHoldsEighteenTickedRows',
    rows.length === PLUMBING_COUNT + 1 && rows.every((r) => r.ticked_at),
    { rows: rows.length, unticked: rows.filter((r) => !r.ticked_at).length });
  check('tickPatchesCarryOnlyTheTickColumns',
    patches.length > 0 && patches.every((p) => p.body && Object.keys(p.body).sort().join(',') === [...TICK_KEYS].sort().join(',')),
    { patches: patches.length, keys: [...new Set(patches.map((p) => Object.keys(p.body ?? {}).sort().join(',')))] });
}

const laptop = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-AU', ...(REAL ? { storageState: await phone.storageState() } : {}) });
if (!REAL) await interceptSupabase(laptop);
const lp = await laptop.newPage();
lp.on('pageerror', (err) => { notes.pageErrors = [...(notes.pageErrors || []), `laptop: ${String(err)}`]; });
await lp.goto(`${BASE}${sheetPath}`, { waitUntil: 'domcontentloaded' });
await lp.waitForSelector('#job-pack', { timeout: 30000 });
await waitItems(lp, PLUMBING_COUNT + 1);
await lp.waitForSelector('[data-job-pack-packed]', { timeout: 30000 });
await lp.evaluate(() => document.fonts.ready);
await shoot(lp, 'pack-laptop-1280.png');
const laptopPack = await readPack(lp);
check('laptopReadsTheSamePackedState', laptopPack.packed && laptopPack.progress === `${PLUMBING_COUNT + 1}/${PLUMBING_COUNT + 1}`, { progress: laptopPack.progress });

check('noPageErrors', !notes.pageErrors, { pageErrors: notes.pageErrors ?? [] });
await browser.close();

notes.finishedAt = new Date().toISOString();
notes.failures = failures;
writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
if (failures.length) {
  console.error('FAILED', failures);
  process.exitCode = 1;
} else {
  console.log('ALL PASS', `${OUT}/notes.json`);
}
