// Proves the reminder walk on the real pages without Supabase credentials:
// quick-capture → list → edit (job, details, date, visibility, tag) → tick done → postpone,
// private vs company vs tagged filters, and the Today strip with reminders, nudges, and the
// schedule ledger. Runs against a dev server whose .env points VITE_SUPABASE_URL at a host
// this script intercepts with an in-memory PostgREST.
// The in-memory store mirrors the RLS SELECT predicate for the signed-in user so the list
// proves the filter chips; the predicate itself is proven against Postgres separately.
// A supabase-js session seeded in localStorage takes AuthProvider down its live branch, so the
// pages read profile, company, jobs, quotes, invoices, crew and reminders from the fake store.
// Run: node scripts/prove-reminders-harness.mjs
// Needs a dev server on LOOK_BASE_URL (default http://127.0.0.1:5173) started with that .env.
// Writes docs/proof/reminders/harness-*.png, harness-notes.json and docs/look/reminders-*.png.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/reminders';
const LOOK = 'docs/look';

const ME = '00000000-0000-0000-0000-000000000002';
const COMPANY = '00000000-0000-0000-0000-000000000001';
const SAM = '00000000-0000-0000-0000-000000000003';
const PRIYA = '00000000-0000-0000-0000-000000000004';
const SARAH = '00000000-0000-0000-0000-000000000101';
const HARBOUR = '00000000-0000-0000-0000-000000000102';

// Browser clock is pinned to 09:00 Perth on this day so "today", "tomorrow" and "leave soon" are stable.
const TODAY = '2026-09-11';
const TOMORROW = '2026-09-12';
const FIXED_NOW = new Date('2026-09-11T01:00:00.000Z');

