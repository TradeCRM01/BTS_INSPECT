import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const COMPANY = '5a106e2d-0000-4000-8000-000000000001';
const ADMIN = '5a106e2d-0000-4000-8000-0000000000a1';
const CLIENT = '5a106e2d-0000-4000-8000-000000000030';
const JOB = '5a106e2d-0000-4000-8000-000000000010';
const INSPECTION = '5a106e2d-0000-4000-8000-000000000020';
const INVOICE = '5a106e2d-0000-4000-8000-000000000040';
const SECRET = 'sec-smtp-probe-secret-5a106e2d';
const ANON = 'sec-smtp-network-anon-key';

type Traffic = {
  method: string;
  url: string;
  path: string;
  search: string;
  body: string;
  status: number;
  response: string;
};

function b64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function adminJwt(): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: ADMIN,
    role: 'authenticated',
    email: 'admin-a@probe.test',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 86400,
  })}.sig`;
}

function selectCols(search: string): string {
  const raw = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('select') ?? '';
  return raw;
}

function asksForSecret(table: string, search: string): boolean {
  if (table !== 'email_settings') return false;
  const cols = selectCols(search);
  if (!cols.trim() || cols.includes('*')) return true;
  return cols.split(',').map((part) => part.trim().split(':', 1)[0]).includes('smtp_pass');
}

function project(row: Record<string, unknown>, search: string): Record<string, unknown> {
  const cols = selectCols(search);
  if (!cols.trim() || cols.includes('*')) return { ...row };
  const out: Record<string, unknown> = {};
  for (const part of cols.split(',')) {
    const key = part.trim().split(':', 1)[0];
    if (key && key !== 'smtp_pass') out[key] = row[key];
  }
  return out;
}

function launchChromeCandidates(): string | undefined {
  return [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/home/ubuntu/.cache/ms-playwright/chromium-1148/chrome-linux64/chrome',
    '/home/ubuntu/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].find((path): path is string => !!path && existsSync(path));
}

function seedStore(): Record<string, Array<Record<string, unknown>>> {
  const now = '2026-10-23T00:00:00.000Z';
  return {
    profiles: [{
      id: ADMIN,
      email: 'admin-a@probe.test',
      name: 'Admin A',
      company_id: COMPANY,
      role: 'admin',
      created_at: now,
      updated_at: now,
      dashboard_widgets_seeded: true,
    }],
    companies: [{
      id: COMPANY,
      name: 'Probe A',
      email: 'office@probe.test',
      created_at: now,
      updated_at: now,
    }],
    platform_operators: [],
    clients: [{
      id: CLIENT,
      company_id: COMPANY,
      name: 'Sarah Lee',
      email: 'sarah@probe.test',
      phone: '0412 345 678',
      address: '5 Hill St',
      archived: false,
      created_at: now,
    }],
    jobs: [{
      id: JOB,
      company_id: COMPANY,
      client_id: CLIENT,
      job_number: 42,
      title: 'Switchboard upgrade',
      status: 'scheduled',
      priority: 'medium',
      scheduled_date: '2026-10-24',
      start_time: '07:30',
      end_time: '12:00',
      address: '12 Workshop Rd',
      assigned_team: [ADMIN],
      created_by: ADMIN,
      created_at: now,
      updated_at: now,
    }],
    inspections: [{
      id: INSPECTION,
      company_id: COMPANY,
      inspector_id: ADMIN,
      client_id: CLIENT,
      crm_job_id: JOB,
      status: 'draft',
      archived: false,
      due_on: '2026-10-24',
      meta: { siteName: 'Workshop', siteAddress: '12 Workshop Rd', clientName: 'Sarah Lee' },
      responses: {},
      template_snapshot: {
        name: 'Site check',
        schema: {
          meta: { requiresSiteName: false, requiresSiteAddress: false, requiresClientName: false, requiresJobNumber: false },
          sections: [{ id: 's1', title: 'Checks', isRepeating: false, questions: [] }],
        },
      },
      started_at: now,
      completed_at: null,
      created_at: now,
      updated_at: now,
    }],
    invoices: [{
      id: INVOICE,
      company_id: COMPANY,
      invoice_number: 2002,
      client_id: CLIENT,
      job_id: JOB,
      status: 'draft',
      line_items: [{ description: 'Callout', quantity: 1, unit_price: 120 }],
      subtotal: 120,
      tax_rate: 10,
      tax_amount: 12,
      total: 132,
      created_by: ADMIN,
      created_at: now,
      updated_at: now,
    }],
    email_settings: [{
      id: '5a106e2d-0000-4000-8000-000000000050',
      company_id: COMPANY,
      smtp_host: 'smtp.resend.com',
      smtp_port: 587,
      smtp_secure: false,
      smtp_user: 'resend',
      smtp_pass: SECRET,
      from_name: 'Probe A',
      from_email: 'a@probe.test',
      created_at: now,
      updated_at: now,
    }],
  };
}

function matchRow(row: Record<string, unknown>, search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [key, expr] of params.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key)) continue;
    const dot = expr.indexOf('.');
    if (dot < 0) continue;
    const op = expr.slice(0, dot);
    const raw = expr.slice(dot + 1);
    const val = row[key];
    if (op === 'eq' && String(val) !== raw) return false;
    if (op === 'neq' && String(val) === raw) return false;
    if (op === 'is' && raw === 'null' && val != null) return false;
  }
  return true;
}

function send(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range, content-profile, prefer',
    ...extra,
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

describe('SEC-SMTP Playwright network as admin', { timeout: 120000 }, () => {
  const traffic: Traffic[] = [];
  const store = seedStore();
  let readyOverride: boolean | null = null;
  let apiPort = 0;
  let vitePort = 0;
  let apiUrl = '';
  let api: ReturnType<typeof createServer> | undefined;
  let vite: ChildProcess | undefined;
  let browser: { close: () => Promise<void> } | undefined;
  let page: {
    goto: (url: string, opts?: { waitUntil?: 'domcontentloaded' | 'networkidle'; timeout?: number }) => Promise<unknown>;
    waitForTimeout: (ms: number) => Promise<void>;
    addInitScript: (script: () => void, arg?: unknown) => Promise<void>;
    content: () => Promise<string>;
    url: () => string;
    locator: (sel: string) => {
      first: () => {
        waitFor: (opts?: { timeout?: number }) => Promise<void>;
        fill: (value: string) => Promise<void>;
        click: () => Promise<void>;
        textContent: () => Promise<string | null>;
        getAttribute: (name: string) => Promise<string | null>;
      };
    };
    on: (event: string, fn: (payload: unknown) => void) => void;
  };
  const token = adminJwt();

  function smtpReady(): boolean {
    if (readyOverride !== null) return readyOverride;
    return store.email_settings.some((row) => (
      String(row.smtp_host ?? '').toLowerCase().includes('resend')
      && String(row.smtp_pass ?? '').trim() !== ''
      && String(row.from_email ?? '').trim() !== ''
    ));
  }

  function bodyHasSecret(raw: string): boolean {
    if (!raw.trim()) return false;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows.some((row) => row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'smtp_pass'));
    } catch {
      return raw.includes('smtp_pass');
    }
  }

  function record(entry: Traffic) {
    traffic.push(entry);
  }

  function leaked(): string[] {
    const hits: string[] = [];
    for (const row of traffic) {
      const blob = `${row.method} ${row.url} ${row.search} ${row.body} ${row.response}`;
      if (blob.includes('smtp_pass')) hits.push(`smtp_pass in ${row.method} ${row.path}${row.search}`);
      if (blob.includes(SECRET)) hits.push(`seed secret in ${row.method} ${row.path}`);
    }
    return hits;
  }

  function denied(): Traffic[] {
    return traffic.filter((row) => row.status === 42501 || row.response.includes('42501'));
  }

  async function waitFor(predicate: () => boolean, timeout = 25000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`timed out waiting for SMTP traffic; last paths: ${traffic.slice(-12).map((row) => row.path).join(', ')}`);
  }

  beforeAll(async () => {
    const user = {
      id: ADMIN,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'admin-a@probe.test',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    };

    const apiServer = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${apiPort || 80}`);
      const body = req.method === 'GET' || req.method === 'OPTIONS' ? '' : await readBody(req);
      if (req.method === 'OPTIONS') {
        record({ method: 'OPTIONS', url: url.href, path: url.pathname, search: url.search, body, status: 204, response: '' });
        send(res, 204, '');
        return;
      }
      if (url.pathname === '/auth/v1/user') {
        const payload = { ...user };
        record({ method: req.method ?? 'GET', url: url.href, path: url.pathname, search: url.search, body, status: 200, response: JSON.stringify(payload) });
        send(res, 200, payload);
        return;
      }
      if (url.pathname === '/auth/v1/token') {
        const payload = {
          access_token: token,
          refresh_token: 'sec-smtp-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        };
        record({ method: req.method ?? 'POST', url: url.href, path: url.pathname, search: url.search, body, status: 200, response: JSON.stringify(payload) });
        send(res, 200, payload);
        return;
      }
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
      if (rpc) {
        const name = rpc[1];
        if (name === 'email_smtp_ready') {
          const ready = smtpReady();
          record({ method: req.method ?? 'POST', url: url.href, path: url.pathname, search: url.search, body, status: 200, response: JSON.stringify(ready) });
          send(res, 200, ready);
          return;
        }
        if (name === 'email_smtp_set_pass') {
          const parsed = body ? JSON.parse(body) as { p_pass?: string } : {};
          const pass = String(parsed.p_pass ?? '').trim();
          const row = store.email_settings.find((item) => item.company_id === COMPANY);
          if (row) row.smtp_pass = pass;
          else {
            store.email_settings.push({
              id: '5a106e2d-0000-4000-8000-000000000051',
              company_id: COMPANY,
              smtp_host: 'smtp.resend.com',
              smtp_port: 587,
              smtp_secure: false,
              smtp_user: 'resend',
              smtp_pass: pass,
              from_name: 'Probe A',
              from_email: 'a@probe.test',
            });
          }
          record({ method: req.method ?? 'POST', url: url.href, path: url.pathname, search: url.search, body, status: 204, response: '' });
          send(res, 204, '');
          return;
        }
        if (name === 'get_company_members') {
          const members = [{ id: ADMIN, name: 'Admin A', email: 'admin-a@probe.test', role: 'admin' }];
          record({ method: req.method ?? 'POST', url: url.href, path: url.pathname, search: url.search, body, status: 200, response: JSON.stringify(members) });
          send(res, 200, members);
          return;
        }
        record({ method: req.method ?? 'POST', url: url.href, path: url.pathname, search: url.search, body, status: 200, response: '[]' });
        send(res, 200, []);
        return;
      }
      const rest = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
      if (rest) {
        const table = rest[1];
        if (asksForSecret(table, url.search) || ((req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') && bodyHasSecret(body))) {
          const err = { code: '42501', message: 'permission denied for column smtp_pass' };
          record({ method: req.method ?? 'GET', url: url.href, path: url.pathname, search: url.search, body, status: 42501, response: JSON.stringify(err) });
          send(res, 401, err);
          return;
        }
        if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'PUT') {
          const parsed = body ? JSON.parse(body) as Record<string, unknown> | Record<string, unknown>[] : {};
          const payloads = Array.isArray(parsed) ? parsed : [parsed];
          store[table] = store[table] ?? [];
          for (const payload of payloads) {
            const idx = store[table].findIndex((row) => String(row.company_id) === String(payload.company_id ?? COMPANY));
            if (idx >= 0) Object.assign(store[table][idx], payload);
            else store[table].push({ id: `5a106e2d-0000-4000-8000-0000000000${store[table].length + 60}`, company_id: COMPANY, ...payload });
          }
        }
        const rows = (store[table] ?? []).filter((row) => matchRow(row, url.search)).map((row) => project(row, url.search));
        const accept = String(req.headers.accept ?? '');
        const wantsObject = accept.includes('vnd.pgrst.object');
        if (wantsObject) {
          if (rows.length !== 1) {
            const err = { code: 'PGRST116', message: `${rows.length} rows` };
            record({ method: req.method ?? 'GET', url: url.href, path: url.pathname, search: url.search, body, status: 406, response: JSON.stringify(err) });
            send(res, 406, err);
            return;
          }
          record({ method: req.method ?? 'GET', url: url.href, path: url.pathname, search: url.search, body, status: 200, response: JSON.stringify(rows[0]) });
          send(res, 200, rows[0]);
          return;
        }
        record({ method: req.method ?? 'GET', url: url.href, path: url.pathname, search: url.search, body, status: 200, response: JSON.stringify(rows) });
        send(res, 200, rows, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
        return;
      }
      record({ method: req.method ?? 'GET', url: url.href, path: url.pathname, search: url.search, body, status: 200, response: '{}' });
      send(res, 200, {});
    });

    api = apiServer;
    await new Promise<void>((resolve) => apiServer.listen(0, '127.0.0.1', () => resolve()));
    const apiAddr = apiServer.address();
    if (!apiAddr || typeof apiAddr === 'string') throw new Error('api listen failed');
    apiPort = apiAddr.port;
    apiUrl = `http://127.0.0.1:${apiPort}`;

    vitePort = Number(process.env.SEC_SMTP_VITE_PORT || 0);
    if (!vitePort) {
      const probe = createServer();
      await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
      const addr = probe.address();
      if (!addr || typeof addr === 'string') throw new Error('vite port probe failed');
      vitePort = addr.port;
      await new Promise<void>((resolve, reject) => probe.close((err) => err ? reject(err) : resolve()));
    }

    vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VITE_SUPABASE_URL: apiUrl,
        VITE_SUPABASE_ANON_KEY: ANON,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('vite start timed out')), 30000);
      const onData = (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        if (text.includes('Local:') || text.includes(`http://127.0.0.1:${vitePort}`)) {
          clearTimeout(timer);
          resolve();
        }
      };
      vite?.stdout?.on('data', onData);
      vite?.stderr?.on('data', onData);
      vite?.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`vite exited ${code}`));
      });
    });

    const executablePath = launchChromeCandidates();
    const { chromium } = await import('playwright');
    const launched = await chromium.launch({ headless: true, executablePath });
    browser = launched;
    const context = await launched.newContext({ viewport: { width: 1280, height: 800 } });
    const storageKey = `sb-${new URL(apiUrl).hostname.split('.')[0]}-auth-token`;
    const session = {
      access_token: token,
      refresh_token: 'sec-smtp-refresh',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user,
    };
    await context.addInitScript(({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    }, { key: storageKey, value: session });
    page = await context.newPage() as typeof page;
    page.on('response', async (res) => {
      const response = res as { url: () => string; status: () => number; text: () => Promise<string>; request: () => { method: () => string; postData: () => string | null } };
      try {
        const text = await response.text();
        const parsed = new URL(response.url());
        if (parsed.origin !== apiUrl) return;
        record({
          method: response.request().method(),
          url: response.url(),
          path: parsed.pathname,
          search: parsed.search,
          body: response.request().postData() ?? '',
          status: response.status(),
          response: text,
        });
      } catch {
        /* ignore closed responses */
      }
    });
  }, 90000);

  afterAll(async () => {
    await browser?.close();
    if (vite?.pid) {
      try { process.kill(vite.pid, 'SIGTERM'); } catch { /* already gone */ }
      await new Promise((resolve) => setTimeout(resolve, 400));
      try { process.kill(vite.pid, 'SIGKILL'); } catch { /* already gone */ }
    }
    await new Promise<void>((resolve) => {
      if (!api) {
        resolve();
        return;
      }
      api.close(() => resolve());
    });
  });

  async function openAdmin(path: string) {
    const before = traffic.length;
    await page.goto(`http://127.0.0.1:${vitePort}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitFor(() => traffic.slice(before).some((row) => row.path.includes('/rest/v1/email_settings')));
    await page.waitForTimeout(400);
    const html = await page.content();
    expect(page.url()).not.toContain('/login');
    expect(html).not.toMatch(/42501|permission denied for column/i);
    expect(leaked()).toEqual([]);
    expect(denied()).toEqual([]);
    return html;
  }

  it('loads the job page as admin with no smtp secret on the wire', async () => {
    const html = await openAdmin(`/jobs/${JOB}`);
    expect(html).toContain('Switchboard upgrade');
    expect(traffic.some((row) => row.path.endsWith('/rpc/email_smtp_ready'))).toBe(true);
  }, 60000);

  it('loads the inspection page as admin with no smtp secret on the wire', async () => {
    const html = await openAdmin(`/inspections/${INSPECTION}`);
    expect(html).toMatch(/Site check|Checks|Workshop/);
    expect(traffic.some((row) => row.path.endsWith('/rpc/email_smtp_ready'))).toBe(true);
  }, 60000);

  it('loads the invoice page as admin with no smtp secret on the wire', async () => {
    await openAdmin('/invoices');
    expect(traffic.some((row) => row.path.endsWith('/rpc/email_smtp_ready'))).toBe(true);
  }, 60000);

  it('loads company settings as admin with a set indicator and no smtp secret on the wire', async () => {
    const html = await openAdmin('/settings/company');
    expect(html).toContain('data-smtp-secret-state="set"');
  }, 60000);

  it('shows not-set when a settings row exists and the ready RPC is false', async () => {
    readyOverride = false;
    const html = await openAdmin('/settings/company');
    readyOverride = null;
    expect(html).toContain('data-smtp-secret-state="unset"');
    expect(html).toContain('not set');
    expect(html).not.toContain('data-smtp-secret-state="set"');
  }, 60000);

  it('saves and rotates the SMTP password on Settings without upserting the secret', async () => {
    store.email_settings.length = 0;
    readyOverride = null;
    await openAdmin('/settings/company');
    expect(await page.locator('[data-smtp-secret-state]').first().getAttribute('data-smtp-secret-state')).toBe('unset');

    const first = 'sec-smtp-typed-first-5a106e2d';
    const rotate = 'sec-smtp-typed-rotate-5a106e2d';
    await page.locator('input[placeholder="smtp.resend.com"]').first().fill('smtp.resend.com');
    await page.locator('#smtp-from').first().fill('c@probe.test');
    await page.locator('input[placeholder="Grafter"]').first().fill('Probe C');
    await page.locator('input[autocomplete="new-password"]').first().fill(first);
    const beforeFirst = traffic.length;
    await page.locator('#settings-email button[type="submit"]').first().click();
    await waitFor(() => traffic.slice(beforeFirst).some((row) => row.path.endsWith('/rpc/email_smtp_set_pass') && row.status < 400));
    await waitFor(() => traffic.slice(beforeFirst).some((row) => (
      row.path.endsWith('/rpc/email_smtp_ready') && row.response.includes('true')
    )));
    expect(await page.locator('[data-smtp-secret-state]').first().getAttribute('data-smtp-secret-state')).toBe('set');
    expect(store.email_settings[0]?.smtp_pass).toBe(first);

    await page.locator('input[autocomplete="new-password"]').first().fill(rotate);
    const beforeRotate = traffic.length;
    await page.locator('#settings-email button[type="submit"]').first().click();
    await waitFor(() => traffic.slice(beforeRotate).some((row) => row.path.endsWith('/rpc/email_smtp_set_pass') && row.status < 400));
    expect(store.email_settings[0]?.smtp_pass).toBe(rotate);
    expect(await page.locator('[data-smtp-secret-state]').first().getAttribute('data-smtp-secret-state')).toBe('set');

    const writes = traffic.filter((row) => (
      row.path.endsWith('/email_settings') && ['POST', 'PATCH', 'PUT'].includes(row.method)
    ));
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((row) => !row.body.includes('smtp_pass'))).toBe(true);
    expect(denied()).toEqual([]);
    expect(traffic.filter((row) => row.path.endsWith('/rpc/email_smtp_set_pass')).length).toBeGreaterThanOrEqual(2);
  }, 60000);
});

describe('SEC-SMTP built dist scan', () => {
  it('keeps the SMTP secret column name and seeded password out of the production bundle', () => {
    const dist = join(process.cwd(), 'dist');
    expect(existsSync(dist), 'gates.sh builds first; dist must exist for this scan').toBe(true);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(js|css|html|map)$/.test(entry.name)) files.push(path);
      }
    };
    walk(dist);
    const hits = files.flatMap((path) => {
      const text = readFileSync(path, 'utf8');
      const found: string[] = [];
      if (text.includes('smtp_pass')) found.push(`${path}:smtp_pass`);
      if (text.includes(SECRET)) found.push(`${path}:seed`);
      return found;
    });
    expect(hits).toEqual([]);
  });
});
