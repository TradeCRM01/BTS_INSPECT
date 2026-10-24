#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const MAIN_SHA = '0898c3b93f167a090615232141bf73790bf731ef';
const OUT = join(repo, 'src/components/layout/fixtures/main-0898c3b9-widget-full.json');
const WIDTHS = [375, 390, 768, 1024, 1280];
const PATH = '/?look=dashboard-full';
const CHROME = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));

function serveDist(root) {
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
  };
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = join(root, rel);
      if (!file.startsWith(root)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      const fallback = !existsSync(file) || !statSync(file).isFile();
      const send = fallback ? join(root, 'index.html') : file;
      res.writeHead(200, { 'content-type': fallback ? 'text/html' : (mime[extname(send)] || 'application/octet-stream') });
      res.end(readFileSync(send));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('listen failed'));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function injectFullLook(pageSrc, authSrc) {
  if (pageSrc.includes("DASHBOARD_LOOK_FULL = 'dashboard-full'")) return { page: pageSrc, auth: authSrc };
  const auth = authSrc.includes("look') === 'dashboard-full'")
    ? authSrc
    : authSrc.replace(
      "|| params.get('look') === 'dashboard-repro'",
      "|| params.get('look') === 'dashboard-repro'\n      || params.get('look') === 'dashboard-full'",
    );
  let page = pageSrc;
  if (!page.includes("DASHBOARD_LOOK_FULL")) {
    page = page.replace(
      "const DASHBOARD_LOOK_REPRO = 'dashboard-repro';",
      "const DASHBOARD_LOOK_REPRO = 'dashboard-repro';\nconst DASHBOARD_LOOK_FULL = 'dashboard-full';",
    );
  }
  if (!page.includes('lookDashboardFull')) {
    page = page.replace(
      'const lookDashboardRepro = lookParam === DASHBOARD_LOOK_REPRO;',
      'const lookDashboardRepro = lookParam === DASHBOARD_LOOK_REPRO;\n  const lookDashboardFull = lookParam === DASHBOARD_LOOK_FULL;',
    );
    page = page.replace(
      '|| lookDashboardRepro;',
      '|| lookDashboardRepro\n    || lookDashboardFull;',
    );
    page = page.replace(
      'if (lookDashboardRepro) return repairDashboardWidgetLayout(dashboardReproLookWidgets()).widgets;',
      "if (lookDashboardRepro) return repairDashboardWidgetLayout(dashboardReproLookWidgets()).widgets;\n      if (lookDashboardFull) return dashboardFullLookWidgets();",
    );
  }
  if (!page.includes('function dashboardFullLookWidgets')) {
    const headPage = readFileSync(join(repo, 'src/pages/DashboardPage.tsx'), 'utf8');
    const start = headPage.indexOf('function dashboardFullLookWidgets()');
    const end = headPage.indexOf('function dashboardJackLookWidgets()', start);
    if (start < 0 || end < 0) throw new Error('dashboardFullLookWidgets missing on head');
    const fn = headPage.slice(start, end);
    page = page.replace('function dashboardJackLookWidgets()', `${fn}function dashboardJackLookWidgets()`);
  }
  return { page, auth };
}

function readVisibleCards() {
  const phone = window.innerWidth < 768;
  const vis = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  return [...document.querySelectorAll('[data-dashboard-widget-id]')].filter((el) => {
    if (!vis(el)) return false;
    const onPhone = !!el.closest('[data-dashboard-phone-stack]');
    return phone ? onPhone : !onPhone;
  }).map((host) => {
    const card = host.querySelector('.dashboard-home-widget') || host;
    const r = card.getBoundingClientRect();
    return {
      id: host.getAttribute('data-dashboard-widget-id') || '',
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    };
  });
}