function envValue(name) {
  if (process.env[name]) return process.env[name];
  if (!existsSync('.env')) return null;
  const line = readFileSync('.env', 'utf8').split('\n').find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : null;
}
const supabaseUrl = envValue('VITE_SUPABASE_URL');
if (!supabaseUrl) throw new Error('need VITE_SUPABASE_URL in .env so the harness knows which host to intercept');
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
const session = {
  access_token: 'harness-access-token',
  refresh_token: 'harness-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(new Date('2030-01-01T00:00:00Z').getTime() / 1000),
  user: { id: ME, aud: 'authenticated', role: 'authenticated', email: 'jack@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};

mkdirSync(OUT, { recursive: true });
mkdirSync(LOOK, { recursive: true });
const notes = { base: BASE, supabaseUrl, startedAt: new Date().toISOString() };
const failures = [];
function check(name, ok, detail) {
  notes[name] = { ok, ...detail };
  if (!ok) failures.push(name);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, detail ? JSON.stringify(detail) : '');
}

function seed() {
  const iso = (d) => new Date(d).toISOString();
  return {
    profiles: [{ id: ME, company_id: COMPANY, name: 'Jack Wieland', email: 'jack@example.com', role: 'admin', created_at: iso('2026-01-01T00:00:00Z'), updated_at: iso('2026-01-01T00:00:00Z'), dashboard_widgets_seeded: true }],
    companies: [{ id: COMPANY, name: 'Northside Plumbing', created_at: iso('2026-01-01T00:00:00Z'), updated_at: iso('2026-01-01T00:00:00Z') }],
    dashboard_widgets: [],
    jobs: [
      { id: 'job-42', company_id: COMPANY, client_id: SARAH, job_number: 42, title: 'Switchboard upgrade', status: 'scheduled', priority: 'medium', scheduled_date: TODAY, start_time: '07:30', end_time: '12:00', address: '12 Workshop Rd, Perth WA 6000', assigned_team: [ME], cost_code: null, parent_job_id: null, created_by: ME, created_at: iso('2026-09-01T00:00:00Z'), updated_at: iso('2026-09-01T00:00:00Z') },
      { id: 'job-44', company_id: COMPANY, client_id: HARBOUR, job_number: 44, title: 'Hot water swap', status: 'scheduled', priority: 'medium', scheduled_date: TODAY, start_time: '09:30', end_time: '11:00', address: '8 Marina Way, Fremantle WA 6160', assigned_team: [ME], cost_code: null, parent_job_id: null, created_by: ME, created_at: iso('2026-09-01T00:00:00Z'), updated_at: iso('2026-09-01T00:00:00Z') },
      { id: 'job-43', company_id: COMPANY, client_id: SARAH, job_number: 43, title: 'Upstairs lighting', status: 'scheduled', priority: 'medium', scheduled_date: TOMORROW, start_time: '08:00', end_time: '15:00', address: '5 Hill St, Subiaco WA 6008', assigned_team: [ME], cost_code: null, parent_job_id: null, created_by: ME, created_at: iso('2026-09-01T00:00:00Z'), updated_at: iso('2026-09-01T00:00:00Z') },
    ],
    clients: [
      { id: SARAH, company_id: COMPANY, name: 'Sarah Lee', email: 'sarah@example.com', phone: null, address: '5 Hill St, Subiaco WA 6008' },
      { id: HARBOUR, company_id: COMPANY, name: 'Harbour Lights', email: 'accounts@example.com', phone: null, address: '8 Marina Way, Fremantle WA 6160' },
    ],
    quotes: [
      { id: 'quote-12', company_id: COMPANY, quote_number: 12, client_id: SARAH, job_id: null, status: 'sent', line_items: [{ description: 'Lighting run', quantity: 1, unit_price: 1200 }], subtotal: 1200, tax_rate: 10, tax_amount: 120, total: 1320, validity_date: null, created_by: ME, created_at: iso('2026-09-05T02:00:00Z'), updated_at: iso('2026-09-05T02:00:00Z') },
    ],
    invoices: [
      { id: 'inv-2002', company_id: COMPANY, invoice_number: 2002, client_id: HARBOUR, job_id: null, quote_id: null, status: 'overdue', line_items: [], subtotal: 760, tax_rate: 10, tax_amount: 76, total: 836, due_date: '2026-09-06', chased_at: null, created_by: ME, created_at: iso('2026-08-20T02:00:00Z'), updated_at: iso('2026-08-20T02:00:00Z') },
    ],
    agent_reminders: [
      { id: 'rem-1', company_id: COMPANY, user_id: ME, title: 'Order the 20 mm fittings', details: null, due_date: null, related_type: null, related_id: null, completed: false, completed_at: null, visibility: 'private', tagged_user_ids: [], created_at: iso('2026-09-10T01:00:00Z'), updated_at: iso('2026-09-10T01:00:00Z') },
      { id: 'rem-2', company_id: COMPANY, user_id: SAM, title: 'Toolbox talk Friday 7am', details: 'Ladder safety and the new van kit.', due_date: iso('2026-09-10T23:00:00Z'), related_type: null, related_id: null, completed: false, completed_at: null, visibility: 'company', tagged_user_ids: [], created_at: iso('2026-09-09T01:00:00Z'), updated_at: iso('2026-09-09T01:00:00Z') },
      { id: 'rem-3', company_id: COMPANY, user_id: SAM, title: 'Bring the ladder for the Upstairs job', details: null, due_date: iso('2026-09-11T07:00:00Z'), related_type: 'job', related_id: 'job-43', completed: false, completed_at: null, visibility: 'private', tagged_user_ids: [ME], created_at: iso('2026-09-10T03:00:00Z'), updated_at: iso('2026-09-10T03:00:00Z') },
      { id: 'rem-4', company_id: COMPANY, user_id: PRIYA, title: 'Priya private note nobody else sees', details: null, due_date: null, related_type: null, related_id: null, completed: false, completed_at: null, visibility: 'private', tagged_user_ids: [], created_at: iso('2026-09-10T04:00:00Z'), updated_at: iso('2026-09-10T04:00:00Z') },
      { id: 'rem-5', company_id: COMPANY, user_id: ME, title: 'Call the sparky about the board', details: null, due_date: null, related_type: null, related_id: null, completed: true, completed_at: iso('2026-09-10T06:00:00Z'), visibility: 'private', tagged_user_ids: [], created_at: iso('2026-09-08T01:00:00Z'), updated_at: iso('2026-09-10T06:00:00Z') },
    ],
    crew: [
      { id: ME, name: 'Jack Wieland', email: 'jack@example.com', role: 'admin', schedule_color: null },
      { id: SAM, name: 'Sam Carter', email: 'sam@example.com', role: 'member', schedule_color: null },
      { id: PRIYA, name: 'Priya Nair', email: 'priya@example.com', role: 'member', schedule_color: null },
    ],
  };
}

// The RLS SELECT predicate from migration 079, mirrored for the signed-in audit user.
function visibleToMe(row) {
  return row.visibility === 'company' || row.user_id === ME || (row.tagged_user_ids ?? []).includes(ME);
}

function matches(row, key, expr) {
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const val = row[key];
  const asComparable = (v) => (typeof val === 'number' ? Number(v) : v);
  switch (op) {
    case 'eq': return String(val) === raw;
    case 'neq': return String(val) !== raw;
    case 'is': return raw === 'null' ? val == null : String(val) === raw;
    case 'in': return raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^"|"$/g, '')).includes(String(val));
    case 'gte': return val != null && asComparable(val) >= asComparable(raw);
    case 'lte': return val != null && asComparable(val) <= asComparable(raw);
    case 'gt': return val != null && asComparable(val) > asComparable(raw);
    case 'lt': return val != null && asComparable(val) < asComparable(raw);
    default: return true;
  }
}

