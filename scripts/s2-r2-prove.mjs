import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((path) => path && existsSync(path));
  return candidates[0];
}

const AFTER = process.env.S2_AFTER_URL || 'http://127.0.0.1:5173';
const BEFORE = process.env.S2_BEFORE_URL || 'http://127.0.0.1:5174';
const OUT = process.env.S2_OUT || 'docs/look/s2';
const N53 = 'Northside Plumbing & Gas Maintenance Services Pty Ltd';
const CLOCK = '2026-10-19T09:41:00+10:00';
const JOBS = `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(N53)}`;
const HEIGHT = 844;
const DPR = 2;
const SHELL = '.shell-header,.shell-bottom-nav,.shell-phone-menu,.overlay-backdrop,.hub-install-anchor';

mkdirSync(OUT, { recursive: true });

function tokenCols(css, dark) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const col = [];
  const pushHex = (h) => {
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    col.push([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]);
  };
  const blockRe = /([^{]+)\{([^}]+)\}/g;
  let m;
  while ((m = blockRe.exec(stripped))) {
    const sel = m[1].replace(/\s+/g, ' ').trim();
    if (sel.includes('@media')) continue;
    const isDark = sel.includes('[data-theme="dark"]');
    if (dark !== isDark && sel.includes(':root') === false) continue;
    if (!dark && isDark) continue;
    if (dark && !isDark && !sel.includes(':root') && !sel.includes('[data-theme="light"]')) continue;
    for (const hx of m[2].matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) pushHex(hx[1]);
    for (const rx of m[2].matchAll(/rgba?\(([^)]+)\)/g)) {
      const p = rx[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      col.push([p[0], p[1], p[2], p.length > 3 ? p[3] : 1]);
    }
  }
  col.push([255, 255, 255, 1], [0, 0, 0, 1]);
  return col;
}

const tokensCss = readFileSync('src/styles/tokens.css', 'utf8');
const COL_LIGHT = tokenCols(tokensCss, false);
const COL_DARK = tokenCols(tokensCss, true);

