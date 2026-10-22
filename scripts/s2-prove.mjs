import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((path) => path && existsSync(path));
  return candidates[0];
}

const AFTER = process.env.S2_AFTER_URL || 'http://127.0.0.1:5173';
const BEFORE = process.env.S2_BEFORE_URL || '';
const OUT = process.env.S2_OUT || 'docs/look/s2';
const N53 = 'Northside Plumbing & Gas Maintenance Services Pty Ltd';
const CLOCK = '2026-10-19T09:41:00+10:00';
const WIDTHS = [375, 390, 768, 800, 900, 1000, 1024, 1280];
const FRAME_WIDTHS = WIDTHS;
const HEIGHT = 844;
const DPR = 2;

const VIEW = {
  page: 'jobs',
  state: 'view',
  path: `/jobs?auditAuth=1&look=jobs-list&auditName=${encodeURIComponent(N53)}`,
  wait: '.shell-header',
};
const EDIT = {
  page: 'job',
  state: 'edit',
  path: `/jobs/audit-doc-job?auditAuth=1&look=visit-notes&auditName=${encodeURIComponent(N53)}`,
  wait: '.shell-header',
};

mkdirSync(OUT, { recursive: true });

function frameName(page, state, theme, side, width) {
  return `s2-${page}-${state}-${theme}-${side}-${width}.png`;
}

