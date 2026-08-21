import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_REPORT_THEME_KEYS,
  defaultAppShellColors,
  parseAppShellTheme,
  resolveAppShellColors,
} from './appShellTheme';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const savedTheme = {
  navy: '#1B3A4B',
  accent: '#C45C26',
  accentLight: '#F4D7C4',
  navyLight: '#2F5A6A',
};

const DOCUMENT_FILES = [
  'src/reports/generatePdf.ts',
  'src/reports/generateJhaPdf.ts',
  'src/reports/generateTake5Pdf.ts',
  'src/reports/commercial/CommercialDocumentPdf.tsx',
  'src/reports/take5/Renderer.tsx',
  'src/reports/take5/theme.ts',
  'src/reports/jha/Renderer.tsx',
  'src/reports/jha/theme.ts',
  'src/reports/jha/compose.ts',
  'src/reports/electrical_3000/compose.ts',
  'src/reports/generic_inspection/compose.ts',
  'src/reports/shared/styles.ts',
] as const;

describe('AppShell header/nav report_theme', () => {
  it('paints navy and accent from the saved companies.report_theme palette', () => {
    expect(APP_SHELL_REPORT_THEME_KEYS).toEqual(['navy', 'accent', 'accentLight', 'navyLight']);
    expect(resolveAppShellColors(savedTheme)).toMatchObject(savedTheme);
    expect(resolveAppShellColors(savedTheme).navy).toBe('#1B3A4B');
    expect(resolveAppShellColors(savedTheme).accent).toBe('#C45C26');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain('resolveAppShellColors');
    expect(shell).toContain('report_theme');
    expect(shell).toContain('--shell-navy');
    expect(shell).toContain('--shell-accent');
    expect(shell).toContain('chrome.navy');
    expect(shell).toContain('chrome.accent');
    expect(shell).toContain('BrandLockup');
    expect(shell).toContain("size=\"header\"");
    expect(shell).toContain('aria-label="Grafter"');
    expect(shell).not.toContain('logo_url');
    expect(shell).not.toContain('companyDocumentLogoUrl');

    const css = src('src/index.css');
    expect(css).toContain('.shell-header');
    expect(css).toContain('--shell-navy: #0A2540');
    expect(css).toContain('--shell-accent: #2E75B6');
    expect(css).toContain('background-color: var(--shell-navy)');
    expect(css).toContain('border-color: var(--shell-accent)');
    expect(css).toContain('Signed-in header / nav only');
  });

  it('keeps the document navy / blue defaults when the palette is blank or unset', () => {
    expect(defaultAppShellColors).toEqual({
      navy: '#0A2540',
      accent: '#2E75B6',
      accentLight: '#D6E8F7',
      navyLight: '#153558',
    });
    expect(resolveAppShellColors(null)).toEqual(defaultAppShellColors);
    expect(resolveAppShellColors(undefined)).toEqual(defaultAppShellColors);
    expect(resolveAppShellColors({})).toEqual(defaultAppShellColors);
    expect(parseAppShellTheme(null)).toEqual({});
    expect(parseAppShellTheme({ navy: '#111111', cream: '#F5F0E6' })).toEqual({ navy: '#111111' });

    const partial = resolveAppShellColors({ navy: '#111111' });
    expect(partial.navy).toBe('#111111');
    expect(partial.accent).toBe('#2E75B6');
    expect(partial.accentLight).toBe('#D6E8F7');
    expect(JSON.stringify(partial)).not.toMatch(/#F5F0E6|#FAF3E0|#FBF6EE/i);
    expect(JSON.stringify(partial)).not.toMatch(/cream|grafter|relovi|littleloop/i);
  });

  it('does not add a settings page, theme login, or put the customer logo in chrome', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('/settings/company');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('ReportThemePage');
    expect(app).not.toContain('ThemeEditorPage');
    expect(app).not.toContain('AppShellTheme');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const settings = src('src/pages/CompanySettingsPage.tsx');
    expect(settings).toContain('report_theme');
    expect(settings).toContain('setReportTheme');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).toContain('BrandLockup');
    expect(login).toContain("size=\"auth\"");
    expect(login).not.toContain('report_theme');
    expect(login).not.toContain('resolveAppShellColors');
    expect(login).not.toContain('--shell-navy');
    expect(login).not.toContain('logo_url');

    const icon = src('public/icon.svg');
    expect(icon).not.toContain('report_theme');
    expect(icon).toContain('#0A2540');
    expect(icon).toContain('#2E75B6');

    const theme = src('src/components/layout/appShellTheme.ts');
    expect(theme).not.toMatch(/from ['"].*reports\//);
    expect(theme).not.toContain('logo_url');
    expect(theme).not.toContain('Relovi');
    expect(theme).not.toContain('Littleloop');
  });

  it('LOOK frames cover blank and saved AppShell header/nav only', () => {
    for (const rel of [
      'docs/look/appshell-theme-blank-desktop.png',
      'docs/look/appshell-theme-blank-ute.png',
      'docs/look/appshell-theme-saved-desktop.png',
      'docs/look/appshell-theme-saved-ute.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });

  it('does not edit document / PDF files and does not import them from AppShell', () => {
    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toMatch(/from ['"].*reports\//);
    expect(shell).not.toContain('parseReportTheme');
    expect(shell).not.toContain('resolvePdfColors');
    expect(shell).not.toContain('commercialPdfCompanyFrom');

    for (const rel of DOCUMENT_FILES) {
      const body = src(rel);
      expect(body).not.toContain('resolveAppShellColors');
      expect(body).not.toContain('appShellTheme');
      expect(body).not.toContain('--shell-navy');
    }
  });
});
