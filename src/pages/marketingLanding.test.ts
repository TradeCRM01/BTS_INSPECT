/**
 * @vitest-environment jsdom
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketingPage } from './MarketingPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('public Grafter landing', () => {
  it('shows visitors a marketing page and keeps the dashboard for a signed-in session', () => {
    const root = src('src/pages/RootPage.tsx');
    expect(root).toContain('if (!user) return <MarketingPage />');
    expect(root).toContain('DashboardPage');
    expect(src('src/App.tsx')).toContain('path="/" element={<RootPage />}');
  });

  it('locks conversion copy on the existing public home, not the old brochure', () => {
    const page = src('src/pages/MarketingPage.tsx');
    const css = src('src/index.css');
    expect(page).toContain('Quote it. Send it. Get paid.');
    const displayRule = css.slice(
      css.indexOf('.hub-marketing-display {'),
      css.indexOf('.hub-marketing-display-sm'),
    );
    expect(displayRule).toContain('white-space: nowrap');
    expect(displayRule).toMatch(/font-size:\s*clamp\(/);
    expect(page).toContain('Quote, schedule, invoice.');
    expect(page).toContain('JobFrame');
    expect(page).toContain('ScheduleFrame');
    expect(page.indexOf('<JobFrame />')).toBeGreaterThan(page.indexOf('hub-marketing-hero'));
    expect(page.indexOf('<JobFrame />')).toBeLessThan(page.indexOf('Send a GST quote.'));
    expect(page.indexOf('<ScheduleFrame />')).toBeGreaterThan(page.indexOf('Drop the job on a name.'));
    expect(page.indexOf('<ScheduleFrame />')).toBeLessThan(page.indexOf('Arriving. Clock in. Hours on the sheet.'));

    const heroCopy = page.slice(page.indexOf('hub-marketing-hero'), page.indexOf('<JobFrame'));
    expect(heroCopy).toContain('Quote, schedule, invoice.');
    expect(heroCopy).not.toMatch(/\bJHA\b/);
    expect(heroCopy).not.toMatch(/Take 5/);
    expect(heroCopy).not.toMatch(/\bSWMS\b/);
    expect(heroCopy).not.toMatch(/inspection/i);

    const titles = [
      'Send a GST quote.',
      'Invoice the same job.',
      'Drop the job on a name.',
      'Arriving. Clock in. Hours on the sheet.',
      'Paperwork stays with the work.',
    ];
    let cursor = page.indexOf('Send a GST quote.');
    expect(cursor).toBeGreaterThan(page.indexOf('hub-marketing-hero'));
    for (const title of titles) {
      const next = page.indexOf(title, cursor);
      expect(next).toBeGreaterThanOrEqual(cursor);
      cursor = next;
    }
    expect(page.indexOf('Paperwork stays with the work.')).toBeGreaterThan(
      page.indexOf('Arriving. Clock in. Hours on the sheet.'),
    );

    expect(page).toContain("Accepting doesn't book the job");
    expect(page).toContain('You book it with one more tap');
    expect(page).not.toMatch(/Accept books the job/i);
    expect(page).not.toMatch(/Accept schedules the job/i);

    expect(page).toContain('data-price-slot="crew"');
    expect(page).toContain('hub-marketing-subhead !text-navy');
    expect(page).not.toContain('$59');
    expect(page).not.toContain('$119');
    expect(page).not.toContain('$199');
    expect(page).not.toContain('$79');
    expect(page).not.toContain('$149');
    expect(page).not.toContain('$249');
    expect(page).not.toContain('aria-hidden="true">mo');
    expect(page).not.toContain('className="sr-only">per month');
    expect(page).not.toContain('3 months free');
    expect(page).not.toContain('3-month');
    expect(page).not.toContain('seat pack');
    expect(page).toContain('2 months free. Then one simple weekly price.');
    expect(page).toContain('One plan. Every feature. AUD, GST included.');
    expect(page).toContain('Up to 10 seats');
    expect(page).toContain('>2 months free<');
    expect(page).toContain('Then one simple weekly price for up to 10 seats. GST included.');
    expect(page).toContain('Crews over 10 seats: talk to us.');
    expect(page).not.toContain('Crews over 10</p>');
    expect(page).not.toContain('Talk to us.');
    expect(page).toContain('One plan up to 10 seats, and bigger crews talk to us.');
    expect(page).toContain('Prices are AUD, GST included.');
    expect(page).toContain('2 months free. Instant signup. Your jobs, your templates, your letterhead.');
    expect(page).toContain('Jobs, custom templates, JHA, Take 5 and SWMS, all included.');
    expect(page).not.toContain('Same Grafter either way');
    expect(page).toContain('max-w-md');
    expect(page).toContain('Crew');
    expect(page).not.toContain('Company');
    expect(page).not.toContain('Plant');
    expect(page).toContain('GST included');
    expect(page).not.toContain('$\u2014');
    expect(page).not.toContain('TBA');
    expect(page).not.toContain('SUPERNINTENDO_PRICE_FILL');
    expect(page).toContain('Create a workspace');
    expect(page).toContain('PublicLegalLinks');
    expect(page).toContain('Australian trade job software');
    expect(page).toContain('Which trades is it for?');
    expect(page).toContain(
      'Any trade crew: plumbing, gas, drainage, carpentry, mechanical, electrical, maintenance.',
    );
    expect(page).not.toMatch(/<details[^>]*\sopen\b/);
    expect(page).toContain('Custom templates, JHA and Take 5, with your SWMS attached, all filed on the job.');
    expect(page).toContain("ref: '#0036'");
    expect(page).toContain('Blocked sewer, CCTV inspection');
    expect(page).toContain('12 Grange Rd, Stafford');
    expect(page).toContain('{LANDING_SEED_JOB.company} · Today · {LANDING_SEED_JOB.time}');
    expect(page).toContain('time={LANDING_SEED_JOB.time}');
    expect(page).not.toContain('Workshop Rd');
    expect(page).not.toContain('Workshop fit-out');
    expect(page).not.toContain('Mon 19 Oct');
    expect(page).not.toContain('#0036.01');
    expect(page).not.toContain('0042');
    expect(page).toContain("ref: '#0040'");
    expect(page).toContain('Toilet cistern replacement');
    expect(page).toContain('07:30–09:30');
    expect(page).toContain('Dean Moretti');
    expect(page).toContain('Tom Nguyen');
    expect(page).not.toContain('Field Audit');
    expect(page).not.toContain('Perth');
    expect(page).not.toContain('\u2014');
    expect(page).not.toContain('electrical and trade');
    expect(page).not.toContain('Northside Electrical');
    expect(page).not.toContain('Switchboard upgrade');
    expect(page).not.toContain('from the ute');
    expect(page).not.toMatch(/SafetyCulture|Simpro/i);
    expect(page).toContain('/signup');
    expect(page).toContain('/login');
    expect(page).toContain('Australian-built. grafter.com.au');
    expect(page).not.toContain('brushless');
    expect(page).not.toContain('Fraunces');
    expect(page).not.toContain('Geist');
    expect(css).toContain('background: var(--ops-cream)');
    const lookStart = css.indexOf('/* Public landing look only.');
    const lookEnd = css.indexOf('/* Public legal paper + auth/marketing legal-link chrome only.');
    const look = css.slice(lookStart, lookEnd);
    expect(look).toContain("font-family: Rajdhani, sans-serif");
    expect(look).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(look).toContain('--mkt-page: var(--g-bg)');
    expect(look).toContain('--mkt-sheet: var(--g-surface)');
    expect(look).toContain('--mkt-ink: var(--g-ink)');
    expect(look).toContain('--mkt-muted: var(--g-ink-muted)');
    expect(look).toContain('--mkt-line: var(--g-line)');
    expect(look).toContain('background: #2E75B6');
    expect(look).toContain('height: 44px');
    expect(look).toContain('border-radius: 16px');
    expect(look).toContain('inset 0 1px 0 #fff');
    expect(look).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(look).toContain('font-variant-numeric: tabular-nums');
    expect(look).toContain('#pricing.hub-marketing-band');
    expect(look).toContain('.hub-marketing-hero .hub-marketing-frame');
    expect(look).not.toMatch(/\.hub-marketing-hero[^{]*\{[^}]*background: var\(--mkt-sheet\)/);
    expect(look).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex|Fraunces|Geist/);
    expect(look).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow|lacquer|gloss|glow/);
    expect(look).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
  });
});

describe('public landing dollar-free pricing cards', () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    host?.remove();
    root = null;
    host = null;
  });

  it('renders one card with no dollar figures and no signup on talk to us', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(createElement(MemoryRouter, null, createElement(MarketingPage)));
    });

    const text = host.innerText || host.textContent || '';
    expect(text).toContain('One plan. Every feature. AUD, GST included.');
    expect(text).toContain('Up to 10 seats');
    expect(text).toContain('2 months free');
    expect(text).toContain('Then one simple weekly price for up to 10 seats. GST included.');
    expect(text).toContain('Crews over 10 seats: talk to us.');
    expect(text).toContain('Create a workspace');
    expect(text).not.toContain('$');
    expect(text).not.toContain('3 months');
    expect(text).not.toContain('Company');
    expect(text).not.toContain('Plant');
    expect(text).not.toContain('per month');

    const pricing = host.querySelector('#pricing');
    expect(pricing).toBeTruthy();
    expect(pricing!.querySelectorAll('article').length).toBe(1);
    const workspaceLinks = [...pricing!.querySelectorAll('a')].filter((a) =>
      (a.textContent || '').includes('Create a workspace'),
    );
    expect(workspaceLinks.length).toBe(1);
    expect(workspaceLinks[0]?.getAttribute('href')).toBe('/signup');

    const talkMatches = [...pricing!.querySelectorAll('*')].filter((el) =>
      /talk to us/i.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 80,
    );
    expect(talkMatches.length).toBeGreaterThan(0);
    for (const el of talkMatches) {
      expect(el.closest('a')?.getAttribute('href') ?? null).not.toBe('/signup');
    }
  });
});

describe('public landing seed frames', () => {
  it('keeps the job-frame meta time and the #0036 board block on one constant', () => {
    const page = src('src/pages/MarketingPage.tsx');
    expect(page).toMatch(/time: '07:00–10:30'/);
    const jobMeta = '{LANDING_SEED_JOB.company} · Today · {LANDING_SEED_JOB.time}';
    expect(page).toContain(jobMeta);
    expect(page.indexOf(jobMeta)).toBeLessThan(page.indexOf('function ScheduleFrame'));
    expect(page.indexOf('time={LANDING_SEED_JOB.time}')).toBeGreaterThan(page.indexOf('function ScheduleFrame'));
    expect(page).toContain('time={LANDING_SEED_TOM.time}');
    expect(page).toContain('{jobRef} · {title}');
    expect(page).toContain('block min-w-0 whitespace-normal break-words sm:inline sm:whitespace-nowrap');
    expect(page).toContain('block sm:inline');
    expect(page).toContain('whitespace-normal sm:whitespace-nowrap');
    expect(page).not.toContain('whitespace-nowrap sm:whitespace-nowrap');
    expect(page).toContain('!overflow-visible');
    expect(page).not.toContain('truncate');
    expect(page.indexOf("ref: '#0040'")).toBeGreaterThan(0);
    expect(page).toContain('hub-marketing-board-row mt-2');
    expect(page).toContain('ops-crew-mark bg-navy');
    expect(page).toContain('ops-crew-mark bg-warning');
    expect(page).toContain('!bg-zebra !border-l-warning');
    expect(page).toContain('!text-[11px]');
    expect(page).not.toContain('hub-marketing-block-part');
    expect(page).toContain('mt-6 md:mt-8');
    expect(page).toContain('Invoice the same job.');
    expect(page).toContain('Paperwork stays with the work.');
  });
});

describe('public landing look frames', () => {
  it('covers desktop hero, phone hero, and desktop pricing near the bottom', () => {
    for (const rel of [
      'docs/look/landing-hero-desktop.png',
      'docs/look/landing-hero-phone.png',
      'docs/look/landing-pricing-desktop.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
