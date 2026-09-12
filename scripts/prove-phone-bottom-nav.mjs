import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/phone-bottom-nav';
const START = '/jobs?auditAuth=1&look=jobs-list';
const NAV = 'nav[aria-label="Phone navigation"]';
const NAVY = 'rgb(10, 37, 64)';
const ACCENT = 'rgb(46, 117, 182)';

mkdirSync(OUT, { recursive: true });

const notes = [];
function check(name, ok, detail) {
  notes.push({ name, ok, detail });
  if (!ok) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}

async function readShell(page) {
  return page.evaluate((sel) => {
    const nav = document.querySelector(sel);
    const main = document.querySelector('main');
    const box = (el) => {
      const r = el?.getBoundingClientRect();
      return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null;
    };
    const tabs = nav ? [...nav.querySelectorAll('[data-phone-tab]')] : [];
    return {
      pathname: window.location.pathname,
      viewH: window.innerHeight,
      navVisible: !!nav && getComputedStyle(nav).display !== 'none',
      navBg: nav ? getComputedStyle(nav).backgroundColor : null,
      nav: box(nav),
      main: box(main),
      tabs: tabs.map((el) => ({
        id: el.getAttribute('data-phone-tab'),
        label: el.querySelector('span')?.textContent ?? '',
        active: el.classList.contains('shell-bottom-tab-active'),
        current: el.getAttribute('aria-current'),
        expanded: el.getAttribute('aria-expanded'),
        topRule: getComputedStyle(el).borderTopColor,
        h: box(el)?.h ?? null,
      })),
      hamburger: !!document.querySelector('header button[aria-label="Open menu"]'),
      menuOpen: !!document.querySelector('header .md\\:hidden.border-t.bg-navy'),
      topGroups: [...document.querySelectorAll('header nav.hidden button span')].map((el) => el.textContent),
    };
  }, NAV);
}

const browser = await chromium.launch({ headless: true });

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
const page = await phone.newPage();
await page.goto(`${BASE}${START}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hub-jobs-list-doc .hub-jobs-row', { timeout: 20000 });
await page.evaluate(() => document.fonts.ready);

let shell = await readShell(page);
check('phone: bar is visible and navy', shell.navVisible && shell.navBg === NAVY, shell);
check('phone: four tabs in order', shell.tabs.map((t) => t.label).join(' / ') === 'Today / Schedule / Jobs / More', shell.tabs);
check('phone: bar sits on the viewport floor and main ends where the bar starts',
  shell.nav.bottom === shell.viewH && shell.main.bottom === shell.nav.top && shell.nav.h === 56, shell);
check('phone: every tab is at least 44px tall', shell.tabs.every((t) => t.h >= 44), shell.tabs);
check('phone: header hamburger is gone', shell.hamburger === false, shell);
check('phone: Jobs lit on /jobs with the accent rule', (() => {
  const jobs = shell.tabs.find((t) => t.id === 'jobs');
  return jobs.active && jobs.current === 'page' && jobs.topRule === ACCENT && shell.tabs.filter((t) => t.active).length === 1;
})(), shell.tabs);
await page.screenshot({ path: `${OUT}/phone-jobs.png` });

async function tap(id, expectPath) {
  await page.click(`${NAV} [data-phone-tab="${id}"]`);
  await page.waitForFunction(([sel, tab, p]) => window.location.pathname === p
    && document.querySelector(`${sel} [data-phone-tab="${tab}"]`)?.classList.contains('shell-bottom-tab-active'),
  [NAV, id, expectPath], { timeout: 10000 });
  await page.waitForTimeout(300);
  const s = await readShell(page);
  const lit = s.tabs.filter((t) => t.active).map((t) => t.id);
  check(`phone: tap ${id} lands on ${expectPath} and lights only ${id}`,
    s.pathname === expectPath && lit.length === 1 && lit[0] === id && s.menuOpen === false, { pathname: s.pathname, lit, menuOpen: s.menuOpen });
  await page.screenshot({ path: `${OUT}/phone-${id}.png` });
  return s;
}

await tap('today', '/');
await tap('schedule', '/schedule');
await tap('jobs', '/jobs');

await page.click(`${NAV} [data-phone-tab="more"]`);
await page.waitForTimeout(300);
shell = await readShell(page);
check('phone: More opens the menu and lights More', (() => {
  const more = shell.tabs.find((t) => t.id === 'more');
  return shell.menuOpen && more.active && more.expanded === 'true' && shell.tabs.filter((t) => t.active).length === 1;
})(), shell);
check('phone: the open menu stops above the bar, bar still on the viewport floor',
  shell.nav.bottom === shell.viewH && shell.nav.h === 56, shell.nav);
await page.screenshot({ path: `${OUT}/phone-more-open.png` });

const PHONE_MENU = 'header .md\\:hidden.border-t.bg-navy';
await page.click(`${PHONE_MENU} button:has-text("Financials")`);
await page.click(`${PHONE_MENU} a:has-text("Quotes")`);
await page.waitForFunction((sel) => window.location.pathname === '/quotes'
  && !document.querySelector(`${sel} .shell-bottom-tab-active`), NAV, { timeout: 10000 });
await page.waitForTimeout(300);
shell = await readShell(page);
check('phone: a menu hop to /quotes closes the menu and lights no tab',
  shell.pathname === '/quotes' && shell.menuOpen === false && shell.tabs.every((t) => !t.active), shell);
await page.screenshot({ path: `${OUT}/phone-quotes-via-more.png` });
await phone.close();

const laptop = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'en-AU' });
const lp = await laptop.newPage();
await lp.goto(`${BASE}${START}`, { waitUntil: 'domcontentloaded' });
await lp.waitForSelector('.hub-jobs-list-doc .hub-jobs-row', { timeout: 20000 });
await lp.evaluate(() => document.fonts.ready);
await lp.waitForTimeout(600);
const laptopShell = await readShell(lp);
check('laptop 1280: bar hidden, main reaches the floor, top groups unchanged',
  laptopShell.navVisible === false
    && laptopShell.main.bottom === laptopShell.viewH
    && laptopShell.topGroups.join(' / ') === 'Dashboard / CRM / Field Work / Financials / Inventory',
  laptopShell);
await lp.screenshot({ path: `${OUT}/laptop-jobs.png` });
await laptop.close();

await browser.close();
writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
console.log(notes.map((n) => `${n.ok ? 'ok  ' : 'FAIL'} ${n.name}`).join('\n'));