const WALKS = `({ shellSel, cols, snippetHeaderOnly }) => {
  const vw = window.innerWidth;
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const blend = (top, bot) => ({
    r: top.r * top.a + bot.r * (1 - top.a),
    g: top.g * top.a + bot.g * (1 - top.a),
    b: top.b * top.a + bot.b * (1 - top.a),
    a: 1,
  });
  const bgOf = (el) => {
    const stack = [];
    let a = el;
    let img = false;
    while (a) {
      const s = getComputedStyle(a);
      const c = parse(s.backgroundColor);
      if (s.backgroundImage !== 'none' && !s.backgroundImage.startsWith('linear')) img = true;
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
      a = a.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const hb = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (hb && hb.a) base = hb;
    let out = stack.length && stack[stack.length - 1].a >= 1 ? stack.pop() : base;
    while (stack.length) out = blend(stack.pop(), out);
    return { c: out, img };
  };
  const cr = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const inShell = (el) => el.closest(shellSel);
  const shellEls = [...document.querySelectorAll(shellSel)].flatMap((root) => [root, ...root.querySelectorAll('*')]).filter(vis);
  const all = [...document.querySelectorAll('body *')].filter(vis);

  let maxRight = 0, worst = '';
  for (const el of all) {
    if (el.closest('svg') && el.tagName !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (r.right > maxRight) { maxRight = r.right; worst = el.tagName + '.' + String(el.className.baseVal ?? el.className).split(' ').slice(0, 2).join('.'); }
  }

  const bRoot = snippetHeaderOnly ? document.querySelector('.shell-header') : document.body;
  const bBad = [];
  if (bRoot) {
    for (const el of [bRoot, ...bRoot.querySelectorAll('*')]) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || el.closest('.sr-only,[aria-hidden="true"]')) continue;
      if (el.clientWidth <= 1 && el.clientHeight <= 1 && cs.position === 'absolute') continue;
      const text = own(el).length > 0;
      const clips = ['hidden', 'clip', 'auto', 'scroll'].includes(cs.overflowX) || ['hidden', 'clip'].includes(cs.overflowY);
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
        if (el.hasAttribute('data-shell-switcher-name') || el.classList.contains('truncate')) continue;
        bBad.push(['ellipsis', (el.textContent || '').trim().slice(0, 40)]);
      } else if (clips && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && el.textContent.trim()) {
        if (el.hasAttribute('data-shell-switcher-name') || el.classList.contains('overflow-y-auto') || el.classList.contains('overlay-backdrop')) continue;
        bBad.push(['overflow', (el.textContent || '').trim().slice(0, 40)]);
      }
      if ((cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) {
        if (el.hasAttribute('data-shell-switcher-name')) continue;
        bBad.push(['clamp/mask', (el.textContent || '').trim().slice(0, 40)]);
      }
      if (text && el.getBoundingClientRect().right > vw + 0.5) bBad.push(['off-screen', (el.textContent || '').trim().slice(0, 40)]);
    }
  }

  const res = [];
  for (const el of shellEls) {
    if (!own(el).length || el.closest('svg')) continue;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) continue;
    const { c: bg, img } = bgOf(el);
    const fgb = fg.a < 1 ? blend(fg, bg) : fg;
    const ratio = cr(fgb, bg);
    const pill = !!el.closest('.pill,[data-status],.status,.shell-bottom-tab-pip');
    res.push({ t: el.textContent.trim().slice(0, 36), ratio: +ratio.toFixed(2), img, pill });
  }
  const body = res.filter((x) => !x.img);
  const below7 = body.filter((x) => !x.pill && x.ratio < 7);
  const minCR = body.length ? Math.min(...body.map((x) => x.ratio)) : null;

  const okCol = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return true;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return true;
    return cols.some((t) => Math.abs(t[0] - p[0]) < 1.5 && Math.abs(t[1] - p[1]) < 1.5 && Math.abs(t[2] - p[2]) < 1.5 && Math.abs(t[3] - a) < 0.015);
  };
  const strays = {};
  const add = (p, v, el) => {
    const k = p + ' ' + v;
    if (!strays[k]) strays[k] = { prop: p, value: v, count: 0, sample: el.tagName.toLowerCase() + '.' + String(el.className.baseVal ?? el.className).split(' ').slice(0, 2).join('.') };
    strays[k].count++;
  };
  for (const el of shellEls) {
    if (el.closest('svg') || el.tagName === 'IMG') continue;
    const cs = getComputedStyle(el);
    if (own(el).length && !okCol(cs.color)) add('color', cs.color, el);
    if (!okCol(cs.backgroundColor)) add('background-color', cs.backgroundColor, el);
  }

  const hsl = (c) => {
    const m = c && c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    if (p.length > 3 && p[3] === 0) return null;
    let [r, g, b] = p.map((v) => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    if (!dd) return { h: 0, s: 0, l };
    const s = dd / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    h *= 60; if (h < 0) h += 360;
    return { h, s, l };
  };
  const green = (c) => { const x = hsl(c); return x && x.h >= 85 && x.h <= 175 && x.s >= 0.2 && x.l > 0.08 && x.l < 0.92; };
  const G = [];
  for (const el of shellEls) {
    if (el.closest('.pill,[data-status],.status')) continue;
    const cs = getComputedStyle(el);
    const props = [];
    if (own(el).length) props.push(['color', cs.color]);
    props.push(['background-color', cs.backgroundColor]);
    for (const [p, v] of props) if (green(v)) G.push({ prop: p, value: v, el: el.tagName.toLowerCase() + '.' + String(el.className).split(' ').slice(0, 2).join('.') });
  }

  const header = document.querySelector('.shell-header');
  const logo = document.querySelector('[data-grafter-lockup="header"]') || document.querySelector('[data-grafter-mark="mitre"]');
  const tabbar = document.querySelector('.shell-bottom-nav');
  const efp = {};
  const hit = (el, name) => {
    if (!el || !vis(el)) { efp[name] = 'missing'; return; }
    const r = el.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const ok = e && (el.contains(e) || e.contains(el) || e.closest('a,.shell-header,.shell-bottom-nav') === el.closest('a,.shell-header,.shell-bottom-nav'));
    efp[name] = ok ? 'ok' : ('covered by ' + (e ? e.tagName + '.' + String(e.className).slice(0, 40) : 'nothing'));
  };
  hit(header, 'header');
  hit(logo, 'logo');
  hit(tabbar, 'tabbar');

  const mark = document.querySelector('.shell-header [data-grafter-mark="mitre"]');
  let mitre = null;
  if (header && mark && vis(mark)) {
    const bar = header.querySelector('.h-14') || header;
    const hr = header.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const mr = mark.getBoundingClientRect();
    mitre = {
      markH: +mr.height.toFixed(2),
      barH: +br.height.toFixed(2),
      fullHeaderH: +hr.height.toFixed(2),
      ratio: +(mr.height / br.height).toFixed(3),
      attr: mark.getAttribute('height'),
      method: 'mark.getBoundingClientRect().height / inner h-14 bar; spec 24/56=0.429. Padded .shell-header includes safe-area paddingTop and is not the denominator.',
    };
  }

  const top50 = [...all].slice(0, 50).map((el) => {
    const r = el.getBoundingClientRect();
    return { t: el.tagName + '.' + String(el.className.baseVal ?? el.className).split(' ').slice(0, 2).join('.'), x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  });

  return {
    innerWidth: vw,
    maxRight: +maxRight.toFixed(2),
    worst,
    scrollWidth: document.documentElement.scrollWidth,
    snippetB: { pass: bBad.length === 0, bad: bBad.slice(0, 8) },
    minCR,
    below7: below7.slice(0, 12),
    contrastSamples: body.length,
    strays: Object.values(strays).slice(0, 20),
    greenOutsidePills: G.slice(0, 10),
    efp,
    mitre,
    top50,
    install: !!document.querySelector('.hub-install-anchor'),
    moreOpen: !!document.querySelector('.shell-phone-menu') && vis(document.querySelector('.shell-phone-menu')),
    searchOpen: !!document.querySelector('.overlay-backdrop'),
    allowDark: document.documentElement.getAttribute('data-allow-dark'),
    theme: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.documentElement).getPropertyValue('--g-bg').trim(),
  };
}`;