async function enterEdit(page) {
  await page.evaluate(async () => {
    const more = document.querySelector('.dashboard-home-more');
    if (!more) throw new Error('more menu missing');
    more.open = true;
    const btn = [...more.querySelectorAll('button')].find((el) => /Customize|Done editing/.test(el.textContent || ''));
    if (!btn) throw new Error('Customize missing');
    if (!/Done editing/.test(btn.textContent || '')) btn.click();
    for (let i = 0; i < 50; i += 1) {
      if ([...document.querySelectorAll('button, a')].some((el) => /Add widget/.test(el.textContent || ''))) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error('edit mode Add widget missing');
  });
}

async function measureOrigin(origin, browser) {
  const edit = {};
  const view = {};
  for (const width of WIDTHS) {
    const phone = width <= 430;
    const page = await browser.newPage({ viewport: { width, height: phone ? 4000 : 5000 } });
    await page.addInitScript(`(function(){
      var Real = Date;
      var ms = Date.parse('2026-10-19T03:40:00.000Z');
      function FrozenDate() {
        if (arguments.length === 0) return new Real(ms);
        return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
      }
      FrozenDate.now = function(){ return ms; };
      FrozenDate.parse = Real.parse;
      FrozenDate.UTC = Real.UTC;
      FrozenDate.prototype = Real.prototype;
      window.Date = FrozenDate;
    })()`);
    await page.goto(`${origin}${PATH}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 25000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    view[String(width)] = await page.evaluate(readVisibleCards);
    await enterEdit(page);
    await page.setViewportSize({ width, height: phone ? 4000 : 5000 });
    await page.waitForTimeout(200);
    edit[String(width)] = await page.evaluate(readVisibleCards);
    await page.close();
  }
  return { edit, view };
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

function digest(payload) {
  return createHash('sha256').update(JSON.stringify(sortKeys(payload))).digest('hex');
}

const wt = join(tmpdir(), 'hf-403-768-main-0898c3b9');
if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
execSync(`git worktree add --detach ${wt} ${MAIN_SHA}`, { cwd: repo, stdio: 'pipe' });
execSync(`ln -sfn ${join(repo, 'node_modules')} ${join(wt, 'node_modules')}`);
const injected = injectFullLook(
  readFileSync(join(wt, 'src/pages/DashboardPage.tsx'), 'utf8'),
  readFileSync(join(wt, 'src/lib/devFieldAuditAuth.ts'), 'utf8'),
);
writeFileSync(join(wt, 'src/pages/DashboardPage.tsx'), injected.page);
writeFileSync(join(wt, 'src/lib/devFieldAuditAuth.ts'), injected.auth);
writeFileSync(join(wt, '.env'), [
  'VITE_LOOK_PROOF=1',
  'VITE_SUPABASE_URL=https://example.supabase.co',
  'VITE_SUPABASE_ANON_KEY=test-anon-key',
  '',
].join('\n'));
const dist = join(wt, 'dist-hf403');
execSync(`npx vite build --outDir ${dist} --emptyOutDir`, {
  cwd: wt,
  env: {
    ...process.env,
    VITE_LOOK_PROOF: '1',
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  },
  stdio: 'pipe',
});
const server = await serveDist(dist);
const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const measured = await measureOrigin(server.origin, browser);
  const core = {
    edit: measured.edit,
    path: PATH,
    sha: MAIN_SHA,
    view: measured.view,
    viewport: { widths: WIDTHS, height: 5000 },
  };
  const payload = {
    ...core,
    produced: `DEV VITE_LOOK_PROOF vite from git worktree ${MAIN_SHA}. Injected look=dashboard-full from head, then measured. Frozen Date 2026-10-19T03:40:00.000Z. Phone widths read [data-dashboard-phone-stack]; md+ excludes the phone stack. sha256 is SHA-256 of JSON.stringify({edit,path,sha,view,viewport}) with sorted object keys. produced is excluded from the digest. Capture: node scripts/capture-hf-403-768-main-fixture.mjs`,
    sha256: digest(core),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({
    out: OUT,
    sha256: payload.sha256,
    edit768: (payload.edit['768'] || []).map((row) => ({ id: row.id, width: row.width, x: row.x })),
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
