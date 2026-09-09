import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/proof/schedule-dispatch';
const JOB = 'audit-doc-job';
const UNDATED = 'audit-undated-job';
const FIELD = '00000000-0000-0000-0000-000000000002';
const SAM = 'audit-crew-sam';
const OPEN = '__unassigned__';

mkdirSync(OUT, { recursive: true });

async function html5Drop(page, sourceSel, targetSel, jobId = JOB) {
  const ok = await page.evaluate(({ sourceSel, targetSel, jobId }) => {
    const pick = (sel) => [...document.querySelectorAll(sel)].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) ?? null;
    const source = pick(sourceSel);
    const target = pick(targetSel);
    if (!source || !target) {
      const listed = [...document.querySelectorAll(targetSel)].map((el) => {
        const r = el.getBoundingClientRect();
        return `${el.getAttribute('data-week-cell') || el.getAttribute('data-crew-drop')}:${Math.round(r.width)}x${Math.round(r.height)}`;
      });
      return { ok: false, reason: `missing ${!source ? 'source' : 'target'} ${listed.join(',')}` };
    }
    const dt = new DataTransfer();
    dt.setData('text/plain', jobId);
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    return { ok: true };
  }, { sourceSel, targetSel, jobId: JOB });
  if (!ok.ok) throw new Error(ok.reason);
  await page.waitForTimeout(250);
}

async function dayRowsForJob(page) {
  return page.evaluate((jobId) => (
    [...document.querySelectorAll('[data-crew-drop]')].filter((row) => (
      row.querySelector(`[data-schedule-job="${jobId}"]`)
    )).map((row) => row.getAttribute('data-crew-drop'))
  ), JOB);
}

async function weekCellsForJob(page) {
  return page.evaluate((jobId) => (
    [...document.querySelectorAll('[data-week-cell]')].filter((cell) => (
      cell.querySelector(`[data-schedule-job="${jobId}"]`)
    )).map((cell) => cell.getAttribute('data-week-cell'))
  ), JOB);
}

async function openAudit(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-schedule-view]', { timeout: 20000 });
}