function applyFilters(rows, params) {
  let out = rows;
  for (const [key, expr] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    if (key === 'or') continue;
    out = out.filter((row) => matches(row, key, expr));
  }
  const order = params.get('order');
  if (order) {
    const terms = order.split(',').map((t) => t.split('.'));
    out = [...out].sort((a, b) => {
      for (const [col, dir = 'asc', nulls] of terms) {
        const av = a[col]; const bv = b[col];
        if (av == null && bv == null) continue;
        if (av == null) return nulls === 'nullsfirst' ? -1 : 1;
        if (bv == null) return nulls === 'nullsfirst' ? 1 : -1;
        if (av < bv) return dir === 'desc' ? 1 : -1;
        if (av > bv) return dir === 'desc' ? -1 : 1;
      }
      return 0;
    });
  }
  const limit = params.get('limit');
  return limit ? out.slice(0, Number(limit)) : out;
}

function fakePostgrest(store, log) {
  return async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const accept = request.headers().accept ?? '';
    const wantsObject = accept.includes('vnd.pgrst.object');
    const reply = (rows, status = 200) => {
      if (wantsObject) {
        if (rows.length !== 1) return route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: `${rows.length} rows` }) });
        return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(rows[0]) });
      }
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(rows) });
    };
    const m = url.pathname.match(/^\/rest\/v1\/(rpc\/)?([^/]+)$/);
    if (!m) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const [, isRpc, name] = m;
    if (isRpc) {
      if (name === 'get_company_members') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(store.crew) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    const table = store[name] ?? (store[name] = []);
    const method = request.method();
    const isReminders = name === 'agent_reminders';
    if (method === 'GET') {
      const rows = applyFilters(isReminders ? table.filter(visibleToMe) : table, url.searchParams);
      return reply(rows);
    }
    if (method === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      const inserted = (Array.isArray(body) ? body : [body]).map((row, i) => ({
        id: `harness-${name}-${table.length + i + 1}`,
        created_at: FIXED_NOW.toISOString(),
        updated_at: FIXED_NOW.toISOString(),
        completed: false,
        completed_at: null,
        details: null,
        due_date: null,
        related_type: null,
        related_id: null,
        ...row,
      }));
      table.push(...inserted);
      log.push({ method, table: name, body });
      return reply(inserted, 201);
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(request.postData() || '{}');
      const targets = applyFilters(isReminders ? table.filter(visibleToMe) : table, url.searchParams);
      for (const row of targets) Object.assign(row, patch);
      log.push({ method, table: name, filter: url.search, body: patch, matched: targets.length });
      return reply(targets);
    }
    if (method === 'DELETE') {
      const targets = applyFilters(isReminders ? table.filter((r) => r.user_id === ME) : table, url.searchParams);
      for (const row of targets) table.splice(table.indexOf(row), 1);
      log.push({ method, table: name, filter: url.search, matched: targets.length });
      return reply(targets);
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  };
}

