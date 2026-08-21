import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeJhaReport } from './compose';
import { jhaDocumentColors, jhaReportTheme, JHA_REPORT_THEME_KEYS } from './theme';
import { jhaPdfCompanyFrom } from '../generateJhaPdf';
import { defaultPdfColors, parseReportTheme } from '../shared/styles';
import type { JhaTemplateSchema } from '../../types/jha';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const savedTheme = {
  navy: '#1B3A2F',
  accent: '#C45C26',
  accentLight: '#F4D7C4',
  navyLight: '#2F5A4A',
};

const schema: JhaTemplateSchema = {
  meta: {
    requiresTaskName: true,
    requiresSiteName: true,
    requiresDate: true,
    requiresSupervisor: false,
  },
  riskLevels: [],
  ppeOptions: [],
  signOffRoles: [],
};

function compose(report_theme: unknown) {
  return composeJhaReport({
    document: {
      id: 'jha-1',
      meta: { taskName: 'Isolate supply', siteName: 'Plant A' },
      steps: [],
      ppe: [],
      sign_offs: [],
    },
    template: { name: 'Switchboard JHA', schema },
    profile: { name: 'Sam Tradie' },
    company: {
      name: 'BTS Electrical',
      logo_url: 'https://example.com/logo.png',
      report_theme: report_theme as Record<string, unknown> | null,
    },
    reportNumber: 'JHA-260821-1000',
  });
}

describe('JHA document report_theme colours', () => {
  it('uses the saved companies.report_theme palette on the JHA document', () => {
    const data = compose(savedTheme);
    expect(data.theme).toEqual(savedTheme);
    expect(jhaDocumentColors(data.theme)).toMatchObject(savedTheme);
    expect(jhaDocumentColors(savedTheme).navy).toBe('#1B3A2F');
    expect(jhaDocumentColors(savedTheme).accent).toBe('#C45C26');
    expect(jhaDocumentColors(savedTheme).accentLight).toBe('#F4D7C4');
    expect(jhaDocumentColors(savedTheme).navyLight).toBe('#2F5A4A');

    const company = jhaPdfCompanyFrom({
      name: 'BTS Electrical',
      logo_url: 'https://example.com/logo.png',
      report_theme: savedTheme,
    });
    expect(company.report_theme).toEqual(savedTheme);
    expect(jhaDocumentColors(company.report_theme)).toMatchObject(savedTheme);
  });

  it('keeps the existing JHA document colours when the theme is blank', () => {
    const blanks = [undefined, null, {}, { navy: '', accent: '', accentLight: '', navyLight: '' }];
    for (const raw of blanks) {
      const data = compose(raw);
      expect(data.theme).toEqual({});
      expect(jhaDocumentColors(data.theme)).toEqual(defaultPdfColors);
    }

    expect(jhaDocumentColors(null).navy).toBe('#0A2540');
    expect(jhaDocumentColors(null).accent).toBe('#2E75B6');
    expect(jhaDocumentColors(null).accentLight).toBe('#D6E8F7');
    expect(jhaDocumentColors(null).navyLight).toBe('#153558');

    const blankCompany = jhaPdfCompanyFrom({ name: 'BTS Electrical', report_theme: null });
    expect(blankCompany.report_theme).toBeNull();
    expect(jhaDocumentColors(blankCompany.report_theme)).toEqual(defaultPdfColors);
  });

  it('overlays only the existing report_theme keys and does not invent a cream fallback', () => {
    expect(JHA_REPORT_THEME_KEYS).toEqual(['navy', 'accent', 'accentLight', 'navyLight']);
    const parsed = parseReportTheme({
      navy: '#111111',
      cream: '#F5F0E6',
      grafter: '#FAF3E0',
      extra: '#00FF00',
    });
    expect(parsed).toEqual({ navy: '#111111' });
    expect(jhaReportTheme({ navy: '#111111', cream: '#F5F0E6' })).toEqual({ navy: '#111111' });

    const colors = jhaDocumentColors({ navy: '#111111' });
    expect(colors.navy).toBe('#111111');
    expect(colors.accent).toBe(defaultPdfColors.accent);
    expect(colors.accentLight).toBe(defaultPdfColors.accentLight);
    expect(JSON.stringify(colors)).not.toMatch(/#F5F0E6|#FAF3E0|#FBF6EE/i);
  });

  it('does not add a settings page or a second theme editor', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('/settings/company');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('JhaTheme');
    expect(app).not.toContain('ReportThemePage');
    expect(app).not.toContain('ThemeEditorPage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/JhaThemeSettingsPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/lib/companyLogo.ts'))).toBe(false);

    const fill = src('src/pages/JhaFillPage.tsx');
    expect(fill).toContain('jhaPdfCompanyFrom');
    expect(fill).toContain('report_theme');
    expect(fill.match(/jhaPdfCompanyFrom/g)?.length).toBeGreaterThanOrEqual(2);

    const renderer = src('src/reports/jha/Renderer.tsx');
    expect(renderer).toContain('jhaDocumentColors');
    expect(renderer).toContain('colors={brand}');
    expect(renderer).not.toMatch(/Grafter|Relovi/);

    const settings = src('src/pages/CompanySettingsPage.tsx');
    expect(settings).toContain('report_theme');
  });
});
