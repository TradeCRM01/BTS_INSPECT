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

describe('inspection review/sign-off report_theme colours', () => {
  it('paints review chrome from the saved companies.report_theme palette', () => {
    expect(inspectionDocumentColors(savedTheme)).toMatchObject(savedTheme);

    const review = src('src/pages/InspectionReviewPage.tsx');
    expect(review).toContain('inspectionDocumentColors');
    expect(review).toContain('report_theme');
    expect(review).toContain('insp-doc-theme');
    expect(review).toContain('insp-review-head');
    expect(review).toContain('insp-review-navy');
    expect(review).toContain("'--insp-navy': docColors.navy");
    expect(review).toContain("'--insp-accent': docColors.accent");
    expect(review).toContain('penColor={navy}');
    expect(review).toContain('bg-[#1B7F3A]');
    expect(review).not.toContain('CompanySettingsPage');
    expect(review).not.toContain('setReportTheme');
    expect(review).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(review).not.toMatch(/bg-\[#0A2540\]/);
  });

  it('keeps the existing review chrome colours when the theme is blank', () => {
    expect(inspectionDocumentColors(null).navy).toBe('#0A2540');
    expect(inspectionDocumentColors(null).accent).toBe('#2E75B6');
    expect(inspectionDocumentColors({})).toEqual(defaultPdfColors);
  });

  it('overlays only the existing report_theme keys and does not invent a cream fallback', () => {
    expect(INSPECTION_REPORT_THEME_KEYS).toEqual(['navy', 'accent', 'accentLight', 'navyLight']);
    const colors = inspectionDocumentColors({ navy: '#111111', cream: '#F5F0E6' });
    expect(colors.navy).toBe('#111111');
    expect(colors.accent).toBe(defaultPdfColors.accent);
    expect(JSON.stringify(colors)).not.toMatch(/#F5F0E6|#FAF3E0|#FBF6EE/i);
  });

  it('does not add a settings page, recast Complete, or edit shared PDF chrome', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('InspectionTheme');
    expect(app).not.toContain('ReportThemePage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const css = src('src/index.css');
    expect(css).toContain('.insp-doc-theme .insp-review-head');
    expect(css).toContain('.insp-doc-theme .insp-review-navy');
    expect(css).not.toMatch(/\.insp-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.insp-doc-theme \.ops-next-control/);
    expect(css).not.toMatch(/insp-review.*#1B7F3A/);

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
    expect(shared).toContain('export function RunningHeader({');
  });

  it('does not disturb fill/PDF, JHA, Take 5, AppShell, or the Grafter mark', () => {
    const fill = src('src/pages/InspectionFillPage.tsx');
    expect(fill).toContain('insp-doc-theme');
    expect(fill).toContain('inspectionDocumentColors');

    const jhaList = src('src/pages/JhaDocumentsPage.tsx');
    expect(jhaList).toContain('jha-doc-theme');
    expect(jhaList).not.toContain('insp-doc-theme');

    const take5Fill = src('src/pages/Take5Page.tsx');
    expect(take5Fill).toContain('take5-doc-theme');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain('resolveAppShellColors');

    const mark = src('src/components/brand/grafterMark.ts');
    expect(mark).toContain('GRAFTER_NAVY');
  });
});
