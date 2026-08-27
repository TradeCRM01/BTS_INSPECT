import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultPdfColors } from '../reports/shared/styles';
import {
  TAKE5_REPORT_THEME_KEYS,
  take5DocumentColors,
} from '../reports/take5/theme';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Take 5 list cream paper look', () => {
  it('paints the list as cream paper rows, not poster cards', () => {
    const list = src('src/pages/Take5ListPage.tsx');
    const css = src('src/index.css');

    expect(list).toContain('hub-take5');
    expect(list).toContain('hub-take5-sheet');
    expect(list).toContain('hub-take5-row');
    expect(list).toContain('hub-take5-pill');
    expect(list).toContain('GO/STOP');
    expect(list).toContain('TAKE5_LIST_FILTERS');
    expect(list).toContain('take5ListOpenHref');
    expect(list).toContain('recommendTake5ListAction');
    expect(list).not.toContain('function Take5Card');
    expect(list).not.toContain('take5-doc-theme');
    expect(list).not.toContain('take5DocumentColors');
    expect(list).not.toContain('report_theme');
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toContain('OpsDocHead');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-take5.ops-page');
    expect(css).toContain('--take5-look-page: #F5F0E6');
    expect(css).toContain('--take5-look-sheet: #FFFDF8');
    expect(css).toContain('--take5-look-ink: #0A2540');
    expect(css).toContain('--take5-look-muted: #5B6B7C');
    expect(css).toContain('--take5-look-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toMatch(/\.hub-take5 \.ops-page-title[\s\S]{0,160}Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).toContain('letter-spacing: 0.12em');
    expect(css).not.toContain('indigo-500');
    expect(css).not.toMatch(/\.hub-take5[\s\S]{0,80}#111|#000\b/);
  });

  it('does not restyle Take 5 fill/PDF, JHA list, jobs, quotes, invoices, login, landing, or AppShell', () => {
    const list = src('src/pages/Take5ListPage.tsx');
    expect(list).not.toContain('generateTake5Pdf');
    expect(list).not.toContain('JhaDocumentsPage');
    expect(list).not.toContain('JobsPage');
    expect(list).not.toContain('hub-jobs');
    expect(list).not.toContain('hub-quotes');
    expect(list).not.toContain('hub-invoices');

    const fill = src('src/pages/Take5Page.tsx');
    expect(fill).toContain('take5-doc-theme');
    expect(fill).toContain('take5DocumentColors');
    expect(fill).not.toContain('hub-take5');

    const jhaList = src('src/pages/JhaDocumentsPage.tsx');
    expect(jhaList).toContain('jha-doc-theme');
    expect(jhaList).not.toContain('hub-take5');
    expect(jhaList).not.toContain('take5-doc-theme');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).toContain('hub-jobs');
    expect(jobs).not.toContain('hub-take5');

    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).toContain('hub-quotes');
    expect(quotes).not.toContain('hub-take5');

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain('hub-invoices');
    expect(invoices).not.toContain('hub-take5');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-take5');

    const landing = src('src/pages/RootPage.tsx');
    expect(landing).not.toContain('hub-take5');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-take5');
    expect(shell).toContain('resolveAppShellColors');

    const css = src('src/index.css');
    expect(css).toContain('.take5-doc-theme .ops-doc-head');
    expect(css).not.toMatch(/\.take5-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.take5-doc-theme \.ops-next-control/);
    expect(css).not.toMatch(/\.take5-doc-theme \.hub-take5/);
  });

  it('keeps saved report_theme on Take 5 documents, not this list', () => {
    const savedTheme = {
      navy: '#1B3A2F',
      accent: '#C45C26',
      accentLight: '#F4D7C4',
      navyLight: '#2F5A4A',
    };
    expect(take5DocumentColors(savedTheme)).toMatchObject(savedTheme);
    expect(take5DocumentColors(null).navy).toBe('#0A2540');
    expect(take5DocumentColors(null).accent).toBe('#2E75B6');
    expect(take5DocumentColors({})).toEqual(defaultPdfColors);
    expect(TAKE5_REPORT_THEME_KEYS).toEqual(['navy', 'accent', 'accentLight', 'navyLight']);
    const colors = take5DocumentColors({ navy: '#111111', cream: '#F5F0E6' });
    expect(colors.navy).toBe('#111111');
    expect(colors.accent).toBe(defaultPdfColors.accent);
    expect(JSON.stringify(colors)).not.toMatch(/#F5F0E6|#FAF3E0|#FBF6EE/i);
  });

  it('LOOK frames cover Open and All Take 5 list desktop and phone only', () => {
    for (const rel of [
      'docs/look/take5-open-desktop.png',
      'docs/look/take5-open-phone.png',
      'docs/look/take5-all-desktop.png',
      'docs/look/take5-all-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