async function boot(page, url) {
  await page.clock.install({ time: new Date(CLOCK) });
  await page.addInitScript(() => { try { localStorage.removeItem('grafter-theme'); } catch {} });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shell-header', { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(280);
}

async function walk(page, { dark = false, headerOnly = true } = {}) {
  const cols = dark ? COL_DARK : COL_LIGHT;
  return page.evaluate(eval(WALKS), { shellSel: SHELL, cols, snippetHeaderOnly: headerOnly });
}

async function ctxPage(browser, width, height = HEIGHT) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  return { context, page };
}

function framePath(name) {
  const file = join(OUT, name);
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

const report = { b2: {}, snippetB: [], section1: [], more: {}, search: {}, frames: [], rawSource: [] };

const RAW_FILES = [
  'src/components/layout/AppShell.tsx',
  'src/components/layout/OperatorShell.tsx',
  'src/components/layout/appShellTheme.ts',
  'src/components/search/GlobalSearch.tsx',
  'src/components/ui/InstallPrompt.tsx',
  'src/components/ui/SWUpdatePrompt.tsx',
  'src/components/brand/BrandLockup.tsx',
  'src/components/brand/Wordmark.tsx',
];
const HEX = /#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/g;
for (const file of RAW_FILES) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  const hits = [];
  for (const line of text.split('\n')) {
    if (HEX.test(line)) hits.push(line.trim().slice(0, 120));
    HEX.lastIndex = 0;
  }
  if (hits.length) report.rawSource.push({ file, hits });
}
const css = readFileSync('src/index.css', 'utf8');
const shellStart = css.indexOf('/* ── App chrome. Tokens only.');
const shellEnd = css.indexOf('/* Field Work Take 5');
const shellCss = css.slice(shellStart, shellEnd === -1 ? undefined : shellEnd);
const shellHits = [];
for (const line of shellCss.split('\n')) {
  if (/#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(/.test(line) && !line.includes('var(--')) shellHits.push(line.trim().slice(0, 120));
}
if (shellHits.length) report.rawSource.push({ file: 'src/index.css .shell-*', hits: shellHits });

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

for (const [side, base] of [['main', BEFORE], ['s2', AFTER]]) {
  for (const width of [375, 390]) {
    const { context, page } = await ctxPage(browser, width);
    await boot(page, `${base}${JOBS}`);
    const r = await walk(page, { headerOnly: false });
    report.b2[`${side}-${width}`] = { maxRight: r.maxRight, innerWidth: r.innerWidth, worst: r.worst, scrollWidth: r.scrollWidth };
    await context.close();
  }
}

for (const width of [768, 1024, 1280, 1920]) {
  const { context, page } = await ctxPage(browser, width, width >= 1280 ? 900 : HEIGHT);
  await boot(page, `${AFTER}${JOBS}`);
  const r = await walk(page, { headerOnly: true });
  report.snippetB.push({
    width,
    pass: r.snippetB.pass,
    bad: r.snippetB.bad,
    mitre: r.mitre,
    shorts: await page.evaluate(() => [...document.querySelectorAll('.shell-nav-label-short')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.textContent)),
    fulls: await page.evaluate(() => [...document.querySelectorAll('.shell-nav-label-full')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => el.textContent)),
  });
  await context.close();
}

for (const spec of [
  { width: 390, dark: false, more: false, search: false, label: 'jobs-390-light' },
  { width: 390, dark: true, more: false, search: false, label: 'jobs-390-dark-forced' },
  { width: 1280, dark: false, more: false, search: false, label: 'jobs-1280-light' },
  { width: 1280, dark: true, more: false, search: false, label: 'jobs-1280-dark-forced' },
]) {
  const { context, page } = await ctxPage(browser, spec.width);
  await boot(page, `${AFTER}${JOBS}`);
  if (spec.dark) {
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-allow-dark', 'true');
      document.documentElement.dataset.theme = 'dark';
    });
    await page.waitForTimeout(120);
  }
  const r = await walk(page, { dark: spec.dark, headerOnly: true });
  let boxes = null;
  if (spec.dark) {
    const darkBoxes = r.top50;
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await page.waitForTimeout(80);
    const lightBoxes = (await walk(page, { dark: false, headerOnly: true })).top50;
    const n = Math.min(50, darkBoxes.length, lightBoxes.length);
    let same = 0;
    for (let i = 0; i < n; i++) {
      if (darkBoxes[i].x === lightBoxes[i].x && darkBoxes[i].y === lightBoxes[i].y && darkBoxes[i].w === lightBoxes[i].w && darkBoxes[i].h === lightBoxes[i].h) same++;
    }
    boxes = { compared: n, identical: same };
  }
  report.section1.push({
    label: spec.label,
    width: spec.width,
    dark: spec.dark,
    minCR: r.minCR,
    below7: r.below7,
    strayCount: r.strays.length,
    strays: r.strays.slice(0, 8),
    greenOutsidePills: r.greenOutsidePills,
    efp: r.efp,
    mitre: r.mitre,
    themeSwitch: boxes,
    install: r.install,
    bg: r.bg,
    allowDark: r.allowDark,
    theme: r.theme,
  });
  await context.close();
}

