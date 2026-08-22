import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultPdfColors } from '../reports/shared/styles';
import {
  INSPECTION_REPORT_THEME_KEYS,
  inspectionDocumentColors,
} from '../reports/generic_inspection/theme';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const savedTheme = {
  navy: '#1B3A4B',
  accent: '#C45C26',
  accentLight: '#F4D7C4',
  navyLight: '#2A5366',
};

describe('inspection list cards report_theme colours', () => {
  it('paints list cards from the saved companies.report_theme palette', () => {
    expect(inspectionDocumentColors(savedTheme)).toMatchObject(savedTheme);
    expect(inspectionDocumentColors(savedTheme).navy).toBe('#1B3A4B');
    expect(inspectionDocumentColors(savedTheme).accent).toBe('#C45C26');

    const list = src('src/pages/InspectionsPage.tsx');
    expect(list).toContain('inspectionDocumentColors');
    expect(list).toContain('report_theme');
    expect(list).toContain('insp-doc-theme');
    expect(list).toContain("'--insp-navy': theme.navy");
    expect(list).toContain("'--insp-accent': theme.accent");
    expect(list).toContain("'--insp-navy-light': theme.navyLight");
    expect(list).toContain("'--insp-accent-light': theme.accentLight");
    expect(list).not.toContain('CompanySettingsPage');
    expect(list).not.toContain('setReportTheme');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);
  });

  it('keeps the existing inspection card colours when the theme is blank', () => {
    const blanks = [undefined, null, {}, { navy: '', accent: '', accentLight: '', navyLight: '' }];
    for (const raw of blanks) {
      expect(inspectionDocumentColors(raw)).toEqual(defaultPdfColors);
    }
    expect(inspectionDocumentColors(null).navy).toBe('#0A2540');
    expect(inspectionDocumentColors(null).accent).toBe('#2E75B6');
  });

  it('overlays only the existing report_theme keys and does not invent a cream fallback', () => {
    expect(INSPECTION_REPORT_THEME_KEYS).toEqual(['navy', 'accent', 'accentLight', 'navyLight']);
    const colors = inspectionDocumentColors({ navy: '#111111', cream: '#F5F0E6' });
    expect(colors.navy).toBe('#111111');
    expect(colors.accent).toBe(defaultPdfColors.accent);
    expect(JSON.stringify(colors)).not.toMatch(/#F5F0E6|#FAF3E0|#FBF6EE/i);
    expect(JSON.stringify(colors)).not.toMatch(/cream|grafter|relovi|littleloop/i);
  });

  it('does not add a settings page, recast Continue, or edit shared PDF chrome', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('/settings/company');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('InspectionTheme');
    expect(app).not.toContain('ReportThemePage');
    expect(app).not.toContain('ThemeEditorPage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/InspectionThemeSettingsPage.tsx'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const css = src('src/index.css');
    expect(css).toContain('.insp-doc-theme .ops-doc-head');
    expect(css).toContain('--insp-navy: #0A2540');
    expect(css).toContain('--insp-accent: #2E75B6');
    expect(css).not.toMatch(/\.insp-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.insp-doc-theme \.ops-next-control/);

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
    expect(shared).toContain('export function RunningHeader({');
    expect(shared).toContain('export function SignatureBlock({');

    const settings = src('src/pages/CompanySettingsPage.tsx');
    expect(settings).toContain('report_theme');
  });

  it('does not disturb fill/PDF, JHA list, Take 5, AppShell, or the Grafter mark', () => {
    const fill = src('src/pages/InspectionFillPage.tsx');
    expect(fill).toContain('insp-doc-theme');
    expect(fill).toContain('inspectionDocumentColors');

    const jhaList = src('src/pages/JhaDocumentsPage.tsx');
    expect(jhaList).toContain('jha-doc-theme');
    expect(jhaList).toContain('jhaDocumentColors');
    expect(jhaList).not.toContain('insp-doc-theme');

    const take5List = src('src/pages/Take5ListPage.tsx');
    expect(take5List).not.toContain('insp-doc-theme');

    const take5Fill = src('src/pages/Take5Page.tsx');
    expect(take5Fill).toContain('take5-doc-theme');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain('resolveAppShellColors');

    const mark = src('src/components/brand/grafterMark.ts');
    expect(mark).toContain('GRAFTER_NAVY');
  });

  it('LOOK frames cover blank and saved inspection list cards only', () => {
    for (const rel of [
      'docs/look/inspection-list-theme-blank-desktop.png',
      'docs/look/inspection-list-theme-blank-ute.png',
      'docs/look/inspection-list-theme-saved-desktop.png',
      'docs/look/inspection-list-theme-saved-ute.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