async function settle(page, ms = 350) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

async function readList(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-reminders-page] .reminders-row')];
    return rows.map((row) => ({
      id: row.getAttribute('data-reminder-id'),
      title: row.querySelector('.reminders-title')?.textContent?.trim() ?? null,
      meta: row.querySelector('.reminders-meta')?.textContent?.trim() ?? null,
      visibility: row.getAttribute('data-visibility'),
      done: row.classList.contains('is-done'),
      tagged: [...row.querySelectorAll('.reminders-tagged *')].map((el) => el.textContent.trim()).filter(Boolean),
    }));
  });
}

async function measurePaper(page, root) {
  return page.evaluate((sel) => {
    const page_ = document.querySelector(`${sel}.ops-page, ${sel} .ops-page, .ops-page${sel}`) || document.querySelector('.ops-page');
    const sheet = document.querySelector(`${sel} .dashboard-home-sheet`);
    const bar = document.querySelector(`${sel} .dashboard-home-sheet-bar`);
    const primary = document.querySelector(`${sel} .dashboard-home-primary`);
    const field = document.querySelector(`${sel} .reminders-capture-input, ${sel} .reminders-field`);
    const rect = (el) => (el ? el.getBoundingClientRect() : null);
    return {
      page: page_ ? getComputedStyle(page_).backgroundColor : null,
      sheet: sheet ? getComputedStyle(sheet).backgroundColor : null,
      sheetW: sheet ? Math.round(rect(sheet).width) : null,
      bar: bar ? getComputedStyle(bar).backgroundColor : null,
      primaryH: primary ? Math.round(rect(primary).height) : null,
      primaryBg: primary ? getComputedStyle(primary).backgroundColor : null,
      fieldH: field ? Math.round(rect(field).height) : null,
      viewW: window.innerWidth,
    };
  }, root);
}

function checkPaper(tag, m) {
  check(`${tag}PaperIsCreamSheetNavyAccent44`,
    m.page === 'rgb(245, 240, 230)' && m.sheet === 'rgb(255, 253, 248)' && m.bar === 'rgb(10, 37, 64)'
    && m.primaryH === 44 && m.primaryBg === 'rgb(46, 117, 182)' && (m.fieldH == null || m.fieldH >= 44)
    && (m.viewW >= 1000 ? m.sheetW <= m.viewW : m.sheetW >= m.viewW - 40),
    m);
}