{
  const { context, page } = await ctxPage(browser, 390);
  await boot(page, `${AFTER}${JOBS}`);
  await page.click('[data-phone-tab="more"]');
  await page.waitForSelector('.shell-phone-menu', { timeout: 8000 });
  await page.waitForTimeout(150);
  const afterFile = framePath('s2-more-view-light-after-390.png');
  await page.screenshot({ path: afterFile, fullPage: false });
  report.frames.push(afterFile);
  report.more.after = await walk(page, { headerOnly: false });
  await context.close();
}
{
  const { context, page } = await ctxPage(browser, 390);
  await boot(page, `${BEFORE}${JOBS}`);
  await page.click('[data-phone-tab="more"]');
  await page.waitForTimeout(200);
  const beforeFile = framePath('s2-more-view-light-before-390.png');
  await page.screenshot({ path: beforeFile, fullPage: false });
  report.frames.push(beforeFile);
  await context.close();
}

for (const width of [1024, 1280]) {
  const { context, page } = await ctxPage(browser, width);
  await boot(page, `${AFTER}${JOBS}`);
  await page.click('.shell-header button[aria-label="Search"]');
  await page.waitForSelector('.overlay-backdrop', { timeout: 8000 });
  await page.waitForTimeout(150);
  if (width === 1024) {
    const afterFile = framePath('s2-search-open-light-after-1024.png');
    await page.screenshot({ path: afterFile, fullPage: false });
    report.frames.push(afterFile);
  }
  report.search[`after-${width}`] = await walk(page, { headerOnly: false });
  await context.close();
}
{
  const { context, page } = await ctxPage(browser, 1024);
  await boot(page, `${BEFORE}${JOBS}`);
  await page.click('.shell-header button[aria-label="Search"]');
  await page.waitForTimeout(200);
  const beforeFile = framePath('s2-search-open-light-before-1024.png');
  await page.screenshot({ path: beforeFile, fullPage: false });
  report.frames.push(beforeFile);
  await context.close();
}

writeFileSync(join(OUT, 's2-r2-prove.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  b2: report.b2,
  snippetB: report.snippetB.map((r) => ({ width: r.width, pass: r.pass, bad: r.bad, mitre: r.mitre })),
  section1: report.section1.map((r) => ({
    label: r.label, minCR: r.minCR, below7n: r.below7.length, strays: r.strayCount,
    green: r.greenOutsidePills.length, efp: r.efp, mitre: r.mitre, themeSwitch: r.themeSwitch, bg: r.bg,
  })),
  moreCR: report.more.after?.minCR,
  moreEfp: report.more.after?.efp,
  search1024: { open: report.search['after-1024']?.searchOpen, minCR: report.search['after-1024']?.minCR, strays: report.search['after-1024']?.strays?.length },
  search1280: { open: report.search['after-1280']?.searchOpen, minCR: report.search['after-1280']?.minCR },
  rawSource: report.rawSource.map((r) => ({ file: r.file, n: r.hits.length, hits: r.hits.slice(0, 6) })),
  frames: report.frames,
}, null, 2));

await browser.close();