const browser = await chromium.launch({ headless: true });
const notes = {};

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openAudit(page, '/schedule?view=day&auditAuth=1&date=2026-08-25');
  await page.locator(`.hub-schedule-desk [data-schedule-job="${JOB}"]`).first().waitFor({ timeout: 20000 });
  await page.locator(`.hub-schedule-desk [data-crew-drop="${SAM}"]`).waitFor();
  notes.dayBefore = await dayRowsForJob(page);
  await html5Drop(page, `[data-schedule-job="${JOB}"]`, `[data-crew-drop="${SAM}"]`);
  notes.dayAfterSam = await dayRowsForJob(page);
  await page.screenshot({ path: `${OUT}/day-after-replace-sam.png` });
  await html5Drop(page, `[data-schedule-job="${JOB}"]`, `[data-crew-drop="${OPEN}"]`);
  notes.dayAfterUnassigned = await dayRowsForJob(page);
  await page.screenshot({ path: `${OUT}/day-after-unassigned.png` });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openAudit(page, '/schedule?view=day&auditAuth=1&date=2026-08-25');
  await page.locator(`.hub-schedule-desk [data-schedule-job="${JOB}"]`).first().waitFor({ timeout: 20000 });
  await page.locator('.hub-schedule-filters button', { hasText: 'Week' }).click();
  await page.locator('div.hidden.lg\\:block [data-week-board="1"]').waitFor({ timeout: 20000 });
  await page.waitForFunction((key) => (
    [...document.querySelectorAll(`[data-week-cell="${key}"]`)].some((el) => el.getBoundingClientRect().width > 0)
  ), `${SAM}:2026-08-25`);
  notes.weekBefore = await weekCellsForJob(page);
  await html5Drop(
    page,
    `[data-schedule-job="${JOB}"]`,
    `[data-week-cell="${SAM}:2026-08-25"]`,
  );
  notes.weekAfterSam = await weekCellsForJob(page);
  await page.screenshot({ path: `${OUT}/week-after-replace-sam.png` });
  await html5Drop(
    page,
    `[data-schedule-job="${JOB}"]`,
    `[data-week-cell="${OPEN}:2026-08-25"]`,
  );
  notes.weekAfterUnassigned = await weekCellsForJob(page);
  await page.screenshot({ path: `${OUT}/week-after-unassigned.png` });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openAudit(page, '/schedule?view=day&auditAuth=1&date=2026-08-25');
  await page.waitForSelector('[data-crew-drop]', { timeout: 20000 });
  notes.phoneZones = await page.evaluate(() => (
    [...document.querySelectorAll('[data-crew-drop]')].map((el) => ({
      id: el.getAttribute('data-crew-drop'),
      name: el.querySelector('.hub-schedule-crew-name')?.textContent?.trim() ?? '',
    }))
  ));
  notes.phoneBefore = await dayRowsForJob(page);
  await html5Drop(page, `[data-schedule-job="${JOB}"]`, `[data-crew-drop="${SAM}"]`);
  notes.phoneAfterSam = await dayRowsForJob(page);
  await page.screenshot({ path: `${OUT}/phone-day-after-replace-sam.png`, fullPage: true });

  const search = page.getByPlaceholder('Search jobs or clients...');
  await search.fill('Meter');
  const hit = page.locator('[data-schedule-search-hit="audit-undated-job"]').first();
  if (await hit.count()) {
    await hit.click();
    await page.locator('.hub-schedule-step').nth(1).click();
    await page.waitForTimeout(200);
    notes.placeCopy = (await page.locator('.hub-schedule-place').first().textContent().catch(() => ''))
      ?.replace(/\s+/g, ' ')
      .trim() ?? null;
  }
  await page.screenshot({ path: `${OUT}/phone-day-place-copy.png`, fullPage: true });
  await page.close();
}

writeFileSync(`${OUT}/notes.json`, JSON.stringify(notes, null, 2));
console.log(JSON.stringify(notes, null, 2));

const stackedDay = (notes.dayAfterSam ?? []).includes(FIELD) && (notes.dayAfterSam ?? []).includes(SAM);
const stackedWeek = (notes.weekAfterSam ?? []).some((cell) => cell?.startsWith(`${FIELD}:`))
  && (notes.weekAfterSam ?? []).some((cell) => cell?.startsWith(`${SAM}:`));
const stackedPhone = (notes.phoneAfterSam ?? []).includes(FIELD) && (notes.phoneAfterSam ?? []).includes(SAM);