async function applyTheme(page, theme) {
  await page.evaluate((next) => {
    document.documentElement.dataset.theme = next;
  }, theme);
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vis = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const all = [...document.querySelectorAll('body *')].filter(vis);
    let maxRight = 0;
    for (const el of all) {
      if (el.closest('svg') && el.tagName !== 'svg') continue;
      const r = el.getBoundingClientRect();
      if (r.right > maxRight) maxRight = r.right;
    }
    const header = document.querySelector('.shell-header');
    const headerRight = header && vis(header) ? header.getBoundingClientRect().right : 0;
    let headerChildMax = 0;
    if (header) {
      for (const el of header.querySelectorAll('*')) {
        if (!vis(el)) continue;
        if (el.closest('svg') && el.tagName !== 'svg') continue;
        const r = el.getBoundingClientRect();
        if (r.right > headerChildMax) headerChildMax = r.right;
      }
    }
    const headerButtons = header
      ? [...header.querySelectorAll('a,button,[role=button]')].filter(vis).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 48),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          ok: el.scrollWidth <= el.clientWidth + 1,
          w: +r.width.toFixed(2),
          h: +r.height.toFixed(2),
          minH: parseFloat(getComputedStyle(el).minHeight) || 0,
        };
      })
      : [];
    const shorts = [...document.querySelectorAll('.shell-nav-label-short')].filter(vis).map((el) => el.textContent);
    const fulls = [...document.querySelectorAll('.shell-nav-label-full')].filter(vis).map((el) => el.textContent);
    const navBtns = [...document.querySelectorAll('.shell-nav-btn')].filter(vis).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: el.getAttribute('data-shell-nav-group'),
        w: +r.width.toFixed(2),
        h: +r.height.toFixed(2),
        tap: r.width >= 44 && r.height >= 44,
      };
    });
    const tabs = [...document.querySelectorAll('.shell-bottom-tab')].filter(vis).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: (el.textContent || '').trim(),
        w: +r.width.toFixed(2),
        h: +r.height.toFixed(2),
        tap: r.width >= 44 && r.height >= 44,
      };
    });
    const name = document.querySelector('[data-shell-switcher-name]');
    const chevron = document.querySelector('[data-shell-switcher-chevron]');
    const nameBox = name && vis(name) ? name.getBoundingClientRect() : null;
    const chevBox = chevron && vis(chevron) ? chevron.getBoundingClientRect() : null;
    const gapNameChevron = nameBox && chevBox ? +(chevBox.left - nameBox.right).toFixed(2) : null;
    const clips = [];
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
        if (el.hasAttribute('data-shell-switcher-name') || el.classList.contains('truncate')) continue;
        clips.push(`ellipsis: ${el.textContent.trim().slice(0, 50)}`);
      }
      const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!tn.length || el.closest('svg')) continue;
      for (const t of tn) {
        const rg = document.createRange();
        rg.selectNodeContents(t);
        const tr = rg.getBoundingClientRect();
        if (tr.right > vw + 0.5) clips.push(`text off screen: ${t.textContent.trim().slice(0, 40)}`);
      }
    }
    const mark = document.querySelector('[data-grafter-mark="mitre"]');
    const word = document.querySelector('[data-grafter-wordmark="header"]');
    let mitre = null;
    if (mark && word && vis(mark) && vis(word)) {
      const mr = mark.getBoundingClientRect();
      const wr = word.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(word).fontSize) || 13;
      const cap = fs * 0.69;
      mitre = {
        markH: +mr.height.toFixed(2),
        markAttr: mark.getAttribute('height'),
        wordFs: fs,
        capProxy: +cap.toFixed(2),
        ratioCapProxy: +(cap / mr.height).toFixed(3),
        ratioFont: +(fs / mr.height).toFixed(3),
        wordH: +wr.height.toFixed(2),
      };
    }
    const root = getComputedStyle(document.documentElement);
    const headerCs = header ? getComputedStyle(header) : null;
    return {
      innerWidth: vw,
      scrollWidth: document.documentElement.scrollWidth,
      maxRight: +maxRight.toFixed(2),
      headerRight: +headerRight.toFixed(2),
      headerChildMax: +headerChildMax.toFixed(2),
      overflowOk: document.documentElement.scrollWidth <= vw && maxRight <= vw + 0.5,
      headerInView: !header || headerRight <= vw + 0.5,
      headerContains: !header || headerChildMax <= vw + 0.5,
      headerButtons,
      headerButtonsOk: headerButtons.every((b) => b.ok),
      shorts,
      fulls,
      navBtns,
      navTapOk: navBtns.every((b) => b.tap),
      tabs,
      tabTapOk: tabs.length === 0 || tabs.every((t) => t.tap),
      clips,
      clipsOk: clips.length === 0,
      companyTitle: name?.getAttribute('title') || null,
      companyText: name?.textContent || null,
      gapNameChevron,
      mitre,
      tokens: {
        bg: root.getPropertyValue('--g-bg').trim(),
        ink: root.getPropertyValue('--g-ink').trim(),
        navBg: root.getPropertyValue('--g-nav-bg').trim(),
        navInk: root.getPropertyValue('--g-nav-ink').trim(),
        allowDark: document.documentElement.getAttribute('data-allow-dark'),
        theme: document.documentElement.getAttribute('data-theme'),
      },
      headerBg: headerCs?.backgroundColor || null,
      headerColor: headerCs?.color || null,
    };
  });
}

async function boot(page, url, wait) {
  await page.clock.install({ time: new Date(CLOCK) });
  await page.addInitScript(() => {
    try { localStorage.removeItem('grafter-theme'); } catch {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(wait, { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(280);
}

async function shoot({ browser, base, side, spec, width, theme, screenshot }) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: DPR,
  });
  const page = await context.newPage();
  await boot(page, `${base}${spec.path}`, spec.wait);
  await applyTheme(page, theme);
  await page.waitForTimeout(80);
  let file = null;
  if (screenshot) {
    file = join(OUT, frameName(spec.page, spec.state, theme, side, width));
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: false });
  }
  const row = await measure(page);
  await context.close();
  return { file, ...row, width, theme, side, page: spec.page, state: spec.state };
}

