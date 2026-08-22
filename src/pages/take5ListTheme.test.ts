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

const savedTheme = {
  navy: '#1B3A2F',
  accent: '#C45C26',
  accentLight: '#F4D7C4',
  navyLight: '#2F5A4A',
};

describe('Take 5 list cards report_theme colours', () => {
  it('paints list cards from the saved companies.report_theme palette', () => {
    expect(take5DocumentColors(savedTheme)).toMatchObject(savedTheme);
    expect(take5DocumentColors(savedTheme).navy).toBe('#1B3A2F');
    expect(take5DocumentColors(savedTheme).accent).toBe('#C45C26');

    const list = src('src/pages/Take5ListPage.tsx');
    expect(list).toContain('take5DocumentColors');
    expect(list).toContain('report_theme');
    expect(list).toContain('take5-doc-theme');
    expect(list).toContain("'--take5-navy': theme.navy");
    expect(list).toContain("'--take5-accent': theme.accent");
    expect(list).not.toContain('CompanySettingsPage');
    expect(list).not.toContain('setReportTheme');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);
  });

  it('keeps the existing Take 5 card colours when the theme is blank', () => {
    expect(take5DocumentColors(null).navy).toBe('#0A2540');
    expect(take5DocumentColors(null).accent).toBe('#2E75B6');
    expect(take5DocumentColors({})).toEqual(defaultPdfColors);
  });

  it('overlays only the existing report_theme keys and does not invent a cream fallback', () => {
    expect(TAKE5_REPORT_THEME_KEYS).toEqual(['navy', 'accent', 'accentLight', 'navyLight']);
    const colors = take5DocumentColors({ navy: '#111111', cream: '#F5F0E6' });
    expect(colors.navy).toBe('#111111');
    expect(colors.accent).toBe(defaultPdfColors.accent);
    expect(JSON.stringify(colors)).not.toMatch(/#F5F0E6|#FAF3E0|#FBF6EE/i);
  });

  it('does not add a settings page, recast Continue / GO / STOP, or edit shared PDF chrome', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('Take5Theme');
    expect(app).not.toContain('ReportThemePage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const css = src('src/index.css');
    expect(css).toContain('.take5-doc-theme .ops-doc-head');
    expect(css).not.toMatch(/\.take5-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.take5-doc-theme \.ops-next-control/);

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
  });

  it('does not disturb Take 5 fill/PDF, JHA list, AppShell, or the Grafter mark', () => {
    const fill = src('src/pages/Take5Page.tsx');
    expect(fill).toContain('take5-doc-theme');
    expect(fill).toContain('take5DocumentColors');

    const jhaList = src('src/pages/JhaDocumentsPage.tsx');
    expect(jhaList).toContain('jha-doc-theme');
    expect(jhaList).not.toContain('take5-doc-theme');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain('resolveAppShellColors');

    const mark = src('src/components/brand/grafterMark.ts');
    expect(mark).toContain('GRAFTER_NAVY');
  });
});
