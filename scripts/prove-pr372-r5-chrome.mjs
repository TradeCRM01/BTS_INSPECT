import { chromium } from 'playwright';

const BASE = process.env.LOOK_BASE_URL || 'http://127.0.0.1:5173';

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
});
const page = await browser.newPage({
  viewport: { width: 1280, height: 800 },
  locale: 'en-AU',
  timezoneId: 'Australia/Perth',
});

const posts = [];
page.on('request', req => {
  if (req.method() === 'POST') {
    posts.push({
      url: req.url(),
      postData: req.postData(),
    });
  }
});

await page.goto(`${BASE}/contracts?auditAuth=1`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /New Contract|Create your first contract/i }).first().click();
await page.waitForSelector('#contract-next-service-date');

const next = page.locator('#contract-next-service-date');
await next.click();
await next.pressSequentially('21/10/20', { delay: 20 });
const afterType = await next.inputValue();
await next.press('Tab');
const afterFirstTab = await next.inputValue();

await page.getByRole('button', { name: /^Save$/i }).click();
const afterFirstSave = await page.evaluate(() => ({
  value: document.querySelector('#contract-next-service-date')?.value ?? null,
  error: document.getElementById('contract-next-service-date-error')?.textContent ?? null,
  posts: 0,
}));

await next.click();
await next.press('Tab');
const afterSecondTab = await next.inputValue();

await page.getByRole('button', { name: /^Save$/i }).press('Enter');
await page.waitForTimeout(300);

const afterEnter = await page.evaluate(() => {
  const err = document.getElementById('contract-next-service-date-error');
  const field = document.querySelector('#contract-next-service-date');
  return {
    value: field?.value ?? null,
    error: err?.textContent ?? null,
    errorVisible: !!(err && err.getClientRects().length),
  };
});

const servicePosts = posts.filter(p =>
  /service_contracts/i.test(p.url) || (p.postData && /next_service_date/i.test(p.postData)),
);

const result = {
  playwright: '1.48.2',
  browser: 'chrome',
  afterType,
  afterFirstTab,
  afterFirstSave: { ...afterFirstSave, postCount: servicePosts.length },
  afterSecondTab,
  afterEnter,
  servicePosts,
  ok:
    afterType === '21/10/20'
    && afterFirstTab === '21/10/20'
    && afterSecondTab === '21/10/20'
    && afterEnter.value === '21/10/20'
    && afterEnter.error === 'Enter the date as dd/mm/yyyy'
    && afterEnter.errorVisible
    && servicePosts.length === 0,
};

console.log(JSON.stringify(result, null, 2));
await browser.close();
if (!result.ok) process.exit(1);