async function pixelDiff(browser, base, path, wait, width) {
  const context = await browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: DPR,
  });
  const page = await context.newPage();
  await boot(page, `${base}${path}`, wait);
  const light = await page.screenshot({ type: 'png' });
  const lightVars = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).getPropertyValue('--g-bg').trim(),
    allow: document.documentElement.getAttribute('data-allow-dark'),
  }));
  await applyTheme(page, 'dark');
  await page.waitForTimeout(120);
  const forced = await page.screenshot({ type: 'png' });
  const forcedVars = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).getPropertyValue('--g-bg').trim(),
    theme: document.documentElement.getAttribute('data-theme'),
    allow: document.documentElement.getAttribute('data-allow-dark'),
  }));
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-allow-dark', 'true');
    document.documentElement.dataset.theme = 'dark';
  });
  await page.waitForTimeout(120);
  const allowed = await page.screenshot({ type: 'png' });
  const allowedVars = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).getPropertyValue('--g-bg').trim(),
  }));
  await context.close();
  return {
    equalForced: Buffer.compare(light, forced) === 0,
    equalAllowed: Buffer.compare(light, allowed) === 0,
    lightVars,
    forcedVars,
    allowedVars,
    bytes: light.length,
  };
}

const report = {
  frames: [],
  measured: [],
  allowDark: null,
};

const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const sides = BEFORE ? ['before', 'after'] : ['after'];

for (const side of sides) {
  const base = side === 'before' ? BEFORE : AFTER;
  for (const theme of ['light']) {
    const widths = FRAME_WIDTHS;
    for (const width of widths) {
      const row = await shoot({
        browser,
        base,
        side,
        spec: VIEW,
        width,
        theme,
        screenshot: true,
      });
      report.frames.push({
        file: row.file,
        page: row.page,
        state: row.state,
        theme,
        side,
        width,
      });
    }
  }
}

for (const spec of [VIEW, EDIT]) {
  for (const width of WIDTHS) {
    const row = await shoot({
      browser,
      base: AFTER,
      side: 'after',
      spec,
      width,
      theme: 'light',
      screenshot: spec === VIEW,
    });
    report.measured.push({
      page: spec.page,
      state: spec.state,
      width,
      innerWidth: row.innerWidth,
      scrollWidth: row.scrollWidth,
      maxRight: row.maxRight,
      headerRight: row.headerRight,
      headerChildMax: row.headerChildMax,
      overflowOk: row.overflowOk,
      headerInView: row.headerInView,
      headerContains: row.headerContains,
      headerButtonsOk: row.headerButtonsOk,
      clipsOk: row.clipsOk,
      clips: row.clips,
      shorts: row.shorts,
      fulls: row.fulls,
      navTapOk: row.navTapOk,
      navBtns: row.navBtns,
      tabTapOk: row.tabTapOk,
      tabs: row.tabs,
      companyTitle: row.companyTitle,
      gapNameChevron: row.gapNameChevron,
      mitre: row.mitre,
      tokens: row.tokens,
      headerBg: row.headerBg,
    });
  }
}

report.allowDark = await pixelDiff(browser, AFTER, VIEW.path, VIEW.wait, 1280);

writeFileSync(join(OUT, 's2-prove.json'), JSON.stringify(report, null, 2));
const fail = report.measured.filter((r) =>
  !r.overflowOk || !r.headerInView || !r.headerContains || !r.headerButtonsOk || !r.clipsOk || !r.navTapOk || !r.tabTapOk,
);
console.log(JSON.stringify({
  frames: report.frames.length,
  measured: report.measured.length,
  measureFails: fail.length,
  failRows: fail.map((r) => ({
    state: r.state,
    width: r.width,
    overflowOk: r.overflowOk,
    headerInView: r.headerInView,
    headerContains: r.headerContains,
    headerButtonsOk: r.headerButtonsOk,
    clipsOk: r.clipsOk,
    clips: r.clips,
    navTapOk: r.navTapOk,
    tabTapOk: r.tabTapOk,
    gapNameChevron: r.gapNameChevron,
  })),
  allowDark: report.allowDark,
  mitre1280: report.measured.find((r) => r.state === 'view' && r.width === 1280)?.mitre,
  shorts800: report.measured.find((r) => r.state === 'view' && r.width === 800)?.shorts,
  fulls1024: report.measured.find((r) => r.state === 'view' && r.width === 1024)?.fulls,
  gap1280: report.measured.find((r) => r.state === 'view' && r.width === 1280)?.gapNameChevron,
}, null, 2));

await browser.close();