async function proveViewport(browser, tag, viewport) {
  const store = seed();
  const log = [];
  const context = await browser.newContext({ viewport, locale: 'en-AU', timezoneId: 'Australia/Perth', ...(tag === 'phone' ? { isMobile: true, hasTouch: true } : {}) });
  await context.clock.setFixedTime(FIXED_NOW);
  await context.addInitScript(([key, value]) => { window.localStorage.setItem(key, value); }, [storageKey, JSON.stringify(session)]);
  await context.route(`${supabaseUrl}/**`, fakePostgrest(store, log));
  const page = await context.newPage();
  page.on('pageerror', (err) => { notes.pageErrors = [...(notes.pageErrors || []), `${tag}: ${String(err)}`]; });

  // 1. List: only what RLS lets me see; Priya's private note stays hidden.
  // (rem-2 is Sam's company reminder due 7:00 am today, rem-3 is Sam's private one tagged to me.)
  await page.goto(`${BASE}/reminders`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-reminders-page] .reminders-row', { timeout: 30000 });
  await settle(page);
  let list = await readList(page);
  check(`${tag}UpcomingShowsMineTaggedAndCompanyOnly`,
    list.map((r) => r.id).sort().join(',') === 'rem-1,rem-2,rem-3' && !list.some((r) => r.title?.includes('Priya')),
    { ids: list.map((r) => r.id), titles: list.map((r) => r.title) });
  check(`${tag}TaggedRowCarriesJobRefAndTodayLabel`,
    list.find((r) => r.id === 'rem-3')?.meta?.includes('#0043') && /Today/.test(list.find((r) => r.id === 'rem-3')?.meta ?? ''),
    { meta: list.find((r) => r.id === 'rem-3')?.meta ?? null });
  checkPaper(`${tag}List`, await measurePaper(page, '[data-reminders-page]'));
  await page.screenshot({ path: `${LOOK}/reminders-list-${tag}.png` });

  // 2. Quick capture: one line and Add.
  await page.fill('#reminder-capture', 'Send Sarah the upstairs quote');
  await page.click('.reminders-capture-add');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-reminders-page] .reminders-title')].some((el) => el.textContent.includes('Send Sarah the upstairs quote')), null, { timeout: 15000 });
  const captureInsert = log.find((e) => e.method === 'POST' && e.table === 'agent_reminders');
  check(`${tag}QuickCaptureInsertsPrivateUntaggedRow`,
    !!captureInsert && captureInsert.body.title === 'Send Sarah the upstairs quote' && captureInsert.body.company_id === COMPANY
    && captureInsert.body.user_id === ME && captureInsert.body.visibility === 'private'
    && Array.isArray(captureInsert.body.tagged_user_ids) && captureInsert.body.tagged_user_ids.length === 0,
    { body: captureInsert?.body ?? null });
  check(`${tag}CaptureClearsAfterAdd`, (await page.inputValue('#reminder-capture')) === '', {});
  const newId = store.agent_reminders.find((r) => r.title === 'Send Sarah the upstairs quote')?.id;

  // 3. Edit: job, details, date+time, company visibility, tag Sam, save.
  await page.click(`.reminders-row[data-reminder-id="${newId}"] .reminders-body`);
  await page.waitForSelector('[data-reminder-edit] #reminder-title', { timeout: 15000 });
  await settle(page);
  check(`${tag}EditOpensWithTitle`, (await page.inputValue('#reminder-title')) === 'Send Sarah the upstairs quote', {});
  const noteBefore = await page.textContent('.reminder-visibility-note');
  check(`${tag}PrivateNoteBeforeEdit`, /Only you can see this reminder/.test(noteBefore ?? ''), { note: noteBefore });
  await page.selectOption('#reminder-job', 'job-43');
  await page.fill('#reminder-details', 'Quote the additional upstairs lighting run.');
  await page.fill('#reminder-date', TOMORROW);
  await page.fill('#reminder-time', '10:30');
  await page.check('input[name="reminder-visibility"][value="company"]');
  await page.click(`[data-reminder-tag="${SAM}"]`);
  const noteAfter = await page.textContent('.reminder-visibility-note');
  check(`${tag}CompanyNoteAfterRadio`, /Everyone at/.test(noteAfter ?? ''), { note: noteAfter });
  const editJobOption = await page.$eval('#reminder-job', (el) => el.options[el.selectedIndex].textContent.trim());
  check(`${tag}JobOptionReadsRefAndTitle`, editJobOption === '#0043 · Upstairs lighting', { option: editJobOption });
  checkPaper(`${tag}Edit`, await measurePaper(page, '[data-reminder-edit]'));
  if (tag === 'phone') {
    await page.screenshot({ path: `${LOOK}/reminders-edit-${tag}-visibility.png` });
    await page.evaluate(() => document.querySelector('[data-reminder-edit] .dashboard-home-hero')?.scrollIntoView({ block: 'start' }));
    await settle(page, 200);
  }
  await page.screenshot({ path: `${LOOK}/reminders-edit-${tag}.png` });
  await page.click('.reminder-save');
  await page.waitForSelector('[data-reminders-page]', { timeout: 15000 });
  await settle(page);
  const savePatch = log.filter((e) => e.method === 'PATCH' && e.table === 'agent_reminders').at(-1);
  const due = savePatch?.body?.due_date ? new Date(savePatch.body.due_date) : null;
  const dueLocal = due ? due.toLocaleString('en-AU', { timeZone: 'Australia/Perth', hour12: false }) : null;
  check(`${tag}SaveWritesJobDetailsDateVisibilityAndTag`,
    !!savePatch && savePatch.filter.includes(`id=eq.${newId}`)
    && savePatch.body.title === 'Send Sarah the upstairs quote'
    && savePatch.body.details === 'Quote the additional upstairs lighting run.'
    && savePatch.body.related_type === 'job' && savePatch.body.related_id === 'job-43'
    && /12\/09\/2026, 10:30/.test(dueLocal ?? '')
    && savePatch.body.visibility === 'company'
    && JSON.stringify(savePatch.body.tagged_user_ids) === JSON.stringify([SAM]),
    { body: savePatch?.body ?? null, dueLocal, filter: savePatch?.filter ?? null });
  list = await readList(page);
  const saved = list.find((r) => r.id === newId);
  check(`${tag}ListRowShowsJobTomorrowCompanyAndTag`,
    !!saved && saved.visibility === 'company' && saved.meta?.includes('#0043') && /Tomorrow/.test(saved.meta ?? '') && saved.tagged.length === 1,
    { row: saved ?? null });

  // 4. Filters: Company shows only company rows; Tagged to me shows rem-3; Mine shows mine.
  await page.click('[data-reminders-scope="company"]');
  await settle(page, 150);
  list = await readList(page);
  check(`${tag}CompanyFilterShowsOnlyCompanyRows`, list.map((r) => r.id).sort().join(',') === [newId, 'rem-2'].sort().join(','), { ids: list.map((r) => r.id) });
  await page.click('[data-reminders-scope="tagged"]');
  await settle(page, 150);
  list = await readList(page);
  check(`${tag}TaggedFilterShowsRowsTaggedToMe`, list.map((r) => r.id).join(',') === 'rem-3', { ids: list.map((r) => r.id) });
  await page.click('[data-reminders-scope="mine"]');
  await settle(page, 150);
  list = await readList(page);
  check(`${tag}MineFilterShowsMyRows`, list.map((r) => r.id).sort().join(',') === [newId, 'rem-1'].sort().join(','), { ids: list.map((r) => r.id) });
  await page.click('[data-reminders-scope="all"]');
  await settle(page, 150);

  // 5. Tick done moves the row to Completed; tick again brings it back.
  await page.click(`.reminders-row[data-reminder-id="${newId}"] .reminders-tick`);
  await page.waitForFunction((id) => !document.querySelector(`[data-reminders-page] .reminders-row[data-reminder-id="${id}"]`), newId, { timeout: 15000 });
  const donePatch = log.filter((e) => e.method === 'PATCH' && e.table === 'agent_reminders').at(-1);
  check(`${tag}TickWritesCompletedTrue`, donePatch?.body?.completed === true && typeof donePatch.body.completed_at === 'string' && donePatch.filter.includes(`id=eq.${newId}`), { body: donePatch?.body ?? null });
  await page.click('[data-reminders-tab="completed"]');
  await settle(page, 200);
  list = await readList(page);
  check(`${tag}CompletedTabListsTickedRows`, list.map((r) => r.id).sort().join(',') === [newId, 'rem-5'].sort().join(',') && list.every((r) => r.done), { ids: list.map((r) => r.id), done: list.map((r) => r.done) });
  await page.click(`.reminders-row[data-reminder-id="${newId}"] .reminders-tick`);
  await page.waitForFunction((id) => !document.querySelector(`[data-reminders-page] .reminders-row[data-reminder-id="${id}"]`), newId, { timeout: 15000 });
  const undoPatch = log.filter((e) => e.method === 'PATCH' && e.table === 'agent_reminders').at(-1);
  check(`${tag}UntickWritesCompletedFalse`, undoPatch?.body?.completed === false && undoPatch.body.completed_at === null, { body: undoPatch?.body ?? null });
  await page.click('[data-reminders-tab="upcoming"]');
  await settle(page, 200);

  // 6. Postpone via the clock: Tomorrow 8:00 am.
  await page.click('.reminders-row[data-reminder-id="rem-1"] .reminders-clock');
  await page.waitForSelector('.reminders-row[data-reminder-id="rem-1"] [data-postpone="tomorrow"]', { timeout: 5000 });
  await page.click('.reminders-row[data-reminder-id="rem-1"] [data-postpone="tomorrow"]');
  await page.waitForFunction(() => /Tomorrow/.test(document.querySelector('.reminders-row[data-reminder-id="rem-1"] .reminders-meta')?.textContent ?? ''), null, { timeout: 15000 });
  const postponePatch = log.filter((e) => e.method === 'PATCH' && e.table === 'agent_reminders').at(-1);
  const postponedLocal = postponePatch?.body?.due_date ? new Date(postponePatch.body.due_date).toLocaleString('en-AU', { timeZone: 'Australia/Perth', hour12: false }) : null;
  check(`${tag}PostponeWritesTomorrowEight`, /12\/09\/2026, 08:00/.test(postponedLocal ?? '') && postponePatch.filter.includes('id=eq.rem-1'), { dueLocal: postponedLocal, body: postponePatch?.body ?? null });

  // 7. Today surface: reminders strip, nudges, schedule ledger.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dashboard-reminders] .reminders-row', { timeout: 30000 });
  await page.waitForSelector('.dashboard-nudge', { timeout: 30000 });
  await settle(page);
  const today = await page.evaluate(() => ({
    reminderIds: [...document.querySelectorAll('[data-dashboard-reminders] .reminders-row')].map((el) => el.getAttribute('data-reminder-id')),
    allHref: document.querySelector('[data-dashboard-reminders] a.dashboard-home-all')?.getAttribute('href') ?? null,
    heads: [...document.querySelectorAll('.dashboard-home-section-head .ops-section-title')].map((el) => el.textContent.trim()),
    scheduleHref: [...document.querySelectorAll('.dashboard-home-section-head a')].map((a) => a.getAttribute('href')),
    ledgerRows: [...document.querySelectorAll('.dashboard-home-row')].map((el) => el.textContent.trim()),
    nudges: [...document.querySelectorAll('.dashboard-nudge')].map((a) => ({ kind: a.getAttribute('data-nudge-kind'), href: a.getAttribute('href'), label: a.querySelector('.dashboard-nudge-label')?.textContent.trim(), detail: a.querySelector('.dashboard-nudge-detail')?.textContent.trim() })),
    capture: !!document.querySelector('#dashboard-reminder-capture'),
  }));
  check(`${tag}TodayStripShowsDueTodayAndUndatedNotTomorrow`,
    today.reminderIds.includes('rem-3') && today.reminderIds.includes('rem-2') && !today.reminderIds.includes('rem-1') && !today.reminderIds.includes(newId) && today.capture && today.allHref === '/reminders',
    { reminderIds: today.reminderIds, allHref: today.allHref, capture: today.capture });
  check(`${tag}TodayHasRemindersAndScheduleHeads`,
    today.heads.includes('Reminders') && today.heads.some((h) => /Today.s schedule/.test(h)) && today.scheduleHref.includes('/schedule')
    && today.ledgerRows.length === 2 && today.ledgerRows.some((t) => t.includes('Switchboard upgrade')) && today.ledgerRows.some((t) => t.includes('Hot water swap')),
    { heads: today.heads, scheduleHref: today.scheduleHref, ledgerRows: today.ledgerRows });
  const byKind = Object.fromEntries(today.nudges.map((n) => [n.kind, n]));
  check(`${tag}NudgesCoverLeaveSoonTomorrowQuoteInvoice`,
    byKind.leave_soon?.href === '/jobs/job-44' && /Leave soon/.test(byKind.leave_soon?.label ?? '') && /#0044/.test(byKind.leave_soon?.detail ?? '')
    && byKind.jobs_tomorrow?.href === '/jobs/job-43' && /Tomorrow/.test(byKind.jobs_tomorrow?.label ?? '') && /#0043/.test(byKind.jobs_tomorrow?.detail ?? '')
    && byKind.quote_chase?.href === '/quotes?id=quote-12' && /Chase quote/.test(byKind.quote_chase?.label ?? '') && /6 days ago/.test(byKind.quote_chase?.detail ?? '') && /Sarah Lee/.test(byKind.quote_chase?.detail ?? '')
    && byKind.invoice_unpaid?.href === '/invoices?id=inv-2002' && /Unpaid/.test(byKind.invoice_unpaid?.label ?? '') && /5 days overdue/.test(byKind.invoice_unpaid?.detail ?? '') && /836/.test(byKind.invoice_unpaid?.detail ?? ''),
    { nudges: today.nudges });
  // Quick capture from Today writes the same row shape.
  await page.fill('#dashboard-reminder-capture', 'Pick up the isolators');
  await page.click('[data-dashboard-reminders] .reminders-capture-add');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-dashboard-reminders] .reminders-title')].some((el) => el.textContent.includes('Pick up the isolators')), null, { timeout: 15000 });
  const todayInsert = log.filter((e) => e.method === 'POST' && e.table === 'agent_reminders').at(-1);
  check(`${tag}TodayCaptureInsertsPrivateRow`, todayInsert?.body?.title === 'Pick up the isolators' && todayInsert.body.visibility === 'private' && todayInsert.body.user_id === ME, { body: todayInsert?.body ?? null });
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  checkPaper(`${tag}Today`, await measurePaper(page, '.dashboard-home'));
  await page.screenshot({ path: `${LOOK}/reminders-today-${tag}.png` });

  // 8. Quotes list shows the chase chip on the stale sent quote and it opens the send dialog.
  await page.goto(`${BASE}/quotes`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hub-quotes-row', { timeout: 30000 });
  await settle(page);
  const chase = await page.$('.hub-quotes-chase');
  const chaseText = chase ? (await chase.textContent())?.trim() : null;
  check(`${tag}StaleSentQuoteShowsChaseChip`, /Chase/.test(chaseText ?? '') && /6 days/.test(chaseText ?? ''), { chaseText });
  if (chase) {
    await chase.click();
    const dialogOpened = await page.waitForSelector('.overlay-panel-md, .overlay-backdrop, [role="dialog"]', { timeout: 10000 }).then(() => true).catch(() => false);
    check(`${tag}ChaseOpensSendDialog`, dialogOpened, {});
    await page.screenshot({ path: `${OUT}/harness-quote-chase-${tag}.png` });
  }

  notes[`${tag}Log`] = log;
  await context.close();
}

const browser = await chromium.launch({ headless: true });
await proveViewport(browser, 'laptop', { width: 1280, height: 900 });
await proveViewport(browser, 'phone', { width: 390, height: 844 });
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