if (!(notes.dayAfterSam ?? []).includes(SAM) || stackedDay) {
  throw new Error(`day replace failed: ${JSON.stringify(notes.dayAfterSam)}`);
}
if (!(notes.dayAfterUnassigned ?? []).includes(OPEN)) {
  throw new Error(`day unassigned failed: ${JSON.stringify(notes.dayAfterUnassigned)}`);
}
if (!(notes.weekAfterSam ?? []).some((cell) => cell?.startsWith(`${SAM}:`)) || stackedWeek) {
  throw new Error(`week replace failed: ${JSON.stringify(notes.weekAfterSam)}`);
}
if (!(notes.weekAfterUnassigned ?? []).some((cell) => cell?.startsWith(`${OPEN}:`))) {
  throw new Error(`week unassigned failed: ${JSON.stringify(notes.weekAfterUnassigned)}`);
}
if ((notes.phoneZones ?? []).length < 3) {
  throw new Error(`phone day missing crew drop zones: ${JSON.stringify(notes.phoneZones)}`);
}
if (!(notes.phoneAfterSam ?? []).includes(SAM) || stackedPhone) {
  throw new Error(`phone replace failed: ${JSON.stringify(notes.phoneAfterSam)}`);
}
if (notes.placeCopy && /today at 8:00/.test(notes.placeCopy)) {
  throw new Error(`place copy still baked today: ${notes.placeCopy}`);
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openAudit(page, '/schedule?view=day&auditAuth=1&date=2026-08-25');
  await page.locator(`[data-schedule-rail-job="${UNDATED}"]`).waitFor({ timeout: 20000 });
  notes.undatedRailBefore = await page.locator(`[data-schedule-rail-job="${UNDATED}"]`).count();
  await html5Drop(page, `[data-schedule-rail-job="${UNDATED}"]`, `[data-crew-drop="${SAM}"]`, UNDATED);
  notes.undatedDayRows = await page.evaluate((jobId) => (
    [...document.querySelectorAll('[data-crew-drop]')].filter((row) => (
      row.querySelector(`[data-schedule-job="${jobId}"]`)
    )).map((row) => row.getAttribute('data-crew-drop'))
  ), UNDATED);
  notes.undatedDayChips = await page.locator(`.hub-day-board [data-schedule-job="${UNDATED}"]`).count();
  notes.undatedRailAfterDrop = await page.locator(`[data-schedule-rail-job="${UNDATED}"]`).count();
  notes.undatedNewJobAfterDrop = await page.getByText('New Job', { exact: true }).count();
  await page.screenshot({ path: `${OUT}/day-after-place-undated.png` });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openAudit(page, '/schedule?auditAuth=1');
  await page.locator('div.hidden.lg\\:block [data-week-board="1"]').waitFor({ timeout: 20000 });
  await page.locator(`[data-schedule-rail-job="${UNDATED}"]`).waitFor();
  const samCell = page.locator('div.hidden.lg\\:block [data-week-cell^="audit-crew-sam:"]').first();
  await samCell.waitFor();
  notes.weekPlaceCell = await samCell.getAttribute('data-week-cell');
  await page.locator(`[data-schedule-rail-job="${UNDATED}"]`).click();
  await page.locator('.hub-schedule-place').first().waitFor();
  await samCell.click();
  notes.weekClickCells = await page.evaluate((jobId) => (
    [...document.querySelectorAll('[data-week-cell]')].filter((cell) => (
      cell.querySelector(`[data-schedule-job="${jobId}"]`)
    )).map((cell) => cell.getAttribute('data-week-cell'))
  ), UNDATED);
  notes.weekClickChips = await page.locator(`.hub-week-board [data-schedule-job="${UNDATED}"]`).count();
  notes.weekClickRail = await page.locator(`[data-schedule-rail-job="${UNDATED}"]`).count();
  notes.weekClickNewJob = await page.getByText('New Job', { exact: true }).count();
  await page.screenshot({ path: `${OUT}/week-after-click-place-undated.png` });
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openAudit(page, '/schedule?auditAuth=1');
  await page.locator('div.hidden.lg\\:block [data-week-board="1"]').waitFor({ timeout: 20000 });
  const search = page.getByPlaceholder('Search jobs or clients...');
  await search.fill('Meter');
  const hit = page.locator(`[data-schedule-search-hit="${UNDATED}"]`).first();
  await hit.waitFor({ timeout: 20000 });
  const samCell = page.locator('div.hidden.lg\\:block [data-week-cell^="audit-crew-sam:"]').first();
  notes.searchPlaceCell = await samCell.getAttribute('data-week-cell');
  await html5Drop(
    page,
    `[data-schedule-search-hit="${UNDATED}"]`,
    `div.hidden.lg\\:block [data-week-cell="${notes.searchPlaceCell}"]`,
    UNDATED,
  );
  notes.searchWeekCells = await page.evaluate((jobId) => (
    [...document.querySelectorAll('[data-week-cell]')].filter((cell) => (
      cell.querySelector(`[data-schedule-job="${jobId}"]`)
    )).map((cell) => cell.getAttribute('data-week-cell'))
  ), UNDATED);
  notes.searchWeekChips = await page.locator(`.hub-week-board [data-schedule-job="${UNDATED}"]`).count();
  notes.searchWeekRail = await page.locator(`[data-schedule-rail-job="${UNDATED}"]`).count();
  notes.searchWeekNewJob = await page.getByText('New Job', { exact: true }).count();
  await page.screenshot({ path: `${OUT}/week-after-search-drop-undated.png` });
  await page.close();
}

