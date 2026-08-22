import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeElectricalReport } from '../electrical_3000/compose';
import { composeGenericReport } from './compose';
import { defaultPdfColors, parseReportTheme } from '../shared/styles';
import type { TemplateSchema } from '../../types/template';
import {
  INSPECTION_REPORT_THEME_KEYS,
  inspectionDocumentColors,
  inspectionReportTheme,
} from './theme';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const savedTheme = {
  navy: '#1B3A4B',
  accent: '#C45C26',
  accentLight: '#F4D7C4',
  navyLight: '#2A5366',
};

const emptySchema: TemplateSchema = {
  meta: {
    requiresSiteName: false,
    requiresSiteAddress: false,
    requiresClientName: false,
    requiresJobNumber: false,
  },
  sections: [],
};

function compose(report_theme: unknown) {
  return composeGenericReport({
    inspection: {
      id: 'insp-1',
      meta: { siteName: 'Yard', clientName: 'Acme' },
      responses: {},
    },
    template: { name: 'Switchboard', schema: emptySchema },
    profile: { name: 'Sam Tradie', licence_number: 'EL-1' },
    company: {
      name: 'BTS Electrical',
      logo_url: 'https://example.com/logo.png',
      report_theme: report_theme as Record<string, unknown> | null,
    },
    photos: [],
    reportNumber: 'BTS-260822-1000',
  });
}

function composeElectrical(report_theme: unknown) {
  return composeElectricalReport({
    inspection: {
      id: 'insp-1',
      meta: { siteName: 'Yard', clientName: 'Acme' },
      responses: {},
    },
    template: { name: 'Switchboard', schema: emptySchema },
    profile: { name: 'Sam Tradie', licence_number: 'EL-1' },
    company: {
      name: 'BTS Electrical',
      logo_url: 'https://example.com/logo.png',
      report_theme: report_theme as Record<string, unknown> | null,
    },
    photos: [],
    reportNumber: 'BTS-260822-1000',
  });
}

describe('inspection-report document report_theme colours', () => {
  it('uses the saved companies.report_theme palette on inspection documents', () => {
    const data = compose(savedTheme);
    expect(data.theme).toEqual(savedTheme);
    expect(inspectionDocumentColors(data.theme)).toMatchObject(savedTheme);
    expect(inspectionDocumentColors(savedTheme).navy).toBe('#1B3A4B');
    expect(inspectionDocumentColors(savedTheme).accent).toBe('#C45C26');
    expect(inspectionDocumentColors(savedTheme).accentLight).toBe('#F4D7C4');
    expect(inspectionDocumentColors(savedTheme).navyLight).toBe('#2A5366');

    const electrical = composeElectrical(savedTheme);
    expect(electrical.theme).toEqual(savedTheme);
    expect(inspectionDocumentColors(electrical.theme)).toMatchObject(savedTheme);
  });

  it('keeps the existing inspection document colours when the theme is blank', () => {
    const blanks = [undefined, null, {}, { navy: '', accent: '', accentLight: '', navyLight: '' }];
    for (const raw of blanks) {
      const data = compose(raw);
      expect(data.theme).toEqual({});
      expect(inspectionDocumentColors(data.theme)).toEqual(defaultPdfColors);
    }

    expect(inspectionDocumentColors(null).navy).toBe('#0A2540');
    expect(inspectionDocumentColors(null).accent).toBe('#2E75B6');
    expect(inspectionDocumentColors(null).accentLight).toBe('#D6E8F7');
    expect(inspectionDocumentColors(null).navyLight).toBe('#153558');

    const blankElectrical = composeElectrical(null);
    expect(blankElectrical.theme).toEqual({});
    expect(inspectionDocumentColors(blankElectrical.theme)).toEqual(defaultPdfColors);
  });

  it('overlays only the existing report_theme keys and does not invent a cream fallback', () => {
    expect(INSPECTION_REPORT_THEME_KEYS).toEqual(['navy', 'accent', 'accentLight', 'navyLight']);
    const parsed = parseReportTheme({
      navy: '#111111',
      cream: '#F5F0E6',
      grafter: '#FAF3E0',
      extra: '#00FF00',
    });
    expect(parsed).toEqual({ navy: '#111111' });
    expect(inspectionReportTheme({ navy: '#111111', cream: '#F5F0E6' })).toEqual({ navy: '#111111' });

    const colors = inspectionDocumentColors({ navy: '#111111' });
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
    expect(app).not.toContain('InspectionTheme');
    expect(app).not.toContain('ReportThemePage');
    expect(app).not.toContain('ThemeEditorPage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/InspectionThemeSettingsPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const fill = src('src/pages/InspectionFillPage.tsx');
    expect(fill).toContain('inspectionDocumentColors');
    expect(fill).toContain('report_theme');
    expect(fill).toContain('insp-doc-theme');
    expect(fill).not.toContain('CompanySettingsPage');
    expect(fill).not.toContain('setReportTheme');
    expect(fill).not.toContain('AppShell theme');

    const css = src('src/index.css');
    expect(css).toContain('.insp-doc-theme');
    expect(css).toContain('.insp-doc-theme .ops-doc-head');
    expect(css).toContain('--insp-navy: #0A2540');
    expect(css).toContain('--insp-accent: #2E75B6');
    expect(css).not.toMatch(/\.insp-doc-theme \.btn-primary/);

    const generic = src('src/reports/generic_inspection/Renderer.tsx');
    expect(generic).toContain('inspectionDocumentColors');
    expect(generic).toContain('InspectionRunningHeader');
    expect(generic).toContain('InspectionSignatureBlock');
    expect(generic).toContain('InspectionCoverLetterhead');
    expect(generic).toContain('InspectionSectionHeaderBar');
    expect(generic).toContain('colors.navy');
    expect(generic).toContain('colors.accent');
    expect(generic).not.toContain('RunningHeader, RunningFooter');
    expect(generic).not.toContain('CoverLetterhead, OverallVerdictStamp');
    expect(generic).toContain('RunningFooter');
    expect(generic).not.toMatch(/Grafter|Relovi|Littleloop/);

    const electrical = src('src/reports/electrical_3000/Renderer.tsx');
    expect(electrical).toContain('inspectionDocumentColors');
    expect(electrical).toContain('InspectionRunningHeader');
    expect(electrical).toContain('InspectionSignatureBlock');
    expect(electrical).toContain('InspectionCoverLetterhead');
    expect(electrical).toContain('InspectionSectionHeaderBar');
    expect(electrical).toContain('colors.navy');
    expect(electrical).toContain('colors.accent');
    expect(electrical).not.toContain('RunningHeader, RunningFooter');
    expect(electrical).not.toContain('CoverLetterhead, OverallVerdictStamp');
    expect(electrical).toContain('RunningFooter');
    expect(electrical).not.toMatch(/Grafter|Relovi|Littleloop/);

    const generator = src('src/reports/generatePdf.ts');
    expect(generator).toContain('inspectionReportTheme');
    expect(generator).not.toContain('CompanySettingsPage');

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
    expect(shared).toContain('export function RunningHeader({');
    expect(shared).toContain('export function SignatureBlock({');

    const settings = src('src/pages/CompanySettingsPage.tsx');
    expect(settings).toContain('report_theme');
  });

  it('LOOK frames cover blank and saved inspection fill chrome only', () => {
    for (const rel of [
      'docs/look/inspection-theme-blank-desktop.png',
      'docs/look/inspection-theme-blank-ute.png',
      'docs/look/inspection-theme-saved-desktop.png',
      'docs/look/inspection-theme-saved-ute.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
