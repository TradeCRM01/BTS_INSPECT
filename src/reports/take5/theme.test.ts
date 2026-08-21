import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { take5DocumentFrom, take5PdfCompanyFrom } from '../generateTake5Pdf';
import { defaultPdfColors, parseReportTheme } from '../shared/styles';
import type { Take5ReportData } from './Renderer';
import { TAKE5_REPORT_THEME_KEYS, take5DocumentColors, take5ReportTheme } from './theme';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const savedTheme = {
  navy: '#1B3A2F',
  accent: '#C45C26',
  accentLight: '#F4D7C4',
  navyLight: '#2F5A4A',
};

function take5Data(theme?: Take5ReportData['theme']): Take5ReportData {
  return {
    parentReportNumber: 'JHA-260821-1000',
    parentTaskName: 'Isolate supply',
    parentSiteName: 'Plant A',
    companyName: 'BTS Electrical',
    companyLogoUrl: 'https://example.com/logo.png',
    inspectorName: 'Sam Tradie',
    date: '2026-08-21',
    time: '07:30',
    location: 'Board 3',
    stopThink: 'Isolate and prove dead',
    identifyHazards: 'Live parts',
    assessRisk: 'High if not isolated',
    controlActions: 'Lock out, test for dead',
    goNoGo: 'go',
    signedName: 'Sam Tradie',
    signature: null,
    signedAt: '21 Aug 2026 07:35',
    theme,
  };
}

describe('Take 5 document report_theme colours', () => {
  it('uses the saved companies.report_theme palette on the Take 5 document', () => {
    const data = take5DocumentFrom(take5Data(savedTheme));
    expect(data.theme).toEqual(savedTheme);
    expect(take5DocumentColors(data.theme)).toMatchObject(savedTheme);
    expect(take5DocumentColors(savedTheme).navy).toBe('#1B3A2F');
    expect(take5DocumentColors(savedTheme).accent).toBe('#C45C26');
    expect(take5DocumentColors(savedTheme).accentLight).toBe('#F4D7C4');
    expect(take5DocumentColors(savedTheme).navyLight).toBe('#2F5A4A');

    const company = take5PdfCompanyFrom({
      name: 'BTS Electrical',
      logo_url: 'https://example.com/logo.png',
      report_theme: savedTheme,
    });
    expect(company.report_theme).toEqual(savedTheme);
    expect(take5DocumentColors(company.report_theme)).toMatchObject(savedTheme);
    expect(take5DocumentFrom({ ...take5Data(), theme: take5ReportTheme(company.report_theme) }).theme).toEqual(savedTheme);
  });

  it('keeps the existing Take 5 document colours when the theme is blank', () => {
    const blanks = [undefined, null, {}, { navy: '', accent: '', accentLight: '', navyLight: '' }];
    for (const raw of blanks) {
      const data = take5DocumentFrom(take5Data(take5ReportTheme(raw)));
      expect(data.theme).toEqual({});
      expect(take5DocumentColors(data.theme)).toEqual(defaultPdfColors);
    }

    expect(take5DocumentColors(null).navy).toBe('#0A2540');
    expect(take5DocumentColors(null).accent).toBe('#2E75B6');
    expect(take5DocumentColors(null).accentLight).toBe('#D6E8F7');
    expect(take5DocumentColors(null).navyLight).toBe('#153558');

    const blankCompany = take5PdfCompanyFrom({ name: 'BTS Electrical', report_theme: null });
    expect(blankCompany.report_theme).toBeNull();
    expect(take5DocumentColors(blankCompany.report_theme)).toEqual(defaultPdfColors);
    expect(take5DocumentFrom(take5Data()).theme).toEqual({});
  });

  it('overlays only the existing report_theme keys and does not invent a cream fallback', () => {
    expect(TAKE5_REPORT_THEME_KEYS).toEqual(['navy', 'accent', 'accentLight', 'navyLight']);
    const parsed = parseReportTheme({
      navy: '#111111',
      cream: '#F5F0E6',
      grafter: '#FAF3E0',
      extra: '#00FF00',
    });
    expect(parsed).toEqual({ navy: '#111111' });
    expect(take5ReportTheme({ navy: '#111111', cream: '#F5F0E6' })).toEqual({ navy: '#111111' });

    const colors = take5DocumentColors({ navy: '#111111' });
    expect(colors.navy).toBe('#111111');
    expect(colors.accent).toBe(defaultPdfColors.accent);
    expect(colors.accentLight).toBe(defaultPdfColors.accentLight);
    expect(JSON.stringify(colors)).not.toMatch(/#F5F0E6|#FAF3E0|#FBF6EE/i);
    expect(JSON.stringify(colors)).not.toMatch(/cream|grafter|relovi|littleloop/i);
  });

  it('does not add a settings page or a second theme editor', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('/settings/company');
    expect(app).toContain('CompanySettingsPage');
    expect(app).toContain('/jha/take5');
    expect(app).not.toContain('Take5Theme');
    expect(app).not.toContain('ReportThemePage');
    expect(app).not.toContain('ThemeEditorPage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/Take5ThemeSettingsPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const fill = src('src/pages/Take5Page.tsx');
    expect(fill).toContain('take5PdfCompanyFrom');
    expect(fill).toContain('report_theme');
    expect(fill).toContain('take5ReportTheme');
    expect(fill).toContain('take5DocumentColors');
    expect(fill).toContain('take5-doc-theme');
    expect(fill).not.toContain('CompanySettingsPage');
    expect(fill).not.toContain('setReportTheme');
    expect(fill).not.toContain('AppShell theme');

    const css = src('src/index.css');
    expect(css).toContain('.take5-doc-theme');
    expect(css).toContain('.take5-doc-theme .ops-doc-head');
    expect(css).toContain('.take5-doc-theme #take5-sign .ops-tray-head');
    expect(css).toContain('--take5-navy: #0A2540');
    expect(css).toContain('--take5-accent: #2E75B6');
    expect(css).toContain('.ops-choice[data-go]:not(.ops-choice-pass)');
    expect(css).toContain('.ops-choice[data-stop]:not(.ops-choice-fail)');
    expect(css).toContain('#1B7F3A');
    expect(css).toContain('#B42318');
    expect(css).not.toMatch(/\.take5-doc-theme \.ops-choice-pass\s*\{[^}]*--take5/);
    expect(css).not.toMatch(/\.take5-doc-theme \.btn-primary/);

    const renderer = src('src/reports/take5/Renderer.tsx');
    expect(renderer).toContain('take5DocumentColors');
    expect(renderer).toContain('function Take5RunningHeader');
    expect(renderer).toContain('function Take5SignatureBlock');
    expect(renderer).toContain('colors.navy');
    expect(renderer).toContain('colors.accent');
    expect(renderer).toContain('colors.accentLight');
    expect(renderer).not.toContain('RunningHeader,');
    expect(renderer).not.toContain('SignatureBlock,');
    expect(renderer).toContain('RunningFooter');
    expect(renderer).not.toMatch(/Grafter|Relovi|Littleloop/);

    const generator = src('src/reports/generateTake5Pdf.ts');
    expect(generator).toContain('take5PdfCompanyFrom');
    expect(generator).toContain('take5DocumentFrom');
    expect(generator).toContain('take5ReportTheme');
    expect(generator).not.toContain('CompanySettingsPage');

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
    expect(shared).toContain('export function RunningHeader({');
    expect(shared).toContain('export function SignatureBlock({');

    const settings = src('src/pages/CompanySettingsPage.tsx');
    expect(settings).toContain('report_theme');
  });
});
