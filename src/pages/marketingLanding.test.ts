import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

    expect(page).toContain('data-price-slot');
    expect(page).toContain('$59');
    expect(page).toContain('$119');
    expect(page).toContain('$199');
    expect(page).not.toContain('$79');
    expect(page).not.toContain('$149');
    expect(page).not.toContain('$249');
    expect(page).toContain('aria-hidden="true">mo');
    expect(page).toContain('className="sr-only">per month');
    expect(page).toContain('3 months free');
    expect(page).toContain('Then you pay for seats. Every plan is the same Grafter.');
    expect(page).toContain('Crew');
    expect(page).toContain('Company');
    expect(page).toContain('Plant');
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
    expect(page).toContain('{LANDING_SEED_JOB.ref} · {LANDING_SEED_JOB.title} · {LANDING_SEED_JOB.time}');
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
    expect(look).toContain('--mkt-page: #F5F0E6');
    expect(look).toContain('--mkt-sheet: #FFFDF8');
    expect(look).toContain('--mkt-ink: #0A2540');
    expect(look).toContain('--mkt-muted: #5B6B7C');
    expect(look).toContain('--mkt-line: #E2D9CC');
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

describe('public landing seed frames', () => {
  it('keeps the job-frame meta time and the #0036 board block on one constant', () => {
    const page = src('src/pages/MarketingPage.tsx');
    expect(page).toMatch(/time: '07:00–10:30'/);
    const jobMeta = '{LANDING_SEED_JOB.company} · Today · {LANDING_SEED_JOB.time}';
    const boardBlock = '{LANDING_SEED_JOB.ref} · {LANDING_SEED_JOB.title} · {LANDING_SEED_JOB.time}';
    expect(page).toContain(jobMeta);
    expect(page).toContain(boardBlock);
    expect(page.indexOf(jobMeta)).toBeLessThan(page.indexOf('function ScheduleFrame'));
    expect(page.indexOf(boardBlock)).toBeGreaterThan(page.indexOf('function ScheduleFrame'));
    expect(page).toContain('{LANDING_SEED_TOM.ref} · {LANDING_SEED_TOM.title} · {LANDING_SEED_TOM.time}');
    expect(page.indexOf("ref: '#0040'")).toBeGreaterThan(0);
    expect(boardBlock).not.toEqual('{LANDING_SEED_TOM.ref} · {LANDING_SEED_TOM.title} · {LANDING_SEED_TOM.time}');
    expect(page).toContain('hub-marketing-board-row mt-2');
    expect(page).toContain('ops-crew-mark bg-navy');
    expect(page).toContain('ops-crew-mark bg-warning');
    expect(page).toContain('hub-marketing-block-part !bg-zebra !border-l-warning');
    expect(page).not.toContain('hub-marketing-block-long !bg-zebra');
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