if (notes.undatedRailBefore !== 1) {
  throw new Error(`unscheduled rail missing before place: ${notes.undatedRailBefore}`);
}
if (!(notes.undatedDayRows ?? []).includes(SAM) || (notes.undatedDayRows ?? []).length !== 1) {
  throw new Error(`unscheduled day place failed: ${JSON.stringify(notes.undatedDayRows)}`);
}
if (notes.undatedDayChips !== 1 || notes.undatedRailAfterDrop !== 0) {
  throw new Error(`unscheduled day duplicate: chips=${notes.undatedDayChips} rail=${notes.undatedRailAfterDrop}`);
}
if (notes.undatedNewJobAfterDrop) {
  throw new Error('rail drop opened New Job');
}
if (!(notes.weekClickCells ?? []).includes(notes.weekPlaceCell) || notes.weekClickChips !== 1) {
  throw new Error(`click place failed: ${JSON.stringify(notes.weekClickCells)} chips=${notes.weekClickChips}`);
}
if (notes.weekClickRail !== 0 || notes.weekClickNewJob) {
  throw new Error(`click place left rail or opened New Job: rail=${notes.weekClickRail} form=${notes.weekClickNewJob}`);
}
if (!(notes.searchWeekCells ?? []).includes(notes.searchPlaceCell) || notes.searchWeekChips !== 1) {
  throw new Error(`search drop failed: ${JSON.stringify(notes.searchWeekCells)} chips=${notes.searchWeekChips}`);
}
if (notes.searchWeekRail !== 0 || notes.searchWeekNewJob) {
  throw new Error(`search drop left rail or opened New Job: rail=${notes.searchWeekRail} form=${notes.searchWeekNewJob}`);
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openAudit(page, '/schedule?auditAuth=1');
  await page.locator('div.hidden.lg\\:block [data-week-board="1"]').waitFor({ timeout: 20000 });
  const search = page.getByPlaceholder('Search jobs or clients...');
  await search.fill('Meter');
  await page.locator(`[data-schedule-search-hit="${UNDATED}"]`).first().click();
  await page.locator('.hub-schedule-place').first().waitFor();
  const samCell = page.locator('div.hidden.lg\\:block [data-week-cell^="audit-crew-sam:"]').first();
  notes.searchClickCell = await samCell.getAttribute('data-week-cell');
  await samCell.click();
  notes.searchClickCells = await page.evaluate((jobId) => (
    [...document.querySelectorAll('[data-week-cell]')].filter((cell) => (
      cell.querySelector(`[data-schedule-job="${jobId}"]`)
    )).map((cell) => cell.getAttribute('data-week-cell'))
  ), UNDATED);
  notes.searchClickChips = await page.locator(`.hub-week-board [data-schedule-job="${UNDATED}"]`).count();
  notes.searchClickNewJob = await page.getByText('New Job', { exact: true }).count();
  await page.screenshot({ path: `${OUT}/week-after-search-click-undated.png` });
  await page.close();
}

if (!(notes.searchClickCells ?? []).includes(notes.searchClickCell) || notes.searchClickChips !== 1) {
  throw new Error(`search click place failed: ${JSON.stringify(notes.searchClickCells)} chips=${notes.searchClickChips}`);
}
if (notes.searchClickNewJob) {
  throw new Error('search then cell click opened New Job');
}

await browser.close();
console.log('schedule dispatch proof ok');
