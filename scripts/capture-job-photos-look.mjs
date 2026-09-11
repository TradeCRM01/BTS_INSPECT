import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';
const OUT = 'docs/look';
const HARNESS = '/jobs/audit-doc-job?look=job-photos';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function openHarness(page) {
  await page.goto(`${BASE}${HARNESS}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#job-gallery .job-gallery-grid img', { timeout: 20000 });
  await page.waitForFunction(() => {
    const notes = document.querySelector('#job-visit-notes');
    const thumbs = [...document.querySelectorAll('#job-visit-notes [data-visit-photo] img')];
    const grid = [...document.querySelectorAll('#job-gallery .job-gallery-grid img')];
    const loaded = (img) => img.complete && img.naturalWidth > 0;
    return notes?.textContent?.includes('Fitted the new unit')
      && thumbs.length >= 3 && thumbs.every(loaded)
      && grid.length >= 6 && grid.every(loaded);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function scrollTo(page, selector) {
  return page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return { ok: false };
    target.scrollIntoView({ block: 'start', inline: 'nearest' });
    return { ok: true, top: Math.round(target.getBoundingClientRect().top), scrollY: Math.round(window.scrollY) };
  }, selector);
}

async function measure(page) {
  return page.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const cream = document.querySelector('.hub-jobs.ops-page');
    const paper = document.querySelector('.hub-jobs-document');
    const visitTitle = document.querySelector('#job-visit-notes .ops-section-title');
    const addVisit = document.querySelector('#job-visit-notes .job-visit-photo-add');
    const visitThumb = document.querySelector('#job-visit-notes [data-visit-photo]');
    const visitThumbs = [...document.querySelectorAll('#job-visit-notes [data-visit-photo] img')];
    const gallery = document.querySelector('#job-gallery');
    const galleryTitle = document.querySelector('#job-gallery .ops-section-title');
    const addGallery = document.querySelector('#job-gallery .job-gallery-add');
    const filterOn = document.querySelector('#job-gallery .job-gallery-filter[aria-pressed="true"]');
    const gridImgs = [...document.querySelectorAll('#job-gallery .job-gallery-grid img')];
    const meta = document.querySelector('#job-gallery .job-gallery-meta');
    const primary = document.querySelector('.hub-jobs-document .hub-jobs-tools .btn-primary');
    return {
      cream: cs(cream)?.backgroundColor ?? null,
      paper: cs(paper)?.backgroundColor ?? null,
      paperWidth: paper ? Math.round(paper.getBoundingClientRect().width) : null,
      visitTitleFont: visitTitle ? `${cs(visitTitle).fontFamily} ${cs(visitTitle).fontWeight}` : null,
      addVisitColor: cs(addVisit)?.color ?? null,
      visitThumbCount: visitThumbs.length,
      visitThumbLoaded: visitThumbs.every(img => img.complete && img.naturalWidth > 0),
      visitThumbSize: visitThumb ? Math.round(visitThumb.getBoundingClientRect().width) : null,
      visitThumbRadius: cs(visitThumb)?.borderRadius ?? null,
      galleryInsidePaper: !!(paper && gallery && paper.contains(gallery)),
      galleryBg: cs(gallery)?.backgroundColor ?? null,
      galleryShadow: cs(gallery)?.boxShadow ?? null,
      galleryTitleFont: galleryTitle ? `${cs(galleryTitle).fontFamily} ${cs(galleryTitle).fontWeight}` : null,
      addGalleryColor: cs(addGallery)?.color ?? null,
      filterOnColor: cs(filterOn)?.color ?? null,
      filterOnRule: cs(filterOn)?.borderBottomColor ?? null,
      gridCount: gridImgs.length,
      gridLoaded: gridImgs.every(img => img.complete && img.naturalWidth > 0),
      gridThumbSize: gridImgs[0] ? Math.round(gridImgs[0].getBoundingClientRect().width) : null,
      gridPerRow: (() => {
        if (gridImgs.length === 0) return 0;
        const top = gridImgs[0].getBoundingClientRect().top;
        return gridImgs.filter(img => Math.abs(img.getBoundingClientRect().top - top) < 2).length;
      })(),
      metaFont: meta ? `${cs(meta).fontFamily} ${cs(meta).fontWeight} ${cs(meta).textTransform}` : null,
      primaryH: primary ? Math.round(primary.getBoundingClientRect().height) : null,
      primaryBg: cs(primary)?.backgroundColor ?? null,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
    };
  });
}

const laptop = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
  locale: 'en-AU',
});
const laptopPage = await laptop.newPage();
await openHarness(laptopPage);
console.log('laptop visit scroll', await scrollTo(laptopPage, '#job-hours .ops-section-title'));
await laptopPage.waitForTimeout(200);
console.log('laptop', await measure(laptopPage));
await laptopPage.screenshot({ path: `${OUT}/visit-photos-laptop-1280.png`, type: 'png' });
console.log('laptop gallery scroll', await scrollTo(laptopPage, '#job-insp .ops-section-title'));
await laptopPage.waitForTimeout(200);
await laptopPage.screenshot({ path: `${OUT}/job-gallery-laptop-1280.png`, type: 'png' });
await laptop.close();

const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
  locale: 'en-AU',
});
const phonePage = await phone.newPage();
await openHarness(phonePage);
console.log('phone visit scroll', await scrollTo(phonePage, '#job-visit-notes .ops-section-title'));
await phonePage.waitForTimeout(200);
console.log('phone', await measure(phonePage));
await phonePage.screenshot({ path: `${OUT}/visit-photos-phone-390.png`, type: 'png' });
console.log('phone gallery scroll', await scrollTo(phonePage, '#job-gallery .ops-section-title'));
await phonePage.waitForTimeout(200);
await phonePage.screenshot({ path: `${OUT}/job-gallery-phone-390.png`, type: 'png' });
await phone.close();

await browser.close();
console.log('wrote job-photos LOOK frames');
